import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = realpathSync(resolve(import.meta.dirname, '..'));
const sourceRoot = join(root, 'src');
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.cjs', '.mjs']);
const resolutionExtensions = ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json'];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function relativeSpecifiers(source) {
  const results = [];
  // Static imports, re-exports, dynamic imports and CommonJS require calls all need to resolve in
  // the Linux deployment checkout. Restrict matches to quoted relative paths so package imports
  // and computed runtime URLs are deliberately ignored.
  const pattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\()\s*['"](\.{1,2}\/[^'"?#]+)['"]/g;
  for (const match of source.matchAll(pattern)) results.push(match[1]);
  return results;
}

function candidates(importer, specifier) {
  const target = resolve(dirname(importer), specifier);
  const extension = extname(target);
  if (extension) {
    // TypeScript intentionally permits source imports ending in .js so emitted ESM keeps a
    // runnable extension. Resolve those the same way the compiler does.
    if (extension === '.js' || extension === '.jsx') {
      const stem = target.slice(0, -extension.length);
      return [target, `${stem}.ts`, `${stem}.tsx`];
    }
    return [target];
  }
  return [
    target,
    ...resolutionExtensions.map((extension) => target + extension),
    ...resolutionExtensions.map((extension) => join(target, 'index' + extension)),
  ];
}

const missing = [];
let checked = 0;
for (const importer of sourceFiles(sourceRoot)) {
  const source = readFileSync(importer, 'utf8');
  for (const specifier of relativeSpecifiers(source)) {
    checked += 1;
    const found = candidates(importer, specifier).some((path) => existsSync(path) && statSync(path).isFile());
    if (!found) missing.push(`${relative(root, importer)} -> ${specifier}`);
  }
}

if (missing.length) {
  console.error('[source-imports] Missing local modules in this checkout:');
  for (const item of missing) console.error(`  - ${item}`);
  const deploymentRevision = process.env.RENDER_GIT_COMMIT
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.COMMIT_REF
    ?? process.env.GITHUB_SHA;
  if (deploymentRevision) console.error(`[source-imports] Deployment revision: ${deploymentRevision}`);
  console.error('[source-imports] The repository contains these modules. Verify the deployment revision, clear its build cache, and redeploy the latest commit.');
  process.exit(1);
}

console.log(`[source-imports] Verified ${checked} local imports across src/.`);
