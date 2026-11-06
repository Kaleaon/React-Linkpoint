#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const rootDir = resolve(here, '../..');

export function validateElectronConfig(options = {}) {
  const cwd = options.cwd ? resolve(options.cwd) : rootDir;

  // 1. Verify CommonJS syntax of Electron main process entry
  execFileSync('node', ['-c', 'electron/main.cjs'], {
    cwd,
    stdio: options.stdio || 'inherit',
  });

  // 2. Load electron-builder.config.js to evaluate dynamic module closure resolution
  const require = createRequire(import.meta.url);
  const configPath = resolve(cwd, 'electron-builder.config.js');
  delete require.cache[configPath];
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

  // 3. Verify desktop icon generation utility succeeds before packaging
  const iconGeneratorScript = resolve(cwd, 'scripts/generate-desktop-icons.mjs');
  if (existsSync(iconGeneratorScript)) {
    execFileSync(process.execPath, [iconGeneratorScript], {
      cwd,
      stdio: options.stdio || 'inherit',
    });

    const requiredSizes = [16, 32, 48, 64, 128, 256, 512, 1024];
    for (const size of requiredSizes) {
      const pngPath = resolve(cwd, `build/icons/${size}x${size}.png`);
      if (!existsSync(pngPath)) {
        throw new Error(`Missing expected generated icon: ${pngPath}`);
      }
    }

    const icoPath = resolve(cwd, 'build/icons/icon.ico');
    if (!existsSync(icoPath)) {
      throw new Error(`Missing expected generated ICO file: ${icoPath}`);
    }

    const icnsPath = resolve(cwd, 'build/icons/icon.icns');
    if (!existsSync(icnsPath)) {
      throw new Error(`Missing expected generated ICNS file: ${icnsPath}`);
    }

    const iconPngPath = resolve(cwd, 'build/icons/icon.png');
    if (!existsSync(iconPngPath)) {
      throw new Error(`Missing expected generated PNG runtime icon: ${iconPngPath}`);
    }

    const hasIconInFiles = config.files.some(
      (entry) =>
        typeof entry === 'string' &&
        (entry.includes('build/icons') || entry.includes('build/**/*')),
    );
    if (!hasIconInFiles) {
      throw new Error(
        "electron-builder.config.js files list must include 'build/icons/**/*' for window icon packaging",
      );
    }
  }

  return config;
}

if (process.argv[1] && resolve(process.argv[1]) === here) {
  try {
    const targetDir = process.argv[2]
      ? resolve(process.argv[2])
      : process.cwd() !== rootDir &&
          (existsSync(resolve(process.cwd(), 'electron')) ||
            existsSync(resolve(process.cwd(), 'electron-builder.config.js')))
        ? process.cwd()
        : rootDir;
    validateElectronConfig({ cwd: targetDir });
    console.log('Electron configuration and main process entry validated successfully.');
  } catch (error) {
    console.error('Electron validation failed:', error?.message || error);
    process.exit(1);
  }
}
