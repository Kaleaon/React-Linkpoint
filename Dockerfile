# Linkpoint bridge for Fly.io: runs server.ts (HTTP API, /api/proxy and the
# /api/udp-proxy WebSocket-to-UDP relay). The web front end is served from
# Vercel, so no `vite build` happens here.
FROM node:22-slim

WORKDIR /app

# Skip the Electron binary download; the bridge never launches the desktop app.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

# Copy the whole tree before installing: package.json depends on the local
# packages/design-system and the postinstall script reads files from src/.
# server.ts imports `vite` at load time, so dev dependencies are required too.
COPY . .
RUN npm install --no-audit --no-fund

# NODE_ENV=production is set at runtime in fly.toml, not here, so the install
# above keeps its dev dependencies.
EXPOSE 3000
CMD ["npm", "start"]
