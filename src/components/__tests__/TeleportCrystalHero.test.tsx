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
    const top0 = host0.querySelector('.tpch-top') as HTMLElement;
    const bot0 = host0.querySelector('.tpch-bot') as HTMLElement;

    expect(top0?.style.transform).toBe('translateY(-10.00px)');
    expect(bot0?.style.transform).toBe('translateY(10.00px)');

    // Unmount
    await act(async () => {
      mounted!.root.unmount();
      mounted = null;
    });

    const host50 = await mount(<TeleportCrystalHero stepPercent={50} phase="preparing" />);
    const top50 = host50.querySelector('.tpch-top') as HTMLElement;
    const bot50 = host50.querySelector('.tpch-bot') as HTMLElement;

    expect(top50?.style.transform).toBe('translateY(-5.00px)');
    expect(bot50?.style.transform).toBe('translateY(5.00px)');

    // Unmount
    await act(async () => {
      mounted!.root.unmount();
      mounted = null;
    });

    const host100 = await mount(<TeleportCrystalHero stepPercent={100} phase="arriving" />);
    const top100 = host100.querySelector('.tpch-top') as HTMLElement;
    const bot100 = host100.querySelector('.tpch-bot') as HTMLElement;

    expect(top100?.style.transform).toBe('translateY(0.00px)');
    expect(bot100?.style.transform).toBe('translateY(0.00px)');
  });

  it('handles failure phase state correctly and renders error glow colors', async () => {
    const host = await mount(<TeleportCrystalHero stepPercent={40} phase="failed" />);
    const hero = host.querySelector('[data-testid="teleport-crystal-hero"]');

    expect(hero?.getAttribute('data-phase')).toBe('failed');

    const coreGradient = host.querySelector('#tpch-core-glow');
    expect(coreGradient).not.toBeNull();

    const stops = coreGradient?.querySelectorAll('stop');
    expect(stops?.[1].getAttribute('stop-color')).toContain('var(--err');
  });

  it('includes prefers-reduced-motion media query styles', async () => {
    const host = await mount(<TeleportCrystalHero stepPercent={25} phase="contacting" />);
    const styleEl = host.querySelector('style');

    expect(styleEl?.textContent).toContain('prefers-reduced-motion');
    expect(styleEl?.textContent).toContain('translateY(0px)');
  });
});
