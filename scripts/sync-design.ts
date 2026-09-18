import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DESIGN_REPO_URL = 'https://github.com/Kaleaon/linkpoint-design';
const TEMP_DIR = path.join(process.cwd(), '.tmp-linkpoint-design');
const TARGET_SRC = path.join(process.cwd(), 'src');

async function syncDesign() {
  console.log('🔄 Syncing Linkpoint Design...');

  if (fs.existsSync(TEMP_DIR)) {
    console.log('Cleaning up existing temp directory...');
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }

  console.log(`📥 Cloning design repository from ${DESIGN_REPO_URL}...`);
  execSync(`git clone --depth 1 ${DESIGN_REPO_URL} "${TEMP_DIR}"`, { stdio: 'inherit' });

  const designReactSrc = path.join(TEMP_DIR, 'docs', 'react', 'src');
  if (!fs.existsSync(designReactSrc)) {
    throw new Error(`React source not found at ${designReactSrc}`);
  }

  console.log('📂 Copying React components, hooks, screens, data, and theme...');
  const subdirs = ['components', 'screens', 'hooks', 'theme', 'context', 'data'];

  for (const dir of subdirs) {
    const srcDir = path.join(designReactSrc, dir);
    const destDir = path.join(TARGET_SRC, dir);

    if (fs.existsSync(srcDir)) {
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.cpSync(srcDir, destDir, { recursive: true, force: true });
      console.log(`  ✓ Synced ${dir}`);
    }
  }

  // Copy CSS and App
  const cssSrc = path.join(designReactSrc, 'index.css');
  if (fs.existsSync(cssSrc)) {
    fs.copyFileSync(cssSrc, path.join(TARGET_SRC, 'index.css'));
    console.log('  ✓ Synced index.css');
  }

  // Save raw HTML mockup and translation mapping for reference/auto-conversion rules
  const docsDir = path.join(TEMP_DIR, 'docs');
  const designDir = path.join(TARGET_SRC, 'design');
  if (!fs.existsSync(designDir)) {
    fs.mkdirSync(designDir, { recursive: true });
  }

  if (fs.existsSync(path.join(docsDir, 'mockup-to-react.yaml'))) {
    fs.copyFileSync(path.join(docsDir, 'mockup-to-react.yaml'), path.join(designDir, 'mockup-to-react.yaml'));
  }
  if (fs.existsSync(path.join(docsDir, 'index.html'))) {
    fs.copyFileSync(path.join(docsDir, 'index.html'), path.join(designDir, 'index.html'));
  }
  console.log('  ✓ Synced raw HTML mockup & mockup-to-react mapping');

  console.log('🧹 Cleaning up temporary clone...');
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  console.log('✅ Linkpoint Design synchronization completed successfully!');
}

syncDesign().catch((err) => {
  console.error('❌ Error during design sync:', err);
  process.exit(1);
});
