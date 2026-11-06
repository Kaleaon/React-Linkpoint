#!/usr/bin/env node
/**
 * Cross-platform desktop packaging driver.
 *
 * Builds the web bundle with a relative asset base (Electron loads
 * dist/index.html over file://, where the GitHub Pages base path would break
 * every asset URL) and then hands off to electron-builder. Any extra CLI
 * arguments are forwarded, e.g. `npm run build:desktop -- --linux AppImage`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const forwarded = process.argv.slice(2);

function findCachedElectronZip() {
  const cacheBase = join(homedir(), '.cache', 'electron');
  if (!existsSync(cacheBase)) return null;
  for (const entry of readdirSync(cacheBase, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.zip')) {
      return join(cacheBase, entry.name);
    }
    if (entry.isDirectory()) {
      const sub = join(cacheBase, entry.name);
      for (const subEntry of readdirSync(sub, { withFileTypes: true })) {
        if (subEntry.isFile() && subEntry.name.endsWith('.zip')) {
          return join(sub, subEntry.name);
        }
      }
    }
  }
  return null;
}

const extraArgs = [];
if (!forwarded.some((arg) => arg.includes('electronDist'))) {
  const cachedZip = findCachedElectronZip();
  if (cachedZip) {
    extraArgs.push(`--config.electronDist=${cachedZip}`);
  }
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });

  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('node', ['scripts/build-wasm.mjs', '--check']);
run('node', ['scripts/check-source-imports.mjs']);
run('node', ['scripts/generate-desktop-icons.mjs']);
run('npx', ['--no-install', 'vite', 'build'], { VITE_BASE_PATH: './' });
// The config is passed explicitly: electron-builder's auto-discovery does not
// pick up electron-builder.config.js here, and silently falling back to its
// defaults drops directories.output and extraMetadata.main, which fails the
// build with `Application entry file "index.js" ... was not found`.
run('npx', [
  '--no-install',
  'electron-builder',
  '--config',
  'electron-builder.config.js',
  ...extraArgs,
  ...forwarded,
]);
