// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { app } from '../../linkpoint/app.ts';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { NotecardsScreen } from '../LumiyaTools.jsx';
import ScreenBody from '../../components/ScreenBody.jsx';
import { encodeLindenText } from '../../linkpoint/notecard.ts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mountScreen(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
  });
  mounted = { host, root };
  return host;
}

describe('NotecardsScreen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    app.inventory.items.clear();
    app.inventory.folders.clear();
    app.inventory.isLoading = false;
    localStorage.removeItem('linkpoint_view_mode');
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
    app.inventory.items.clear();
    app.inventory.folders.clear();
    app.inventory.isLoading = false;
    localStorage.removeItem('linkpoint_view_mode');
    window.history.replaceState({}, '', '/');
  });

  it('renders skeleton rows while inventory is loading and calls app.inventory.load from SyncActionButton', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    const loadSpy = vi.spyOn(app.inventory, 'load').mockResolvedValue(undefined);
    app.inventory.isLoading = true;

    const host = await mountScreen(<NotecardsScreen />);

    expect(host.querySelectorAll('[data-testid="skeleton-row"]').length).toBeGreaterThan(0);
    expect(host.textContent).not.toContain('No notecards have been loaded from inventory.');

    await act(async () => {
      app.inventory.isLoading = false;
      app.inventory.emit('inventory_loading_end');
    });

    expect(host.querySelectorAll('[data-testid="skeleton-row"]').length).toBe(0);
    expect(host.textContent).toContain('No notecards have been loaded from inventory.');

    const syncBtn = host.querySelector(
      '[data-testid="sync-action-button"]',
    ) as HTMLButtonElement | null;
    expect(syncBtn).not.toBeNull();
    expect(syncBtn?.disabled).toBe(false);

    await act(async () => {
      syncBtn?.click();
    });

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('updates reactively on inventory_loaded and clears selection when an item is removed', async () => {
    localStorage.setItem('linkpoint_view_mode', 'mobile');
    vi.spyOn(app.protocol, 'fetchNotecard').mockResolvedValue({
      id: 'asset-rules',
      data: encodeLindenText('Region covenant rules.'),
      size: 64,
    });

    const host = await mountScreen(<NotecardsScreen />);
    expect(host.textContent).toContain('No notecards have been loaded from inventory.');

    await act(async () => {
      app.inventory.items.set('nc-1', {
        id: 'nc-1',
        assetId: 'asset-rules',
        name: 'Region Covenant',
        assetType: 7,
      });
      app.inventory.items.set('obj-1', {
        id: 'obj-1',
        name: 'Wooden Crate',
        assetType: 6,
      });
      app.inventory.emit('inventory_loaded');
    });

    expect(host.textContent).toContain('Region Covenant');
    expect(host.textContent).not.toContain('Wooden Crate');

    const cardButton = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button.runtime-card-button'),
    ).find((btn) => btn.textContent?.includes('Region Covenant'));
    expect(cardButton).toBeDefined();

    await act(async () => {
      cardButton?.click();
    });

    expect(host.querySelector('[data-testid="asset-loaded-state"]')?.textContent).toContain(
      'Region covenant rules.',
    );

    await act(async () => {
      app.inventory.items.delete('nc-1');
      app.inventory.emit('inventory_updated');
    });

    expect(host.querySelector('[data-testid="asset-loaded-state"]')).toBeNull();
    expect(host.textContent).toContain('No notecards have been loaded from inventory.');
  });

  it('fetches unloaded notecards inline, decodes Linden text, caches text, and uses U+2014 when empty', async () => {
    localStorage.setItem('linkpoint_view_mode', 'mobile');
    const welcomeText = 'Welcome to Mainland Hub!\nEnjoy your stay.';
    const fetchSpy = vi
      .spyOn(app.protocol, 'fetchNotecard')
      .mockImplementation(async (assetId: string) => {
        if (assetId === 'asset-welcome') {
          return {
            id: assetId,
            data: encodeLindenText(welcomeText),
            size: 96,
          };
        }
        return {
          id: assetId,
          data: encodeLindenText(''),
          size: 48,
        };
      });

    const welcomeCard: Record<string, unknown> = {
      id: 'nc-welcome',
      assetId: 'asset-welcome',
      name: 'Welcome Note',
      description: 'Metadata description that must not substitute body text',
      assetType: 7,
    };
    const emptyCard: Record<string, unknown> = {
      id: 'nc-empty',
      assetId: 'asset-empty',
      name: 'Blank Note',
      description: '2026-01-01 creator metadata',
      assetType: 7,
    };
    app.inventory.items.set('nc-welcome', welcomeCard);
    app.inventory.items.set('nc-empty', emptyCard);

    const host = await mountScreen(<NotecardsScreen />);

    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button.runtime-card-button'),
    );
    const welcomeBtn = buttons.find((b) => b.textContent?.includes('Welcome Note'));
    const emptyBtn = buttons.find((b) => b.textContent?.includes('Blank Note'));

    await act(async () => {
      welcomeBtn?.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith('asset-welcome', 'nc-welcome');
    expect(welcomeCard.text).toBe(welcomeText);
    expect(host.querySelector('[data-testid="asset-loaded-state"]')?.textContent).toContain(
      'Welcome to Mainland Hub!',
    );

    // Select empty card: must show U+2014 ('—'), NOT description and NOT U+2015 ('―')
    await act(async () => {
      emptyBtn?.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const loadedContainer = host.querySelector('[data-testid="asset-loaded-state"]');
    expect(loadedContainer).not.toBeNull();
    const paragraph = loadedContainer?.querySelector('p');
    expect(paragraph?.textContent).toBe('—');
    expect(loadedContainer?.textContent).not.toContain('2026-01-01 creator metadata');
    expect(loadedContainer?.textContent).not.toContain('―');

    // Re-selecting Welcome Note uses cached text and skips duplicate network fetch
    await act(async () => {
      welcomeBtn?.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-testid="asset-loaded-state"]')?.textContent).toContain(
      'Welcome to Mainland Hub!',
    );
  });

  it('prefers state.notecardDrafts and pre-cached card.data over network fetches', async () => {
    localStorage.setItem('linkpoint_view_mode', 'mobile');
    const fetchSpy = vi.spyOn(app.protocol, 'fetchNotecard');

    app.inventory.items.set('nc-draft', {
      id: 'nc-draft',
      assetId: 'asset-draft',
      name: 'Draft Note',
      assetType: 7,
    });
    app.inventory.items.set('nc-cached-bytes', {
      id: 'nc-cached-bytes',
      assetId: 'asset-cached-bytes',
      name: 'Cached Bytes Note',
      data: new TextEncoder().encode(encodeLindenText('Decoded from cached Uint8Array payload.')),
      assetType: 7,
    });

    function DraftSeeder({ children }: { children: React.ReactNode }) {
      const { actions } = useApp();
      const seeded = React.useRef(false);
      useEffect(() => {
        if (!seeded.current) {
          seeded.current = true;
          actions.setNotecardDraft('nc-draft', 'Unsaved local draft text');
        }
      }, [actions]);
      return <>{children}</>;
    }

    const host = await mountScreen(
      <DraftSeeder>
        <NotecardsScreen />
      </DraftSeeder>,
    );

    const draftBtn = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button.runtime-card-button'),
    ).find((b) => b.textContent?.includes('Draft Note'));
    const cachedBytesBtn = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button.runtime-card-button'),
    ).find((b) => b.textContent?.includes('Cached Bytes Note'));

    await act(async () => {
      draftBtn?.click();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="asset-loaded-state"]')?.textContent).toContain(
      'Unsaved local draft text',
    );

    await act(async () => {
      cachedBytesBtn?.click();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(host.querySelector('[data-testid="asset-loaded-state"]')?.textContent).toContain(
      'Decoded from cached Uint8Array payload.',
    );
  });

  it('propagates fetchNotecard errors to AssetContainer alert state and succeeds on retry', async () => {
    localStorage.setItem('linkpoint_view_mode', 'mobile');
    const fetchSpy = vi
      .spyOn(app.protocol, 'fetchNotecard')
      .mockRejectedValueOnce(new Error('ViewerAsset capability timed out'))
      .mockResolvedValueOnce({
        id: 'asset-retry',
        data: encodeLindenText('Recovered notecard body after retry.'),
        size: 72,
      });

    app.inventory.items.set('nc-retry', {
      id: 'nc-retry',
      assetId: 'asset-retry',
      name: 'Retryable Note',
      assetType: 7,
    });

    const host = await mountScreen(<NotecardsScreen />);
    const cardBtn = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button.runtime-card-button'),
    ).find((b) => b.textContent?.includes('Retryable Note'));

    await act(async () => {
      cardBtn?.click();
    });

    const errorAlert = host.querySelector('[data-testid="asset-error-state"]');
    expect(errorAlert).not.toBeNull();
    expect(errorAlert?.getAttribute('role')).toBe('alert');
    expect(errorAlert?.textContent).toContain('ViewerAsset capability timed out');

    const retryBtn = host.querySelector(
      '[data-testid="asset-retry-button"]',
    ) as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();

    await act(async () => {
      retryBtn?.click();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-testid="asset-error-state"]')).toBeNull();
    expect(host.querySelector('[data-testid="asset-loaded-state"]')?.textContent).toContain(
      'Recovered notecard body after retry.',
    );
  });

  it('gates openNotecard and floater button by isFloat so non-floater selection stays on NotecardsScreen', async () => {
    window.history.replaceState({}, '', '/?screen=Notecards');
    localStorage.setItem('linkpoint_view_mode', 'mobile');

    app.inventory.items.set('nc-mobile', {
      id: 'nc-mobile',
      name: 'Mobile Field Guide',
      text: 'Inline mobile preview content.',
      assetType: 7,
    });

    const mobileHost = await mountScreen(<ScreenBody />);
    const mobileCardBtn = Array.from(
      mobileHost.querySelectorAll<HTMLButtonElement>('button.runtime-card-button'),
    ).find((b) => b.textContent?.includes('Mobile Field Guide'));
    expect(mobileCardBtn).toBeDefined();

    await act(async () => {
      mobileCardBtn?.click();
    });

    // ScreenBody remains on NotecardsScreen and renders inline preview without floater button
    expect(mobileHost.querySelector('h2')?.textContent).toBe('Notecards');
    expect(mobileHost.querySelector('[data-testid="asset-loaded-state"]')?.textContent).toContain(
      'Inline mobile preview content.',
    );
    const mobileFloaterBtn = Array.from(mobileHost.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open in Floater'),
    );
    expect(mobileFloaterBtn).toBeUndefined();

    // Unmount and verify desktop floater mode renders Open in Floater and triggers openNotecard
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted!.host.remove();
    mounted = null;

    localStorage.setItem('linkpoint_view_mode', 'desktop');
    let observedScreen = '';
    function ScreenObserver() {
      const { state } = useApp();
      observedScreen = state.screen;
      return <NotecardsScreen />;
    }

    const desktopHost = await mountScreen(<ScreenObserver />);
    const desktopCardBtn = Array.from(
      desktopHost.querySelectorAll<HTMLButtonElement>('button.runtime-card-button'),
    ).find((b) => b.textContent?.includes('Mobile Field Guide'));

    await act(async () => {
      desktopCardBtn?.click();
    });

    const desktopFloaterBtn = Array.from(desktopHost.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Open in Floater'),
    );
    expect(desktopFloaterBtn).toBeDefined();
    expect(observedScreen).toBe('Notecard');
  });
});
