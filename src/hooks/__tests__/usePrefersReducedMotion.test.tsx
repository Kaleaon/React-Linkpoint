import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePrefersReducedMotion } from '../usePrefersReducedMotion.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

function TestComponent() {
  const reducedMotion = usePrefersReducedMotion();
  return <div data-testid="motion">{String(reducedMotion)}</div>;
}

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

describe('usePrefersReducedMotion hook', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('defaults to false when prefers-reduced-motion does not match', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const host = await mount(<TestComponent />);
    const el = host.querySelector('[data-testid="motion"]');
    expect(el?.textContent).toBe('false');
  });

  it('returns true when prefers-reduced-motion matches', async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const host = await mount(<TestComponent />);
    const el = host.querySelector('[data-testid="motion"]');
    expect(el?.textContent).toBe('true');
  });

  it('updates state when prefers-reduced-motion preference changes dynamically', async () => {
    let changeHandler: ((e: any) => void) | null = null;

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'change') changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const host = await mount(<TestComponent />);
    const el = host.querySelector('[data-testid="motion"]');
    expect(el?.textContent).toBe('false');

    await act(async () => {
      if (changeHandler) {
        changeHandler({ matches: true });
      }
    });

    expect(el?.textContent).toBe('true');
  });

  it('gracefully handles missing matchMedia in non-browser environment', async () => {
    // @ts-expect-error simulating non-browser env
    delete window.matchMedia;

    const host = await mount(<TestComponent />);
    const el = host.querySelector('[data-testid="motion"]');
    expect(el?.textContent).toBe('false');
  });
});
