import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CrystalLoader from '../CrystalLoader.jsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(ui);
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

describe('<CrystalLoader /> Component', () => {
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
