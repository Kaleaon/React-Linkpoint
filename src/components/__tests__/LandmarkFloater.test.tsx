import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import LandmarkFloater from '../LandmarkFloater.jsx';
import FloatersDesktop from '../FloatersDesktop.jsx';
import MenuBar from '../MenuBar.jsx';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { FLOATER_STATE_STORAGE_KEY } from '../../hooks/useAppState.js';
import { app } from '../../linkpoint/app';
import { LLFolderType } from '../../linkpoint/inventory';
import { getUtf8ByteLength } from '../../linkpoint/landmark';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Avoid WebGL canvas initialization noise in jsdom desktop tests
vi.mock('../../screens/World3D.jsx', () => ({
  default: () => createElement('div', { 'data-testid': 'mock-world3d' }),
  World3DActionBar: () => null,
}));

let mounted: { host: HTMLElement; root: ReturnType<typeof createRoot> } | null = null;

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

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  if (!el) return;
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement | null, value: string) {
  if (!select) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('LandmarkFloater Component & Desktop Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('linkpoint_view_mode', 'desktop');
    app.inventory.folders.clear();
    app.inventory.items.clear();
    app.inventory.rootFolder = null;
    app.world.region = null;
    app.world.avatarPosition = null;
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted!.host.remove();
      mounted = null;
    }
    vi.restoreAllMocks();
  });

  it('renders standard window chrome with drag handle, minimize button, close button, and resize grip', async () => {
    const closeSpy = vi.fn();
    const host = await mount(createElement(LandmarkFloater, { onClose: closeSpy }));

    expect(host.querySelector('[data-testid="landmark-floater"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="landmark-floater-drag-handle"]')).toBeTruthy();
    expect(host.querySelector('[aria-roledescription="window move handle"]')).toBeTruthy();
    expect(host.querySelector('[aria-roledescription="window resize grip"]')).toBeTruthy();

    const minimizeBtn = host.querySelector('button[aria-label="Minimize"]');
    const closeBtn = host.querySelector('button[aria-label="Close"]');
    expect(minimizeBtn).toBeTruthy();
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('displays current parcel name, region name, maturity rating, and honest fallback when unknown', async () => {
    // 1. Unknown/offline state -> honest "—"
    const hostOffline = await mount(createElement(LandmarkFloater));
    expect(hostOffline.querySelector('[data-testid="landmark-parcel-name"]')?.textContent).toBe(
      '—',
    );
    expect(hostOffline.querySelector('[data-testid="landmark-region-name"]')?.textContent).toBe(
      '—',
    );
    expect(hostOffline.querySelector('[data-testid="landmark-maturity-text"]')?.textContent).toBe(
      '—',
    );
    expect(hostOffline.querySelector('[data-testid="landmark-coordinates"]')?.textContent).toBe(
      '—',
    );

    await act(async () => {
      mounted!.root.unmount();
    });
    mounted!.host.remove();
    mounted = null;

    // 2. Live parcel & region state -> renders parcel name, region name, maturity rating, and coordinates
    app.world.region = {
      id: '33333333-4444-5555-6666-777777777777',
      name: 'Bay City - Harwich',
      simAccess: 21,
      parcel: {
        id: 12,
        name: 'Harwich Municipal Pier',
      },
    };
    app.world.avatarPosition = [184.4, 72.1, 25.8];

    const hostLive = await mount(createElement(LandmarkFloater));
    expect(hostLive.querySelector('[data-testid="landmark-parcel-name"]')?.textContent).toBe(
      'Harwich Municipal Pier',
    );
    expect(hostLive.querySelector('[data-testid="landmark-region-name"]')?.textContent).toBe(
      'Bay City - Harwich',
    );
    expect(hostLive.querySelector('[data-testid="landmark-maturity-text"]')?.textContent).toBe(
      'Moderate',
    );
    expect(hostLive.querySelector('[data-testid="landmark-coordinates"]')?.textContent).toBe(
      '184, 72, 26',
    );
    const nameInput = hostLive.querySelector('#landmark-name-input') as HTMLInputElement;
    expect(nameInput.value).toBe('Harwich Municipal Pier');
  });

  it('populates hierarchical folder selector with all valid folders, defaults to Landmarks, and truncates description at 127 bytes', async () => {
    app.inventory.setRootFolder('root-folder');
    app.inventory.createFolder('objects-folder', {
      name: 'Objects',
      parent: 'root-folder',
      folderType: LLFolderType.Object,
    });
    app.inventory.createFolder('landmarks-folder', {
      name: 'Landmarks',
      parent: 'root-folder',
      folderType: LLFolderType.Landmark,
    });
    app.inventory.createFolder('clubs-subfolder', {
      name: 'Favorite Venues',
      parent: 'landmarks-folder',
      folderType: LLFolderType.None,
    });
    app.inventory.createFolder('trash-folder', {
      name: 'Trash',
      parent: 'root-folder',
      folderType: LLFolderType.Trash,
    });

    const host = await mount(createElement(LandmarkFloater));
    // Flush async folder hierarchy promise
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const select = host.querySelector('#landmark-folder-select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain('root-folder');
    expect(optionValues).toContain('objects-folder');
    expect(optionValues).toContain('landmarks-folder');
    expect(optionValues).toContain('clubs-subfolder');
    expect(optionValues).not.toContain('trash-folder');

    // Defaults to Landmarks folder
    expect(select.value).toBe('landmarks-folder');

    // Truncates description at 127 UTF-8 bytes
    const descArea = host.querySelector('#landmark-description-input') as HTMLTextAreaElement;
    await act(async () => {
      setInputValue(descArea, '📍'.repeat(40)); // 160 bytes
    });
    expect(getUtf8ByteLength(descArea.value)).toBeLessThanOrEqual(127);
    expect(host.querySelector('[data-testid="landmark-desc-bytes"]')?.textContent).toBe(
      '124 / 127 bytes',
    );
  });

  it('opens through Ctrl+Shift+D, World menu navigation, and location bar button, then closes & refreshes inventory upon creation', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    app.inventory.setRootFolder('root-folder');
    app.inventory.createFolder('landmarks-folder', {
      name: 'Landmarks',
      parent: 'root-folder',
      folderType: LLFolderType.Landmark,
    });
    app.inventory.createFolder('events-subfolder', {
      name: 'Concerts',
      parent: 'landmarks-folder',
      folderType: LLFolderType.None,
    });
    app.world.region = {
      id: '33333333-4444-5555-6666-777777777777',
      name: 'Amphitheater Sim',
      simAccess: 13,
      parcel: { id: 5, name: 'Main Stage' },
    };
    app.world.avatarPosition = [120, 140, 24];

    const createSpy = vi.spyOn(app.inventory, 'createLandmark').mockImplementation(async (p) => {
      const inserted = app.inventory.addItem('created-lm-99', {
        name: p.name,
        description: p.description,
        folderId: p.folderId,
        assetType: 'landmark',
        inventoryType: 3,
      });
      app.inventory.emit('inventory_updated', { items: [inserted] });
      app.inventory.emit('inventory_loaded');
      return {
        success: true,
        transport: 'capability',
        itemId: 'created-lm-99',
        folderId: p.folderId || 'landmarks-folder',
        item: inserted,
      };
    });

    const host = await mount(
      createElement(React.Fragment, null, createElement(MenuBar), createElement(FloatersDesktop)),
    );

    // Initially closed
    expect(host.querySelector('[data-testid="landmark-floater"]')).toBeNull();

    // 1. Open via Ctrl+Shift+D shortcut
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'D',
          code: 'KeyD',
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(host.querySelector('[data-testid="landmark-floater"]')).toBeTruthy();

    // Close it via Close button
    await act(async () => {
      host
        .querySelector('[data-testid="landmark-floater"] button[aria-label="Close"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="landmark-floater"]')).toBeNull();

    // 2. Open via World > Landmark Here menu navigation
    const worldMenuBtn = host.querySelector('[role="menuitem"][aria-label="World"]');
    expect(worldMenuBtn).toBeTruthy();
    await act(async () => {
      worldMenuBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const landmarkMenuItem = host.querySelector('[role="menuitem"][aria-label="Landmark Here"]');
    expect(landmarkMenuItem).toBeTruthy();
    await act(async () => {
      landmarkMenuItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="landmark-floater"]')).toBeTruthy();

    // Wait for folder options to populate
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });

    // Select custom subfolder, enter details, and submit
    const select = host.querySelector('#landmark-folder-select') as HTMLSelectElement;
    const nameInput = host.querySelector('#landmark-name-input') as HTMLInputElement;
    const descInput = host.querySelector('#landmark-description-input') as HTMLTextAreaElement;
    const form = host.querySelector('[data-testid="landmark-floater"] form') as HTMLFormElement;

    const refreshListener = vi.fn();
    app.inventory.on('inventory_updated', refreshListener);

    await act(async () => {
      setSelectValue(select, 'events-subfolder');
      setInputValue(nameInput, 'Summer Solstice Stage');
      setInputValue(descInput, 'VIP entrance on north side');
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Summer Solstice Stage',
        description: 'VIP entrance on north side',
        folderId: 'events-subfolder',
      }),
    );
    expect(refreshListener).toHaveBeenCalled();
    // Floater closes upon completion
    expect(host.querySelector('[data-testid="landmark-floater"]')).toBeNull();

    // 3. Also verify location bar Create landmark button opens the floater
    const locBarBtn = host.querySelector(
      '.desktop-location-form button[aria-label="Create landmark"]',
    );
    expect(locBarBtn).toBeTruthy();
    await act(async () => {
      locBarBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="landmark-floater"]')).toBeTruthy();

    app.inventory.off('inventory_updated', refreshListener);
  });

  it('remembers floater position, size, and minimized state across sessions', async () => {
    let latestState: any = null;
    let latestActions: any = null;

    function Inspector() {
      const ctx = useApp();
      latestState = ctx.state;
      latestActions = ctx.actions;
      return createElement(LandmarkFloater);
    }

    await mount(createElement(Inspector));

    await act(async () => {
      latestActions.openLandmarkFloater();
      latestActions.flSetRect('CreateLandmark', { x: 210, y: 130, w: 460, h: 390 });
    });
    await act(async () => {
      latestActions.flToggle('CreateLandmark'); // minimizes since it's currently open
    });

    expect(latestState.flRect.CreateLandmark).toEqual({ x: 210, y: 130, w: 460, h: 390 });
    expect(latestState.flMin.CreateLandmark).toBe(true);

    const persistedRaw = localStorage.getItem(FLOATER_STATE_STORAGE_KEY);
    expect(persistedRaw).toBeTruthy();

    // Unmount session 1 and mount fresh session 2
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted!.host.remove();
    mounted = null;

    await mount(createElement(Inspector));
    expect(latestActions.flR('CreateLandmark')).toMatchObject({
      x: 210,
      y: 130,
      w: 460,
      h: 390,
    });
    expect(latestState.flMin.CreateLandmark).toBe(true);
    expect(latestState.flOpen.CreateLandmark).toBe(true);
  });
});
