// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import MapScreen from '../Map.jsx';
import { app } from '../../linkpoint/app.ts';
import { slBridge } from '../../linkpoint/sl-bridge.ts';
import { PALETTES, computeThemeTokens } from '@linkpoint/design-system/tokens';

(globalThis as unknown as Record<string, boolean>).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;
let currentAppActions: ReturnType<typeof useApp>['actions'] | null = null;
let origRegion: typeof app.world.region;
let origConnected: boolean;

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

function expectBorderColorMatch(actualBorder: string | undefined, expectedHex: string) {
  const normBorder = (actualBorder || '').toLowerCase();
  const hexNorm = expectedHex.toLowerCase();
  const rgbNorm = hexToRgb(expectedHex).toLowerCase();
  expect(
    normBorder.includes(hexNorm) || normBorder.includes(rgbNorm),
    `Expected border "${actualBorder}" to include "${expectedHex}" (or "${rgbNorm}")`,
  ).toBe(true);
}

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

function ActionBridge() {
  const { actions } = useApp();
  useEffect(() => {
    currentAppActions = actions;
  }, [actions]);
  return null;
}

async function mountMap() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(ActionBridge),
        createElement(ThemeProvider, null, createElement(MapScreen)),
      ),
    );
  });
  mounted = { host, root };
  return host;
}

async function clickElement(el: Element | null | undefined) {
  await act(async () => {
    (el as HTMLElement | null | undefined)?.click();
  });
}

