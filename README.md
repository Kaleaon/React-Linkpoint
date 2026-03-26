<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Linkpoint PWA

LLSD playground + Second Life connectivity utilities packaged as a Progressive Web App.

## Local development

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a local env file:
   ```bash
   cp .env.example .env.local
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```

## PWA notes

- The app registers `public/service-worker.js` in production builds.
- Manifest is provided by `public/manifest.webmanifest`.
- Install prompt will be available in compatible browsers when served over HTTPS.

## GitHub Pages deployment

This repo is configured to build with a production base path of `/React-Linkpoint/` by default.

If your repository name/path is different, set a custom base at build time:

```bash
VITE_BASE_PATH="/<your-repo-name>/" npm run build
```

Deploy the `dist/` directory to GitHub Pages.

## Second Life connectivity in static hosting

GitHub Pages cannot run the local `/api/proxy` endpoint. For reliable login/caps/chat access on static hosting:

1. Deploy a dedicated HTTPS proxy that forwards XML-RPC + LLSD requests.
2. Set:

```bash
VITE_SL_PROXY_URL="https://your-proxy.example/proxy?url="
```

Without `VITE_SL_PROXY_URL`, the app falls back to public proxies (best-effort, not guaranteed).
