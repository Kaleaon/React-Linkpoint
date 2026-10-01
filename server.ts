import express from "express";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import dgram from "dgram";
import { getAllowedProxyHosts, parseSecureProxyTarget } from "./src/linkpoint/proxy-policy.ts";
import { CapabilityPermitService, extractSeedCapability } from "./src/linkpoint/proxy-permit.ts";
import { processLLSDWithGemini } from "./src/server/llsd-assistant.ts";
import {
  createSLSession,
  teleportSL, touchSLObject, sitSL, standSL, getSLBalance,
  getSLSession,
  getSLDiagnostics,
  sendSLChat,
  sendSLInstantMessage,
  sendSLGroupMessage,
  sendSLFriendRequest,
  fetchSLFriends,
  fetchSLGroups,
  fetchSLInventory,
  fetchSLSceneObjects,
  fetchSLSceneAssets,
  closeSLSession,
} from "./src/server/sl-session.ts";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Filter out harmless SL packet padding and diagnostic warnings from node-metaverse
const _origConsoleError = console.error;
console.error = function (...args: any[]) {
  if (
    typeof args[0] === 'string' &&
    (args[0].startsWith('WARNING: Finished reading ') ||
     args[0].includes("not at the end of the packet") ||
     args[0].startsWith('WARNING: Bytes written does not match') ||
     args[0].startsWith('WARNING: BUFFER UNDERFLOW'))
  ) {
    return;
  }
  _origConsoleError.apply(console, args);
};

