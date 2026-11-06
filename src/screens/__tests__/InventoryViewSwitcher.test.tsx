import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import Inventory from '../Inventory.jsx';
import { app } from '../../linkpoint/app';

(globalThis as unknown as Record<string, boolean>).IS_REACT_ACT_ENVIRONMENT = true;

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

const click = async (el: Element | null | undefined) => {
  await act(async () => {
    if (el) (el as HTMLElement).click();
  });
};

const keyDown = async (el: Element | null, key: string) => {
  await act(async () => {
    if (el) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
  });
};

const changeInput = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    nativeInputValueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('Inventory View Switcher & Hierarchy Parity', () => {
  beforeEach(() => {
    localStorage.clear();
    app.inventory.folders.clear();
    app.inventory.items.clear();
    app.inventory.isLoading = false;

    const rootFolder = {
      id: 'root-id',
      name: 'My Inventory',
      type: 'folder',
      parent: null,
      children: ['folder-clothes', 'folder-objects', 'item-note'],
      data: 'folder-root-data',
    };

    const folderClothes = {
      id: 'folder-clothes',
      name: 'Clothing',
      type: 'folder',
      parent: 'root-id',
      children: ['item-shirt', 'item-pants'],
      data: 'folder-clothes-data',
    };

    const folderObjects = {
      id: 'folder-objects',
      name: 'Objects',
      type: 'folder',
      parent: 'root-id',
      children: ['item-box'],
      data: 'folder-objects-data',
    };

    const itemNote = {
      id: 'item-note',
      name: 'Welcome Notecard',
      type: 'item',
      parent: 'root-id',
      assetType: 'Notecard',
      description: 'Orientation instructions',
      data: 'Orientation instructions content',
    };

    const itemShirt = {
      id: 'item-shirt',
      name: 'Blue Shirt',
      type: 'item',
      parent: 'folder-clothes',
      assetType: 'Clothing',
      description: 'Casual blue shirt',
      data: 'Shirt texture data',
    };

    const itemPants = {
      id: 'item-pants',
      name: 'Black Pants',
      type: 'item',
      parent: 'folder-clothes',
      assetType: 'Clothing',
      data: 'Pants data',
    };

    const itemBox = {
      id: 'item-box',
      name: 'Magic Box',
      type: 'item',
      parent: 'folder-objects',
      assetType: 'Object',
      data: 'Box prim data',
    };

    app.inventory.rootFolder = rootFolder;
    app.inventory.folders.set('root-id', rootFolder);
    app.inventory.folders.set('folder-clothes', folderClothes);
    app.inventory.folders.set('folder-objects', folderObjects);
    app.inventory.items.set('item-note', itemNote);
    app.inventory.items.set('item-shirt', itemShirt);
    app.inventory.items.set('item-pants', itemPants);
    app.inventory.items.set('item-box', itemBox);
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted?.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
    localStorage.clear();
  });

  it('defaults to hierarchical tree view mode on initial launch (Firestorm parity)', async () => {
    const host = await mount(createElement(Inventory));

    const switcherGroup = host.querySelector('[role="group"][aria-label="Inventory view mode"]');
    expect(switcherGroup).toBeTruthy();

    const treeBtn = host.querySelector('button[aria-label="Tree view"]');
    const flatBtn = host.querySelector('button[aria-label="Flat view"]');
    expect(treeBtn).toBeTruthy();
    expect(flatBtn).toBeTruthy();

    expect(treeBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(flatBtn?.getAttribute('aria-pressed')).toBe('false');

    // Hierarchy tree view is mounted
    const treeElement = host.querySelector('[role="tree"]');
    expect(treeElement).toBeTruthy();

    // Flat inventory rows are not mounted
    const flatRows = host.querySelectorAll('.inventory-row.inventory-button');
    expect(flatRows.length).toBe(0);
  });

  it('switches between hierarchical tree and flat list in one click and persists preference', async () => {
    const host = await mount(createElement(Inventory));

    const treeBtn = host.querySelector('button[aria-label="Tree view"]');
    const flatBtn = host.querySelector('button[aria-label="Flat view"]');

    // 1-click switch to flat view
    await click(flatBtn);

    expect(flatBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(treeBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('linkpoint_inventory_view_mode')).toBe('flat');

    // Flat view buttons are rendered
    const flatRows = host.querySelectorAll('.inventory-row.inventory-button');
    expect(flatRows.length).toBeGreaterThan(0);
    expect(host.querySelector('[role="tree"]')).toBeNull();

    // 1-click switch back to tree view
    await click(treeBtn);

    expect(treeBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(flatBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('linkpoint_inventory_view_mode')).toBe('tree');

    // Tree view is mounted again
    expect(host.querySelector('[role="tree"]')).toBeTruthy();
    expect(host.querySelectorAll('.inventory-row.inventory-button').length).toBe(0);
  });

  it('restores previous view mode from localStorage on mount', async () => {
    localStorage.setItem('linkpoint_inventory_view_mode', 'flat');

    const host = await mount(createElement(Inventory));

    const treeBtn = host.querySelector('button[aria-label="Tree view"]');
    const flatBtn = host.querySelector('button[aria-label="Flat view"]');

    expect(flatBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(treeBtn?.getAttribute('aria-pressed')).toBe('false');

    const flatRows = host.querySelectorAll('.inventory-row.inventory-button');
    expect(flatRows.length).toBeGreaterThan(0);
    expect(host.querySelector('[role="tree"]')).toBeNull();
  });

  it('preserves filter query state when switching between view modes', async () => {
    const host = await mount(createElement(Inventory));

    const filterInput = host.querySelector(
      'input[aria-label="Filter inventory"]',
    ) as HTMLInputElement;
    expect(filterInput).toBeTruthy();

    // Type filter query
    await changeInput(filterInput, 'Shirt');
    expect(filterInput.value).toBe('Shirt');

    // Switch to flat mode
    const flatBtn = host.querySelector('button[aria-label="Flat view"]');
    await click(flatBtn);

    // Filter value is preserved
    const flatFilterInput = host.querySelector(
      'input[aria-label="Filter inventory"]',
    ) as HTMLInputElement;
    expect(flatFilterInput.value).toBe('Shirt');

    // Flat mode shows filtered result
    const flatRows = host.querySelectorAll('.inventory-row.inventory-button');
    expect(flatRows.length).toBe(1);
    expect(flatRows[0].textContent).toContain('Blue Shirt');

    // Switch back to tree mode
    const treeBtn = host.querySelector('button[aria-label="Tree view"]');
    await click(treeBtn);

    const treeFilterInput = host.querySelector(
      'input[aria-label="Filter inventory"]',
    ) as HTMLInputElement;
    expect(treeFilterInput.value).toBe('Shirt');
    expect(host.querySelector('[role="tree"]')).toBeTruthy();
  });

  it('preserves selected item and record-detail aside when switching between view modes', async () => {
    const host = await mount(createElement(Inventory));

    // Initially no aside drawer
    expect(host.querySelector('aside.record-detail')).toBeNull();

    // Select an item in tree view
    const treeNoteItem = host.querySelector('#inventory-node-item-note');
    await click(treeNoteItem);

    // Detail drawer opens with item details
    let aside = host.querySelector('aside.record-detail');
    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain('Welcome Notecard');
    expect(aside?.textContent).toContain('Orientation instructions');

    // Switch to flat view
    const flatBtn = host.querySelector('button[aria-label="Flat view"]');
    await click(flatBtn);

    // Detail drawer is preserved
    aside = host.querySelector('aside.record-detail');
    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain('Welcome Notecard');

    // Select a different item in flat view
    const flatRows = host.querySelectorAll('.inventory-row.inventory-button');
    const shirtRow = Array.from(flatRows).find((r) => r.textContent?.includes('Blue Shirt'));
    expect(shirtRow).toBeTruthy();
    await click(shirtRow);

    // Detail drawer updates
    aside = host.querySelector('aside.record-detail');
    expect(aside?.textContent).toContain('Blue Shirt');
    expect(aside?.textContent).toContain('Casual blue shirt');

    // Switch back to tree view
    const treeBtn = host.querySelector('button[aria-label="Tree view"]');
    await click(treeBtn);

    // Detail drawer remains open with Blue Shirt
    aside = host.querySelector('aside.record-detail');
    expect(aside).toBeTruthy();
    expect(aside?.textContent).toContain('Blue Shirt');
  });

  it('supports keyboard navigation with arrow keys and announces mode change to screen readers', async () => {
    const host = await mount(createElement(Inventory));

    const treeBtn = host.querySelector('button[aria-label="Tree view"]') as HTMLButtonElement;
    const flatBtn = host.querySelector('button[aria-label="Flat view"]') as HTMLButtonElement;
    const liveRegion = host.querySelector('[role="status"][aria-live="polite"]');

    // Focus tree button
    treeBtn.focus();
    expect(treeBtn.getAttribute('aria-pressed')).toBe('true');

    // Press ArrowRight to toggle to flat view
    await keyDown(treeBtn, 'ArrowRight');

    expect(flatBtn.getAttribute('aria-pressed')).toBe('true');
    expect(treeBtn.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(flatBtn);
    expect(liveRegion?.textContent).toBe('Flat view mode active');

    // Press ArrowLeft to toggle back to tree view
    await keyDown(flatBtn, 'ArrowLeft');

    expect(treeBtn.getAttribute('aria-pressed')).toBe('true');
    expect(flatBtn.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(treeBtn);
    expect(liveRegion?.textContent).toBe('Tree view mode active');

    // Press ArrowDown to toggle to flat view
    await keyDown(treeBtn, 'ArrowDown');
    expect(flatBtn.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(flatBtn);

    // Press ArrowUp to toggle back to tree view
    await keyDown(flatBtn, 'ArrowUp');
    expect(treeBtn.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(treeBtn);
  });

  it('allows closing the record-detail aside via the close button', async () => {
    const host = await mount(createElement(Inventory));

    const treeNoteItem = host.querySelector('#inventory-node-item-note');
    await click(treeNoteItem);

    expect(host.querySelector('aside.record-detail')).toBeTruthy();

    const closeBtn = host.querySelector('button.detail-close');
    await click(closeBtn);

    expect(host.querySelector('aside.record-detail')).toBeNull();
  });

  it('maintains SyncActionButton in both tree and flat view modes', async () => {
    const host = await mount(createElement(Inventory));

    let syncBtn = host.querySelector('button[title="Reload Second Life inventory"]');
    expect(syncBtn).toBeTruthy();

    const flatBtn = host.querySelector('button[aria-label="Flat view"]');
    await click(flatBtn);

    syncBtn = host.querySelector('button[title="Reload Second Life inventory"]');
    expect(syncBtn).toBeTruthy();
  });
});
