import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function run(binary, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [path.resolve('node_modules', binary), ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('vite/bin/vite.js', ['build'], { VITE_BASE_PATH: './' });
run('electron-builder/out/cli/cli.js', ['--publish', 'never']);
