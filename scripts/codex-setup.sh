#!/usr/bin/env bash

# Standalone Codex/bootstrap setup for Linkpoint's web and unit-test suite.
# Run from any directory inside the checkout. Pass --check to validate afterward.
set -Eeuo pipefail

readonly BUN_VERSION="1.4.2"
RUN_CHECKS=false

case "${1:-}" in
  ""|--skip-check) ;;
  --check) RUN_CHECKS=true ;;
  -h|--help)
    cat <<'EOF'
Usage: ./scripts/codex-setup.sh [--check]

Installs the locked dependencies and creates a local environment file. Pass
--check to additionally run the type-check, unit tests, and production build.
No credentials are needed for setup or for these checks.
EOF
    exit 0
    ;;
  *)
    printf 'Unknown option: %s\n' "$1" >&2
    exit 2
    ;;
esac

if REPO_ROOT="$(git -C "$PWD" rev-parse --show-toplevel 2>/dev/null)"; then
  : # A pasted Codex setup script starts with the checkout as its working tree.
else
  SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
fi
cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 or newer is required but was not found." >&2
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( node_major < 22 )); then
  printf 'Node.js 22 or newer is required (found %s).\n' "$(node --version)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to run the pinned Bun binary without a global install." >&2
  exit 1
fi

# Do not install tools globally: Codex containers commonly use an unprivileged
# account. npm exec downloads the exact Bun binary into npm's user cache and
# works whether or not the image happens to have another Bun version installed.
BUN=(npm exec --yes --package="bun@${BUN_VERSION}" -- bun)

# Electron is not exercised by the browser/unit-test checks. Avoid downloading
# its large runtime binary while still installing the package APIs and types.
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
if ! "${BUN[@]}" install --frozen-lockfile --ignore-scripts; then
  # Bun downloads GitHub dependencies (xmlrpc, via @caspertech/node-metaverse)
  # from the api.github.com tarball endpoint, which restricted proxies and
  # sandboxes often block even when git over HTTPS works. npm clones them with
  # git instead, so fall back to it rather than leaving no node_modules.
  echo "bun install failed; retrying with npm (clones GitHub dependencies via git)." >&2
  rm -rf node_modules
  npm install --ignore-scripts --no-audit --no-fund --no-package-lock --legacy-peer-deps
fi

# package.json normally applies these compatibility patches through postinstall,
# which --ignore-scripts skipped. Apply all of them (Packet.js, friend online
# status, viewer identity); the test suite asserts the identity patch.
node scripts/patch-metaverse.cjs

if [[ ! -e .env.local ]]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example (test/build checks need no secrets)."
fi

if [[ "$RUN_CHECKS" == true ]]; then
  # Keep this file standalone: invoke the installed tools directly instead of
  # depending on package.json helper scripts or another repository script.
  ./node_modules/.bin/tsc --noEmit
  ./node_modules/.bin/vitest run
  ./node_modules/.bin/vite build
else
  echo "Setup complete. Re-run with --check to validate the app."
fi
