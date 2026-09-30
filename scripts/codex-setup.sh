#!/usr/bin/env bash

# Standalone Codex/bootstrap setup for Linkpoint's web and unit-test suite.
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
"${BUN[@]}" install --frozen-lockfile --ignore-scripts

# package.json normally applies this compatibility patch through postinstall.
# Inline it here so this standalone bootstrap does not invoke that helper.
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const packetPath = path.join(
  process.cwd(),
  'node_modules/@caspertech/node-metaverse/dist/lib/classes/Packet.js',
);
if (fs.existsSync(packetPath)) {
  const target = "console.error('WARNING: Finished reading ' + (0, MessageClasses_1.nameFromID)(messageID) + ' but we\\'re not at the end of the packet (' + pos + ' < ' + buf.length + ', seq ' + this.sequenceNumber + ')');";
  const replacement = '// Second Life simulator packets frequently contain extra padding or newer unparsed fields; ignore gracefully';
  const content = fs.readFileSync(packetPath, 'utf8');
  if (content.includes(target)) {
    fs.writeFileSync(packetPath, content.replace(target, replacement), 'utf8');
  }
}
NODE

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
  echo "Setup complete. Re-run without --skip-check to validate the app."
fi
