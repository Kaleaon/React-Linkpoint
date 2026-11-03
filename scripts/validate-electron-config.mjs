#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const rootDir = resolve(here, '../..');

export function validateElectronConfig(options = {}) {
  const cwd = options.cwd || rootDir;

  // 1. Verify CommonJS syntax of Electron main process entry
  execFileSync('node', ['-c', 'electron/main.cjs'], {
    cwd,
    stdio: options.stdio || 'inherit',
  });

  // 2. Load electron-builder.config.js to evaluate dynamic module closure resolution
  const require = createRequire(import.meta.url);
  const configPath = resolve(cwd, 'electron-builder.config.js');
  const config = require(configPath);

  if (!config || typeof config !== 'object') {
    throw new Error('electron-builder.config.js did not export a configuration object');
  }

  if (!Array.isArray(config.files) || config.files.length === 0) {
    throw new Error('electron-builder.config.js files list is missing or empty');
  }

  if (!config.extraMetadata || config.extraMetadata.main !== 'electron/main.cjs') {
    throw new Error("electron-builder.config.js extraMetadata.main must be 'electron/main.cjs'");
  }

  return config;
}

if (process.argv[1] && resolve(process.argv[1]) === here) {
  try {
    validateElectronConfig();
    console.log('Electron configuration and main process entry validated successfully.');
  } catch (error) {
    console.error('Electron validation failed:', error?.message || error);
    process.exit(1);
  }
}
