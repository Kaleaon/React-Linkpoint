import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, useEffect, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ConsoleFrame from '../ConsoleFrame.jsx';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

function ConsoleFrameWithScene() {
  const { state, actions } = useApp();
  useEffect(() => {
    actions.setViewMode('mobile');
    actions.setLayout('sweep');
    actions.setScreen('3D View');
  }, []);
  return <ConsoleFrame />;
}

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

describe('ConsoleFrame Continuous Motion Suppression', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    vi.useFakeTimers();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it('runs wiggle animation on dock buttons during edit mode when prefers-reduced-motion is false', async () => {
    const host = await mount(<ConsoleFrameWithScene />);

    // Find a dock button by aria-label
    const dockButton = host.querySelector('[aria-label="fly"]') as HTMLElement;
    expect(dockButton).not.toBeNull();

    // Trigger holdStart to enter edit mode (480ms timer in useAppState)
    await act(async () => {
      dockButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      vi.advanceTimersByTime(600);
    });

    // Verify dock button animation contains 'wig'
    expect(dockButton.style.animation).toContain('wig');
  });

  it('suppresses wiggle animation on dock buttons during edit mode when prefers-reduced-motion is true', async () => {
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

    const host = await mount(<ConsoleFrameWithScene />);

    // Find a dock button by aria-label
    const dockButton = host.querySelector('[aria-label="fly"]') as HTMLElement;
    expect(dockButton).not.toBeNull();

    // Trigger holdStart to enter edit mode
    await act(async () => {
      dockButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      vi.advanceTimersByTime(600);
    });

    // Verify dock button animation is 'none'
    expect(dockButton.style.animation).toBe('none');
  });
});
