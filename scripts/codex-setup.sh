#!/usr/bin/env bash

# Reproducible Codex/bootstrap setup for Linkpoint's web and unit-test suite.
# Run from any directory inside the checkout. Pass --skip-check to install only.
set -Eeuo pipefail

readonly BUN_VERSION="1.4.2"
RUN_CHECKS=true

case "${1:-}" in
  "") ;;
  --skip-check) RUN_CHECKS=false ;;
  -h|--help)
    cat <<'EOF'
Usage: ./scripts/codex-setup.sh [--skip-check]

Installs the locked dependencies and creates a local environment file. By
default it then runs the same type-check, unit-test, and web-build checks used
to validate the application. No credentials are needed for these checks.
EOF
    exit 0
    ;;
  *)
    printf 'Unknown option: %s\n' "$1" >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
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

if ! command -v bun >/dev/null 2>&1; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to bootstrap Bun when Bun is not already installed." >&2
    exit 1
  fi
  echo "Installing Bun ${BUN_VERSION}..."
  npm install --global "bun@${BUN_VERSION}"
fi

installed_bun_version="$(bun --version)"
if [[ "$installed_bun_version" != "$BUN_VERSION" ]]; then
  printf 'Expected Bun %s (found %s); installing the pinned version...\n' \
    "$BUN_VERSION" "$installed_bun_version"
  npm install --global "bun@${BUN_VERSION}"
fi

# Electron is not exercised by the browser/unit-test checks. Avoid downloading
# its large runtime binary while still installing the package APIs and types.
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
bun install --frozen-lockfile

if [[ ! -e .env.local ]]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example (test/build checks need no secrets)."
fi

if [[ "$RUN_CHECKS" == true ]]; then
  bun run check
else
  echo "Setup complete. Run 'bun run check' to validate the app."
fi
