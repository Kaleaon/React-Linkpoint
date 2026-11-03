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

    const cap = host.querySelector('[data-testid="crystal-progress-cap"]');
    expect(cap).not.toBeNull();
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

  it('renders state-block variant with default 216px container width and 4px track height', async () => {
    const host = await mount(
      <CrystalProgressBar variant="state-block" progress={60} ariaLabel="Loading scene" />,
    );

    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    expect(container).not.toBeNull();
    expect(container.style.width).toBe('216px');
    expect(container.getAttribute('role')).toBe('progressbar');
    expect(container.getAttribute('aria-valuenow')).toBe('60');
    expect(container.getAttribute('aria-valuemin')).toBe('0');
    expect(container.getAttribute('aria-valuemax')).toBe('100');
    expect(container.getAttribute('aria-label')).toBe('Loading scene');

    const track = host.querySelector('[data-testid="crystal-progress-track"]') as HTMLElement;
    expect(track).not.toBeNull();
    expect(track.style.height).toBe('4px');
    expect(track.style.borderRadius).toBe('2px');

    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe('60%');
    expect(fill.style.background).toContain('linear-gradient(90deg');

    const cap = host.querySelector('[data-testid="crystal-progress-cap"]');
    expect(cap).not.toBeNull();

    // Verify header text label is omitted by default
    expect(host.textContent).not.toContain('Downloading asset data...');
    expect(host.textContent).not.toContain('Loading scene');
  });

  it('allows overriding dimensions and style in state-block variant', async () => {
    const host = await mount(
      <CrystalProgressBar
        variant="state-block"
        progress={35}
        height={8}
        style={{ width: '180px' }}
      />,
    );

    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    expect(container.style.width).toBe('180px');

    const track = host.querySelector('[data-testid="crystal-progress-track"]') as HTMLElement;
    expect(track.style.height).toBe('8px');
  });

  it('retains default 100% width and 6px height when variant is default or omitted', async () => {
    const hostDefault = await mount(<CrystalProgressBar variant="default" progress={25} />);
    const containerDefault = hostDefault.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    const trackDefault = hostDefault.querySelector(
      '[data-testid="crystal-progress-track"]',
    ) as HTMLElement;
    expect(containerDefault.style.width).toBe('100%');
    expect(trackDefault.style.height).toBe('6px');
    expect(trackDefault.style.borderRadius).toBe('4px');
  });

  it('attaches imperative handle via React.forwardRef and exposes DOM node references', async () => {
    const barRef = { current: null as any };
    const host = await mount(
      <CrystalProgressBar ref={barRef} progress={20} showLabel={true} label="Loading mesh..." />,
    );

    expect(barRef.current).not.toBeNull();
    expect(typeof barRef.current.updateProgress).toBe('function');
    expect(barRef.current.track).toBeInstanceOf(HTMLElement);
    expect(barRef.current.fill).toBeInstanceOf(HTMLElement);
    expect(barRef.current.label).toBeInstanceOf(HTMLElement);
    expect(barRef.current.container).toBeInstanceOf(HTMLElement);

    const trackElem = host.querySelector('[data-testid="crystal-progress-track"]');
    const fillElem = host.querySelector('[data-testid="asset-progress-bar"]');
    const labelElem = host.querySelector('[data-testid="crystal-progress-label"]');

    expect(barRef.current.track).toBe(trackElem);
    expect(barRef.current.fill).toBe(fillElem);
    expect(barRef.current.label).toBe(labelElem);
  });

  it('updates fill width, ARIA valuenow, and cap visibility directly in the DOM on updateProgress call', async () => {
    const barRef = { current: null as any };
    const host = await mount(<CrystalProgressBar ref={barRef} progress={0} />);

    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    const cap = host.querySelector('[data-testid="crystal-progress-cap"]') as HTMLElement;

    expect(fill.style.width).toBe('0%');
    expect(container.getAttribute('aria-valuenow')).toBe('0');
    expect(cap.style.display).toBe('none');

    await act(async () => {
      barRef.current.updateProgress(72);
    });

    expect(fill.style.width).toBe('72%');
    expect(container.getAttribute('aria-valuenow')).toBe('72');
    expect(cap.style.display).toBe('flex');
    expect(cap.style.visibility).toBe('visible');

    await act(async () => {
      barRef.current.updateProgress(0);
    });

    expect(fill.style.width).toBe('0%');
    expect(container.getAttribute('aria-valuenow')).toBe('0');
    expect(cap.style.display).toBe('none');
    expect(cap.style.visibility).toBe('hidden');
  });

  it('clamps numerical percentage values and handles non-numeric inputs in updateProgress', async () => {
    const barRef = { current: null as any };
    const host = await mount(<CrystalProgressBar ref={barRef} progress={10} />);

    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;

    await act(async () => {
      barRef.current.updateProgress(-30);
    });
    expect(fill.style.width).toBe('0%');
    expect(container.getAttribute('aria-valuenow')).toBe('0');

    await act(async () => {
      barRef.current.updateProgress(180);
    });
    expect(fill.style.width).toBe('100%');
    expect(container.getAttribute('aria-valuenow')).toBe('100');

    await act(async () => {
      barRef.current.updateProgress(NaN);
    });
    expect(fill.style.width).toBe('0%');
    expect(container.getAttribute('aria-valuenow')).toBe('0');

    await act(async () => {
      barRef.current.updateProgress('invalid');
    });
    expect(fill.style.width).toBe('0%');
    expect(container.getAttribute('aria-valuenow')).toBe('0');

    await act(async () => {
      barRef.current.updateProgress('55');
    });
    expect(fill.style.width).toBe('55%');
    expect(container.getAttribute('aria-valuenow')).toBe('55');
  });

  it('supports error styling when isFailed or error prop is true', async () => {
    const host = await mount(<CrystalProgressBar progress={50} isFailed={true} />);
    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    const cap = host.querySelector('[data-testid="crystal-progress-cap"]') as HTMLElement;
    const polygon = cap.querySelector('polygon') as SVGPolygonElement;

    expect(container.classList.contains('is-failed')).toBe(true);
    expect(fill.style.background).not.toContain('linear-gradient');
    expect(fill.style.background).toBe('rgb(211, 114, 131)');
    expect(polygon.getAttribute('fill')).toBe('#d37283');
  });
});
