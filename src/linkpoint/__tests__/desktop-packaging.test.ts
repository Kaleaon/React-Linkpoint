import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, '../../..');
const config = require('../../../electron-builder.config.js') as {
  files: string[];
  extraMetadata: { main: string };
};
const excluded = new Set(
  config.files
    .filter((f) => f.startsWith('!node_modules/'))
    .map((f) => f.slice('!node_modules/'.length).replace(/\/\*\*\/\*$/, '')),
);

/** Bare package names the main process and shared core load at runtime. */
function runtimeRequires() {
  const names = new Set<string>();
  for (const dir of ['electron', 'core']) {
    for (const file of readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.cjs'))) {
      for (const m of readFileSync(path.join(root, dir, file), 'utf8').matchAll(
        /require\(\s*['"]([^'"]+)['"]\s*\)/g,
      )) {
        const request = m[1];
        if (request.startsWith('.') || request.startsWith('node:') || request === 'electron')
          continue;
        const segments = request.split('/');
        names.add(request.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]);
      }
    }
  }
  return [...names];
}

describe('desktop packaging', () => {
  it('ships the shared core and the Electron entry', () => {
    expect(config.files).toEqual(
      expect.arrayContaining(['dist/**/*', 'electron/**/*', 'core/**/*']),
    );
    expect(config.extraMetadata.main).toBe('electron/main.cjs');
  });

  it('keeps every package the main process and shared core require (sharp and jpeg2000 are loaded at startup)', () => {
    const packages = runtimeRequires().filter(
      (name) => !require('node:module').builtinModules.includes(name),
    );
    expect(packages).toEqual(
      expect.arrayContaining(['sharp', 'jpeg2000', '@caspertech/node-metaverse']),
    );
    for (const name of packages)
      expect(excluded.has(name), `${name} would be left out of the package`).toBe(false);
  });

  it("keeps sharp's platform binaries (optional dependencies) and still drops renderer-only packages", () => {
    expect(excluded.has('@img/sharp-linux-x64')).toBe(false);
    expect(excluded.has('@img/sharp-win32-x64')).toBe(false);
    for (const name of ['react', 'vite', 'vitest']) expect(excluded.has(name), name).toBe(true);
  });

  it('validates Electron configuration and main process entry successfully', () => {
    const res = spawnSync('node', ['scripts/validate-electron-config.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain(
      'Electron configuration and main process entry validated successfully.',
    );
  });

  it('fails validate-electron-config when electron/main.cjs has invalid syntax', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'electron-syntax-test-'));
    try {
      mkdirSync(path.join(tempDir, 'electron'), { recursive: true });
      writeFileSync(
        path.join(tempDir, 'electron', 'main.cjs'),
        'const syntax_error = { unclosed: ;',
      );
      writeFileSync(
        path.join(tempDir, 'electron-builder.config.js'),
        'module.exports = { files: ["electron/**/*"], extraMetadata: { main: "electron/main.cjs" } };',
      );
      const res = spawnSync('node', ['scripts/validate-electron-config.mjs', tempDir], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(res.status).not.toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails validate-electron-config when electron-builder.config.js throws during evaluation', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'electron-config-test-'));
    try {
      mkdirSync(path.join(tempDir, 'electron'), { recursive: true });
      writeFileSync(path.join(tempDir, 'electron', 'main.cjs'), 'module.exports = {};');
      writeFileSync(
        path.join(tempDir, 'electron-builder.config.js'),
        'throw new Error("Evaluation failure");',
      );
      const res = spawnSync('node', ['scripts/validate-electron-config.mjs', tempDir], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(res.status).not.toBe(0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('includes Electron configuration validation in combined check scripts before build steps', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const checkScript = pkg.scripts?.check ?? '';
    const electronCheckIdx = checkScript.indexOf('npm run check:electron');
    const buildIdx = checkScript.indexOf('npm run build');
    expect(electronCheckIdx).toBeGreaterThanOrEqual(0);
    expect(buildIdx).toBeGreaterThan(electronCheckIdx);

    const codexSetup = readFileSync(path.join(root, 'scripts', 'codex-setup.sh'), 'utf8');
    const runChecksMatch = codexSetup.match(
      /if \[\[ "\$RUN_CHECKS" == true \]\]; then([\s\S]*?)else/,
    );
    expect(runChecksMatch).not.toBeNull();
    const runChecksBlock = runChecksMatch?.[1] ?? '';
    const validateIdx = runChecksBlock.indexOf('node scripts/validate-electron-config.mjs');
    const viteBuildIdx = runChecksBlock.indexOf('./node_modules/.bin/vite build');
    expect(validateIdx).toBeGreaterThanOrEqual(0);
    expect(viteBuildIdx).toBeGreaterThan(validateIdx);
  });
});
