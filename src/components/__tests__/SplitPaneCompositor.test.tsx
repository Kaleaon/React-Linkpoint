import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SplitPaneCompositor, {
  createSinglePreset,
  createDualPreset,
  createInspectorStackPreset,
  createTerminalSplitPreset,
  createQuadPreset,
  getNodeDepth,
  splitLeafInTree,
  closeLeafInTree,
  updateLeafViewInTree,
  updateSplitRatioInTree,
} from '../SplitPaneCompositor';
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

describe('SplitPaneCompositor Engine & Workstation Splitter', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Tree Data Structure Logic', () => {
    it('creates single, dual, inspector stack, terminal split, and quad preset trees correctly', () => {
      const single = createSinglePreset();
      expect(single.type).toBe('leaf');
      if (single.type === 'leaf') {
        expect(single.view).toBe('Viewport');
      }

      const dual = createDualPreset();
      expect(dual.type).toBe('parent');
      if (dual.type === 'parent') {
        expect(dual.direction).toBe('horizontal');
        expect(dual.splitRatio).toBe(0.5);
        expect(dual.children.length).toBe(2);
      }

      const stack = createInspectorStackPreset();
      expect(stack.type).toBe('parent');
      if (stack.type === 'parent') {
        expect(stack.children[0].type).toBe('leaf');
        expect(stack.children[1].type).toBe('parent');
      }

      const terminal = createTerminalSplitPreset();
      expect(terminal.type).toBe('parent');
      if (terminal.type === 'parent') {
        expect(terminal.direction).toBe('vertical');
      }

      const quad = createQuadPreset();
      expect(quad.type).toBe('parent');
      if (quad.type === 'parent') {
        expect(quad.children[0].type).toBe('parent');
        expect(quad.children[1].type).toBe('parent');
      }
    });

    it('calculates node depth accurately and enforces max split depth limit of 3', () => {
      const single = createSinglePreset();
      expect(getNodeDepth(single)).toBe(1);

      const dual = createDualPreset();
      expect(getNodeDepth(dual)).toBe(2);

      const quad = createQuadPreset();
      expect(getNodeDepth(quad)).toBe(3);

      // Attempting to split a leaf at depth 3 should return the tree unchanged
      if (quad.type === 'parent' && quad.children[0].type === 'parent') {
        const leafAtDepth3 = quad.children[0].children[0];
        const triedSplit = splitLeafInTree(quad, leafAtDepth3.id, 'horizontal', 1);
        expect(triedSplit).toEqual(quad);
      }
    });

    it('splits a leaf node horizontally and vertically', () => {
      const single = createSinglePreset();
      const splitH = splitLeafInTree(single, single.id, 'horizontal');
      expect(splitH.type).toBe('parent');
      if (splitH.type === 'parent') {
        expect(splitH.direction).toBe('horizontal');
        expect(splitH.children[0].type).toBe('leaf');
        expect(splitH.children[1].type).toBe('leaf');
      }

      const splitV = splitLeafInTree(single, single.id, 'vertical');
      expect(splitV.type).toBe('parent');
      if (splitV.type === 'parent') {
        expect(splitV.direction).toBe('vertical');
      }
    });

    it('closes a leaf node and collapses parent to remaining sibling', () => {
      const dual = createDualPreset();
      if (dual.type === 'parent') {
        const leafToClose = dual.children[1];
        const remaining = closeLeafInTree(dual, leafToClose.id);
        expect(remaining).not.toBeNull();
        expect(remaining?.type).toBe('leaf');
        if (remaining && remaining.type === 'leaf') {
          expect(remaining.id).toBe(dual.children[0].id);
        }
      }
    });

    it('updates leaf tool view and split ratio', () => {
      const single = createSinglePreset();
      const updatedView = updateLeafViewInTree(single, single.id, 'Inspector');
      if (updatedView.type === 'leaf') {
        expect(updatedView.view).toBe('Inspector');
      }

      const dual = createDualPreset();
      const updatedRatio = updateSplitRatioInTree(dual, dual.id, 0.7);
      if (updatedRatio.type === 'parent') {
        expect(updatedRatio.splitRatio).toBe(0.7);
      }
    });
  });

  describe('Component Rendering & User Interactions', () => {
    it('renders workstation preset toolbar and default single view', async () => {
      const host = await mount(
        createElement(SplitPaneCompositor, {
          initialPreset: 'single',
          renderViewport: (paneId: string) =>
            createElement('div', { 'data-testid': `viewport-${paneId}` }, '3D Canvas Surface'),
        }),
      );

      const toolbar = host.querySelector('[role="toolbar"]');
      expect(toolbar).not.toBeNull();
      expect(host.textContent).toContain('Single Viewport');
      expect(host.textContent).toContain('3D Canvas Surface');
    });

    it('switches workstation presets on one click (Dual, Inspector Stack, Terminal Split, Quad)', async () => {
      const host = await mount(
        createElement(SplitPaneCompositor, {
          initialPreset: 'single',
          renderViewport: (paneId: string) =>
            createElement('div', { 'data-testid': `viewport-${paneId}` }, '3D Canvas'),
        }),
      );

      // Click Dual / Split preset button
      const dualBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Dual / Split'),
      );
      expect(dualBtn).not.toBeNull();

      await act(async () => {
        dualBtn?.click();
      });

      expect(host.textContent).toContain('OBJECT INSPECTOR');

      // Click Quad Viewport preset button
      const quadBtn = Array.from(host.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Quad Viewport'),
      );
      expect(quadBtn).not.toBeNull();

      await act(async () => {
        quadBtn?.click();
      });

      expect(host.textContent).toContain('OBJECT INSPECTOR');
      expect(host.textContent).toContain('NETWORK HEALTH DIAGNOSTICS');
    });

    it('allows splitting panels using SPLIT H and SPLIT V buttons', async () => {
      const host = await mount(
        createElement(SplitPaneCompositor, {
          initialPreset: 'single',
          renderViewport: (paneId: string) =>
            createElement('div', { 'data-testid': `viewport-${paneId}` }, '3D Canvas'),
        }),
      );

      const splitHBtn = host.querySelector(
        'button[aria-label="Split panel horizontally"]',
      ) as HTMLButtonElement;
      expect(splitHBtn).not.toBeNull();

      await act(async () => {
        splitHBtn.click();
      });

      expect(host.textContent).toContain('OBJECT INSPECTOR');
    });

    it('allows changing pane tool view via dropdown selector', async () => {
      const host = await mount(
        createElement(SplitPaneCompositor, {
          initialPreset: 'single',
          renderViewport: (paneId: string) =>
            createElement('div', { 'data-testid': `viewport-${paneId}` }, '3D Canvas'),
        }),
      );

      const viewSelect = host.querySelector(
        'select[aria-label^="Tile tool view selector"]',
      ) as HTMLSelectElement;
      expect(viewSelect).not.toBeNull();

      await act(async () => {
        viewSelect.value = 'Diagnostics';
        viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(host.textContent).toContain('NETWORK HEALTH DIAGNOSTICS');
    });

    it('serializes split pane state tree into localStorage and recovers on session resume', async () => {
      await mount(
        createElement(SplitPaneCompositor, {
          initialPreset: 'dual',
          renderViewport: (paneId: string) =>
            createElement('div', { 'data-testid': `viewport-${paneId}` }, '3D Canvas'),
        }),
      );

      const savedTree = localStorage.getItem('linkpoint_split_pane_tree');
      expect(savedTree).not.toBeNull();
      const parsed = JSON.parse(savedTree!);
      expect(parsed.type).toBe('parent');

      // Re-mount component without initialPreset, should recover saved tree
      const host2 = await mount(
        createElement(SplitPaneCompositor, {
          renderViewport: (paneId: string) =>
            createElement('div', { 'data-testid': `viewport-${paneId}` }, '3D Canvas'),
        }),
      );

      expect(host2.textContent).toContain('OBJECT INSPECTOR');
    });

    it('adjusts splitter ratio when keyboard arrow keys are pressed on separator handle', async () => {
      const host = await mount(
        createElement(SplitPaneCompositor, {
          initialPreset: 'dual',
          renderViewport: (paneId: string) =>
            createElement('div', { 'data-testid': `viewport-${paneId}` }, '3D Canvas'),
        }),
      );

      const separator = host.querySelector('[role="separator"]') as HTMLElement;
      expect(separator).not.toBeNull();

      await act(async () => {
        separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });

      const savedTree = localStorage.getItem('linkpoint_split_pane_tree');
      expect(savedTree).not.toBeNull();
      const parsed = JSON.parse(savedTree!);
      expect(parsed.splitRatio).toBe(0.45);
    });

    it('falls back to single-pane stacked/tabbed layout on non-desktop viewports (< 768px)', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      const host = await mount(
        createElement(SplitPaneCompositor, {
          initialPreset: 'quad',
          renderViewport: (paneId: string) =>
            createElement('div', { 'data-testid': `viewport-${paneId}` }, '3D Canvas'),
        }),
      );

      expect(host.textContent).toContain('MOBILE STACKED FALLBACK');

      const inspectorTab = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent === 'Inspector',
      );
      expect(inspectorTab).not.toBeNull();

      await act(async () => {
        inspectorTab?.click();
      });

      expect(host.textContent).toContain('OBJECT INSPECTOR');
    });
  });
});
