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

  // Aircall recording proxy — calls Aircall API to get a fresh signed mp3 URL, then streams audio
  app.get("/api/aircall-recording", async (req, res) => {
    const callId = req.query.callId as string;
    if (!callId || !/^\d+$/.test(callId)) {
      res.status(400).json({ error: "Invalid callId" });
      return;
    }
    const apiId = process.env.AIRCALL_API_ID;
    const apiToken = process.env.AIRCALL_API_TOKEN;
    if (!apiId || !apiToken) {
      res.status(500).json({ error: "Aircall credentials not configured" });
      return;
    }
    try {
      const auth = Buffer.from(`${apiId}:${apiToken}`).toString("base64");
      // Step 1: fetch call details from Aircall API to get a fresh signed voicemail/recording URL
      const apiRes = await fetch(`https://api.aircall.io/v1/calls/${callId}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!apiRes.ok) {
        console.error(`[recording-proxy] Aircall API ${apiRes.status} for call ${callId}`);
        res.status(apiRes.status).json({ error: "Aircall API error", status: apiRes.status });
        return;
      }
      const callData = (await apiRes.json()) as { call?: { voicemail?: string; recording?: string } };
      const audioUrl = callData?.call?.voicemail ?? callData?.call?.recording;
      if (!audioUrl) {
        res.status(404).json({ error: "No audio available for this call" });
        return;
      }
      // Step 2: stream the audio file to the browser
      // S3 pre-signed URLs embed auth in the query string — do NOT add an Authorization header
      const parsed = new URL(audioUrl);
      const proto = parsed.protocol === "https:" ? https : http;
      const isS3 = parsed.hostname.includes("amazonaws.com") || parsed.hostname.includes("s3.");
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: isS3 ? {} : { Authorization: `Basic ${auth}` },
      };
      const proxyReq = proto.get(options, (proxyRes) => {
        const ct = proxyRes.headers["content-type"] || "";
        // Guard: if upstream returns HTML the URL is still an asset page
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
      });
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
