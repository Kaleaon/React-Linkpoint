import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import { getAllowedProxyHosts, parseSecureProxyTarget } from "./src/linkpoint/proxy-policy";
import { CapabilityPermitService, extractSeedCapability } from "./src/linkpoint/proxy-permit";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp() {
  const app = express();
  const permitSecret = process.env.PROXY_PERMIT_SECRET || (process.env.NODE_ENV !== 'production' ? 'development-only-secret-must-never-be-deployed' : '');
  const permits = new CapabilityPermitService(permitSecret);

  // The API is only intended for the viewer origin.  Development uses the
  // Vite middleware on this same origin; deployments must set APP_URL.
  const allowedOrigin = process.env.APP_URL;
  app.use(cors({ origin: allowedOrigin || false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: ['text/xml', 'application/xml', 'application/llsd+xml'] }));
  app.use(express.raw({ type: '*/*', limit: '1mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    console.log("[Server] Health check hit");
    res.json({ status: "ok", env: process.env.NODE_ENV || 'development' });
  });

  // CORS Proxy Endpoint
  app.all("/api/proxy", async (req, res) => {
    const targetUrl = (req.query.url || req.body?.url) as string;
    let target: URL;
    try {
      target = parseSecureProxyTarget(targetUrl);
      const isLoginHost = getAllowedProxyHosts().has(target.hostname.toLowerCase());
      if (!isLoginHost && !permits.permits(target, req.header('x-linkpoint-capability-permit'))) {
        throw new Error('Target host is not allowed by this session permit');
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
        timeout: 20000,
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
      console.error(`[Proxy] Request to ${target.hostname} failed:`, error.message);
      res.status(error.response?.status || 500).json({ 
        error: "Failed to fetch target URL",
        message: error.message 
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Failed to start:", err);
});
