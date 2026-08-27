import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import multer from "multer";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { aircallRouter } from "../aircall";
import { startAircallSyncJob } from "../aircallSync";
import { scheduledLossIntakeSyncHandler } from "../lossIntakeScheduled";
import {
  SLACK_LOSS_INTAKE_PATH,
  slackLossIntakeEventsHandler,
} from "../lossIntakeSlackEvents";
import { dailyDigestHandler } from "../scheduled/dailyDigest";
import { weeklyQAPostHandler } from "../scheduled/weeklyQAPost";
import {
  REMOTE_OPS_SLACK_PATH,
  remoteOpsSlackEventsHandler,
} from "../remoteOpsSlackEvents";
import { storagePut } from "../storage";
import { storageGetSignedUrl } from "../storage";
import { sdk } from "./sdk";
import {
  MAIL_SLACK_EVENTS_PATH,
  mailSlackEventsHandler,
} from "../mail/slackEventsHandler";
import {
  mailRemindersHandler,
  mailProcessHandler,
  mailIngestSlackHandler,
  mailQaWeeklyHandler,
} from "../mail/jobs";
import { mailIngestGmailHandler } from "../mail/jobs";
import {
  buildGmailOAuthUrl,
  exchangeGmailCode,
} from "../mail/ingestGmail";
import mysql from "mysql2/promise";

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

  // Slack signs the exact raw bytes, so this endpoint must precede express.json().
  // Remote Ops @claims-intake event handler — must precede express.json()
  app.post(
    REMOTE_OPS_SLACK_PATH,
    express.raw({ type: "application/json", limit: "1mb" }),
    remoteOpsSlackEventsHandler,
  );

  app.post(SLACK_LOSS_INTAKE_PATH,
    express.raw({ type: "application/json", limit: "1mb" }),
    slackLossIntakeEventsHandler,
  );

  app.post(
    MAIL_SLACK_EVENTS_PATH,
    express.raw({ type: "application/json", limit: "1mb" }),
    mailSlackEventsHandler,
  );

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // ─── Document File Upload Endpoint ─────────────────────────────────────────
  // Used by Medical Bills Review, Carrier Rebuttal, PIP Exhaustion, TL Settlement
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  });

  app.post("/api/upload/document", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      const { originalname, mimetype, buffer } = req.file;
      const safeFilename = originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `docgen-uploads/${Date.now()}_${safeFilename}`;
      const { url } = await storagePut(key, buffer, mimetype);
      // Get a presigned S3 URL so the LLM can read the file directly
      const signedUrl = await storageGetSignedUrl(key).catch(() => url);
      res.json({ url, signedUrl, key, filename: originalname, mimetype });
    } catch (err) {
      console.error("[upload/document] Error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // ─── Mail item file upload ─────────────────────────────────────────────────
  app.post("/api/mail/:id/files", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }
      // Auth: must be signed in
      let user: any = null;
      try { user = await sdk.authenticateRequest(req); } catch {}
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

      const itemId = parseInt(req.params.id, 10);
      if (isNaN(itemId)) { res.status(400).json({ error: "Invalid item id" }); return; }

      // Load item to check permission
      const conn = await mysql.createConnection(process.env.DATABASE_URL!);
      try {
        const [[item]] = await conn.execute<any[]>(
          "SELECT id, assigned_handler_id FROM mail_items WHERE id = ?",
          [itemId]
        );
        if (!item) { res.status(404).json({ error: "Item not found" }); return; }
        const isAdmin = user.role === "admin";
        const isAssigned = user.handlerProfileId != null && item.assigned_handler_id === user.handlerProfileId;
        if (!isAdmin && !isAssigned) { res.status(403).json({ error: "Forbidden" }); return; }

        const { originalname, mimetype, buffer } = req.file!;
        const safeFilename = originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `mail/uploads/${itemId}/${Date.now()}_${safeFilename}`;
        const { key: storageKey } = await storagePut(key, buffer, mimetype);

        await conn.execute(
          "INSERT INTO mail_item_files (item_id, storage_key, filename, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)",
          [itemId, storageKey, originalname, mimetype, buffer.length]
        );
        const fileId = (await conn.execute<any>("SELECT LAST_INSERT_ID() AS id"))[0][0].id;

        // Append note
        await conn.execute(
          "INSERT INTO mail_item_notes (item_id, by_user_id, note) VALUES (?, ?, ?)",
          [itemId, user.id, `File added by ${user.name ?? user.email ?? "user"}: ${originalname}`]
        );

        res.json({ ok: true, fileId, storageKey, filename: originalname, contentType: mimetype, sizeBytes: buffer.length });
      } finally {
        await conn.end();
      }
    } catch (err) {
      console.error("[mail/files] Error:", err);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  app.use("/api/aircall", aircallRouter);
  app.post("/api/scheduled/loss-intake-sync", scheduledLossIntakeSyncHandler);

  // Scheduled endpoints — must be registered before tRPC/Vite fallthrough
  app.post("/api/scheduled/dailyDigest", dailyDigestHandler);
  app.post("/api/scheduled/weeklyQAPost", weeklyQAPostHandler);
  // ─── Claims Mail Triage jobs ─────────────────────────────────────────────────
  // Keep the autoscaling service warm before the source-recovery callbacks. This
  // route intentionally avoids database and third-party work so a cold start is
  // absorbed by the once-per-minute pulse instead of a mail-processing run.
  app.post("/api/scheduled/mailWarmup", (_req, res) => {
    res.status(204).end();
  });
  app.post("/api/scheduled/mailIngestGmail", mailIngestGmailHandler);
  app.post("/api/scheduled/mailIngestSlack", mailIngestSlackHandler);
  app.post("/api/scheduled/mailReminders", mailRemindersHandler);
  app.post("/api/scheduled/mailProcess", mailProcessHandler);
  app.post("/api/scheduled/mailQaWeekly", mailQaWeeklyHandler);

  // ─── Gmail OAuth connect ──────────────────────────────────────────────────
  const GMAIL_REDIRECT_URI = `${process.env.VITE_APP_URL ?? "https://whipivr-tyswfku7.manus.space"}/api/mail/gmail-oauth-callback`;

  /** Step 1: redirect admin to Google consent screen */
  // File proxy: stream S3 file to browser without X-Frame-Options blocking iframe preview
  app.get("/api/mail/file-proxy", async (req, res) => {
    try {
      const { storageKey: requestedStorageKey, fileId, download } = req.query as { storageKey?: string; fileId?: string; download?: string };
      if (!requestedStorageKey && !fileId) { res.status(400).json({ error: 'storageKey or fileId required' }); return; }
      const { storageGetSignedUrl, storagePut } = await import('../storage.js');
      let finalStorageKey = requestedStorageKey || '';
      let resolvedFileId = fileId && /^\d+$/.test(fileId) ? Number(fileId) : null;
      if (resolvedFileId) {
        const lookupConn = await mysql.createConnection(process.env.DATABASE_URL!);
        try {
          const [[file]] = await lookupConn.execute<any[]>(
            'SELECT storage_key FROM mail_item_files WHERE id = ? LIMIT 1',
            [resolvedFileId],
          );
          if (!file?.storage_key) { res.status(404).json({ error: 'Attachment record not found' }); return; }
          finalStorageKey = file.storage_key;
        } finally {
          await lookupConn.end();
        }
      }
      let upstream: Response | null = null;
      let recoveredBuffer: Buffer | null = null;
      let recoveredContentType: string | null = null;
      let recoveredFilename: string | null = null;
      const isUsableFileResponse = (response: Response) => {
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        return response.ok && !contentType.includes('xml') && !contentType.includes('text/html');
      };
      // Try to get from S3 first — wrap in try-catch since presign may fail for dev-env keys
      try {
        const signedUrl = await storageGetSignedUrl(finalStorageKey);
        const resp = await fetch(signedUrl);
        if (isUsableFileResponse(resp)) upstream = resp;
      } catch { /* fall through to Slack re-download */ }
      // If S3 failed (file was stored in a different environment), try lazy re-download from Slack
      if (!upstream) {
        try {
          const conn = await mysql.createConnection(process.env.DATABASE_URL!);
          // Look up the file record to get slackFileId
          const [fileRow] = await conn.execute<any[]>(
            `SELECT mf.id, mf.slack_file_id, mf.filename, mf.content_type,
                    mi.source, mi.external_id
             FROM mail_item_files mf
             JOIN mail_items mi ON mi.id = mf.item_id
             WHERE ${resolvedFileId ? 'mf.id = ?' : 'mf.storage_key = ?'} LIMIT 1`,
            [resolvedFileId ?? requestedStorageKey]
          );
          const fileRec = Array.isArray(fileRow) ? fileRow[0] : null;
          if (fileRec?.slack_file_id) {
            // Get the Slack bot token
            const [cfgRow] = await conn.execute<any[]>('SELECT slack_bot_token FROM mail_bot_config LIMIT 1');
            const cfg = Array.isArray(cfgRow) ? cfgRow[0] : null;
            const slackToken = cfg?.slack_bot_token || process.env.SLACK_BOT_TOKEN;
            if (slackToken) {
              // Fetch fresh download URL from Slack
              const infoResp = await fetch(`https://slack.com/api/files.info?file=${fileRec.slack_file_id}`, {
                headers: { Authorization: `Bearer ${slackToken}` }
              });
              const infoData = await infoResp.json() as any;
              const dlUrl = infoData?.file?.url_private_download || infoData?.file?.url_private;
              if (dlUrl) {
                const dlResp = await fetch(dlUrl, { headers: { Authorization: `Bearer ${slackToken}` } });
                if (isUsableFileResponse(dlResp)) {
                  const buf = Buffer.from(await dlResp.arrayBuffer());
                  const ct = fileRec.content_type || dlResp.headers.get('content-type') || 'application/pdf';
                  const fname = fileRec.filename || finalStorageKey.split('/').pop() || 'file.pdf';
                  // Serve the recovered original immediately. Re-uploading is best-effort only;
                  // attachment access must never fail merely because the storage write or a second
                  // signed-URL read fails.
                  recoveredBuffer = buf;
                  recoveredContentType = ct;
                  recoveredFilename = fname;
                  try {
                    const { key: newKey } = await storagePut(`mail/slack/redownload/${fname}`, buf, ct);
                    await conn.execute('UPDATE mail_item_files SET storage_key = ? WHERE id = ?', [newKey, fileRec.id]);
                    finalStorageKey = newKey;
                  } catch (storageRecoveryErr) {
                    console.warn('[file-proxy] Slack file served but storage refresh failed:', storageRecoveryErr);
                  }
                }
              }
            }
          }
          // Email attachments can also be stranded after a preview/prod storage boundary.
          // Re-fetch the original Gmail attachment by message ID and filename, then replace
          // its stale key so all subsequent opens use the live project bucket.
          if (!upstream && fileRec?.source === 'email' && fileRec.external_id) {
            const { buildRealGmailFetch } = await import('../mail/ingestGmail.js');
            const gmail = buildRealGmailFetch(conn);
            const token = await gmail.getAccessToken();
            const message = await gmail.getMessage(token, fileRec.external_id);
            const findAttachment = (parts: any[]): any | null => {
              for (const part of parts ?? []) {
                if (part.filename === fileRec.filename && part.body) return part;
                const nested = findAttachment(part.parts ?? []);
                if (nested) return nested;
              }
              return null;
            };
            const part = findAttachment(message.payload?.parts ?? []);
            if (part?.body?.attachmentId || part?.body?.data) {
              const encoded = part.body.attachmentId
                ? (await gmail.getAttachment(token, fileRec.external_id, part.body.attachmentId)).data
                : part.body.data;
              const buffer = Buffer.from(String(encoded).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
              const contentType = fileRec.content_type || part.mimeType || 'application/octet-stream';
              const { key: newKey } = await storagePut(
                `mail/email/recovered/${fileRec.external_id}/${fileRec.filename || 'attachment'}`,
                buffer,
                contentType,
              );
              await conn.execute('UPDATE mail_item_files SET storage_key = ? WHERE id = ?', [newKey, fileRec.id]);
              finalStorageKey = newKey;
              const recoveredResponse = await fetch(await storageGetSignedUrl(finalStorageKey));
              if (isUsableFileResponse(recoveredResponse)) upstream = recoveredResponse;
            }
          }
          await conn.end();
        } catch (redownloadErr) {
          console.error('[file-proxy] Re-download failed:', redownloadErr);
        }
      }
      if (!upstream && !recoveredBuffer) { res.status(404).json({ error: 'File not found or could not be recovered' }); return; }
      const contentType = recoveredContentType ?? upstream?.headers.get('content-type') ?? 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      const filename = recoveredFilename ?? finalStorageKey.split('/').pop() ?? 'file.pdf';
      if (download === '1') {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      } else {
        res.setHeader('Content-Disposition', 'inline');
        res.removeHeader('X-Frame-Options');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      }
      const buffer = recoveredBuffer ?? Buffer.from(await upstream!.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/api/mail/gmail-oauth-start", (req, res) => {
    const url = buildGmailOAuthUrl(GMAIL_REDIRECT_URI);
    res.redirect(url);
  });

  /** Step 2: Google redirects here with ?code=... — exchange for tokens and store */
  app.get("/api/mail/gmail-oauth-callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).send("Missing code parameter");
      return;
    }
    let conn: mysql.Connection | null = null;
    try {
      const tokens = await exchangeGmailCode(code, GMAIL_REDIRECT_URI);
      conn = await mysql.createConnection(process.env.DATABASE_URL!);
      // Upsert the refresh token into mail_settings
      await conn.execute(
        `INSERT INTO mail_settings (\`key\`, value) VALUES ('gmail_refresh_token', ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [tokens.refresh_token]
      );
      // Also store the connected email if available (best-effort)
      res.redirect("/#/mailroom?gmail=connected");
    } catch (e) {
      console.error("[gmail-oauth-callback] error:", e);
      res.redirect(`/#/mailroom?gmail=error&msg=${encodeURIComponent(String(e))}`);
    } finally {
      if (conn) await conn.end();
    }
  });

  /** Admin endpoint: check Gmail connection status */
  app.get("/api/mail/gmail-status", async (req, res) => {
    let conn: mysql.Connection | null = null;
    try {
      conn = await mysql.createConnection(process.env.DATABASE_URL!);
      const [[row]] = await conn.execute<any[]>(
        "SELECT value FROM mail_settings WHERE `key` = 'gmail_refresh_token'"
      );
      res.json({ connected: !!row?.value });
    } catch (e) {
      res.json({ connected: false, error: String(e) });
    } finally {
      if (conn) await conn.end();
    }
  });

  // Aircall recording proxy — accepts ?url=<encoded assets.aircall.io URL> or ?callId=<id>
  // Resolves the Aircall asset URL to a fresh signed S3 URL via the Aircall API, then
  // streams the audio back to the browser using fetch() (which follows redirects automatically).
  // CORS headers are added so the <audio> element can play cross-origin.
  // Handles both GET (streaming) and HEAD (pre-flight check from VoicemailPlayer).
  app.all("/api/aircall-recording", async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
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

      // HEAD requests only need headers, not the body
      if (req.method === "HEAD" || !upstream.body) {
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
