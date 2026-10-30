import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CrystalProgressBar from '../CrystalProgressBar.jsx';
import { SkeletonAssetPlaceholder } from '../SkeletonLoader.jsx';
import AssetContainer from '../AssetContainer.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';

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
});

describe('CrystalProgressBar Component', () => {
  it('renders progress bar with correct role, aria attributes, and testids', async () => {
    const host = await mount(<CrystalProgressBar progress={45} />);
    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    expect(container).not.toBeNull();
    expect(container.getAttribute('role')).toBe('progressbar');
    expect(container.getAttribute('aria-valuenow')).toBe('45');
    expect(container.getAttribute('aria-valuemin')).toBe('0');
    expect(container.getAttribute('aria-valuemax')).toBe('100');

    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe('45%');
    expect(fill.style.transition).toContain('width 0.2s ease-out');
  });

  it('clamps numerical percentage values between 0 and 100 and handles invalid inputs', async () => {
    const hostNegative = await mount(<CrystalProgressBar progress={-20} />);
    const fillNegative = hostNegative.querySelector(
      '[data-testid="asset-progress-bar"]',
    ) as HTMLElement;
    expect(fillNegative.style.width).toBe('0%');

    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
        mounted!.host.remove();
        mounted = null;
      });
    }

    const hostOver = await mount(<CrystalProgressBar progress={150} />);
    const fillOver = hostOver.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fillOver.style.width).toBe('100%');

    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
        mounted!.host.remove();
        mounted = null;
      });
    }

    const hostNaN = await mount(<CrystalProgressBar progress={NaN} />);
    const fillNaN = hostNaN.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fillNaN.style.width).toBe('0%');
  });

  it('renders label and rounded percentage when showLabel is true', async () => {
    const host = await mount(
      <CrystalProgressBar progress={68.6} showLabel={true} label="Fetching texture..." />,
    );
    expect(host.textContent).toContain('Fetching texture...');
    expect(host.textContent).toContain('69%');
  });

  it('renders crystal brand indicator cap when progress is greater than 0', async () => {
    const host = await mount(<CrystalProgressBar progress={50} />);
    const cap = host.querySelector('[data-testid="crystal-progress-cap"]');
    expect(cap).not.toBeNull();
  });

  it('applies custom height and custom inline styles', async () => {
    const host = await mount(
      <CrystalProgressBar progress={30} height={12} style={{ marginTop: '10px' }} />,
    );
    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    expect(container.style.marginTop).toBe('10px');
  });

  it('uses theme palette variables for linear gradient fill styling', async () => {
    const host = await mount(<CrystalProgressBar progress={75} />);
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fill.style.background).toContain('linear-gradient');
  });

  it('renders inside SkeletonAssetPlaceholder when progress is provided', async () => {
    const host = await mount(<SkeletonAssetPlaceholder title="Asset Loading" progress={80} />);
    const container = host.querySelector('[data-testid="skeleton-asset-placeholder"]');
    expect(container).not.toBeNull();

    const progressBarContainer = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    );
    expect(progressBarContainer).not.toBeNull();

    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fill.style.width).toBe('80%');
  });

  it('updates progress state in AssetContainer during progressive download', async () => {
    let progressCallback: ((loaded: number, total: number) => void) | null = null;
    const mockFetch = vi.fn((_asset, onProgress) => {
      progressCallback = onProgress;
      return new Promise(() => {}); // pending
    });

    const host = await mount(
      <AssetContainer asset={{ id: 'asset-mesh-1', name: 'Mesh Avatar' }} onFetch={mockFetch} />,
    );

    // Trigger progressive download update
    await act(async () => {
      if (progressCallback) {
        progressCallback(400, 1000); // 40%
      }
    });

    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe('40%');
  });
});
