// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import ObjectInspector from '../ObjectInspector';
import { BuildingToolbar } from '../BuildingToolbar';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app';
import { PALETTES, computeThemeTokens, contrastRatio } from '@linkpoint/design-system/tokens';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

interface AppActionsBridge {
  setPalette: (palette: string) => void;
  setLayout: (layout: string) => void;
}

let mounted: { host: HTMLElement; root: Root } | null = null;
let currentAppActions: AppActionsBridge | null = null;

function hexToRgbTuple(hex: string): [number, number, number] {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function hexToRgbString(hex: string): string {
  const [r, g, b] = hexToRgbTuple(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

function blendHexOverBg(fgHex: string, bgHex: string, alphaByteHex: string): string {
  const alpha = parseInt(alphaByteHex, 16) / 255;
  const [fr, fg, fb] = hexToRgbTuple(fgHex);
  const [br, bg, bb] = hexToRgbTuple(bgHex);
  const r = Math.round(fr * alpha + br * (1 - alpha));
  const g = Math.round(fg * alpha + bg * (1 - alpha));
  const b = Math.round(fb * alpha + bb * (1 - alpha));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function expectColorMatch(actual: string | undefined, expectedHex: string) {
  const normActual = actual?.trim().toLowerCase() ?? '';
  const hexNorm = expectedHex.toLowerCase();
  const rgbNorm = hexToRgbString(expectedHex).toLowerCase();
  expect(
    normActual === hexNorm || normActual === rgbNorm,
    `Expected color "${actual}" to match "${expectedHex}" (or "${rgbNorm}")`,
  ).toBe(true);
}

function expectBorderContainsColor(borderValue: string | undefined, expectedHex: string) {
  const normBorder = borderValue?.trim().toLowerCase() ?? '';
  const hexNorm = expectedHex.toLowerCase();
  const rgbNorm = hexToRgbString(expectedHex).toLowerCase();
  expect(
    normBorder.includes(hexNorm) || normBorder.includes(rgbNorm),
    `Expected border "${borderValue}" to include "${expectedHex}" (or "${rgbNorm}")`,
  ).toBe(true);
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function ActionBridge() {
  const { actions } = useApp() as { actions: AppActionsBridge };
  useEffect(() => {
    currentAppActions = actions;
  }, [actions]);
  return null;
}

async function mountWithTheme(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(ActionBridge),
        createElement(ThemeProvider, null, ui),
      ),
    );
  });
  mounted = { host, root };
  return host;
}

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
  currentAppActions = null;
  app.objectEditPipeline.clearSessionState();
  app.world.selectedObject = null;
  vi.restoreAllMocks();
});

