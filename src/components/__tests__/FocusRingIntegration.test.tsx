// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app.ts';
import SegmentedTabs from '../SegmentedTabs.jsx';
import SplitPaneCompositor from '../SplitPaneCompositor';
import PayDialog from '../PayDialog.jsx';
import { TransactionsScreen } from '../../screens/LumiyaTools.jsx';
import { FocusRing, useFocusRing } from '../FocusRing';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
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
  vi.restoreAllMocks();
});

describe('FocusRing UI Component Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    app.economy.currencySymbol = 'L$';
    app.economy.isZeroCurrency = false;
  });

  it('src/components/FocusRing re-exports FocusRing and useFocusRing correctly', () => {
    expect(FocusRing).toBeDefined();
    expect(useFocusRing).toBeDefined();
  });

  it('SegmentedTabs tab buttons use FocusRing and lack raw outline: none', async () => {
    const host = await mount(<SegmentedTabs screen="Search" />);

    const tabButtons = host.querySelectorAll('button[role="tab"]');
    expect(tabButtons.length).toBeGreaterThan(0);

    const firstTab = tabButtons[0] as HTMLButtonElement;
    // Verify outline: none is not in inline style
    expect(firstTab.style.outline).toBe('');

    await act(async () => {
      firstTab.focus();
    });

    expect(firstTab.style.outline).toContain('solid');
    expect(firstTab.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      firstTab.blur();
    });

    expect(firstTab.style.outline).toBe('');
    expect(firstTab.getAttribute('data-focused')).toBeNull();
  });

  it('SplitPaneCompositor tile view selector select uses FocusRing and lacks raw outline: none', async () => {
    const host = await mount(createElement(SplitPaneCompositor));

    const viewSelector = host.querySelector(
      'select[aria-label^="Tile tool view selector"]',
    ) as HTMLSelectElement;
    expect(viewSelector).toBeTruthy();

    expect(viewSelector.style.outline).toBe('');

    await act(async () => {
      viewSelector.focus();
    });

    expect(viewSelector.style.outline).toContain('solid');
    expect(viewSelector.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      viewSelector.blur();
    });

    expect(viewSelector.style.outline).toBe('');
    expect(viewSelector.getAttribute('data-focused')).toBeNull();
  });

  it('PayDialog custom amount and description inputs use FocusRing and lack raw outline: none', async () => {
    const host = await mount(
      createElement(PayDialog, {
        isOpen: true,
        onClose: vi.fn(),
        target: { id: 'resident-1', name: 'Aimee Resident', type: 'avatar' },
      }),
    );

    const amountInput = host.querySelector(
      'input[aria-label="Custom payment amount"]',
    ) as HTMLInputElement;
    const descInput = host.querySelector(
      'input[aria-label="Description / Note"]',
    ) as HTMLInputElement;

    expect(amountInput).toBeTruthy();
    expect(descInput).toBeTruthy();

    expect(amountInput.style.outline).toBe('');
    expect(descInput.style.outline).toBe('');

    await act(async () => {
      amountInput.focus();
    });
    expect(amountInput.style.outline).toContain('solid');
    expect(amountInput.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      amountInput.blur();
    });
    expect(amountInput.style.outline).toBe('');

    await act(async () => {
      descInput.focus();
    });
    expect(descInput.style.outline).toContain('solid');
    expect(descInput.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      descInput.blur();
    });
    expect(descInput.style.outline).toBe('');
  });

  it('LumiyaTools transaction search input uses FocusRing and lacks raw outline: none', async () => {
    const host = await mount(createElement(TransactionsScreen));

    const searchInput = host.querySelector(
      'input[placeholder="Search description/ID..."]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    expect(searchInput.style.outline).toBe('');

    await act(async () => {
      searchInput.focus();
    });
    expect(searchInput.style.outline).toContain('solid');
    expect(searchInput.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      searchInput.blur();
    });
    expect(searchInput.style.outline).toBe('');
    expect(searchInput.getAttribute('data-focused')).toBeNull();
  });
});
