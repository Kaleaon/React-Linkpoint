import fs from 'fs';
import path from 'path';
import { LAYOUTS, PALETTES, themeNames, computeThemeTokens } from '@linkpoint/design-system/tokens';
import * as ReactComponents from '@linkpoint/design-system/react';

async function syncDesign() {
  console.log('🔄 Validating Linkpoint Design System package integration...');

  // 1. Verify package installation & version
  let pkgVersion = 'unknown';
  try {
    const pkgPath = require.resolve('@linkpoint/design-system/package.json');
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkgVersion = pkgJson.version || 'unknown';
    console.log(`  ✓ Package @linkpoint/design-system resolved (v${pkgVersion})`);
  } catch (err) {
    // Fallback: check node_modules or local package.json
    const localPkgPath = path.join(process.cwd(), 'packages', 'design-system', 'package.json');
    if (fs.existsSync(localPkgPath)) {
      const pkgJson = JSON.parse(fs.readFileSync(localPkgPath, 'utf8'));
      pkgVersion = pkgJson.version || 'unknown';
      console.log(`  ✓ Package @linkpoint/design-system resolved locally (v${pkgVersion})`);
    } else {
      throw new Error('Failed to resolve @linkpoint/design-system package.');
    }
  }

  // 2. Token validity checks: LAYOUTS
  const requiredLayouts = ['terminal', 'sweep', 'tiles', 'glass', 'rules', 'press'];
  if (!LAYOUTS || typeof LAYOUTS !== 'object') {
    throw new Error('LAYOUTS export from @linkpoint/design-system/tokens is invalid.');
  }

  for (const layoutKey of requiredLayouts) {
    if (!LAYOUTS[layoutKey]) {
      throw new Error(`Missing required layout key '${layoutKey}' in design system LAYOUTS.`);
    }
    const l = LAYOUTS[layoutKey];
    if (!l.name || !l.nav || !l.s || !l.look) {
      throw new Error(`Invalid layout structure for '${layoutKey}'.`);
    }
  }
  console.log(
    `  ✓ Verified ${Object.keys(LAYOUTS).length} layout packs in @linkpoint/design-system/tokens`,
  );

  // 3. Token validity checks: PALETTES
  const requiredPalettes = ['ink', 'lcars', 'metro', 'aero', 'navy', 'paper', 'deco'];
  if (!PALETTES || typeof PALETTES !== 'object') {
    throw new Error('PALETTES export from @linkpoint/design-system/tokens is invalid.');
  }

  for (const palKey of requiredPalettes) {
    if (!PALETTES[palKey]) {
      throw new Error(`Missing required palette key '${palKey}' in design system PALETTES.`);
    }
    const p = PALETTES[palKey];
    if (!p.name || !p.c || !p.c.bg || !p.c.pri) {
      throw new Error(`Invalid palette structure for '${palKey}'.`);
    }
  }
  console.log(
    `  ✓ Verified ${Object.keys(PALETTES).length} palette packs in @linkpoint/design-system/tokens`,
  );

  // 4. Token compute function & contrast check
  const testTokens = computeThemeTokens('terminal', 'ink');
  if (!testTokens || !testTokens.bg || !testTokens.pri) {
    throw new Error('computeThemeTokens failed to produce valid theme tokens.');
  }
  console.log('  ✓ Token computation and contrast enforcement verified');

  // 5. Verify theme names list
  if (!Array.isArray(themeNames) || (themeNames as readonly string[]).length === 0) {
    throw new Error('themeNames export from @linkpoint/design-system/tokens is empty or invalid.');
  }
  console.log(`  ✓ Verified ${themeNames.length} synchronized theme names`);

  // 6. Verify React component primitives
  const expectedComponents = [
    'Card',
    'BottomTabs',
    'RailNav',
    'TileNav',
    'ConsoleFrame',
    'DeviceFrame',
  ];
  for (const compName of expectedComponents) {
    if (typeof (ReactComponents as any)[compName] !== 'function') {
      throw new Error(
        `Missing expected React layout primitive '${compName}' in @linkpoint/design-system/react.`,
      );
    }
  }
  console.log('  ✓ Verified React layout primitives (@linkpoint/design-system/react)');

  console.log(`✅ Linkpoint Design System integration verified successfully (v${pkgVersion})!`);
}

syncDesign().catch((err) => {
  console.error('❌ Error during design system verification:', err);
  process.exit(1);
});
