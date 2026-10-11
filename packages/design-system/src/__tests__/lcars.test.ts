import { describe, expect, it } from 'vitest';
import { computeThemeTokens, contrastRatio, lcarsGeometry, PALETTES } from '../tokens/index.js';
import { deskGeometry } from '../../../../src/theme/deskStyle.js';

describe('LCARS split frame and palette independence', () => {
  for (const G of [lcarsGeometry(), lcarsGeometry(true), deskGeometry('sweep')]) {
    it(`keeps both elbow centers concentric at rail width ${G.rail}`, () => {
      expect(G.outerX).toBe(G.rail + G.inner);
      expect(G.outerY).toBe(G.frame + G.inner);
      // Header inner/outer centers; content inner/outer centers.
      expect(G.headerBottom - G.outerY).toBe(G.headerBottom - G.frame - G.inner);
      expect(G.contentTop + G.outerY).toBe(G.shellTop + G.inner);
      expect(G.contentTop - G.headerBottom).toBe(4);
      expect(G.railTop).toBeGreaterThan(G.contentTop + G.outerY);
    });
  }

  it('uses a black reference field while retaining independent colour packs', () => {
    expect(computeThemeTokens('sweep', 'lcars').bg).toBe('#000000');
    for (const [key, palette] of Object.entries(PALETTES)) {
      const V = computeThemeTokens('sweep', key);
      expect(V.bg).toBe(palette.c.bg);
      expect(V.pri).toBe(palette.c.pri);
      for (const role of ['ink', 'ink2', 'priText', 'sec', 'sec2', 'ok', 'err', 'warn'] as const) {
        for (const surface of ['bg', 'surf', 'surf2'] as const) {
          expect(
            contrastRatio(V[role], V[surface]),
            `${key}: ${role} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const [fill, ink] of [
        ['pri', 'onpri'],
        ['priC', 'onpriC'],
        ['sec', 'onsec'],
        ['bdg', 'onbdg'],
      ] as const) {
        expect(contrastRatio(V[fill], V[ink]), `${key}: ${fill} label`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
