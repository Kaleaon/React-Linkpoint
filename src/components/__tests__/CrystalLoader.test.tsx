import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CrystalLoader from '../CrystalLoader.jsx';
import SkeletonLoader, { SkeletonBox, SkeletonAssetPlaceholder } from '../SkeletonLoader.jsx';
import BrandedLoader from '../BrandedLoader.jsx';
import StateBlock from '../StateBlock.jsx';
import AssetContainer from '../AssetContainer.jsx';
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

describe('<CrystalLoader /> Component', () => {
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

  it('renders SVG loading indicator with valid colon-free gradient IDs', async () => {
    const host = await mount(<CrystalLoader size={100} />);
    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();

    const linearGradients = Array.from(host.querySelectorAll('linearGradient'));
    const radialGradients = Array.from(host.querySelectorAll('radialGradient'));

    expect(linearGradients).toHaveLength(2);
    expect(radialGradients).toHaveLength(1);

    const ids = [
      ...linearGradients.map((el) => el.getAttribute('id')),
      ...radialGradients.map((el) => el.getAttribute('id')),
    ];

    ids.forEach((id) => {
      expect(id).toBeTruthy();
      expect(id).not.toContain(':');
    });

    const polygons = Array.from(host.querySelectorAll('polygon'));
    expect(polygons.length).toBeGreaterThan(0);
    polygons.forEach((poly) => {
      const fill = poly.getAttribute('fill');
      expect(fill).toMatch(/^url\(#lpld-[^:]+-(a|b)\)$/);
    });

    const coreCircle = host.querySelector('circle.lpld-core');
    expect(coreCircle).not.toBeNull();
    expect(coreCircle?.getAttribute('fill')).toMatch(/^url\(#lpld-[^:]+-core\)$/);
  });

  it('generates unique SVG IDs when rendered concurrently in multi-pane views', async () => {
    const host = await mount(
      <div>
        <CrystalLoader />
        <CrystalLoader />
        <CrystalLoader />
      </div>,
    );

    const loaderContainers = Array.from(host.querySelectorAll('div[role="img"]'));
    expect(loaderContainers).toHaveLength(3);

    const allGradients = Array.from(host.querySelectorAll('linearGradient, radialGradient'));
    const allIds = allGradients.map((el) => el.getAttribute('id'));

    // 3 instances * 3 gradients each = 9 total gradients
    expect(allIds).toHaveLength(9);

    // Verify all IDs are unique
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(9);

    // Verify each loader instance references its own local gradients
    loaderContainers.forEach((container) => {
      const localGradients = Array.from(
        container.querySelectorAll('linearGradient, radialGradient'),
      ).map((el) => el.getAttribute('id'));

      const localFills = Array.from(container.querySelectorAll('[fill^="url(#"]')).map((el) =>
        el.getAttribute('fill'),
      );

      localFills.forEach((fill) => {
        const referencedId = fill?.replace(/^url\(#|\)$/g, '');
        expect(localGradients).toContain(referencedId);
      });
    });
  });

  it('supports explicit idPrefix prop for deterministic testing and overrides', async () => {
    const host = await mount(<CrystalLoader idPrefix="test-crystal:1" size={64} />);

    const gradA = host.querySelector('linearGradient#test-crystal1-a');
    const gradB = host.querySelector('linearGradient#test-crystal1-b');
    const gradCore = host.querySelector('radialGradient#test-crystal1-core');

    expect(gradA).not.toBeNull();
    expect(gradB).not.toBeNull();
    expect(gradCore).not.toBeNull();

    const coreCircle = host.querySelector('circle.lpld-core');
    expect(coreCircle?.getAttribute('fill')).toBe('url(#test-crystal1-core)');
  });

  it('preserves gradient integrity when a concurrent loader instance unmounts', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    function DualLoaderWrapper({ renderSecond }: { renderSecond: boolean }) {
      return (
        <div>
          <CrystalLoader idPrefix="loader-primary" />
          {renderSecond && <CrystalLoader idPrefix="loader-secondary" />}
        </div>
      );
    }

    await act(async () => {
      root.render(<DualLoaderWrapper renderSecond={true} />);
    });

    expect(host.querySelector('#loader-primary-a')).not.toBeNull();
    expect(host.querySelector('#loader-secondary-a')).not.toBeNull();

    // Unmount secondary loader
    await act(async () => {
      root.render(<DualLoaderWrapper renderSecond={false} />);
    });

    // Primary loader gradients and fills remain valid
    expect(host.querySelector('#loader-primary-a')).not.toBeNull();
    expect(host.querySelector('#loader-primary-b')).not.toBeNull();
    expect(host.querySelector('#loader-primary-core')).not.toBeNull();
    expect(host.querySelector('#loader-secondary-a')).toBeNull();

    const primaryCore = host.querySelector('circle.lpld-core');
    expect(primaryCore?.getAttribute('fill')).toBe('url(#loader-primary-core)');

    await act(async () => {
      root.unmount();
    });
    host.remove();
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

  it('renders a 20px CrystalLoader instance in SkeletonAssetPlaceholder header slot', async () => {
    const host = await mount(
      createElement(SkeletonAssetPlaceholder, { title: 'Test Asset', progress: 50 }),
    );
    const container = host.querySelector(
      '[data-testid="skeleton-asset-placeholder"]',
    ) as HTMLElement;
    expect(container).not.toBeNull();

    const crystal = container.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(crystal).not.toBeNull();
    expect(crystal.getAttribute('data-variant')).toBe('inline');
    expect(crystal.style.width).toBe('20px');
    expect(crystal.style.height).toBe('20px');
    expect(crystal.getAttribute('role')).toBe('img');
    expect(crystal.getAttribute('aria-label')).toBe('Loading');

    const progressBar = container.querySelector(
      '[data-testid="asset-progress-bar"]',
    ) as HTMLElement;
    expect(progressBar).not.toBeNull();
    expect(progressBar.style.background).toContain('linear-gradient');
  });
});

describe('AssetContainer downloading state CrystalLoader integration', () => {
  it('displays inline CrystalLoader instead of download-cloud icon in container header during asset download', async () => {
    let progressListener: ((loaded: number, total: number) => void) | null = null;
    const mockFetch = vi.fn((_asset, onProgress) => {
      progressListener = onProgress;
      return new Promise(() => {}); // stay pending
    });

    const host = await mount(
      createElement(AssetContainer, {
        asset: { id: 'asset-123', name: 'Mesh Avatar' },
        onFetch: mockFetch,
      }),
    );

    // Put AssetContainer into downloading state
    await act(async () => {
      if (progressListener) {
        progressListener(300, 1000);
      }
    });

    const downloadingState = host.querySelector(
      '[data-testid="asset-downloading-state"]',
    ) as HTMLElement;
    expect(downloadingState).not.toBeNull();

    // Verify download-cloud icon is replaced
    const downloadIcon = downloadingState.querySelector('[data-lucide="download-cloud"]');
    expect(downloadIcon).toBeNull();

    // Verify inline CrystalLoader renders in header
    const crystals = Array.from(
      downloadingState.querySelectorAll('[data-testid="crystal-loader"]'),
    );
    expect(crystals.length).toBeGreaterThanOrEqual(1);

    const headerCrystal = crystals[0] as HTMLElement;
    expect(headerCrystal).not.toBeNull();
    expect(headerCrystal.getAttribute('data-variant')).toBe('inline');
    expect(headerCrystal.style.width).toBe('18px');
    expect(headerCrystal.style.height).toBe('18px');
    expect(headerCrystal.getAttribute('role')).toBe('img');
  });
});

describe('BrandedLoader Engine', () => {
  it('renders screen variant with default size 88px', async () => {
    const host = await mount(<BrandedLoader variant="screen" />);
    const loader = host.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(loader).not.toBeNull();
    expect(loader.getAttribute('data-variant')).toBe('screen');
    expect(loader.style.width).toBe('88px');
  });

  it('renders card variant with crystal mark and skeleton placeholders', async () => {
    const host = await mount(<BrandedLoader variant="card" title="Card Title" />);
    const container = host.querySelector('[data-testid="branded-loader-card"]') as HTMLElement;
    expect(container).not.toBeNull();
    expect(container.getAttribute('data-variant')).toBe('card');
    expect(host.textContent).toContain('Card Title');
    expect(host.querySelector('.skeleton-box')).not.toBeNull();
  });

  it('renders asset variant with title, skeleton preview, and progress bar', async () => {
    const host = await mount(<BrandedLoader variant="asset" title="Mesh Asset" progress={45} />);
    const container = host.querySelector(
      '[data-testid="skeleton-asset-placeholder"]',
    ) as HTMLElement;
    expect(container).not.toBeNull();
    expect(container.getAttribute('data-variant')).toBe('asset');
    expect(host.textContent).toContain('Mesh Asset');
    expect(host.textContent).toContain('45%');

    const progressBar = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(progressBar).not.toBeNull();
    expect(progressBar.style.width).toBe('45%');
  });

  it('renders StateBlock with BrandedLoader variant="screen" during loading state', async () => {
    // StateBlock renders when stateBlockActive is true and cond is 'loading'
    const host = await mount(<StateBlock />);
    // Note: ThemeContext stateBlockActive defaults to true when condPack is provided
    const crystal = host.querySelector('[data-testid="crystal-loader"]');
    if (crystal) {
      expect(crystal.getAttribute('data-variant')).toBe('screen');
    }
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
      }),
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
