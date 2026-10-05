import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const cSource = path.join(rootDir, 'src', 'wasm', 'spatial_engine.c');
const wasmOut = path.join(rootDir, 'public', 'spatial.wasm');
const tsOut = path.join(rootDir, 'src', 'wasm', 'spatial-wasm-binary.ts');

console.log('Compiling spatial_engine.c to WebAssembly SIMD module...');

const publicDir = path.join(rootDir, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Compile C to WASM using clang with SIMD enabled and imported memory
const clangCmd = `clang --target=wasm32 -msimd128 -O3 -nostdlib -Wl,--no-entry -Wl,--export-all -Wl,--import-memory -o "${wasmOut}" "${cSource}"`;
execSync(clangCmd, { stdio: 'inherit' });

const wasmBuffer = fs.readFileSync(wasmOut);
console.log(`WASM binary compiled successfully (${wasmBuffer.length} bytes).`);

if (wasmBuffer.length > 100 * 1024) {
  throw new Error(`WASM binary exceeds 100KB size limit (${wasmBuffer.length} bytes)`);
}

// Generate embedded TypeScript byte array for zero-fetch synchronous/asynchronous WASM initialization
const uint8ArrayStr = Array.from(wasmBuffer).join(',');
const tsContent = `// Auto-generated WebAssembly SIMD binary container
export const SPATIAL_WASM_BYTES = new Uint8Array([${uint8ArrayStr}]);
export const SPATIAL_WASM_SIZE = ${wasmBuffer.length};
`;

fs.writeFileSync(tsOut, tsContent, 'utf-8');
console.log(`Embedded WASM binary module written to ${tsOut}`);
