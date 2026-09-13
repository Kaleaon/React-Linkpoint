import { describe, expect, it } from 'vitest';
import { DEVICES, LAYOUTS, PALETTES, PALETTE_FAMILIES } from '../theme/tokens';
import { contrastRatio, inkOn, luminance, meetsAA } from '../theme/contrast';
import { resolveNav } from '../theme/ThemeContext';
import { REGISTERED_ICON_NAMES, icon } from '../ui/icons';
import { CONDITIONS, DOCK_BUTTONS } from '../data/slData';

/**
 * The token set is only worth having if every combination of it actually works.
 * Six layouts by twenty-four palettes is 144 skins, which is far past what
 * anyone will check by eye, so the invariants are asserted instead.
 */

describe('token completeness', () => {
  it('ships six layout packs and twenty-four colour packs', () => {
    expect(Object.keys(LAYOUTS)).toHaveLength(6);
    expect(Object.keys(PALETTES)).toHaveLength(24);
  });

  it('groups every colour pack into exactly one family', () => {
    const grouped = PALETTE_FAMILIES.flatMap((f) => f.keys);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.sort()).toEqual(Object.keys(PALETTES).sort());
  });

  it('gives every palette the full set of colour roles', () => {
    const roles = Object.keys(PALETTES.ink.c);
    for (const [name, pack] of Object.entries(PALETTES)) {
      expect(Object.keys(pack.c).sort(), `palette ${name}`).toEqual(roles.sort());
      for (const [role, value] of Object.entries(pack.c)) {
        expect(String(value), `${name}.${role}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('gives every layout a full shape scale and look', () => {
    for (const [name, pack] of Object.entries(LAYOUTS)) {
      expect(Object.keys(pack.s).sort(), `layout ${name}`).toEqual(['navr', 'pad', 'rl', 'rp', 'rs', 'tls']);
      expect(pack.look.card, `layout ${name}`).toBeTruthy();
      expect(pack.look.seg, `layout ${name}`).toBeTruthy();
      expect(pack.look.head, `layout ${name}`).toBeTruthy();
    }
  });
});

describe('contrast', () => {
  it('scores pure black against pure white at the full 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 3);
    expect(luminance('#000000')).toBeCloseTo(0, 3);
  });

  it('treats shorthand and longhand hex alike', () => {
    expect(luminance('#fff')).toBeCloseTo(luminance('#ffffff'), 6);
  });

  it('picks whichever candidate scores highest against the background', () => {
    // Black and white are always in the running as backstops, so on an extreme
    // background one of them legitimately wins.
    expect(inkOn('#000000', ['#111111', '#EEEEEE'])).toBe('#FFFFFF');
    expect(inkOn('#FFFFFF', ['#111111', '#EEEEEE'])).toBe('#000000');

    // On a mid background the ranking is what decides it, not the order given.
    const light = inkOn('#4A4A4A', ['#5A5A5A', '#F0F0F0']);
    expect(light).not.toBe('#5A5A5A');
    expect(contrastRatio(light, '#4A4A4A')).toBeGreaterThanOrEqual(4.5);
  });

  it('always returns something readable even with no usable candidates', () => {
    // Black and white are appended as a backstop, so this can never fail open.
    const chosen = inkOn('#808080', []);
    expect(meetsAA(chosen, '#808080', true)).toBe(true);
  });
});

describe('every palette is legible', () => {
  // Body text on the page background and on a card is the pairing a resident
  // reads constantly; if that fails the palette is not shippable.
  it.each(Object.entries(PALETTES))('%s reads body text at AA', (name, pack) => {
    expect(contrastRatio(pack.c.ink, pack.c.bg), `${name} ink on bg`).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(pack.c.ink, pack.c.surf), `${name} ink on surf`).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(PALETTES))('%s reads secondary text at large-text AA', (name, pack) => {
    expect(contrastRatio(pack.c.ink2, pack.c.bg), `${name} ink2 on bg`).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(PALETTES))('%s reads its primary action', (name, pack) => {
    expect(contrastRatio(pack.c.onpri, pack.c.pri), `${name} onpri on pri`).toBeGreaterThanOrEqual(3);
  });
});

describe('navigation model resolution', () => {
  it('keeps the sweep rail at every form factor', () => {
    for (const device of Object.keys(DEVICES)) {
      expect(resolveNav('sweep', device)).toBe('sweep');
    }
  });

  it('gives split devices a rail whatever the pack asked for', () => {
    expect(DEVICES.tab.split).toBe(true);
    expect(resolveNav('terminal', 'tab')).toBe('rail');
    expect(resolveNav('tiles', 'fold')).toBe('rail');
  });

  it('falls back to bottom tabs on a phone', () => {
    expect(resolveNav('terminal', 'ios')).toBe('tabs');
    // Rule & Rail only earns its rail above 700dp, so a phone gets tabs.
    expect(resolveNav('rules', 'ios')).toBe('tabs');
  });

  it('honours the tile model on a phone', () => {
    expect(resolveNav('tiles', 'ios')).toBe('tiles');
  });
});

describe('icon registry', () => {
  it('resolves every icon name the data tables can produce', () => {
    const fromConditions = Object.values(CONDITIONS)
      .flatMap((byScreen) => Object.values(byScreen))
      .map((c) => c.icon);
    const fromDock = Object.values(DOCK_BUTTONS).map((b) => b.icon);

    for (const name of [...fromConditions, ...fromDock]) {
      expect(REGISTERED_ICON_NAMES, `icon "${name}" is not registered`).toContain(name);
    }
  });

  it('falls back to a circle rather than throwing on an unknown name', () => {
    expect(icon('definitely-not-an-icon')).toBeTruthy();
  });
});
