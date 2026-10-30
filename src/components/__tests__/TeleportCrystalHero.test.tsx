import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import TeleportCrystalHero from '../TeleportCrystalHero.jsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(AppProvider as any, null, createElement(ThemeProvider as any, null, ui)),
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

describe('<TeleportCrystalHero /> Component', () => {
  it('renders with role="img" and aria-label="Teleport transition progress"', async () => {
    const host = await mount(<TeleportCrystalHero stepPercent={0} phase="initiating" />);
    const hero = host.querySelector('[role="img"]');

    expect(hero).not.toBeNull();
    expect(hero?.getAttribute('aria-label')).toBe('Teleport transition progress');
  });

  it('calculates vertical gap translateY correctly for 0%, 50%, and 100% progress', async () => {
    const host0 = await mount(<TeleportCrystalHero stepPercent={0} phase="initiating" />);
    const hero0 = host0.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
    const top0 = host0.querySelector('.tpch-top') as HTMLElement;
    const bot0 = host0.querySelector('.tpch-bot') as HTMLElement;

    expect(hero0?.style.getPropertyValue('--tpch-progress')).toBe('0');
    expect(top0?.style.transform).toBe('translateY(var(--tpch-top-y))');
    expect(bot0?.style.transform).toBe('translateY(var(--tpch-bot-y))');

    // Unmount
    await act(async () => {
      mounted!.root.unmount();
      mounted = null;
    });

    const host50 = await mount(<TeleportCrystalHero stepPercent={50} phase="preparing" />);
    const hero50 = host50.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
    const top50 = host50.querySelector('.tpch-top') as HTMLElement;
    const bot50 = host50.querySelector('.tpch-bot') as HTMLElement;

    expect(hero50?.style.getPropertyValue('--tpch-progress')).toBe('50');
    expect(top50?.style.transform).toBe('translateY(var(--tpch-top-y))');
    expect(bot50?.style.transform).toBe('translateY(var(--tpch-bot-y))');

    // Unmount
    await act(async () => {
      mounted!.root.unmount();
      mounted = null;
    });

    const host100 = await mount(<TeleportCrystalHero stepPercent={100} phase="arriving" />);
    const hero100 = host100.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
    const top100 = host100.querySelector('.tpch-top') as HTMLElement;
    const bot100 = host100.querySelector('.tpch-bot') as HTMLElement;

    expect(hero100?.style.getPropertyValue('--tpch-progress')).toBe('100');
    expect(top100?.style.transform).toBe('translateY(var(--tpch-top-y))');
    expect(bot100?.style.transform).toBe('translateY(var(--tpch-bot-y))');
  });

  it('handles failure phase state correctly and renders error glow colors', async () => {
    const host = await mount(<TeleportCrystalHero stepPercent={40} phase="failed" />);
    const hero = host.querySelector('[data-testid="teleport-crystal-hero"]');

    expect(hero?.getAttribute('data-phase')).toBe('failed');

    const coreGradient = host.querySelector('[id$="-core-glow"]');
    expect(coreGradient).not.toBeNull();

    const stops = coreGradient?.querySelectorAll('stop');
    expect(stops?.[1].getAttribute('stop-color')).toContain('var(--err');
  });

  it('renders SVG gradient elements with valid colon-free dynamic IDs', async () => {
    const host = await mount(<TeleportCrystalHero stepPercent={50} phase="preparing" />);
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
      expect(fill).toMatch(/^url\(#tpch-[^:]+-grad-(a|b)\)$/);
    });

    const coreCircle = host.querySelector('circle.tpch-core');
    expect(coreCircle?.getAttribute('fill')).toMatch(/^url\(#tpch-[^:]+-core-glow\)$/);
  });

  it('generates unique SVG IDs when rendered concurrently in multi-pane views', async () => {
    const host = await mount(
      <div>
        <TeleportCrystalHero stepPercent={0} />
        <TeleportCrystalHero stepPercent={50} />
        <TeleportCrystalHero stepPercent={100} />
      </div>,
    );

    const heroContainers = Array.from(
      host.querySelectorAll('[data-testid="teleport-crystal-hero"]'),
    );
    expect(heroContainers).toHaveLength(3);

    const allGradients = Array.from(host.querySelectorAll('linearGradient, radialGradient'));
    const allIds = allGradients.map((el) => el.getAttribute('id'));

    expect(allIds).toHaveLength(9);
    expect(new Set(allIds).size).toBe(9);

    heroContainers.forEach((container) => {
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
    const host = await mount(<TeleportCrystalHero idPrefix="custom-hero:1" stepPercent={30} />);

    const gradA = host.querySelector('linearGradient#custom-hero1-grad-a');
    const gradB = host.querySelector('linearGradient#custom-hero1-grad-b');
    const coreGlow = host.querySelector('radialGradient#custom-hero1-core-glow');

    expect(gradA).not.toBeNull();
    expect(gradB).not.toBeNull();
    expect(coreGlow).not.toBeNull();

    const coreCircle = host.querySelector('circle.tpch-core');
    expect(coreCircle?.getAttribute('fill')).toBe('url(#custom-hero1-core-glow)');
  });

  it('includes prefers-reduced-motion media query styles', async () => {
    const host = await mount(<TeleportCrystalHero stepPercent={25} phase="contacting" />);
    const styleEl = host.querySelector('style');

    expect(styleEl?.textContent).toContain('prefers-reduced-motion');
    expect(styleEl?.textContent).toContain('translateY(0px)');
  });

  it('binds dynamic CSS custom properties for scale and glow opacity across progress phases', async () => {
    const host0 = await mount(<TeleportCrystalHero stepPercent={0} phase="initiating" />);
    const hero0 = host0.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
    expect(hero0?.style.getPropertyValue('--crystal-scale')).toBe('1');
    expect(hero0?.style.getPropertyValue('--crystal-glow-opacity')).toBe('0.4');

    await act(async () => {
      mounted!.root.unmount();
      mounted = null;
    });

    const host50 = await mount(<TeleportCrystalHero stepPercent={50} phase="preparing" />);
    const hero50 = host50.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
    expect(hero50?.style.getPropertyValue('--crystal-scale')).toBe('1.025');
    expect(hero50?.style.getPropertyValue('--crystal-glow-opacity')).toBe('0.675');

    await act(async () => {
      mounted!.root.unmount();
      mounted = null;
    });

    const host100 = await mount(<TeleportCrystalHero stepPercent={100} phase="arriving" />);
    const hero100 = host100.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
    expect(hero100?.style.getPropertyValue('--crystal-scale')).toBe('1.05');
    expect(hero100?.style.getPropertyValue('--crystal-glow-opacity')).toBe('0.95');

    await act(async () => {
      mounted!.root.unmount();
      mounted = null;
    });

    const hostFailed = await mount(<TeleportCrystalHero stepPercent={40} phase="failed" />);
    const heroFailed = hostFailed.querySelector(
      '[data-testid="teleport-crystal-hero"]',
    ) as HTMLElement;
    expect(heroFailed?.style.getPropertyValue('--crystal-scale')).toBe('1');
    expect(heroFailed?.style.getPropertyValue('--crystal-glow-opacity')).toBe('0.95');
  });

  it('is wrapped with React.memo to prevent unnecessary rerenders', () => {
    expect((TeleportCrystalHero as any).$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('attaches imperative handle via React.forwardRef and updates DOM on updateProgress call', async () => {
    const heroRef = { current: null as any };
    const host = await mount(
      <TeleportCrystalHero ref={heroRef} stepPercent={10} phase="initiating" />,
    );

    expect(heroRef.current).not.toBeNull();
    expect(typeof heroRef.current.updateProgress).toBe('function');

    await act(async () => {
      heroRef.current.updateProgress(75);
      await new Promise((r) => requestAnimationFrame(r));
    });

    const container = host.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
    expect(container.getAttribute('data-step-percent')).toBe('75');
    expect(container.style.getPropertyValue('--crystal-scale')).toBe('1.0375');
    expect(container.style.getPropertyValue('--crystal-glow-opacity')).toBe('0.8125');
  });
});
