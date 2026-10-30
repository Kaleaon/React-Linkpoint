import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SecondaryViewLoader from '../SecondaryViewLoader';
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
  vi.restoreAllMocks();
});

describe('<SecondaryViewLoader /> Wrapper Component', () => {
  it('renders default block layout with ARIA live region attributes', async () => {
    const host = await mount(createElement(SecondaryViewLoader));
    const loaderWrapper = host.querySelector(
      '[data-testid="secondary-view-loader"]',
    ) as HTMLElement;

    expect(loaderWrapper).not.toBeNull();
    expect(loaderWrapper.getAttribute('role')).toBe('status');
    expect(loaderWrapper.getAttribute('aria-live')).toBe('polite');
    expect(loaderWrapper.getAttribute('aria-busy')).toBe('true');
    expect(loaderWrapper.getAttribute('data-layout')).toBe('block');
    expect(loaderWrapper.style.display).toBe('flex');
    expect(loaderWrapper.style.flexDirection).toBe('column');

    const crystal = loaderWrapper.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(crystal).not.toBeNull();
    expect(crystal.getAttribute('data-variant')).toBe('block');
  });

  it('renders inline layout when layout="inline"', async () => {
    const host = await mount(
      createElement(SecondaryViewLoader, { layout: 'inline', label: 'Loading details…' }),
    );
    const loaderWrapper = host.querySelector(
      '[data-testid="secondary-view-loader"]',
    ) as HTMLElement;

    expect(loaderWrapper).not.toBeNull();
    expect(loaderWrapper.getAttribute('data-layout')).toBe('inline');
    expect(loaderWrapper.style.display).toBe('inline-flex');

    const crystal = loaderWrapper.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(crystal).not.toBeNull();
    expect(crystal.getAttribute('data-variant')).toBe('inline');

    const labelEl = loaderWrapper.querySelector('.secondary-view-loader-label');
    expect(labelEl).not.toBeNull();
    expect(labelEl?.textContent).toBe('Loading details…');
  });

  it('renders label and action elements when provided', async () => {
    const retryBtn = createElement('button', { type: 'button' }, 'Retry');
    const host = await mount(
      createElement(SecondaryViewLoader, {
        label: 'Fetching notice detail…',
        action: retryBtn,
      }),
    );

    const labelEl = host.querySelector('.secondary-view-loader-label');
    expect(labelEl).not.toBeNull();
    expect(labelEl?.textContent).toBe('Fetching notice detail…');

    const actionEl = host.querySelector('.secondary-view-loader-action');
    expect(actionEl).not.toBeNull();
    expect(actionEl?.querySelector('button')?.textContent).toBe('Retry');
  });

  it('passes custom size to CrystalLoader', async () => {
    const host = await mount(createElement(SecondaryViewLoader, { size: 32, layout: 'block' }));
    const crystal = host.querySelector('[data-testid="crystal-loader"]') as HTMLElement;

    expect(crystal).not.toBeNull();
    expect(crystal.style.width).toBe('32px');
    expect(crystal.style.height).toBe('32px');
  });

  it('supports custom ariaLive, ariaBusy, className, and style props', async () => {
    const host = await mount(
      createElement(SecondaryViewLoader, {
        ariaLive: 'assertive',
        ariaBusy: false,
        className: 'custom-class',
        style: { marginTop: '20px' },
      }),
    );
    const loaderWrapper = host.querySelector(
      '[data-testid="secondary-view-loader"]',
    ) as HTMLElement;

    expect(loaderWrapper).not.toBeNull();
    expect(loaderWrapper.getAttribute('aria-live')).toBe('assertive');
    expect(loaderWrapper.getAttribute('aria-busy')).toBe('false');
    expect(loaderWrapper.classList.contains('custom-class')).toBe(true);
    expect(loaderWrapper.style.marginTop).toBe('20px');
  });
});
