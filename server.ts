import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log(`[Server] Starting in ${process.env.NODE_ENV || 'development'} mode...`);

  // Basic middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.text({ type: ['text/xml', 'application/xml', 'application/llsd+xml'] }));
  app.use(express.raw({ type: '*/*', limit: '1mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    console.log("[Server] Health check hit");
    res.json({ status: "ok", env: process.env.NODE_ENV || 'development' });
  });

  // CORS Proxy Endpoint
  app.all("/api/proxy", async (req, res) => {
    const targetUrl = (req.query.url || req.body.url) as string;
    
    console.log(`[Proxy] ${req.method} request for: ${targetUrl}`);

    if (!targetUrl) {
      return res.status(400).json({ error: "Target URL is required" });
    }

    // Determine the body to forward
    let forwardData = req.body;
    
    // Handle Buffer from express.raw()
    if (Buffer.isBuffer(req.body)) {
      forwardData = req.body;
    }
    
    console.log(`[Proxy] Body type: ${typeof req.body}, isBuffer: ${Buffer.isBuffer(req.body)}, length: ${Buffer.isBuffer(req.body) ? req.body.length : (typeof req.body === 'string' ? req.body.length : 'N/A')}`);
    if (typeof req.body === 'string') {
      console.log(`[Proxy] Body start: ${req.body.substring(0, 50)}...`);
    } else if (Buffer.isBuffer(req.body)) {
      console.log(`[Proxy] Buffer start: ${req.body.toString('utf8', 0, 50)}...`);
    }

    // If req.body is an empty object (from express.json() default), 
    // but the request actually had no body, we should send undefined
    if (req.method === 'GET' || (!Buffer.isBuffer(req.body) && typeof req.body === 'object' && Object.keys(req.body).length === 0)) {
      forwardData = undefined;
    }

    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: forwardData,
        responseType: "arraybuffer",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Content-Type": req.headers["content-type"] || "text/xml"
        },
        timeout: 20000
      });

      const contentType = response.headers["content-type"];
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      res.send(response.data);
    } catch (error: any) {
      console.error(`[Proxy] Error fetching ${targetUrl}:`, error.message);
      res.status(error.response?.status || 500).json({ 
        error: "Failed to fetch target URL",
        message: error.message 
      });
    }
  });

  console.log("[Server] Testing outbound connectivity...");
  axios.get("https://login.agni.lindenlab.com/cgi-bin/login.cgi", { timeout: 5000 })
    .then(r => console.log("[Server] Outbound connectivity to SL OK:", r.status))
    .catch(e => console.error("[Server] Outbound connectivity to SL FAILED:", e.message));

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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server] Failed to start:", err);
});
