import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
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

  // Aircall recording proxy — accepts ?url=<encoded assets.aircall.io URL> or ?callId=<id>
  // Resolves the Aircall asset URL to a fresh signed S3 URL via the Aircall API, then
  // streams the audio back to the browser using fetch() (which follows redirects automatically).
  // CORS headers are added so the <audio> element can play cross-origin.
  app.get("/api/aircall-recording", async (req, res) => {
    const rawUrl = req.query.url as string;
    const callId = req.query.callId as string;

    // Helper: resolve an Aircall call ID to a fresh signed S3 audio URL
    async function resolveCallIdToAudioUrl(id: string): Promise<string | null> {
      const apiId = process.env.AIRCALL_API_ID;
      const apiToken = process.env.AIRCALL_API_TOKEN;
      if (!apiId || !apiToken) return null;
      try {
        const auth = Buffer.from(`${apiId}:${apiToken}`).toString("base64");
        const apiRes = await fetch(`https://api.aircall.io/v1/calls/${id}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (!apiRes.ok) {
          console.warn(`[recording-proxy] Aircall API ${apiRes.status} for call ${id}`);
          return null;
        }
        const callData = (await apiRes.json()) as { call?: { voicemail?: string; recording?: string } };
        const resolved = callData?.call?.voicemail ?? callData?.call?.recording ?? null;
        // Only return if it's a real S3 URL (not another assets.aircall.io page)
        if (resolved && !resolved.includes("assets.aircall.io")) return resolved;
        return null;
      } catch (err) {
        console.warn("[recording-proxy] Aircall API lookup failed:", err);
        return null;
      }
    }

    let audioUrl: string | null = null;

    if (rawUrl) {
      try {
        audioUrl = decodeURIComponent(rawUrl);
        new URL(audioUrl);
      } catch {
        res.status(400).json({ error: "Invalid url parameter" });
        return;
      }
      // If it's an Aircall asset page URL, resolve to a fresh S3 URL
      const assetMatch = audioUrl.match(/assets\.aircall\.io\/calls\/(\d+)\/(voicemail|recording)/);
      if (assetMatch) {
        audioUrl = await resolveCallIdToAudioUrl(assetMatch[1]);
      }
    } else if (callId && /^\d+$/.test(callId)) {
      audioUrl = await resolveCallIdToAudioUrl(callId);
    } else {
      res.status(400).json({ error: "Provide ?url= or ?callId= parameter" });
      return;
    }

    if (!audioUrl) {
      res.status(404).json({ error: "No audio available for this call" });
      return;
    }

    // CORS headers so the browser <audio> element can play the stream
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD");
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Type, Accept-Ranges");

    try {
      // Use fetch() — it follows 307/302 redirects automatically (unlike http.get)
      // Forward Range header if the browser is seeking
      const fetchHeaders: Record<string, string> = {};
      if (req.headers.range) fetchHeaders["Range"] = req.headers.range;

      const upstream = await fetch(audioUrl, { headers: fetchHeaders });
      const ct = upstream.headers.get("content-type") || "audio/mpeg";

      if (ct.includes("text/html") || ct.includes("application/xml")) {
        // S3 returned an error XML or HTML page — the signed URL may have expired
        console.error("[recording-proxy] upstream returned non-audio content-type:", ct);
        res.status(502).json({ error: "Audio URL expired or invalid" });
        return;
      }

      res.setHeader("Content-Type", ct);
      res.setHeader("Accept-Ranges", "bytes");
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);
      const cr = upstream.headers.get("content-range");
      if (cr) res.setHeader("Content-Range", cr);
      // Short cache — signed URLs expire in ~1 hour, so don't cache longer than 5 min
      res.setHeader("Cache-Control", "private, max-age=300");
      res.status(upstream.status);

      if (!upstream.body) {
        res.end();
        return;
      }
      // Stream the response body
      const reader = upstream.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { res.end(); break; }
            const ok = res.write(Buffer.from(value));
            if (!ok) await new Promise((r) => res.once("drain", r));
          }
        } catch (err) {
          console.error("[recording-proxy] stream error:", (err as Error).message);
          if (!res.headersSent) res.status(502).end();
        }
      };
      pump();
    } catch (err) {
      console.error("[recording-proxy] fetch error:", err);
      if (!res.headersSent) res.status(502).json({ error: "Upstream fetch failed" });
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
