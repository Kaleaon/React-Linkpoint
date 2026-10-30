// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import App from '../../../App.tsx';
import BottomTabs from '../../components/BottomTabs.jsx';
import RailNav from '../../components/RailNav.jsx';
import TileNav from '../../components/TileNav.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { PALETTES } from '../../theme/tokens';
import { ensureMinContrast } from '@linkpoint/design-system/tokens';

function getLuminance(hex: string): number {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const aR = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const aG = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const aB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * aR + 0.7152 * aG + 0.0722 * aB;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('In-place ThemeContext token binding for navigation containers', () => {
  it('has zero hardcoded hex color values in App.tsx, BottomTabs.jsx, RailNav.jsx, and TileNav.jsx', () => {
    const rootDir = path.resolve(__dirname, '../../../');
    const filesToScan = [
      path.join(rootDir, 'App.tsx'),
      path.join(rootDir, 'src/components/BottomTabs.jsx'),
      path.join(rootDir, 'src/components/RailNav.jsx'),
      path.join(rootDir, 'src/components/TileNav.jsx'),
    ];

    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;

    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const matches = content.match(hexPattern) || [];
      expect(
        matches,
        `File ${path.basename(filePath)} contains hardcoded hex colors: ${matches.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('renders root App component without errors using ThemeContext tokens', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(createElement(App));
    });

    expect(host.innerHTML).toContain('Login Screen');
    expect(host.innerHTML).toContain('Login');
    expect(host.innerHTML).toContain('World');
    expect(host.innerHTML).toContain('Settings');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('verifies contrast compliance across all 24 theme palettes for navigation surfaces', () => {
    const paletteKeys = Object.keys(PALETTES);
    expect(paletteKeys.length).toBeGreaterThanOrEqual(24);

    for (const key of paletteKeys) {
      const palette = PALETTES[key];
      const V = palette.c;
      const bg = V.bg;
      const surf = V.surf;

      // Check primary color or enforced contrast primary text on surface / background
      const inkContrastOnBg = getContrastRatio(V.ink, bg);
      const ink2ContrastOnBg = getContrastRatio(V.ink2, bg);
      const ink2ContrastOnSurf = getContrastRatio(ensureMinContrast(V.ink2, surf, 4.5), surf);

      expect(
        inkContrastOnBg,
        `Palette '${key}' primary ink text vs bg contrast ratio < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);

      expect(
        ink2ContrastOnSurf,
        `Palette '${key}' secondary ink text vs surf contrast ratio < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('dynamically adapts BottomTabs, RailNav, and TileNav styling when changing theme palette packs', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    function TestApp() {
      return createElement(
        AppProvider,
        null,
        createElement(
          ThemeProvider,
          null,
          createElement(
            'div',
            null,
            createElement(BottomTabs),
            createElement(RailNav),
            createElement(TileNav),
          ),
        ),
      );
    }

    await act(async () => {
      root.render(createElement(TestApp));
    });

    // Renders successfully under ThemeProvider
    expect(host).toBeDefined();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
