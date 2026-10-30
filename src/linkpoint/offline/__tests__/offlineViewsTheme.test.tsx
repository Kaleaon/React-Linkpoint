import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../../context/AppContext.jsx';
import { ThemeProvider } from '../../../context/ThemeContext.jsx';
import { GridConsolePanel } from '../GridConsolePanel';
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

  beforeEach(() => {
    localStorage.clear();
    gridConsole = new GridConsole();
  });

  it('renders GridConsolePanel and binds level colors to dynamic ThemeContext tokens', async () => {
    gridConsole.debug('STORAGE', 'Initializing local storage');
    gridConsole.info('GRID', 'Grid starting test');
    gridConsole.warn('CACHE', 'Cache space low');
    gridConsole.error('ASSET', 'Failed to load asset');
    gridConsole.fatal('SIM', 'Region simulator crashed');

    const host = await mountComponent(
      createElement(GridConsolePanel, {
        console: gridConsole,
      }),
    );

    expect(host.textContent).toContain('Grid Console & Error Log');
    expect(host.textContent).toContain('Initializing local storage');
    expect(host.textContent).toContain('Grid starting test');
    expect(host.textContent).toContain('Cache space low');
    expect(host.textContent).toContain('Failed to load asset');
    expect(host.textContent).toContain('Region simulator crashed');

    // Verify console container background is styled with theme tokens rather than hardcoded #1e1e1e
    const consoleBox = host.querySelector('[role="log"]');
    expect(consoleBox).not.toBeNull();
    const style = consoleBox?.getAttribute('style') || '';
    expect(style).not.toContain('#1e1e1e');
    expect(style).not.toContain('#d4d4d4');

    // Ensure buttons are styled without hardcoded colors
    const buttons = host.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      const btnStyle = btn.getAttribute('style') || '';
      expect(btnStyle).not.toContain('#5cb85c');
      expect(btnStyle).not.toContain('#d9534f');
      expect(btnStyle).not.toContain('#0275d8');
    });
  });
});
