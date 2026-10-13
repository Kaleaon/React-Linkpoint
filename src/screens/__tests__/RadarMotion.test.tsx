import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Radar from '../Radar.jsx';
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

describe('Radar Continuous Motion Suppression', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('runs ping animation on central blip when prefers-reduced-motion is false', async () => {
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

    const host = await mount(<Radar />);
    const centerIndicator = host.querySelector('[title="You (Center)"]');
    expect(centerIndicator).not.toBeNull();

    const pingBlip = centerIndicator?.previousElementSibling as HTMLElement;
    expect(pingBlip).not.toBeNull();
    expect(pingBlip.style.animation).toContain('ping');
  });

  it('suppresses ping animation on central blip when prefers-reduced-motion is true', async () => {
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

    const host = await mount(<Radar />);
    const centerIndicator = host.querySelector('[title="You (Center)"]');
    expect(centerIndicator).not.toBeNull();

    const pingBlip = centerIndicator?.previousElementSibling as HTMLElement;
    expect(pingBlip).not.toBeNull();
    expect(pingBlip.style.animation).toBe('none');
  });
});
