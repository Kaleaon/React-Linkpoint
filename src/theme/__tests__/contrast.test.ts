import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PALETTES } from '../tokens';
import { contrastRatio, ensureMinContrast, luminance } from '../contrast';
import { computeTheme } from '../computeTheme';

describe('Theme Token Contrast Engine (WCAG 2.2 SC 1.4.3 & SC 1.4.11)', () => {
  it('ensureMinContrast returns original color when contrast is already >= 4.5', () => {
    const white = '#FFFFFF';
    const darkBg = '#0A1112';
    expect(contrastRatio(white, darkBg)).toBeGreaterThanOrEqual(4.5);
    expect(ensureMinContrast(white, darkBg, 4.5)).toBe(white);
  });

  it('ensureMinContrast adjusts low contrast token on dark background surface', () => {
    const lowContrastToken = '#3E4E5E';
    const darkBg = '#0A1112';
    expect(contrastRatio(lowContrastToken, darkBg)).toBeLessThan(4.5);

    const adjusted = ensureMinContrast(lowContrastToken, darkBg, 4.5);
    expect(contrastRatio(adjusted, darkBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('ensureMinContrast adjusts low contrast token on light background surface', () => {
    const lowContrastToken = '#79D87E';
    const lightBg = '#EAF7FF';
    expect(contrastRatio(lowContrastToken, lightBg)).toBeLessThan(4.5);

    const adjusted = ensureMinContrast(lowContrastToken, lightBg, 4.5);
    expect(contrastRatio(adjusted, lightBg)).toBeGreaterThanOrEqual(4.5);
  });

  it('all 24 palette skins pass 4.5:1 contrast for secondary text and status tokens after theme resolution', () => {
    const mockState = {
      layout: 'terminal',
      palette: 'ink',
      device: 'ios',
      dense: false,
      screen: 'World',
      cond: 'normal',
    };
    const mockCf = () => ({});

    const targetTokens = ['ink2', 'sec', 'sec2', 'ok', 'err', 'warn', 'info'];

    for (const paletteKey of Object.keys(PALETTES)) {
      const { V } = computeTheme({ ...mockState, palette: paletteKey }, mockCf);

      for (const tokenKey of targetTokens) {
        const tokenValue = V[tokenKey];
        expect(tokenValue).toBeDefined();

        const ratioBg = contrastRatio(tokenValue, V.bg);
        const ratioSurf = contrastRatio(tokenValue, V.surf);

        expect(
          ratioBg,
          `Palette [${paletteKey}] token [${tokenKey}] (${tokenValue}) vs bg (${V.bg}) contrast ratio ${ratioBg.toFixed(2)} must be >= 4.5`,
        ).toBeGreaterThanOrEqual(4.5);

        expect(
          ratioSurf,
          `Palette [${paletteKey}] token [${tokenKey}] (${tokenValue}) vs surf (${V.surf}) contrast ratio ${ratioSurf.toFixed(2)} must be >= 4.5`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('Universal Focus Rings & Outline Suppression Audit', () => {
  it('index.css implements 2px focus-visible outline and offset', () => {
    const cssPath = path.resolve(__dirname, '../../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toContain(':focus-visible');
    expect(cssContent).toContain('outline: 2px solid');
    expect(cssContent).toContain('outline-offset: 2px');
  });

  it('index.css implements focus-within styling for container search fields', () => {
    const cssPath = path.resolve(__dirname, '../../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toContain('.filter-field:focus-within');
    expect(cssContent).toContain('.search-container:focus-within');
  });

  it('zero inline outline suppression rules remain in Radar.jsx, Search.jsx, and index.css', () => {
    const filesToAudit = [
      path.resolve(__dirname, '../../screens/Radar.jsx'),
      path.resolve(__dirname, '../../screens/Search.jsx'),
      path.resolve(__dirname, '../../index.css'),
    ];

    for (const filePath of filesToAudit) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/outline:\s*['"]?(none|0)['"]?/i);
    }
  });
});
