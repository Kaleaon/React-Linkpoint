import { describe, expect, it } from 'vitest';
import { LAYOUTS, PALETTES } from '../../theme/tokens';

describe('Ktheme Theme System Centralization', () => {
  it('defines all 24 Ktheme color palette presets', () => {
    const paletteKeys = Object.keys(PALETTES);
    expect(paletteKeys.length).toBeGreaterThanOrEqual(24);

    const expectedPalettes = [
      'ink', 'lcars', 'metro', 'aero', 'navy', 'paper', 'deco', 'noir',
      'emerald', 'amber', 'crimson', 'nouveau', 'aurora', 'burgundy',
      'calm', 'charcoal', 'deep', 'forest', 'rose', 'royalb', 'royals',
      'slatec', 'slateg', 'solarpunk'
    ];

    for (const key of expectedPalettes) {
      expect(PALETTES[key]).toBeDefined();
      expect(PALETTES[key].c.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(PALETTES[key].c.pri).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('defines all 8 structural layout variations', () => {
    const expectedLayouts = [
      'metro', 'lcars', 'frutiger_aero', 'art_deco', 'terminal',
      'modernglass', 'material3', 'cyberpunk'
    ];

    for (const layoutKey of expectedLayouts) {
      expect(LAYOUTS[layoutKey]).toBeDefined();
      expect(LAYOUTS[layoutKey].name).toBeTruthy();
      expect(LAYOUTS[layoutKey].nav).toBeTruthy();
      expect(LAYOUTS[layoutKey].s.rs).toBeDefined();
    }
  });
});
