import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AccessibleInput, AccessibleSelect } from '@linkpoint/design-system/react';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import PayDialog from '../../components/PayDialog.jsx';
import SplitPaneCompositor from '../../components/SplitPaneCompositor';
import VoiceDevices from '../../components/VoiceDevices.jsx';
import Settings from '../../screens/Settings.jsx';
import { TransactionsScreen } from '../../screens/LumiyaTools.jsx';
import { computeThemeTokens } from '@linkpoint/design-system/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mountWithApp(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(AppProvider, null, React.createElement(ThemeProvider, null, ui)),
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
});

describe('Accessible Control Primitives Integration', () => {
  it('exports AccessibleInput and AccessibleSelect from @linkpoint/design-system/react', () => {
    expect(AccessibleInput).toBeDefined();
    expect(AccessibleSelect).toBeDefined();
  });

  it('renders PayDialog with AccessibleInput controls that maintain visible keyboard focus', async () => {
    const host = await mountWithApp(
      <PayDialog isOpen={true} onClose={() => {}} target={{ name: 'Test Merchant', id: '123' }} />,
    );

    const customAmountInput = host.querySelector(
      'input[aria-label="Custom payment amount"]',
    ) as HTMLInputElement;
    const noteInput = host.querySelector(
      'input[aria-label="Description / Note"]',
    ) as HTMLInputElement;

    expect(customAmountInput).not.toBeNull();
    expect(noteInput).not.toBeNull();

    // Verify minHeight meets 44px touch target requirement
    expect(customAmountInput.style.minHeight).toBe('44px');
    expect(noteInput.style.minHeight).toBe('44px');

    // Verify initial outline is not 'none'
    expect(customAmountInput.style.outline).not.toBe('none');

    // Simulate keyboard focus
    await act(async () => {
      customAmountInput.focus();
    });

    expect(customAmountInput.style.outline).toContain('2px solid');
    expect(customAmountInput.style.outlineOffset).toBe('2px');

    await act(async () => {
      noteInput.focus();
    });

    expect(noteInput.style.outline).toContain('2px solid');
    expect(noteInput.style.outlineOffset).toBe('2px');
  });

  it('renders SplitPaneCompositor tool view selector with AccessibleSelect without outline suppression', async () => {
    const host = await mountWithApp(<SplitPaneCompositor />);

    const select = host.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();

    // Verify outline is not suppressed with outline: 'none'
    expect(select.style.outline).not.toBe('none');

    // Simulate keyboard focus
    await act(async () => {
      select.focus();
    });

    expect(select.style.outline).toContain('2px solid');
    expect(select.style.outlineOffset).toBe('2px');
  });

  it('renders TransactionsScreen filter bar with AccessibleInput and AccessibleSelect controls', async () => {
    const host = await mountWithApp(<TransactionsScreen />);

    const searchInput = host.querySelector(
      'input[placeholder="Search description/ID..."]',
    ) as HTMLInputElement;
    const selects = host.querySelectorAll('select');

    expect(searchInput).not.toBeNull();
    expect(selects.length).toBeGreaterThanOrEqual(2);

    expect(searchInput.style.outline).not.toBe('none');
    expect(searchInput.style.minHeight).toBe('44px');

    // Focus search input
    await act(async () => {
      searchInput.focus();
    });

    expect(searchInput.style.outline).toContain('2px solid');
    expect(searchInput.style.outlineOffset).toBe('2px');
  });

  it('renders Settings search input with AccessibleInput and visible keyboard focus ring', async () => {
    const host = await mountWithApp(<Settings />);

    const searchInput = host.querySelector('input[type="search"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.style.minHeight).toBe('44px');
    expect(searchInput.style.outline).not.toBe('none');

    await act(async () => {
      searchInput.focus();
    });

    expect(searchInput.style.outline).toContain('2px solid');
    expect(searchInput.style.outlineOffset).toBe('2px');

    await act(async () => {
      searchInput.blur();
    });

    expect(searchInput.style.outline).toBe('');
  });

  it('renders Settings preference dropdown controls with AccessibleSelect and visible focus rings', async () => {
    const host = await mountWithApp(<Settings />);

    const selects = host.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(10);

    const themeSelect = host.querySelector('#settings-theme-select') as HTMLSelectElement;
    expect(themeSelect).not.toBeNull();
    const optgroups = themeSelect.querySelectorAll('optgroup');
    expect(optgroups.length).toBeGreaterThan(0);

    for (const select of selects) {
      expect(select.style.minHeight).toBe('44px');
      expect(select.style.outline).not.toBe('none');

      if (!select.disabled) {
        await act(async () => {
          select.focus();
        });
        expect(select.style.outline).toContain('2px solid');
        expect(select.style.outlineOffset).toBe('2px');

        await act(async () => {
          select.blur();
        });
        expect(select.style.outline).toBe('');
      }
    }
  });

  it('renders VoiceDevices selectors with AccessibleSelect, 44px touch targets, and focus rings', async () => {
    const host = await mountWithApp(<VoiceDevices />);

    const selects = host.querySelectorAll('select');
    expect(selects.length).toBe(2);

    for (const select of selects) {
      expect(select.style.minHeight).toBe('44px');
      expect(select.style.outline).not.toBe('none');

      if (!select.disabled) {
        await act(async () => {
          select.focus();
        });
        expect(select.style.outline).toContain('2px solid');
        expect(select.style.outlineOffset).toBe('2px');

        await act(async () => {
          select.blur();
        });
        expect(select.style.outline).toBe('');
      }
    }
  });
});
