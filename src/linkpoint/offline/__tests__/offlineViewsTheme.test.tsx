import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../../context/AppContext.jsx';
import { ThemeProvider } from '../../../context/ThemeContext.jsx';
import { OfflineManagerView } from '../OfflineManagerView';
import { GridConsolePanel } from '../GridConsolePanel';
import { LocalGridManager } from '../LocalGridManager';
import { LocalAssetManager } from '../LocalAssetManager';
import { CacheManager } from '../CacheManager';
import { GridConsole } from '../GridConsole';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mountComponent(ui: React.ReactNode) {
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
    await act(async () => mounted!.root.unmount());
    mounted.host.remove();
    mounted = null;
  }
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Offline views theme token binding', () => {
  let gridConsole: GridConsole;
  let gridManager: LocalGridManager;
  let assetManager: LocalAssetManager;
  let cacheManager: CacheManager;

  beforeEach(() => {
    localStorage.clear();
    gridConsole = new GridConsole();
    gridManager = new LocalGridManager(gridConsole);
    assetManager = new LocalAssetManager(gridConsole);
    cacheManager = new CacheManager(gridConsole);
  });

  it('renders OfflineManagerView and applies dynamic theme tokens to panels and buttons', async () => {
    const host = await mountComponent(
      createElement(OfflineManagerView, {
        gridManager,
        assetManager,
        cacheManager,
        console: gridConsole,
      }),
    );

    expect(host.textContent).toContain('Offline OpenSim Grid Control Center');
    expect(host.textContent).toContain('Local Grid Status:');
    expect(host.textContent).toContain('First Time Offline Account Setup');

    // Check status text color & button styles
    const statusText = host.querySelector('h3 span');
    expect(statusText).not.toBeNull();
    expect(statusText?.getAttribute('style')).not.toContain('green');
    expect(statusText?.getAttribute('style')).not.toContain('red');

    // Check action buttons
    const buttons = host.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      const style = btn.getAttribute('style') || '';
      // Ensure no static hex colors like #5cb85c or #d9534f or #0275d8 remain
      expect(style).not.toContain('#5cb85c');
      expect(style).not.toContain('#d9534f');
      expect(style).not.toContain('#0275d8');
      expect(style).not.toContain('#6c757d');
      expect(style).not.toContain('#f0ad4e');
    });
  });

  it('renders GridConsolePanel and binds level colors to dynamic ThemeContext tokens', async () => {
    gridConsole.info('GRID', 'Grid starting test');
    gridConsole.warn('CACHE', 'Cache space low');
    gridConsole.error('ASSET', 'Failed to load asset');

    const host = await mountComponent(
      createElement(GridConsolePanel, {
        console: gridConsole,
      }),
    );

    expect(host.textContent).toContain('Grid Console & Error Log');
    expect(host.textContent).toContain('Grid starting test');
    expect(host.textContent).toContain('Cache space low');
    expect(host.textContent).toContain('Failed to load asset');

    // Verify console container background is styled with theme tokens rather than hardcoded #1e1e1e
    const consoleBox = host.querySelector('[role="log"]');
    expect(consoleBox).not.toBeNull();
    const style = consoleBox?.getAttribute('style') || '';
    expect(style).not.toContain('#1e1e1e');
    expect(style).not.toContain('#d4d4d4');
  });
});
