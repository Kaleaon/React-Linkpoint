import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import FloatersDesktop from '../FloatersDesktop.jsx';
import ChipRow from '../ChipRow.jsx';
import Header from '../Header.jsx';
import BottomTabs from '../BottomTabs.jsx';
import MobileOverlayControls from '../MobileOverlayControls';
import TouchTarget from '../TouchTarget';
import { app } from '../../linkpoint/app';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(AppProvider, null, createElement(ThemeProvider, null, ui))
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

describe('Minimum Touch Target Dimensions', () => {
  it('renders Camera HUD Close Button in FloatersDesktop with minimum 24x24 dimensions', async () => {
    const host = await mount(createElement(FloatersDesktop));
    const closeBtn = host.querySelector('button[aria-label="Close Camera Controls"]') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.style.minWidth).toBe('24px');
    expect(closeBtn.style.minHeight).toBe('24px');
    expect(closeBtn.style.display).toBe('inline-flex');
    expect(closeBtn.style.alignItems).toBe('center');
    expect(closeBtn.style.justifyContent).toBe('center');
  });

  it('renders ChipRow conversation close button with minimum 24x24 dimensions', async () => {
    const origGetIMThreads = app.chat.getIMThreads;
    app.chat.getIMThreads = () => [{ contactName: 'Jules', unreadCount: 0 } as any];

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    function TestWrapper() {
      const { actions } = useApp();
      useEffect(() => {
        actions.setScreen('Chat');
        actions.setTab('Chat', 'IM');
        actions.setChip('Jules');
      }, []);
      return createElement(ChipRow);
    }

    try {
      await act(async () => {
        root.render(
          createElement(AppProvider, null, createElement(ThemeProvider, null, createElement(TestWrapper)))
        );
      });
      const closeBtn = host.querySelector('button[title="Close conversation with Jules"]') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();
      expect(closeBtn.style.minWidth).toBe('24px');
      expect(closeBtn.style.minHeight).toBe('24px');
      expect(closeBtn.style.display).toBe('inline-flex');
      expect(closeBtn.style.alignItems).toBe('center');
      expect(closeBtn.style.justifyContent).toBe('center');
    } finally {
      app.chat.getIMThreads = origGetIMThreads;
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it('renders Header action buttons with minimum 24x24 dimensions', async () => {
    const host = await mount(createElement(Header));
    const buttons = host.querySelectorAll('[role="button"]');
    buttons.forEach((btn) => {
      const el = btn as HTMLElement;
      if (el.style.minWidth) {
        expect(parseInt(el.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
      }
      if (el.style.minHeight) {
        expect(parseInt(el.style.minHeight, 10)).toBeGreaterThanOrEqual(24);
      }
    });
  });

  it('renders BottomTabs tab triggers with minimum 24x24 dimensions and TouchTarget properties', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    function TestBottomTabsWrapper() {
      const { actions } = useApp();
      useEffect(() => {
        actions.setDevice('ios');
      }, []);
      return createElement(BottomTabs);
    }

    try {
      await act(async () => {
        root.render(
          createElement(AppProvider, null, createElement(ThemeProvider, null, createElement(TestBottomTabsWrapper)))
        );
      });

      const tabs = host.querySelectorAll('[role="tab"]');
      expect(tabs.length).toBeGreaterThan(0);
      tabs.forEach((tab) => {
        const el = tab as HTMLElement;
        expect(el.classList.contains('touch-target')).toBe(true);
        expect(parseInt(el.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(24);
        expect(parseInt(el.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(24);
        expect(el.style.alignItems).toBe('center');
        expect(el.style.justifyContent).toBe('center');
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it('renders MobileOverlayControls triggers with TouchTarget minimum 24x24 dimensions', async () => {
    const host = await mount(createElement(MobileOverlayControls, { cameraPreset: 'rear' }));
    const buttons = host.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.classList.contains('touch-target')).toBe(true);
      expect(parseInt(btn.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(24);
      expect(parseInt(btn.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(24);
      expect(btn.style.alignItems).toBe('center');
      expect(btn.style.justifyContent).toBe('center');
    });
  });

  it('TouchTarget applies default minWidth 24px and centering styles when wrapping 16px-20px icons', async () => {
    const icon = createElement('svg', { width: 16, height: 16, 'data-testid': 'icon' });
    const host = await mount(createElement(TouchTarget, null, icon));
    const btn = host.querySelector('button') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.style.minWidth).toBe('24px');
    expect(btn.style.minHeight).toBe('24px');
    expect(btn.style.display).toBe('inline-flex');
    expect(btn.style.alignItems).toBe('center');
    expect(btn.style.justifyContent).toBe('center');
  });
});
