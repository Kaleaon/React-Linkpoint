import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import StateBlock from '../StateBlock.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import * as ThemeContextModule from '../../context/ThemeContext.jsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, ui));
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

describe('StateBlock Crystal Gradient Progress Bar', () => {
  it('renders track, fill with standard crystal gradient, and diamond crystal cap when condPack.bar is present', async () => {
    vi.spyOn(ThemeContextModule, 'useTheme').mockReturnValue({
      V: {
        pri: '#6CFF9A',
        priC: '#123B27',
        sec2: '#8AD0B0',
        outv: '#365047',
        surf2: 'rgba(255, 255, 255, 0.1)',
      },
      t: { font: 'sans-serif', dfont: 'sans-serif' },
      condPack: { bar: 0.65, title: 'LOADING DATA', body: 'Fetching...' },
      stateBlockActive: true,
    } as any);

    const host = await mount(
      <StateBlock status="loading" title="LOADING DATA" body="Fetching..." />,
    );

    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    const track = host.querySelector('[data-testid="crystal-progress-track"]') as HTMLElement;
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    const cap = host.querySelector('[data-testid="crystal-progress-cap"]') as HTMLElement;

    expect(container).not.toBeNull();
    expect(track).not.toBeNull();
    expect(fill).not.toBeNull();
    expect(cap).not.toBeNull();

    // Verify progressbar accessibility attributes
    expect(container.getAttribute('role')).toBe('progressbar');
    expect(container.getAttribute('aria-valuenow')).toBe('65');
    expect(container.getAttribute('aria-valuemin')).toBe('0');
    expect(container.getAttribute('aria-valuemax')).toBe('100');
    expect(container.getAttribute('aria-label')).toBe('LOADING DATA');

    // Verify track styling and 216px container width
    expect(container.style.width).toBe('216px');
    expect(track.style.height).toBe('4px');
    expect(track.style.borderRadius).toBe('2px');
    expect(track.style.border).toContain('1px solid');
    expect(track.style.border).toContain('54, 80, 71');
    expect(track.style.background).toBe('rgba(255, 255, 255, 0.1)');

    // Verify fill width calculation (Math.round(0.65 * 100) + '%') => '65%'
    expect(fill.style.width).toBe('65%');
    expect(fill.style.background).toContain('linear-gradient(90deg');
    expect(fill.style.background).toContain('rgb(18, 59, 39)');
    expect(fill.style.background).toContain('rgb(138, 208, 176)');
    expect(fill.style.background).toContain('rgb(108, 255, 154)');
  });

  it('correctly calculates rounded percentage for progress width', async () => {
    vi.spyOn(ThemeContextModule, 'useTheme').mockReturnValue({
      V: {
        pri: '#6CFF9A',
        priC: '#123B27',
        sec2: '#8AD0B0',
        outv: '#365047',
        surf2: 'rgba(255, 255, 255, 0.1)',
      },
      t: { font: 'sans-serif', dfont: 'sans-serif' },
      condPack: { bar: 0.887, title: 'SYNCHRONIZING', body: 'Syncing...' },
      stateBlockActive: true,
    } as any);

    const host = await mount(
      <StateBlock status="loading" title="SYNCHRONIZING" body="Syncing..." />,
    );
    const container = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;

    expect(fill).not.toBeNull();
    // Math.round(0.887 * 100) => 89%
    expect(fill.style.width).toBe('89%');
    expect(container.getAttribute('aria-valuenow')).toBe('89');
  });

  it('uses fallback variables when theme tokens are undefined', async () => {
    vi.spyOn(ThemeContextModule, 'useTheme').mockReturnValue({
      V: {},
      t: { font: 'sans-serif', dfont: 'sans-serif' },
      condPack: { bar: 0.5, title: 'LOADING', body: 'Please wait...' },
      stateBlockActive: true,
    } as any);

    const host = await mount(<StateBlock status="loading" title="LOADING" body="Please wait..." />);

    const track = host.querySelector('[data-testid="crystal-progress-track"]') as HTMLElement;
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    const cap = host.querySelector('[data-testid="crystal-progress-cap"]') as HTMLElement;

    expect(track).not.toBeNull();
    expect(fill).not.toBeNull();
    expect(cap).not.toBeNull();

    expect(track.style.border).toBe('1px solid var(--outv, #365047)');
    expect(track.style.background).toBe('var(--surf2, rgba(255, 255, 255, 0.1))');
    expect(fill.style.background).toBe(
      'linear-gradient(90deg, var(--priC, #123B27) 0%, var(--sec2, #8AD0B0) 40%, var(--pri, #6CFF9A) 100%)',
    );
  });

  it('reflects updated theme palette tokens', async () => {
    // Solarpunk theme tokens
    vi.spyOn(ThemeContextModule, 'useTheme').mockReturnValue({
      V: {
        pri: '#38B56A',
        priC: '#BFEFD0',
        sec2: '#F2C46C',
        outv: '#B3D0BF',
        surf2: '#E2F2E8',
      },
      t: { font: 'sans-serif', dfont: 'sans-serif' },
      condPack: { bar: 0.4, title: 'SOLARPUNK LOAD', body: 'Loading...' },
      stateBlockActive: true,
    } as any);

    const host = await mount(
      <StateBlock status="loading" title="SOLARPUNK LOAD" body="Loading..." />,
    );

    const track = host.querySelector('[data-testid="crystal-progress-track"]') as HTMLElement;
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;

    expect(track.style.border).toContain('1px solid');
    expect(track.style.border).toContain('179, 208, 191');
    expect(track.style.background).toBe('rgb(226, 242, 232)');
    expect(fill.style.background).toContain('linear-gradient(90deg');
    expect(fill.style.background).toContain('rgb(191, 239, 208)');
    expect(fill.style.background).toContain('rgb(242, 196, 108)');
    expect(fill.style.background).toContain('rgb(56, 181, 106)');
  });
});
