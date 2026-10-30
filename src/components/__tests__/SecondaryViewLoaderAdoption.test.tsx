import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import OutfitCarouselDrawer from '../OutfitCarouselDrawer';
import SecondaryViewLoader from '../SecondaryViewLoader';
import OutfitViewer from '../../screens/OutfitViewer.jsx';
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
});
