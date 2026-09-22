#!/usr/bin/env node
/**
 * Cross-platform desktop packaging driver.
 *
 * Builds the web bundle with a relative asset base (Electron loads
 * dist/index.html over file://, where the GitHub Pages base path would break
 * every asset URL) and then hands off to electron-builder. Any extra CLI
 * arguments are forwarded, e.g. `npm run build:desktop -- --linux AppImage`.
 */
import {spawnSync} from 'node:child_process';

const forwarded = process.argv.slice(2);

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {...process.env, ...env},
  });

  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('npx', ['--no-install', 'vite', 'build'], {VITE_BASE_PATH: './'});
run('npx', ['--no-install', 'electron-builder', ...forwarded]);
