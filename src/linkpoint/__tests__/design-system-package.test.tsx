import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  LAYOUTS,
  PALETTES,
  computeThemeTokens,
  ensureMinContrast,
  themeNames,
} from '@linkpoint/design-system/tokens';
import {
  Card as DesignCard,
  BottomTabs as DesignBottomTabs,
  RailNav as DesignRailNav,
  LayoutProvider,
} from '@linkpoint/design-system/react';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import BottomTabs from '../../components/BottomTabs.jsx';
import Card from '../../components/Card.jsx';

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

describe('@linkpoint/design-system package integration', () => {
  describe('Tokens & Registry Exports', () => {
    it('exports complete LAYOUTS and PALETTES registries', () => {
      expect(Object.keys(LAYOUTS)).toEqual(
        expect.arrayContaining(['terminal', 'sweep', 'tiles', 'glass', 'rules', 'press']),
      );
      expect(Object.keys(PALETTES)).toEqual(
        expect.arrayContaining(['ink', 'lcars', 'metro', 'aero', 'navy', 'paper', 'deco']),
      );
      expect(themeNames.length).toBeGreaterThanOrEqual(20);
    });

    it('computes theme tokens with contrast enforcement', () => {
      const tokens = computeThemeTokens('terminal', 'ink');
      expect(tokens.bg).toBe('#0A1112');
      expect(tokens.pri).toBe('#6CFF9A');
      expect(tokens.font).toBeDefined();

      const adjustedColor = ensureMinContrast('#111111', '#000000', 4.5);
      expect(adjustedColor).toBeDefined();
    });
  });

  describe('React Layout Primitives Direct Rendering', () => {
    it('renders DesignCard with child elements inside LayoutProvider', async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);

      const card = createElement(DesignCard, { c: { title: 'Package Test Card', badge: 'NEW' } });
      await act(async () => {
        root.render(
          createElement(LayoutProvider, {
            initialLayout: 'terminal',
            initialPalette: 'ink',
            children: card,
          }),
        );
      });

      expect(host.textContent).toContain('Package Test Card');
      expect(host.textContent).toContain('NEW');

      await act(async () => {
        root.unmount();
      });
      host.remove();
    });

    it('renders DesignBottomTabs with items', async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);

      const tabs = createElement(DesignBottomTabs, {
        items: [
          { id: 'World', label: 'World' },
          { id: 'Chat', label: 'Chat', badge: 3 },
        ],
        activeId: 'World',
      });
      await act(async () => {
        root.render(
          createElement(LayoutProvider, {
            initialLayout: 'terminal',
            initialPalette: 'ink',
            children: tabs,
          }),
        );
      });

      expect(host.textContent).toContain('World');
      expect(host.textContent).toContain('Chat');
      expect(host.textContent).toContain('3');

      await act(async () => {
        root.unmount();
      });
      host.remove();
    });

    it('renders DesignRailNav with items', async () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const root = createRoot(host);

      const rail = createElement(DesignRailNav, {
        items: [{ id: 'World', label: 'World' }],
        activeId: 'World',
      });
      await act(async () => {
        root.render(
          createElement(LayoutProvider, {
            initialLayout: 'rules',
            initialPalette: 'ink',
            initialDevice: 'tab',
            children: rail,
          }),
        );
      });

      expect(host.textContent).toContain('World');

      await act(async () => {
        root.unmount();
      });
      host.remove();
    });
  });

  describe('Application Component Integration with Design System Primitives', () => {
    it('renders Card component with theme tokens', async () => {
      const host = await mount(createElement(Card, { c: { title: 'App Card', body: 'App Body' } }));
      expect(host.textContent).toContain('App Card');
      expect(host.textContent).toContain('App Body');
    });

    it('renders BottomTabs navigation when device is mobile/ios', async () => {
      function TestWrapper() {
        const { actions } = useApp();
        useEffect(() => {
          actions.setDevice('ios');
        }, []);
        return createElement(BottomTabs);
      }
      const host = await mount(createElement(TestWrapper));
      const navEl = host.querySelector('nav[aria-label="Bottom Navigation"]');
      expect(navEl).not.toBeNull();
    });
  });
});
