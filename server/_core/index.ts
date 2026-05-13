import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import https from "https";
import http from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { aircallRouter } from "../aircall";
import { startAircallSyncJob } from "../aircallSync";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/api/aircall", aircallRouter);

  // Aircall recording proxy — accepts ?url=<encoded S3 URL> and streams the audio
  // The aircallRecordingUrl stored in the DB is already a signed S3 URL from the webhook payload.
  // We proxy it server-side to avoid CORS issues. S3 pre-signed URLs must NOT have an extra
  // Authorization header — auth is embedded in the query string.
  app.get("/api/aircall-recording", async (req, res) => {
    const rawUrl = req.query.url as string;
    // Legacy: also accept callId for very recent calls (fallback to Aircall API)
    const callId = req.query.callId as string;

    let audioUrl: string | null = null;

    if (rawUrl) {
      // Primary path: use the stored URL
      try {
        audioUrl = decodeURIComponent(rawUrl);
        new URL(audioUrl); // validate
      } catch {
        res.status(400).json({ error: "Invalid url parameter" });
        return;
      }
      // Detect Aircall asset page URLs (not direct audio) and resolve via API
      // Pattern: https://assets.aircall.io/calls/{callId}/voicemail
      const aircallAssetMatch = audioUrl.match(/assets\.aircall\.io\/calls\/(\d+)\/(voicemail|recording)/);
      if (aircallAssetMatch) {
        const resolvedCallId = aircallAssetMatch[1];
        const apiId = process.env.AIRCALL_API_ID;
        const apiToken = process.env.AIRCALL_API_TOKEN;
        if (apiId && apiToken) {
          try {
            const auth = Buffer.from(`${apiId}:${apiToken}`).toString("base64");
            const apiRes = await fetch(`https://api.aircall.io/v1/calls/${resolvedCallId}`, {
              headers: { Authorization: `Basic ${auth}` },
            });
            if (apiRes.ok) {
              const callData = (await apiRes.json()) as { call?: { voicemail?: string; recording?: string } };
              const resolved = callData?.call?.voicemail ?? callData?.call?.recording ?? null;
              if (resolved && !resolved.includes("assets.aircall.io")) {
                audioUrl = resolved; // Use the fresh signed S3 URL
              }
            } else {
              console.warn(`[recording-proxy] Aircall API ${apiRes.status} for call ${resolvedCallId} — will attempt direct stream`);
            }
          } catch (err) {
            console.warn("[recording-proxy] Aircall API lookup failed:", err);
          }
        }
      }
    } else if (callId && /^\d+$/.test(callId)) {
      // Fallback path: fetch from Aircall API by call ID (only works for recent calls)
      const apiId = process.env.AIRCALL_API_ID;
      const apiToken = process.env.AIRCALL_API_TOKEN;
      if (!apiId || !apiToken) {
        res.status(500).json({ error: "Aircall credentials not configured" });
        return;
      }
      try {
        const auth = Buffer.from(`${apiId}:${apiToken}`).toString("base64");
        const apiRes = await fetch(`https://api.aircall.io/v1/calls/${callId}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (!apiRes.ok) {
          console.error(`[recording-proxy] Aircall API ${apiRes.status} for call ${callId}`);
          res.status(apiRes.status).json({ error: "Aircall API error", status: apiRes.status });
          return;
        }
        const callData = (await apiRes.json()) as { call?: { voicemail?: string; recording?: string } };
        audioUrl = callData?.call?.voicemail ?? callData?.call?.recording ?? null;
      } catch (err) {
        console.error("[recording-proxy] Aircall API error:", err);
        res.status(500).json({ error: "Internal error" });
        return;
      }
    } else {
      res.status(400).json({ error: "Provide ?url= or ?callId= parameter" });
      return;
    }

    if (!audioUrl) {
      res.status(404).json({ error: "No audio available" });
      return;
    }

    try {
      const parsed = new URL(audioUrl);
      const proto = parsed.protocol === "https:" ? https : http;
      // S3 pre-signed URLs embed auth in query string — never add Authorization header
      const proxyReq = proto.get(
        { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: {} },
        (proxyRes) => {
          const ct = proxyRes.headers["content-type"] || "";
          if (ct.includes("text/html")) {
            if (!res.headersSent) res.status(502).json({ error: "Upstream returned HTML instead of audio" });
            return;
          }
          res.setHeader("Content-Type", ct || "audio/mpeg");
          res.setHeader("Accept-Ranges", "bytes");
          if (proxyRes.headers["content-length"]) {
            res.setHeader("Content-Length", proxyRes.headers["content-length"]);
          }
          res.status(proxyRes.statusCode || 200);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on("error", (err) => {
        console.error("[recording-proxy] stream error:", err.message);
        if (!res.headersSent) res.status(502).json({ error: "Upstream error" });
      });
    } catch (err) {
      console.error("[recording-proxy] error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start the Aircall background sync job after server is up
    startAircallSyncJob();
  });
}

startServer().catch(console.error);
