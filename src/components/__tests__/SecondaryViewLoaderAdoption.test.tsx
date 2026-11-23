import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import OutfitCarouselDrawer from '../OutfitCarouselDrawer';
import SecondaryViewLoader from '../SecondaryViewLoader';
import OutfitViewer from '../../screens/OutfitViewer.jsx';
import World3D from '../../screens/World3D.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app.ts';

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

describe('SecondaryViewLoader Adoption in Secondary Views', () => {
  describe('OutfitCarouselDrawer integration', () => {
    it('renders SecondaryViewLoader with inline layout when isLoading prop is true', async () => {
      const host = await mount(
        createElement(OutfitCarouselDrawer, {
          isOpen: true,
          isLoading: true,
          onClose: vi.fn(),
          emptyMessage: 'Loading outfits…',
        }),
      );

      const loader = host.querySelector('[data-testid="secondary-view-loader"]') as HTMLElement;
      expect(loader).not.toBeNull();
      expect(loader.getAttribute('data-layout')).toBe('inline');
      expect(loader.getAttribute('role')).toBe('status');
      expect(loader.textContent).toContain('Loading outfits…');

      const crystal = loader.querySelector('[data-testid="crystal-loader"]');
      expect(crystal).not.toBeNull();
    });

    it('renders SecondaryViewLoader when emptyMessage contains Loading and no outfits are provided', async () => {
      const host = await mount(
        createElement(OutfitCarouselDrawer, {
          isOpen: true,
          onClose: vi.fn(),
          emptyMessage: 'Loading your outfits…',
        }),
      );

      const loader = host.querySelector('[data-testid="secondary-view-loader"]') as HTMLElement;
      expect(loader).not.toBeNull();
      expect(loader.getAttribute('data-layout')).toBe('inline');
      expect(loader.textContent).toContain('Loading your outfits…');
    });

    it('renders plain emptyMessage div without loader when not loading and empty', async () => {
      const host = await mount(
        createElement(OutfitCarouselDrawer, {
          isOpen: true,
          onClose: vi.fn(),
          emptyMessage: 'No outfits to show.',
        }),
      );

      const loader = host.querySelector('[data-testid="secondary-view-loader"]');
      expect(loader).toBeNull();

      const statusDiv = host.querySelector('[role="status"]');
      expect(statusDiv).not.toBeNull();
      expect(statusDiv?.textContent).toBe('No outfits to show.');
    });
  });

  describe('OutfitViewer screen integration', () => {
    it('renders SecondaryViewLoader when outfit is loading', async () => {
      vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
      // Pending loadOutfit promise keeping outfit in loading state
      vi.spyOn(app, 'loadOutfit').mockImplementation(() => new Promise(() => {}));

      const host = await mount(createElement(OutfitViewer));

      const loaders = Array.from(host.querySelectorAll('[data-testid="secondary-view-loader"]'));
      expect(loaders.length).toBeGreaterThanOrEqual(1);

      const outfitLoader = loaders.find((el) => el.textContent?.includes('Loading your outfit…'));
      expect(outfitLoader).toBeDefined();
      expect(outfitLoader?.getAttribute('data-layout')).toBe('block');
      expect(outfitLoader?.getAttribute('role')).toBe('status');
    });
  });

  describe('World3D renderer startup integration', () => {
    it('outputs SecondaryViewLoader with inline CrystalLoader during renderer startup and clears when ready', async () => {
      vi.spyOn(app.world, 'init').mockImplementation(() => new Promise(() => {}));
      vi.spyOn(app.world, 'destroyRenderer').mockImplementation(() => {});

      const host = await mount(createElement(World3D));

      // Collapsed status output displays inline SecondaryViewLoader during startup
      let startupLoader = host.querySelector(
        'output [data-testid="secondary-view-loader"]',
      ) as HTMLElement | null;
      expect(startupLoader).not.toBeNull();
      expect(startupLoader?.getAttribute('data-layout')).toBe('inline');
      expect(startupLoader?.textContent).toContain('Starting renderer…');
      const crystal = startupLoader?.querySelector('[data-testid="crystal-loader"]');
      expect(crystal).not.toBeNull();
      expect(crystal?.getAttribute('data-variant')).toBe('inline');

      // Expand diagnostics panel and verify expanded output also renders inline SecondaryViewLoader
      const expandBtn = host.querySelector(
        'button[aria-label="Expand scene statistics"]',
      ) as HTMLButtonElement | null;
      await act(async () => {
        expandBtn?.click();
      });

      startupLoader = host.querySelector(
        'output [data-testid="secondary-view-loader"]',
      ) as HTMLElement | null;
      expect(startupLoader).not.toBeNull();
      expect(startupLoader?.getAttribute('data-layout')).toBe('inline');
      expect(startupLoader?.textContent).toContain('Starting renderer…');
      expect(startupLoader?.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();

      // Emit renderer ready state and confirm loader disappears
      await act(async () => {
        app.world.emit('renderer_state', { ready: true, message: '' });
      });

      expect(host.querySelector('output [data-testid="secondary-view-loader"]')).toBeNull();
    });
  });
});
