import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CrystalLoader from '../CrystalLoader.jsx';
import SkeletonLoader, { SkeletonBox } from '../SkeletonLoader.jsx';
import PayDialog from '../PayDialog.jsx';
import Search from '../../screens/Search.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app.ts';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(AppProvider, null, createElement(ThemeProvider, null, ui))
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
  vi.restoreAllMocks();
});

describe('CrystalLoader Component', () => {
  it('renders default block variant with size 88px', async () => {
    const host = await mount(createElement(CrystalLoader));
    const loader = host.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(loader).not.toBeNull();
    expect(loader.getAttribute('data-variant')).toBe('block');
    expect(loader.style.width).toBe('88px');
    expect(loader.style.height).toBe('88px');
    expect(loader.style.display).toBe('flex');
    expect(loader.getAttribute('role')).toBe('img');
    expect(loader.getAttribute('aria-label')).toBe('Loading');
  });

  it('renders inline variant with default size 16px', async () => {
    const host = await mount(createElement(CrystalLoader, { variant: 'inline' }));
    const loader = host.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(loader).not.toBeNull();
    expect(loader.getAttribute('data-variant')).toBe('inline');
    expect(loader.style.width).toBe('16px');
    expect(loader.style.height).toBe('16px');
    expect(loader.style.display).toBe('inline-flex');
    expect(loader.style.verticalAlign).toBe('middle');
  });

  it('renders inline variant with custom size prop (e.g. 24px)', async () => {
    const host = await mount(createElement(CrystalLoader, { variant: 'inline', size: 24 }));
    const loader = host.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(loader).not.toBeNull();
    expect(loader.style.width).toBe('24px');
    expect(loader.style.height).toBe('24px');
  });

  it('renders unique SVG gradient IDs across multiple instances', async () => {
    const host = await mount(
      createElement(
        'div',
        null,
        createElement(CrystalLoader, { variant: 'inline' }),
        createElement(CrystalLoader, { variant: 'inline' })
      )
    );
    const loaders = host.querySelectorAll('[data-testid="crystal-loader"]');
    expect(loaders.length).toBe(2);
    const gradients1 = loaders[0].querySelectorAll('linearGradient, radialGradient');
    const gradients2 = loaders[1].querySelectorAll('linearGradient, radialGradient');
    const id1 = gradients1[0]?.id;
    const id2 = gradients2[0]?.id;
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });
});

describe('Branded Skeleton System', () => {
  it('incorporates primary brand color tokens into SkeletonBox shimmer gradient', async () => {
    const host = await mount(createElement(SkeletonBox, { width: '100px', height: '20px' }));
    const box = host.querySelector('.skeleton-box') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.style.background).toContain('linear-gradient');
    // In jsdom/browsers, hex color values like #6CFF9A (V.pri) are computed into rgb(108, 255, 154)
    expect(box.style.background).toMatch(/(108, 255, 154|#6CFF9A|var\(--pri\))/);
  });
});

describe('PayDialog inline CrystalLoader integration', () => {
  beforeEach(() => {
    app.economy.currencySymbol = 'L$';
    app.economy.isZeroCurrency = false;
  });

  it('renders inline CrystalLoader during payment processing', async () => {
    let resolvePay: (val: any) => void = () => {};
    const payPromise = new Promise((resolve) => {
      resolvePay = resolve;
    });

    vi.spyOn(app.economy, 'payAvatar').mockImplementation(() => payPromise as any);

    const host = await mount(
      createElement(PayDialog, {
        isOpen: true,
        onClose: vi.fn(),
        target: { id: 'resident-1', name: 'Aimee Resident', type: 'avatar' },
      })
    );

    const payBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(payBtn).not.toBeNull();

    await act(async () => {
      payBtn.click();
    });

    // Button should now be in loading state
    const crystal = payBtn.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(crystal).not.toBeNull();
    expect(crystal.getAttribute('data-variant')).toBe('inline');
    expect(crystal.style.width).toBe('16px');
    expect(payBtn.textContent).toContain('Sending L$');

    // Clean up pending promise
    await act(async () => {
      resolvePay({ id: 'tx-1', status: 'success' });
    });
  });
});
