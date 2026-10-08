# Linkpoint backend image.
#
# server.ts is the Node.js process that speaks Second Life's UDP protocol and
# exposes it to the web frontend over HTTP/SSE/WebSocket. Vercel cannot host
# it (no UDP sockets, no long-lived connections), so it runs here — on Fly.io,
# a VPS, or anywhere Node 22+ runs — while Vercel serves the static frontend
# and proxies /api/* to it (see vercel.json rewrites).
FROM node:22-slim

# git is required: at least one dependency installs from a git URL.
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first for better layer caching.
# The repo has no package-lock.json; .npmrc sets legacy-peer-deps so the
# install avoids the npm arborist crash ("Cannot read properties of null
# (reading 'edgesOut')") that broke the Vercel builds.
COPY package.json .npmrc ./
RUN npm install

# Copy the rest and build the frontend; server.ts serves dist/ itself.
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Serves the frontend, the /api/* HTTP endpoints, SSE events, and the
# WebSocket UDP bridge at /api/udp-proxy.
CMD ["npx", "tsx", "server.ts"]