describe('ObjectInspector and BuildingToolbar Direct ThemeContext Token Binding', () => {
  const editableObject = {
    id: 'prim-theme-1',
    localId: 101,
    name: 'Studio Lamp Prim',
    owner: 'Designer Resident',
    price: 25,
    position: [128.0, 128.0, 24.0],
    rotation: [0, 0, 0, 1],
    scale: [1.0, 1.0, 1.0],
    distance: 4.2,
    canModify: true,
    ownerMask: 0x4000,
  };

  beforeEach(() => {
    app.economy.currencySymbol = 'L$';
    app.economy.isZeroCurrency = false;
    app.economy.balance = 1000;
  });

  it('contains zero hardcoded hex color literals in ObjectInspector.tsx and BuildingToolbar.tsx', () => {
    const files = [
      path.resolve(__dirname, '../ObjectInspector.tsx'),
      path.resolve(__dirname, '../BuildingToolbar.tsx'),
    ];
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const matches = content.match(hexPattern) || [];
      expect(
        matches,
        `${path.basename(filePath)} still contains hardcoded hex literals: ${matches.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('binds ObjectInspector unsaved pill, Apply/Discard buttons, and Pay Object button to ThemeContext tokens', async () => {
    app.world.selectedObject = { ...editableObject };
    app.objectEditPipeline.beginSession(app.world.selectedObject);

    const V = computeThemeTokens('terminal', 'ink');
    const host = await mountWithTheme(createElement(ObjectInspector));

    const applyBtn = host.querySelector('button[aria-label="Apply Changes"]') as HTMLButtonElement;
    const discardBtn = host.querySelector(
      'button[aria-label="Discard Changes"]',
    ) as HTMLButtonElement;
    const payBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PAY OBJECT'),
    ) as HTMLButtonElement;

    // Clean state uses surface and secondary ink tokens
    expectColorMatch(applyBtn.style.backgroundColor, V.surf2);
    expectColorMatch(applyBtn.style.color, V.ink2);
    expectColorMatch(discardBtn.style.backgroundColor, V.surf2);
    expectColorMatch(discardBtn.style.color, V.ink2);

    // Pay Object button binds background and border to V.pri and text to V.onpri
    expectColorMatch(payBtn.style.backgroundColor, V.pri);
    expectColorMatch(payBtn.style.color, V.onpri);
    expectBorderContainsColor(payBtn.style.border, V.pri);

    // Trigger dirty edit state
    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    await act(async () => {
      changeInput(posX, '132.5');
    });

    const pill = host.querySelector('[data-testid="unsaved-status-pill"]') as HTMLElement;
    expect(pill).not.toBeNull();
    expectColorMatch(pill.style.backgroundColor, V.warn);
    expectColorMatch(pill.style.color, V.bg);

    // Dirty state Apply and Discard bind to V.ok / V.err and V.onpri
    expectColorMatch(applyBtn.style.backgroundColor, V.ok);
    expectColorMatch(applyBtn.style.color, V.onpri);
    expectColorMatch(discardBtn.style.backgroundColor, V.err);
    expectColorMatch(discardBtn.style.color, V.onpri);
  });

  it('binds ObjectInspector permission text and gizmo lock notice to V.err when canModify is false', async () => {
    app.world.selectedObject = {
      ...editableObject,
      id: 'prim-locked-99',
      canModify: false,
      ownerMask: 0x0,
    };

    const V = computeThemeTokens('terminal', 'ink');
    const host = await mountWithTheme(createElement(ObjectInspector));

    const permSpan = Array.from(host.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === 'Locked (No Modify)',
    ) as HTMLElement;
    const gizmoLockSpan = Array.from(host.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === 'Controls Locked',
    ) as HTMLElement;

    expect(permSpan).toBeDefined();
    expect(gizmoLockSpan).toBeDefined();
    expectColorMatch(permSpan.style.color, V.err);
    expectColorMatch(gizmoLockSpan.style.color, V.err);
  });

  it('binds ObjectInspector deselect confirmation dialog Save and Discard buttons to V.ok, V.err, and V.onpri', async () => {
    app.world.selectedObject = { ...editableObject };
    app.objectEditPipeline.beginSession(app.world.selectedObject);

    const V = computeThemeTokens('terminal', 'ink');
    const host = await mountWithTheme(createElement(ObjectInspector));

    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    await act(async () => {
      changeInput(posX, '140.0');
    });

    const deselectBtn = host.querySelector(
      'button[aria-label="Deselect object"]',
    ) as HTMLButtonElement;
    await act(async () => {
      deselectBtn.click();
    });

    const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();

    const saveBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    ) as HTMLButtonElement;
    const discardBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Discard',
    ) as HTMLButtonElement;

    expect(saveBtn).toBeDefined();
    expect(discardBtn).toBeDefined();
    expectColorMatch(saveBtn.style.backgroundColor, V.ok);
    expectColorMatch(saveBtn.style.color, V.onpri);
    expectColorMatch(discardBtn.style.backgroundColor, V.err);
    expectColorMatch(discardBtn.style.color, V.onpri);
  });

  it('binds BuildingToolbar status banner, Link Primitives button, and Derez button to ThemeContext tokens', async () => {
    const onRez = vi.fn().mockResolvedValue(undefined);
    const obj1 = { id: 'obj-1', localId: 101, name: 'Prim A' };
    const V = computeThemeTokens('terminal', 'ink');

    const host = await mountWithTheme(
      createElement(BuildingToolbar, {
        selectedObject: obj1,
        selectedObjects: [obj1],
        onRez,
      }),
    );

    // Trigger success status banner via REZ action
    const rezBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('REZ BOX IN WORLD'),
    ) as HTMLButtonElement;
    await act(async () => {
      rezBtn.click();
    });

    const successBanner = host.querySelector('div[role="status"]') as HTMLElement;
    expect(successBanner).not.toBeNull();
    expectColorMatch(successBanner.style.color, V.ok);
    expectBorderContainsColor(successBanner.style.border, V.ok);
    const [okR, okG, okB] = hexToRgbTuple(V.ok);
    expect(successBanner.style.backgroundColor.replace(/\s+/g, '')).toContain(
      `rgba(${okR},${okG},${okB},`,
    );

    // Switch to LINKSET & DEREZ tab
    const linksetTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LINKSET & DEREZ',
    ) as HTMLButtonElement;
    await act(async () => {
      linksetTabBtn.click();
    });

    const linkBtn = host.querySelector(
      'button[aria-label="Link selected primitives into linkset"]',
    ) as HTMLButtonElement;
    const derezBtn = host.querySelector(
      'button[aria-label="Derez selected object"]',
    ) as HTMLButtonElement;

    expectColorMatch(linkBtn.style.backgroundColor, V.pri);
    expectColorMatch(linkBtn.style.color, V.onpri);
    expectColorMatch(derezBtn.style.backgroundColor, V.err);
    expectColorMatch(derezBtn.style.color, V.onpri);

    // Trigger error status banner (linking with only 1 selected prim)
    await act(async () => {
      linkBtn.click();
    });

    const errorBanner = host.querySelector('div[role="status"]') as HTMLElement;
    expect(errorBanner).not.toBeNull();
    expectColorMatch(errorBanner.style.color, V.err);
    expectBorderContainsColor(errorBanner.style.border, V.err);
    const [errR, errG, errB] = hexToRgbTuple(V.err);
    expect(errorBanner.style.backgroundColor.replace(/\s+/g, '')).toContain(
      `rgba(${errR},${errG},${errB},`,
    );
  });

  it('updates ObjectInspector and BuildingToolbar colors immediately on active theme palette switches without remounting', async () => {
    app.world.selectedObject = { ...editableObject };
    app.objectEditPipeline.beginSession(app.world.selectedObject);

    const host = await mountWithTheme(createElement(ObjectInspector));

    // Dirty pipeline so unsaved pill and Apply/Discard active colors are rendered
    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    await act(async () => {
      changeInput(posX, '135.0');
    });

    // Switch BuildingToolbar inside ObjectInspector to LINKSET & DEREZ tab
    const linksetTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LINKSET & DEREZ',
    ) as HTMLButtonElement;
    await act(async () => {
      linksetTabBtn.click();
    });

    const pill = host.querySelector('[data-testid="unsaved-status-pill"]') as HTMLElement;
    const applyBtn = host.querySelector('button[aria-label="Apply Changes"]') as HTMLButtonElement;
    const discardBtn = host.querySelector(
      'button[aria-label="Discard Changes"]',
    ) as HTMLButtonElement;
    const payBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PAY OBJECT'),
    ) as HTMLButtonElement;
    const linkBtn = host.querySelector(
      'button[aria-label="Link selected primitives into linkset"]',
    ) as HTMLButtonElement;
    const derezBtn = host.querySelector(
      'button[aria-label="Derez selected object"]',
    ) as HTMLButtonElement;

    for (const paletteKey of ['calm', 'aero', 'paper', 'lcars']) {
      await act(async () => {
        currentAppActions!.setPalette(paletteKey);
      });

      const V = computeThemeTokens('terminal', paletteKey);
      expectColorMatch(pill.style.backgroundColor, V.warn);
      expectColorMatch(pill.style.color, V.bg);
      expectColorMatch(applyBtn.style.backgroundColor, V.ok);
      expectColorMatch(applyBtn.style.color, V.onpri);
      expectColorMatch(discardBtn.style.backgroundColor, V.err);
      expectColorMatch(discardBtn.style.color, V.onpri);
      expectColorMatch(payBtn.style.backgroundColor, V.pri);
      expectColorMatch(payBtn.style.color, V.onpri);
      expectColorMatch(linkBtn.style.backgroundColor, V.pri);
      expectColorMatch(linkBtn.style.color, V.onpri);
      expectColorMatch(derezBtn.style.backgroundColor, V.err);
      expectColorMatch(derezBtn.style.color, V.onpri);
    }
  });

  it('satisfies WCAG 2.2 AA 4.5:1 contrast ratios across palettes and maintains >= 24px button hitboxes', async () => {
    const paletteKeys = Object.keys(PALETTES);
    expect(paletteKeys.length).toBeGreaterThanOrEqual(24);

    for (const key of paletteKeys) {
      const V = computeThemeTokens('terminal', key);

      // Unsaved status pill: V.warn background with V.bg text
      expect(
        contrastRatio(V.warn, V.bg),
        `Palette '${key}' V.warn vs V.bg contrast < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);

      // Primary action buttons (Pay Object, Link Primitives): V.pri background with V.onpri text
      expect(
        contrastRatio(V.onpri, V.pri),
        `Palette '${key}' V.onpri vs V.pri contrast < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);

      // Locked permission & gizmo indicator text: V.err on V.bg card surface
      expect(
        contrastRatio(V.err, V.bg),
        `Palette '${key}' V.err vs V.bg contrast < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);

      // BuildingToolbar status banner tinted backgrounds over V.bg
      const blendedOkBg = blendHexOverBg(V.ok, V.bg, '14');
      const blendedErrBg = blendHexOverBg(V.err, V.bg, '14');
      expect(
        contrastRatio(V.ok, blendedOkBg),
        `Palette '${key}' status banner V.ok vs tinted bg contrast < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(V.err, blendedErrBg),
        `Palette '${key}' status banner V.err vs tinted bg contrast < 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    // Verify both light (calm, paper, nouveau) and dark (ink, metro, amber) palettes meet >= 4.5:1 on V.ok/V.err action buttons
    for (const key of ['ink', 'metro', 'amber', 'calm', 'paper', 'nouveau']) {
      const V = computeThemeTokens('terminal', key);
      expect(contrastRatio(V.onpri, V.ok)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(V.onpri, V.err)).toBeGreaterThanOrEqual(4.5);
    }

    // Verify minimum 24px hitbox styles on all rendered buttons
    app.world.selectedObject = { ...editableObject };
    app.objectEditPipeline.beginSession(app.world.selectedObject);
    const host = await mountWithTheme(createElement(ObjectInspector));

    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    await act(async () => {
      changeInput(posX, '142.0');
    });
    const deselectBtn = host.querySelector(
      'button[aria-label="Deselect object"]',
    ) as HTMLButtonElement;
    await act(async () => {
      deselectBtn.click();
    });

    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      const minW = parseInt(btn.style.minWidth || '0', 10);
      const minH = parseInt(btn.style.minHeight || '0', 10);
      expect(
        minW,
        `Button "${btn.textContent || btn.getAttribute('aria-label')}" minWidth < 24px`,
      ).toBeGreaterThanOrEqual(24);
      expect(
        minH,
        `Button "${btn.textContent || btn.getAttribute('aria-label')}" minHeight < 24px`,
      ).toBeGreaterThanOrEqual(24);
    }
  });
});
