// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { TransactionsScreen } from '../LumiyaTools.jsx';
import { app } from '../../linkpoint/app.ts';
import { PALETTES, computeThemeTokens, ensureMinContrast } from '@linkpoint/design-system/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;
let currentAppActions: any = null;

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

function ActionBridge() {
  const { actions } = useApp();
  useEffect(() => {
    currentAppActions = actions;
  }, [actions]);
  return null;
}

async function mountScreen(ui: React.ReactNode) {
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
  vi.restoreAllMocks();
});

describe('TransactionsScreen Theme Token Direct Binding', () => {
  it('imports useTheme from ../context/ThemeContext.jsx and extracts { V, t }', () => {
    const filePath = path.resolve(__dirname, '../LumiyaTools.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    const expectedImport = [
      'import',
      '{ useTheme }',
      'from',
      "'../context/ThemeContext.jsx';",
    ].join(' ');
    expect(content).toContain(expectedImport);

    // Locate TransactionsScreen definition
    const transactionsFnMatch = content.match(
      /export function TransactionsScreen\(\)\s*\{([\s\S]*?)(?=\nexport function|\nfunction Empty|$)/,
    );
    expect(transactionsFnMatch).not.toBeNull();
    const transactionsBody = transactionsFnMatch![1];

    expect(transactionsBody).toMatch(/const\s*\{\s*V,\s*t\s*\}\s*=\s*useTheme\(\);/);
  });

  it('contains zero hardcoded hex color strings in TransactionsScreen', () => {
    const filePath = path.resolve(__dirname, '../LumiyaTools.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    const transactionsFnMatch = content.match(
      /export function TransactionsScreen\(\)\s*\{([\s\S]*?)(?=\nexport function TeleportScreen)/,
    );
    expect(transactionsFnMatch).not.toBeNull();
    const transactionsBody = transactionsFnMatch![1];

    const forbiddenHexes = [
      '#0284c7',
      '#94a3b8',
      '#38bdf8',
      '#f43f5e',
      '#34d399',
      '#e2e8f0',
      '#334155',
      '#0f172a',
      '#f8fafc',
      '#64748b',
    ];

    for (const hex of forbiddenHexes) {
      expect(
        transactionsBody.toLowerCase().includes(hex.toLowerCase()),
        `TransactionsScreen still contains forbidden hex color: ${hex}`,
      ).toBe(false);
    }

    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const remainingHexMatches = transactionsBody.match(hexPattern) || [];
    expect(remainingHexMatches).toEqual([]);
  });

  it('renders "Pay / Tip" button with V.pri background, V.onpri color, and V.rs border radius', async () => {
    const expectedTokens = computeThemeTokens('terminal', 'ink');
    const host = await mountScreen(<TransactionsScreen />);

    const payButton = Array.from(host.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Pay / Tip'),
    ) as HTMLButtonElement | undefined;

    expect(payButton).toBeDefined();
    expectColorMatch(payButton?.style.backgroundColor, expectedTokens.pri);
    expectColorMatch(payButton?.style.color, expectedTokens.onpri);
    expect(payButton?.style.borderRadius).toBe(expectedTokens.rs);
  });

  it('renders summary metrics with V tokens across light and dark palettes', async () => {
    const darkTokens = computeThemeTokens('terminal', 'ink');
    const darkHost = await mountScreen(<TransactionsScreen />);

    const metricSections = darkHost.querySelectorAll('div[style*="grid"] section.runtime-card');
    expect(metricSections.length).toBe(4);

    // Current Balance
    const balanceSmall = metricSections[0].querySelector('small');
    const balanceStrong = metricSections[0].querySelector('strong');
    expectColorMatch(balanceSmall?.style.color, darkTokens.ink2);
    expectColorMatch(balanceStrong?.style.color, darkTokens.pri);

    // Spent
    const spentSmall = metricSections[1].querySelector('small');
    const spentStrong = metricSections[1].querySelector('strong');
    expectColorMatch(spentSmall?.style.color, darkTokens.ink2);
    expectColorMatch(spentStrong?.style.color, darkTokens.err);

    // Received
    const receivedSmall = metricSections[2].querySelector('small');
    const receivedStrong = metricSections[2].querySelector('strong');
    expectColorMatch(receivedSmall?.style.color, darkTokens.ink2);
    expectColorMatch(receivedStrong?.style.color, darkTokens.ok);

    // Total Records
    const recordsSmall = metricSections[3].querySelector('small');
    const recordsStrong = metricSections[3].querySelector('strong');
    expectColorMatch(recordsSmall?.style.color, darkTokens.ink2);
    expectColorMatch(recordsStrong?.style.color, darkTokens.ink);
  });

  it('renders filter inputs and selects with V.outv, V.surf, V.ink, and V.rs', async () => {
    const tokens = computeThemeTokens('terminal', 'ink');
    const host = await mountScreen(<TransactionsScreen />);

    const inputs = host.querySelectorAll('input, select');
    expect(inputs.length).toBeGreaterThanOrEqual(6);

    for (const input of Array.from(inputs)) {
      const el = input as HTMLElement;
      expect(el.style.borderRadius).toBe(tokens.rs);
      expectColorMatch(el.style.backgroundColor, tokens.surf);
      expectColorMatch(el.style.color, tokens.ink);
      const outvRgb = hexToRgb(tokens.outv).toLowerCase();
      expect(
        el.style.border.toLowerCase().includes(tokens.outv.toLowerCase()) ||
          el.style.border.toLowerCase().includes(outvRgb),
      ).toBe(true);
    }
  });

  it('renders transaction list with V tokens for icons, badges, amounts, and dates', async () => {
    const tokens = computeThemeTokens('terminal', 'ink');

    vi.spyOn(app.economy, 'init').mockResolvedValue();
    vi.spyOn(app.economy, 'fetchHistory').mockResolvedValue([]);
    vi.spyOn(app.economy, 'getTransactions').mockReturnValue([
      {
        id: 'tx-1',
        agentId: 'agent-1',
        targetId: 'target-1',
        targetName: 'Store Vendor',
        targetType: 'object',
        type: 'payment',
        amount: -250,
        timestamp: Date.now() - 3600000,
        description: 'Store Purchase',
        status: 'failed',
      },
      {
        id: 'tx-2',
        agentId: 'agent-1',
        targetId: 'target-2',
        targetName: 'Friend Avatar',
        targetType: 'avatar',
        type: 'tip',
        amount: 500,
        timestamp: Date.now() - 7200000,
        description: 'Tip received',
        status: 'success',
      },
    ]);

    const host = await mountScreen(<TransactionsScreen />);

    const rows = host.querySelectorAll('div[style*="flex-direction: column"] section.runtime-card');
    expect(rows.length).toBe(2);

    // Row 1 (Failed Payment)
    const row1 = rows[0];
    const icon1 = row1.querySelector('svg');
    expectColorMatch(icon1?.style.color, tokens.ink2);

    const failedBadge = Array.from(row1.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === 'Failed',
    );
    expect(failedBadge).toBeDefined();
    expectColorMatch(failedBadge?.style.color, tokens.err);
    const bg = failedBadge?.style.backgroundColor?.toLowerCase();
    const expectedHexWithAlpha = `${tokens.err}33`.toLowerCase();
    expect(bg?.includes(expectedHexWithAlpha) || bg?.includes('rgba(')).toBe(true);
    expect(failedBadge?.style.borderRadius).toBe(tokens.rs);

    const timestamp1 = row1.querySelector('small');
    expectColorMatch(timestamp1?.style.color, tokens.ink2);

    const amount1 = Array.from(row1.querySelectorAll('span')).find((s) =>
      s.textContent?.includes('250'),
    );
    expectColorMatch(amount1?.style.color, tokens.err);

    // Row 2 (Completed Credit)
    const row2 = rows[1];
    const amount2 = Array.from(row2.querySelectorAll('span')).find((s) =>
      s.textContent?.includes('500'),
    );
    expectColorMatch(amount2?.style.color, tokens.ok);
  });

  it('updates ledger styles immediately when switching theme palettes', async () => {
    const host = await mountScreen(<TransactionsScreen />);

    const initialTokens = computeThemeTokens('terminal', 'ink');
    const button = Array.from(host.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Pay / Tip'),
    );
    expect(button?.style.borderRadius).toBe(initialTokens.rs);
    expectColorMatch(button?.style.backgroundColor, initialTokens.pri);

    // Switch palette and layout using active AppContext actions
    expect(currentAppActions).toBeDefined();
    await act(async () => {
      currentAppActions.setLayout('metro');
      currentAppActions.setPalette('amber');
    });

    const metroAmberTokens = computeThemeTokens('metro', 'amber');
    const updatedButton = Array.from(host.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Pay / Tip'),
    );
    expect(updatedButton?.style.borderRadius).toBe(metroAmberTokens.rs);
    expectColorMatch(updatedButton?.style.backgroundColor, metroAmberTokens.pri);
    expectColorMatch(updatedButton?.style.color, metroAmberTokens.onpri);

    const metricSections = host.querySelectorAll('div[style*="grid"] section.runtime-card');
    const balanceStrong = metricSections[0].querySelector('strong');
    expectColorMatch(balanceStrong?.style.color, metroAmberTokens.pri);
  });

  it('verifies contrast compliance for ledger tokens across all palettes under WCAG 2.2', () => {
    const paletteKeys = Object.keys(PALETTES);
    expect(paletteKeys.length).toBeGreaterThanOrEqual(24);

    for (const key of paletteKeys) {
      const V = computeThemeTokens('terminal', key);
      const bg = V.bg;
      const surf = V.surf;

      // Primary button text on primary button background meets minimum WCAG AA standard
      const onpriContrast = getContrastRatio(V.onpri, V.pri);
      expect(
        onpriContrast,
        `Palette '${key}' V.onpri vs V.pri contrast ratio < 4.5:1 (${onpriContrast.toFixed(2)})`,
      ).toBeGreaterThanOrEqual(4.5);

      // Ink text on bg and surf
      const inkOnBg = getContrastRatio(V.ink, bg);
      expect(
        inkOnBg,
        `Palette '${key}' V.ink vs bg contrast ratio < 4.5:1 (${inkOnBg.toFixed(2)})`,
      ).toBeGreaterThanOrEqual(4.5);

      // Ink2 contrast on surf
      const ink2OnSurf = getContrastRatio(ensureMinContrast(V.ink2, surf, 4.5), surf);
      expect(ink2OnSurf).toBeGreaterThanOrEqual(4.5);
    }
  });
});
