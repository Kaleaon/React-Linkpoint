// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import Settings, { ActionRemapRow, CapabilityBadge } from '../Settings.jsx';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { KeybindingsProvider } from '../../context/KeybindingsContext.tsx';
import { CAPABILITY_STATES } from '../../config/featureCapabilities.js';
import { PALETTES, computeThemeTokens } from '@linkpoint/design-system/tokens';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface AppActionsBridge {
  setLayout: (layout: string) => void;
  setPalette: (palette: string) => void;
  toggleSetting: (key: string) => void;
  setThemeColor: (key: string, value: string) => void;
}

let mounted: { host: HTMLElement; root: Root } | null = null;
let currentAppActions: AppActionsBridge | null = null;

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

function hexToRgb(hex: string): string {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function expectColorMatch(actual: string | undefined, expectedHex: string) {
  const normActual = actual?.trim().toLowerCase();
  const hexNorm = expectedHex.toLowerCase();
  const rgbNorm = hexToRgb(expectedHex).toLowerCase();
  expect(
    normActual === hexNorm || normActual === rgbNorm,
    `Expected color "${actual}" to match "${expectedHex}" (or "${rgbNorm}")`,
  ).toBe(true);
}

function expectBorderContainsColor(actualBorder: string | undefined, expectedHex: string) {
  const borderNorm = (actualBorder || '').toLowerCase();
  const hexNorm = expectedHex.toLowerCase();
  const rgbNorm = hexToRgb(expectedHex).toLowerCase();
  expect(
    borderNorm.includes(hexNorm) || borderNorm.includes(rgbNorm),
    `Expected border "${actualBorder}" to contain "${expectedHex}" (or "${rgbNorm}")`,
  ).toBe(true);
}

function ActionBridge() {
  const { actions } = useApp();
  useEffect(() => {
    currentAppActions = actions as unknown as AppActionsBridge;
  }, [actions]);
  return null;
}

async function mountWithProviders(ui: ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(ActionBridge),
        createElement(ThemeProvider, null, createElement(KeybindingsProvider, null, ui)),
      ),
    );
  });
  mounted = { host, root };
  return host;
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  await act(async () => {
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
  currentAppActions = null;
  vi.restoreAllMocks();
});

