# Linkpoint backend image.
#
# server.ts is the Node.js process that speaks Second Life's UDP protocol and
# exposes it to the web frontend over HTTP/SSE/WebSocket. Vercel cannot host
# it (no UDP sockets, no long-lived connections), so it runs here — on Fly.io,
# a VPS, or anywhere Node 22+ runs — while Vercel serves the static frontend
# and proxies /api/* to it (see vercel.json rewrites).
FROM node:22-slim

# Copy Bun binary for locked dependency resolution matching packageManager.
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun

# git is required: at least one dependency installs from a git URL.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Some dependencies use ssh:// git URLs; the repos are public, so rewrite to
# https (no SSH keys available at build time).
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

WORKDIR /app

# Copy dependency manifests, lockfile, and local workspace package before installing
# dependencies for optimal Docker layer caching.
COPY package.json .npmrc bun.lock ./
COPY packages/design-system ./packages/design-system

# Enforce strict lockfile execution using bun install --frozen-lockfile.
RUN bun install --frozen-lockfile --ignore-scripts

# Copy application source code after dependency installation completes.
COPY . .

# Apply post-install patches on installed dependencies.
RUN node scripts/patch-metaverse.cjs

RUN npm run build
# ESM format: server.ts uses import.meta.url (via createRequire), which only
# exists in ESM. .mjs runs as ESM regardless of package.json type.
RUN npx esbuild server.ts --bundle --platform=node --packages=external --format=esm --outfile=dist-server/server.mjs

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Serves the frontend, the /api/* HTTP endpoints, SSE events, and the
# WebSocket UDP bridge at /api/udp-proxy.
CMD ["node", "dist-server/server.mjs"]