beforeEach(() => {
  localStorage.clear();
  origRegion = app.world.region;
  origConnected = slBridge.connected;

  app.world.region = {
    id: 'region-daboom',
    name: 'Da Boom',
    x: 1000,
    y: 1000,
  } as typeof app.world.region;

  Object.defineProperty(slBridge, 'connected', {
    value: true,
    configurable: true,
    writable: true,
  });

  vi.spyOn(slBridge, 'call').mockImplementation(async (method: string) => {
    if (method === 'getMapBlocks') {
      return [
        { x: 1000, y: 1000, name: 'Da Boom', access: 13 },
        { x: 1001, y: 1000, name: 'Ahern', access: 21 },
      ];
    }
    return [];
  });
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
  app.world.region = origRegion;
  Object.defineProperty(slBridge, 'connected', {
    value: origConnected,
    configurable: true,
    writable: true,
  });
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('Map Screen Token Bindings & TouchTarget Controls', () => {
  it('imports TouchTarget and eliminates nonexistent V.on references in Map.jsx', () => {
    const filePath = path.resolve(__dirname, '../Map.jsx');
    const source = fs.readFileSync(filePath, 'utf-8');

    const expectedImport = ['import TouchTarget', 'from', "'../components/TouchTarget.tsx';"].join(
      ' ',
    );
    expect(source).toContain(expectedImport);
    expect(source).not.toMatch(/\bV\.on\b/);
  });

  it('renders all seven toolbar buttons as TouchTargets bound to V.ink, V.surf, and V.outv', async () => {
    const expectedTokens = computeThemeTokens('terminal', 'ink');
    const host = await mountMap();

    const toolbar = host.querySelector('[role="toolbar"][aria-label="Map controls"]');
    expect(toolbar).not.toBeNull();

    const toolbarButtons = Array.from(toolbar!.querySelectorAll('button')) as HTMLButtonElement[];
    expect(toolbarButtons).toHaveLength(7);

    const expectedLabels = [
      'Pan north',
      'Pan south',
      'Pan west',
      'Pan east',
      null,
      'Zoom in',
      'Zoom out',
    ];
    toolbarButtons.forEach((btn, idx) => {
      expect(btn.classList.contains('touch-target')).toBe(true);
      expect(btn.getAttribute('aria-label')).toBe(expectedLabels[idx]);
      expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
      expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(24);
      expect(btn.style.display).toBe('inline-flex');
      expect(btn.style.color).not.toBe('');
      expectColorMatch(btn.style.color, expectedTokens.ink);
      expectColorMatch(btn.style.backgroundColor, expectedTokens.surf);
      expectBorderColorMatch(btn.style.border, expectedTokens.outv);
      expect(btn.style.cursor).toBe('pointer');
    });

    expect(toolbarButtons[4].textContent).toBe('My region');
  });

  it('renders the Teleport action button as a TouchTarget bound to V.pri and V.onpri', async () => {
    const expectedTokens = computeThemeTokens('terminal', 'ink');
    const teleportSpy = vi.spyOn(app.protocol, 'teleportTo').mockResolvedValue(undefined as never);
    const host = await mountMap();

    const regionTile = host.querySelector(
      'button[aria-label="Ahern (1001, 1000)"]',
    ) as HTMLButtonElement | null;
    expect(regionTile).not.toBeNull();
    expect(regionTile!.classList.contains('touch-target')).toBe(false);

    await clickElement(regionTile);

    const teleportBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Teleport',
    ) as HTMLButtonElement | undefined;

    expect(teleportBtn).toBeDefined();
    expect(teleportBtn!.classList.contains('touch-target')).toBe(true);
    expect(parseInt(teleportBtn!.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(teleportBtn!.style.minHeight, 10)).toBeGreaterThanOrEqual(24);
    expectColorMatch(teleportBtn!.style.backgroundColor, expectedTokens.pri);
    expectColorMatch(teleportBtn!.style.color, expectedTokens.onpri);
    expectBorderColorMatch(teleportBtn!.style.border, expectedTokens.pri);
    expect(teleportBtn!.style.cursor).toBe('pointer');

    await clickElement(teleportBtn);
    expect(teleportSpy).toHaveBeenCalledWith('Ahern/128/128/30');
  });

  it('updates V.ink and V.onpri across toolbar and Teleport controls dynamically when palette changes without remounting', async () => {
    const host = await mountMap();

    const regionTile = host.querySelector('button[aria-label="Da Boom (1000, 1000)"]');
    await clickElement(regionTile);

    const toolbar = host.querySelector('[role="toolbar"][aria-label="Map controls"]')!;
    const toolbarButtons = Array.from(toolbar.querySelectorAll('button')) as HTMLButtonElement[];
    const teleportBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Teleport',
    ) as HTMLButtonElement;

    expect(currentAppActions).not.toBeNull();

    // Switch to a light palette ('paper') and another layout ('metro')
    await act(async () => {
      currentAppActions!.setLayout('metro');
      currentAppActions!.setPalette('paper');
    });

    const paperTokens = computeThemeTokens('metro', 'paper');
    for (const btn of toolbarButtons) {
      expectColorMatch(btn.style.color, paperTokens.ink);
      expectColorMatch(btn.style.backgroundColor, paperTokens.surf);
      expectBorderColorMatch(btn.style.border, paperTokens.outv);
    }
    expectColorMatch(teleportBtn.style.backgroundColor, paperTokens.pri);
    expectColorMatch(teleportBtn.style.color, paperTokens.onpri);
    expectBorderColorMatch(teleportBtn.style.border, paperTokens.pri);

    // Switch to 'amber' palette without remounting
    await act(async () => {
      currentAppActions!.setPalette('amber');
    });

    const amberTokens = computeThemeTokens('metro', 'amber');
    for (const btn of toolbarButtons) {
      expectColorMatch(btn.style.color, amberTokens.ink);
      expectColorMatch(btn.style.backgroundColor, amberTokens.surf);
    }
    expectColorMatch(teleportBtn.style.backgroundColor, amberTokens.pri);
    expectColorMatch(teleportBtn.style.color, amberTokens.onpri);
  });

  it('retains readable disabled styling and not-allowed cursor at MIN_RADIUS and MAX_RADIUS zoom boundaries', async () => {
    const expectedTokens = computeThemeTokens('terminal', 'ink');
    const host = await mountMap();

    const zoomInBtn = host.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement;
    const zoomOutBtn = host.querySelector('button[aria-label="Zoom out"]') as HTMLButtonElement;

    expect(zoomInBtn.disabled).toBe(false);
    expect(zoomOutBtn.disabled).toBe(false);
    expect(zoomInBtn.style.cursor).toBe('pointer');
    expect(zoomOutBtn.style.cursor).toBe('pointer');

    // Default radius is 3; clicking Zoom in twice reaches MIN_RADIUS (1)
    await clickElement(zoomInBtn);
    await clickElement(zoomInBtn);

    expect(zoomInBtn.disabled).toBe(true);
    expect(zoomInBtn.style.cursor).toBe('not-allowed');
    expect(zoomInBtn.style.opacity).toBe('0.5');
    expectColorMatch(zoomInBtn.style.color, expectedTokens.ink);
    expect(zoomOutBtn.disabled).toBe(false);
    expect(zoomOutBtn.style.cursor).toBe('pointer');

    // Clicking Zoom out 5 times reaches MAX_RADIUS (6)
    for (let i = 0; i < 5; i++) {
      await clickElement(zoomOutBtn);
    }

    expect(zoomOutBtn.disabled).toBe(true);
    expect(zoomOutBtn.style.cursor).toBe('not-allowed');
    expect(zoomOutBtn.style.opacity).toBe('0.5');
    expectColorMatch(zoomOutBtn.style.color, expectedTokens.ink);
    expect(zoomInBtn.disabled).toBe(false);
    expect(zoomInBtn.style.cursor).toBe('pointer');
    expect(zoomInBtn.style.opacity).toBe('');
  });

  it('preserves map pan and My region reset behavior when wrapped in TouchTarget', async () => {
    const host = await mountMap();

    const panNorth = host.querySelector('button[aria-label="Pan north"]') as HTMLButtonElement;
    const panEast = host.querySelector('button[aria-label="Pan east"]') as HTMLButtonElement;
    const myRegion = Array.from(host.querySelectorAll('[role="toolbar"] button')).find(
      (b) => b.textContent?.trim() === 'My region',
    ) as HTMLButtonElement;

    await clickElement(panNorth);
    await clickElement(panEast);

    // Center tile should now be (1001, 1001)
    const pannedCenterTile = host.querySelector('button[aria-label="Open water (1001, 1001)"]');
    expect(pannedCenterTile).not.toBeNull();
    expect(pannedCenterTile?.querySelector('svg')).not.toBeNull();

    await clickElement(myRegion);
    const homeCenterTile = host.querySelector('button[aria-label="Da Boom (1000, 1000)"]');
    expect(homeCenterTile).not.toBeNull();
    expect(homeCenterTile?.querySelector('svg')).not.toBeNull();
  });

  it('maintains WCAG 2.2 AA (>= 4.5:1) contrast for V.ink on V.surf and V.onpri on V.pri across all palettes', () => {
    for (const key of Object.keys(PALETTES)) {
      const V = computeThemeTokens('terminal', key);
      expect(
        getContrastRatio(V.ink, V.surf),
        `Palette "${key}" V.ink on V.surf contrast < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(V.onpri, V.pri),
        `Palette "${key}" V.onpri on V.pri contrast < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
