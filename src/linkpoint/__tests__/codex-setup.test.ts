import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const codexSetupPath = path.join(repoRoot, 'scripts', 'codex-setup.sh');
const packageJsonPath = path.join(repoRoot, 'package.json');
const esbuildBinPath = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild',
);

interface PackageJsonShape {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

describe('scripts/codex-setup.sh CI parity', () => {
  it('declares esbuild explicitly in devDependencies', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJsonShape;
    expect(pkg.devDependencies?.esbuild).toBeDefined();
    expect(existsSync(esbuildBinPath)).toBe(true);
  });

  it('documents server build verification in --help output', () => {
    const output = execFileSync('bash', [codexSetupPath, '--help'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).toContain('Usage: ./scripts/codex-setup.sh [--check]');
    expect(output).toContain('production build');
    expect(output).toContain('server build');
  });

  it('runs the esbuild server bundle command directly after vite build during --check', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJsonShape;
    const expectedServerBuildScript = pkg.scripts?.['build:server'];
    expect(expectedServerBuildScript).toBe(
      'esbuild server.ts --bundle --platform=node --packages=external --format=esm --outfile=dist-server/server.mjs',
    );

    const scriptSource = readFileSync(codexSetupPath, 'utf8');
    const expectedStandaloneCommand = `./node_modules/.bin/${expectedServerBuildScript}`;
    expect(scriptSource).toContain(expectedStandaloneCommand);

    const viteBuildIndex = scriptSource.indexOf('./node_modules/.bin/vite build');
    const esbuildIndex = scriptSource.indexOf(expectedStandaloneCommand);
    expect(viteBuildIndex).toBeGreaterThan(-1);
    expect(esbuildIndex).toBeGreaterThan(viteBuildIndex);
  });

  it('compiles server.ts into a fresh dist-server/server.mjs directory and fails on syntax errors', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'linkpoint-server-build-'));
    try {
      const outFile = path.join(tmpDir, 'dist-server', 'server.mjs');
      expect(existsSync(path.dirname(outFile))).toBe(false);

      execFileSync(
        esbuildBinPath,
        [
          path.join(repoRoot, 'server.ts'),
          '--bundle',
          '--platform=node',
          '--packages=external',
          '--format=esm',
          `--outfile=${outFile}`,
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      );

      expect(existsSync(outFile)).toBe(true);
      expect(readFileSync(outFile, 'utf8').length).toBeGreaterThan(0);

      const brokenServer = path.join(tmpDir, 'broken-server.ts');
      writeFileSync(brokenServer, 'export const broken = (; // invalid syntax\n', 'utf8');
      const brokenResult = spawnSync(
        esbuildBinPath,
        [
          brokenServer,
          '--bundle',
          '--platform=node',
          '--packages=external',
          '--format=esm',
          `--outfile=${path.join(tmpDir, 'broken-out.mjs')}`,
        ],
        { cwd: repoRoot, encoding: 'utf8' },
      );
      expect(brokenResult.status).not.toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
