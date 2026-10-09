import { describe, expect, it } from 'vitest';
import {
  sanitizeTheme,
  themeFromPalette,
  encodeSharedTheme,
  decodeSharedTheme,
} from '../../theme/customTheme';
import { PALETTES } from '../../theme/palettes';
import { computeTheme } from '../../theme/computeTheme';

describe('Unified Layout Control State & Preferences', () => {
  it('initializes custom theme with layoutMode, density, and breakpoint defaults', () => {
    const theme = themeFromPalette(PALETTES.ink);
    expect(theme.layoutMode).toBe('grid');
    expect(theme.density).toBe('standard');
    expect(theme.breakpoint).toBe('desktop');
  });

  it('sanitizes and preserves valid layoutMode, density, and breakpoint fields', () => {
    const input = {
      name: 'Custom Glass Theme',
      colors: PALETTES.aero.c,
      layoutMode: 'rail',
      density: 'compact',
      breakpoint: 'mobile',
    };
    const sanitized = sanitizeTheme(input);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.layoutMode).toBe('rail');
    expect(sanitized?.density).toBe('compact');
    expect(sanitized?.breakpoint).toBe('mobile');
  });

  it('falls back to safe defaults when invalid layout options are passed to sanitizeTheme', () => {
    const input = {
      name: 'Test Theme',
      colors: PALETTES.ink.c,
      layoutMode: 'invalid_mode',
      density: 'invalid_density',
      breakpoint: 'invalid_bp',
    };
    const sanitized = sanitizeTheme(input);
    expect(sanitized?.layoutMode).toBe('grid');
    expect(sanitized?.density).toBe('standard');
    expect(sanitized?.breakpoint).toBe('desktop');
  });

  it('encodes and decodes shared theme links with layout state preserved', () => {
    const theme = {
      version: 1,
      active: true,
      name: 'Shared Theme',
      colors: PALETTES.lcars.c,
      layoutMode: 'split',
      density: 'comfortable',
      breakpoint: 'tablet',
    };
    const encoded = encodeSharedTheme(theme);
    const decoded = decodeSharedTheme(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.name).toBe('Shared Theme');
    expect(decoded?.layoutMode).toBe('split');
    expect(decoded?.density).toBe('comfortable');
    expect(decoded?.breakpoint).toBe('tablet');
  });

  it('computes spacing tokens according to density selection', () => {
    const dummyCf = () => ({ dock: [] });
    const compactTheme = computeTheme(
      {
        layout: 'terminal',
        palette: 'ink',
        device: 'desk',
        screen: 'Login',
        cond: 'normal',
        customTheme: { active: true, density: 'compact', colors: PALETTES.ink.c },
      },
      dummyCf,
    );
    const standardTheme = computeTheme(
      {
        layout: 'terminal',
        palette: 'ink',
        device: 'desk',
        screen: 'Login',
        cond: 'normal',
        customTheme: { active: true, density: 'standard', colors: PALETTES.ink.c },
      },
      dummyCf,
    );
    const comfyTheme = computeTheme(
      {
        layout: 'terminal',
        palette: 'ink',
        device: 'desk',
        screen: 'Login',
        cond: 'normal',
        customTheme: { active: true, density: 'comfortable', colors: PALETTES.ink.c },
      },
      dummyCf,
    );

    expect(compactTheme.pad).toBe('6px');
    expect(standardTheme.pad).toBe('12px');
    expect(comfyTheme.pad).toBe('18px');
  });
});