export async function createApp() {
  const app = express();
  const permitSecret = process.env.PROXY_PERMIT_SECRET || (process.env.NODE_ENV !== 'production' ? 'development-only-secret-must-never-be-deployed' : '');
  const permits = new CapabilityPermitService(permitSecret);

  // The API is only intended for the viewer origin.  Development uses the
  // Vite middleware on this same origin; deployments must set APP_URL.
  const allowedOrigin = process.env.APP_URL;
  app.use(cors({ origin: allowedOrigin ? [allowedOrigin] : true, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: ['text/xml', 'application/xml', 'application/llsd+xml'] }));
  app.use(express.raw({ type: '*/*', limit: '1mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    console.log("[Server] Health check hit");
    res.json({ status: "ok", env: process.env.NODE_ENV || 'development' });
  });

  // Real Second Life / OpenSim Session Management
  app.get("/api/sl/auto-login-status", (_req, res) => {
    const hasSecrets = Boolean(process.env.USERNAME && process.env.PASSWORD);
    let displayName = "";
    if (hasSecrets && process.env.USERNAME) {
      displayName = process.env.USERNAME.includes(" ")
        ? process.env.USERNAME
        : `${process.env.USERNAME} Resident`;
    }
    res.json({
      available: hasSecrets,
      username: displayName,
      grid: "agni",
    });
  });

  app.post("/api/sl/auto-login", async (req, res) => {
    try {
      const username = process.env.USERNAME;
      const password = process.env.PASSWORD;
      if (!username || !password) {
        return res.status(400).json({ error: "USERNAME and PASSWORD secrets are not configured on server" });
      }
      const { start } = req.body || {};
      console.log(`[SL Session] Auto-logging in resident "${username}" to Second Life (agni)...`);
      const session = await createSLSession({
        loginUrl: "https://login.agni.lindenlab.com/cgi-bin/login.cgi",
        username,
        password,
        start: start || "last",
      });
      res.json(session);
    } catch (err: any) {
      console.error("[SL Auto-Login Error]", err.message);
      res.status(401).json({ error: err.message || "Auto-login failed" });
    }
  });

  app.post("/api/sl/connect", async (req, res) => {
    try {
      const { loginUrl, username, password, start } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }
      console.log(`[SL Session] Connecting resident "${username}" to ${loginUrl || 'Second Life'}...`);
      const session = await createSLSession({
        loginUrl: loginUrl || "https://login.agni.lindenlab.com/cgi-bin/login.cgi",
        username,
        password,
        start,
      });
      res.json(session);
    } catch (err: any) {
      console.error("[SL Connect Error]", err.message);
      res.status(401).json({ error: err.message || "Failed to log in to Second Life" });
    }
  });

  app.post("/api/sl/chat", async (req, res) => {
    try {
      const { sessionId, message, channel, type } = req.body || {};
      if (!sessionId || !message) {
        return res.status(400).json({ error: "Missing sessionId or message" });
      }
      await sendSLChat(sessionId, message, channel ?? 0, type ?? 1);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Viewer actions. Each validates its own input (electron/sl-actions.cjs) and
  // reports only what the grid answered.
  const action = (run: (sessionId: string, body: any) => any) => async (req: any, res: any) => {
    try {
      const sessionId = String((req.method === "GET" ? req.query.sessionId : req.body?.sessionId) || "");
      if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
      res.json(await run(sessionId, req.body || {}));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  };
  app.post("/api/sl/teleport", action((id, body) => teleportSL(id, body)));
  app.post("/api/sl/touch", action((id, body) => touchSLObject(id, body)));
  app.post("/api/sl/sit", action((id, body) => sitSL(id, body)));
  app.post("/api/sl/stand", action((id) => standSL(id)));
  app.get("/api/sl/balance", action((id) => getSLBalance(id)));

  app.post("/api/sl/im", async (req, res) => {
    try {
      const { sessionId, to, message } = req.body || {};
      if (!sessionId || !to || !message) {
        return res.status(400).json({ error: "Missing sessionId, to, or message" });
      }
      await sendSLInstantMessage(sessionId, to, message);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sl/group-message", async (req, res) => {
    try {
      const { sessionId, groupId, message } = req.body || {};
      if (!sessionId || !groupId || !message) {
        return res.status(400).json({ error: "Missing sessionId, groupId, or message" });
      }
      await sendSLGroupMessage(sessionId, groupId, message);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sl/diagnostics", (req, res) => {
    try {
      const sessionId = (req.query.sessionId as string) || "";
      const diag = getSLDiagnostics(sessionId);
      res.json(diag);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sl/friends", async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }
      const friends = await fetchSLFriends(sessionId);
      res.json(friends);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sl/groups", async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }
      const groups = await fetchSLGroups(sessionId);
      res.json(groups);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sl/friend-request", async (req, res) => {
    try {
      const { sessionId, to, message } = req.body || {};
      if (!sessionId || !to) {
        return res.status(400).json({ error: "Missing sessionId or to" });
      }
      await sendSLFriendRequest(sessionId, to, message || "Would you like to be friends?");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sl/events", (req, res) => {
    const sessionId = req.query.sessionId as string;
    const session = getSLSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") res.flushHeaders();

    session.eventClients.push(res);
    res.write(`data: ${JSON.stringify({ type: "connected", data: { sim: session.simName } })}\n\n`);

    // Stream initial 3D simulator objects to newly connected client
    try {
      const initialObjects = fetchSLSceneObjects(sessionId);
      for (const obj of initialObjects) {
        res.write(`data: ${JSON.stringify({ type: "object-add", data: obj })}\n\n`);
      }
      for (const asset of fetchSLSceneAssets(sessionId)) {
        const payload = asset.type ? asset : { type: "asset-ready", data: asset };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (objErr) {
      console.warn('[SL Events] Error streaming initial objects:', objErr);
    }

    req.on("close", () => {
      const index = session.eventClients.indexOf(res);
      if (index !== -1) session.eventClients.splice(index, 1);
    });
  });

  app.get("/api/sl/scene", (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }
      const objects = fetchSLSceneObjects(sessionId);
      res.json(objects);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sl/inventory", async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      const folderId = req.query.folderId as string | undefined;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" });
      }
      const data = await fetchSLInventory(sessionId, folderId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sl/disconnect", (req, res) => {
    const { sessionId } = req.body || {};
    if (sessionId) closeSLSession(sessionId);
    res.json({ ok: true });
  });

  // --- Local / Removable Flashdrive Cache System ---
  const getCacheDir = (customPath?: string) => {
    if (customPath && typeof customPath === "string" && customPath.trim().length > 0) {
      if (customPath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(customPath)) {
        return customPath;
      }
      return path.resolve(process.cwd(), customPath);
    }
    return path.resolve(process.cwd(), ".sl-cache");
  };

  app.post("/api/sl/cache/inventory", async (req, res) => {
    try {
      const { agentId, customPath, inventoryData } = req.body || {};
      if (!agentId || !inventoryData) {
        return res.status(400).json({ error: "Missing agentId or inventoryData" });
      }
      const cacheDir = getCacheDir(customPath);
      await fs.promises.mkdir(cacheDir, { recursive: true });
      const filePath = path.join(cacheDir, `inventory_${agentId}.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(inventoryData), "utf8");
      res.json({ ok: true, path: filePath, foldersCount: inventoryData.foldersCount || 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/sl/cache/inventory", async (req, res) => {
    try {
      const agentId = req.query.agentId as string;
      const customPath = req.query.path as string;
      if (!agentId) return res.status(400).json({ error: "Missing agentId" });
      const cacheDir = getCacheDir(customPath);
      const filePath = path.join(cacheDir, `inventory_${agentId}.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "Cache not found" });
      }
      const data = await fs.promises.readFile(filePath, "utf8");
      res.json(JSON.parse(data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sl/cache/texture", async (req, res) => {
    try {
      const { uuid, dataUrl, customPath } = req.body || {};
      if (!uuid || !dataUrl) return res.status(400).json({ error: "Missing uuid or dataUrl" });
      const texDir = path.join(getCacheDir(customPath), "textures");
      await fs.promises.mkdir(texDir, { recursive: true });
      await fs.promises.writeFile(path.join(texDir, `${uuid}.txt`), dataUrl, "utf8");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/sl/cache/clear", async (req, res) => {
    try {
      const { customPath } = req.body || {};
      const cacheDir = getCacheDir(customPath);
      if (fs.existsSync(cacheDir)) {
        await fs.promises.rm(cacheDir, { recursive: true, force: true });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // LLSD assistant status. This only explains pasted LLSD; it cannot stand in for a grid.
  app.get("/api/gemini/status", (req, res) => {
    res.json({
      status: "ok",
      purpose: "LLSD explanation assistant",
      model: "gemini-3.8-flash",
      apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // LLSD explanation assistant
  app.post("/api/gemini/llsd", async (req, res) => {
    try {
      const { data, task = "Parse and explain this LLSD structure" } = req.body || {};
      const result = await processLLSDWithGemini(data || "", task);
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // CORS Proxy Endpoint. Failures are reported as failures; nothing is synthesized.
  app.all("/api/proxy", async (req, res) => {
    const targetUrl = (req.query.url || req.body?.url) as string;
    let target: URL | null = null;
    const host = req.headers.host || 'localhost:3000';
    const proto = (req.headers['x-forwarded-proto'] as string) || (req.secure ? 'https' : (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https'));

    try {
      if (targetUrl) {
        target = parseSecureProxyTarget(targetUrl);
        // Ensure local server targets always use http protocol to avoid SSL wrong version errors
        if (target.hostname === 'localhost' || target.hostname === '127.0.0.1') {
          target.protocol = 'http:';
        }
        const currentHost = host.split(':')[0].toLowerCase();
        const allowedHosts = getAllowedProxyHosts();
        if (currentHost) allowedHosts.add(currentHost);
        const isLoginHost = allowedHosts.has(target.hostname.toLowerCase());
        if (!isLoginHost && !permits.permits(target, req.header('x-linkpoint-capability-permit'))) {
          throw new Error('Target host is not allowed by this session permit');
        }
      }
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    // Determine the body to forward
    let forwardData = req.body;
    
    // Handle Buffer from express.raw()
    if (Buffer.isBuffer(req.body)) {
      forwardData = req.body;
    }
    
    // If req.body is an empty object (from express.json() default), 
    // but the request actually had no body, we should send undefined
    if (req.method === 'GET' || (!Buffer.isBuffer(req.body) && typeof req.body === 'object' && Object.keys(req.body).length === 0)) {
      forwardData = undefined;
    }

    const xmlBodyStr = Buffer.isBuffer(forwardData)
      ? forwardData.toString('utf8')
      : typeof forwardData === 'string'
      ? forwardData
      : JSON.stringify(forwardData || '');

    if (!target) {
      return res.status(400).json({ error: "Missing proxy target URL" });
    }

    try {
      const response = await axios({
        method: req.method,
        url: target.toString(),
        data: forwardData,
        responseType: "arraybuffer",
        headers: {
          "Accept": String(req.headers.accept || "text/xml, application/xml"),
          "Content-Type": String(req.headers["content-type"] || "text/xml"),
        },
        timeout: 10000,
        maxContentLength: 1024 * 1024,
        maxBodyLength: 1024 * 1024,
        maxRedirects: 0,
      });

      const contentType = response.headers["content-type"];
      if (contentType) {
        res.setHeader("Content-Type", contentType as string);
      }
      const permit = extractSeedCapability(Buffer.from(response.data).toString('utf8'));
      const token = permits.issue(permit);
      if (token) {
        res.setHeader('X-Linkpoint-Capability-Permit', token);
        res.setHeader('Access-Control-Expose-Headers', 'X-Linkpoint-Capability-Permit');
      }
      
      res.send(response.data);
    } catch (error: any) {
      // An unreachable grid is reported as exactly that. The proxy never invents
      // a login reply, so a failed connection can never look like a successful one.
      console.warn(`[Proxy] Target ${target.hostname} unreachable (${error.message}).`);
      res.status(error.response?.status || 502).json({
        error: "Failed to fetch target URL",
        message: error.message,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Mounting Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Serving static files from dist...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  console.log(`[Server] Starting in ${process.env.NODE_ENV || 'development'} mode...`);
  const app = await createApp();

  const server = http.createServer(app);

  // WebSocket to UDP bridging
  const wss = new WebSocketServer({ server, path: '/api/udp-proxy' });

  wss.on('connection', (ws) => {
    let udpSocket = null;
    let targetIp = null;
    let targetPort = null;

    ws.on('message', (message) => {
      // First message must be a JSON config containing ip and port
      if (!udpSocket) {
        try {
          const config = JSON.parse(message.toString());
          if (!config.ip || !config.port) {
            throw new Error("Missing ip or port");
          }
          targetIp = config.ip;
          targetPort = config.port;

          udpSocket = dgram.createSocket('udp4');

          udpSocket.on('message', (msg, rinfo) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(msg);
            }
          });

          udpSocket.on('error', (err) => {
            console.error(`[UDP Error] ${err.message}`);
            ws.close();
          });

          ws.send(JSON.stringify({ status: "connected" }));
          console.log(`[UDP Proxy] Bridged to ${targetIp}:${targetPort}`);
        } catch (e) {
          console.error("[UDP Proxy] Invalid initialization message:", e);
          ws.close();
        }
      } else {
        // Forward binary WebSocket messages to UDP
        if (targetIp && targetPort) {
          udpSocket.send(message, targetPort, targetIp, (err) => {
             if (err) console.error("[UDP Proxy] Send error:", err);
          });
        }
      }
    });

    ws.on('close', () => {
      if (udpSocket) {
        udpSocket.close();
      }
      console.log(`[UDP Proxy] Disconnected from ${targetIp}:${targetPort}`);
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Failed to start:", err);
});