describe('Settings Keybinding Controls and Capability Badges Theme Tokens', () => {
  it('invokes useTheme() in ActionRemapRow and CapabilityBadge and removes hardcoded color literals', () => {
    const filePath = path.resolve(__dirname, '../Settings.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    const remapMatch = content.match(/function ActionRemapRow\([\s\S]*?\{([\s\S]*?)\n\}\n\n\/\*\*/);
    expect(remapMatch).not.toBeNull();
    expect(remapMatch![1]).toMatch(/const\s*\{\s*V\s*\}\s*=\s*useTheme\(\);/);

    const badgeMatch = content.match(
      /function CapabilityBadge\([\s\S]*?\{([\s\S]*?)\n\}\n\nfunction SwitchSetting/,
    );
    expect(badgeMatch).not.toBeNull();
    expect(badgeMatch![1]).toMatch(/const\s*\{\s*V\s*\}\s*=\s*useTheme\(\);/);

    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const rgbaPattern = /rgba?\(/g;
    expect(content.match(hexPattern) || []).toEqual([]);
    expect(content.match(rgbaPattern) || []).toEqual([]);
  });

  it('applies active dark and light palette tokens to ActionRemapRow container, badge, input, and error label', async () => {
    const host = await mountWithProviders(<Settings />);

    const darkTokens = computeThemeTokens('terminal', 'ink');

    const mouselookLabel = host.querySelector('#toggleMouselook-remap-label');
    expect(mouselookLabel).not.toBeNull();
    const row = mouselookLabel?.closest('.settings-switch-row') as HTMLElement | null;
    expect(row).not.toBeNull();

    // Row container uses V.surf2, V.outv, and V.ink
    expectColorMatch(row?.style.backgroundColor, darkTokens.surf2);
    expectBorderContainsColor(row?.style.border, darkTokens.outv);
    expectColorMatch(row?.style.color, darkTokens.ink);

    // Current binding indicator uses V.bdg, V.onbdg, and V.rs
    const bindingIndicator = Array.from(row!.querySelectorAll('span')).find((el) =>
      el.getAttribute('aria-label')?.startsWith('Current keybinding for Toggle Mouselook'),
    ) as HTMLElement | undefined;
    expect(bindingIndicator).toBeDefined();
    expectColorMatch(bindingIndicator?.style.backgroundColor, darkTokens.bdg);
    expectColorMatch(bindingIndicator?.style.color, darkTokens.onbdg);
    expect(bindingIndicator?.style.borderRadius).toBe(darkTokens.rs);

    // Key input uses V.surf, V.outv, V.ink, and V.rs
    const keyInput = Array.from(row!.querySelectorAll('input[type="text"]'))[0] as
      HTMLInputElement | undefined;
    expect(keyInput).toBeDefined();
    expectColorMatch(keyInput?.style.backgroundColor, darkTokens.surf);
    expectBorderContainsColor(keyInput?.style.border, darkTokens.outv);
    expectColorMatch(keyInput?.style.color, darkTokens.ink);
    expect(keyInput?.style.borderRadius).toBe(darkTokens.rs);

    // Trigger validation error by clearing key input and clicking Update
    await setInputValue(keyInput!, '   ');
    const updateButton = Array.from(row!.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Update',
    ) as HTMLButtonElement | undefined;
    expect(updateButton).toBeDefined();
    await act(async () => {
      updateButton!.click();
    });

    const errorSpan = Array.from(row!.querySelectorAll('span')).find((el) =>
      el.textContent?.includes('Please specify a key.'),
    ) as HTMLElement | undefined;
    expect(errorSpan).toBeDefined();
    expectColorMatch(errorSpan?.style.color, darkTokens.err);

    // Switch dynamically to a light palette ('aero') and 'metro' layout
    expect(currentAppActions).not.toBeNull();
    await act(async () => {
      currentAppActions!.setLayout('metro');
      currentAppActions!.setPalette('aero');
    });

    const lightTokens = computeThemeTokens('metro', 'aero');

    expectColorMatch(row?.style.backgroundColor, lightTokens.surf2);
    expectBorderContainsColor(row?.style.border, lightTokens.outv);
    expectColorMatch(row?.style.color, lightTokens.ink);

    expectColorMatch(bindingIndicator?.style.backgroundColor, lightTokens.bdg);
    expectColorMatch(bindingIndicator?.style.color, lightTokens.onbdg);
    expect(bindingIndicator?.style.borderRadius).toBe(lightTokens.rs);

    expectColorMatch(keyInput?.style.backgroundColor, lightTokens.surf);
    expectBorderContainsColor(keyInput?.style.border, lightTokens.outv);
    expectColorMatch(keyInput?.style.color, lightTokens.ink);
    expect(keyInput?.style.borderRadius).toBe(lightTokens.rs);

    expectColorMatch(errorSpan?.style.color, lightTokens.err);
  });

  it('applies V.bdg and V.onbdg to CapabilityBadge across dark and light palettes', async () => {
    const host = await mountWithProviders(<Settings />);

    expect(currentAppActions).not.toBeNull();
    await act(async () => {
      currentAppActions!.toggleSetting('devMode');
    });

    const darkTokens = computeThemeTokens('terminal', 'ink');
    const badges = Array.from(host.querySelectorAll('.capability-badge')) as HTMLElement[];
    expect(badges.length).toBeGreaterThan(0);

    for (const badge of badges) {
      expectColorMatch(badge.style.backgroundColor, darkTokens.bdg);
      expectColorMatch(badge.style.color, darkTokens.onbdg);
    }

    // Switch to light 'paper' palette
    await act(async () => {
      currentAppActions!.setPalette('paper');
    });

    const paperTokens = computeThemeTokens('terminal', 'paper');
    const updatedBadges = Array.from(host.querySelectorAll('.capability-badge')) as HTMLElement[];
    expect(updatedBadges.length).toBeGreaterThan(0);

    for (const badge of updatedBadges) {
      expectColorMatch(badge.style.backgroundColor, paperTokens.bdg);
      expectColorMatch(badge.style.color, paperTokens.onbdg);
    }

    // Apply custom palette overrides via setThemeColor
    await act(async () => {
      currentAppActions!.setThemeColor('bdg', '#1d4ed8');
      currentAppActions!.setThemeColor('surf2', '#e2e8f0');
    });

    const customTokens = computeThemeTokens('terminal', 'paper', {
      customColors: {
        ...PALETTES.paper.c,
        bdg: '#1d4ed8',
        surf2: '#e2e8f0',
      },
    });

    const mouselookRow = host
      .querySelector('#toggleMouselook-remap-label')
      ?.closest('.settings-switch-row') as HTMLElement | null;
    expectColorMatch(mouselookRow?.style.backgroundColor, customTokens.surf2);

    const customBadges = Array.from(host.querySelectorAll('.capability-badge')) as HTMLElement[];
    for (const badge of customBadges) {
      expectColorMatch(badge.style.backgroundColor, customTokens.bdg);
      expectColorMatch(badge.style.color, customTokens.onbdg);
    }
  });

  it('falls back safely to DEFAULT_THEME when rendered outside ThemeProvider', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted = { host, root };

    const defaultTokens = computeThemeTokens('terminal', 'ink');
    const onSave = vi.fn(() => false);

    await act(async () => {
      root.render(
        <div>
          <ActionRemapRow
            action="toggleMouselook"
            label="Toggle Mouselook"
            description="Switch camera mode"
            currentBinding="KeyM"
            onSave={onSave}
          />
          <CapabilityBadge capability={CAPABILITY_STATES.EXPERIMENTAL} size="medium" />
          <CapabilityBadge capability={CAPABILITY_STATES.SUPPORTED} size="small" />
        </div>,
      );
    });

    const row = host.querySelector('.settings-switch-row') as HTMLElement;
    expect(row).not.toBeNull();
    expectColorMatch(row.style.backgroundColor, defaultTokens.surf2);
    expectBorderContainsColor(row.style.border, defaultTokens.outv);

    const badge = host.querySelector('.capability-badge') as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toBe(CAPABILITY_STATES.EXPERIMENTAL);
    expectColorMatch(badge.style.backgroundColor, defaultTokens.bdg);
    expectColorMatch(badge.style.color, defaultTokens.onbdg);

    // Trigger failed save error outside ThemeProvider
    const updateBtn = host.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      updateBtn.click();
    });
    expect(onSave).toHaveBeenCalledWith('KeyM');
    const errorEl = Array.from(row.querySelectorAll('span')).find((el) =>
      el.textContent?.includes('Could not save keybinding.'),
    ) as HTMLElement | undefined;
    expect(errorEl).toBeDefined();
    expectColorMatch(errorEl?.style.color, defaultTokens.err);
  });

  it('maintains WCAG contrast compliance for badge, input, and error tokens across all palettes', () => {
    const paletteKeys = Object.keys(PALETTES);
    expect(paletteKeys.length).toBeGreaterThanOrEqual(24);

    for (const key of paletteKeys) {
      const V = computeThemeTokens('terminal', key);

      const badgeContrast = getContrastRatio(V.onbdg, V.bdg);
      expect(
        badgeContrast,
        `Palette '${key}' V.onbdg vs V.bdg contrast ratio < 4.5:1 (${badgeContrast.toFixed(2)})`,
      ).toBeGreaterThanOrEqual(4.5);

      const inkOnSurf = getContrastRatio(V.ink, V.surf);
      expect(
        inkOnSurf,
        `Palette '${key}' V.ink vs V.surf contrast ratio < 4.5:1 (${inkOnSurf.toFixed(2)})`,
      ).toBeGreaterThanOrEqual(4.5);

      const inkOnSurf2 = getContrastRatio(V.ink, V.surf2);
      expect(
        inkOnSurf2,
        `Palette '${key}' V.ink vs V.surf2 contrast ratio < 4.5:1 (${inkOnSurf2.toFixed(2)})`,
      ).toBeGreaterThanOrEqual(4.5);

      const errOnSurf2 = getContrastRatio(V.err, V.surf2);
      expect(
        errOnSurf2,
        `Palette '${key}' V.err vs V.surf2 contrast ratio < 4.5:1 (${errOnSurf2.toFixed(2)})`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
