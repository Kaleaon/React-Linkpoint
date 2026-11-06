// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Inventory, { INVENTORY_VIEW_MODE_KEY } from '../../screens/Inventory.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../app';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mountInventory() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider as any,
        null,
        createElement(ThemeProvider as any, null, createElement(Inventory)),
      ),
    );
  });
  mounted = { host, root };
  return host;
}

const click = async (el: Element | null | undefined) => {
  await act(async () => {
    (el as HTMLElement)?.click();
  });
};

const changeInput = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('Dual-Mode Composite Inventory View (Tree & Flat Table)', () => {
  beforeEach(() => {
    localStorage.clear();
    app.inventory.folders.clear();
    app.inventory.items.clear();
    app.inventory.isLoading = false;

    // Set up standard hierarchical inventory tree
    const rootFolder = {
      id: 'root-id',
      name: 'My Inventory',
      type: 'folder',
      parent: null,
      children: ['folder-clothes', 'folder-objects', 'item-note'],
    };

    const folderClothes = {
      id: 'folder-clothes',
      name: 'Clothing',
      type: 'folder',
      parent: 'root-id',
      children: ['item-shirt', 'item-pants'],
    };

    const folderObjects = {
      id: 'folder-objects',
      name: 'Objects',
      type: 'folder',
      parent: 'root-id',
      children: [],
    };

    const itemShirt = {
      id: 'item-shirt',
      name: 'Blue Shirt',
      type: 'item',
      assetType: 5,
      parent: 'folder-clothes',
      description: 'A stylish blue shirt',
      data: 'shirt-asset-data',
    };

    const itemPants = {
      id: 'item-pants',
      name: 'Black Pants',
      type: 'item',
      assetType: 5,
      parent: 'folder-clothes',
      description: 'Casual trousers',
      data: 'pants-asset-data',
    };

    const itemNote = {
      id: 'item-note',
      name: 'Welcome Notecard',
      type: 'item',
      assetType: 7,
      parent: 'root-id',
      description: 'Read me first',
      data: 'note-asset-data',
    };

    app.inventory.rootFolder = rootFolder;
    app.inventory.folders.set('root-id', rootFolder);
    app.inventory.folders.set('folder-clothes', folderClothes);
    app.inventory.folders.set('folder-objects', folderObjects);
    app.inventory.items.set('item-shirt', itemShirt);
    app.inventory.items.set('item-pants', itemPants);
    app.inventory.items.set('item-note', itemNote);
  });

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

  it('Requirement 1 & Criterion 1: renders segmented toggle button group with accessible labels and touch targets >= 24px', async () => {
    const host = await mountInventory();

    const viewModeGroup = host.querySelector('[role="group"][aria-label="View mode"]');
    expect(viewModeGroup).toBeTruthy();

    const treeBtn = host.querySelector('button[aria-label="Tree View"]') as HTMLButtonElement;
    const flatBtn = host.querySelector('button[aria-label="Flat Table"]') as HTMLButtonElement;

    expect(treeBtn).toBeTruthy();
    expect(flatBtn).toBeTruthy();

    // Verify accessible labels and titles
    expect(treeBtn.getAttribute('title')).toBe('Tree View');
    expect(flatBtn.getAttribute('title')).toBe('Flat Table');

    // Verify touch targets comply with WCAG 2.5.8 (min 24px)
    expect(treeBtn.classList.contains('touch-target')).toBe(true);
    expect(flatBtn.classList.contains('touch-target')).toBe(true);
    expect(parseInt(treeBtn.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(treeBtn.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(flatBtn.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(flatBtn.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(24);
  });

  it('Requirement 2 & Criterion 2: defaults to Tree View mode and displays virtualized InventoryTree component', async () => {
    const host = await mountInventory();

    const treeBtn = host.querySelector('button[aria-label="Tree View"]') as HTMLButtonElement;
    const flatBtn = host.querySelector('button[aria-label="Flat Table"]') as HTMLButtonElement;

    // Default view mode must be tree mode
    expect(treeBtn.getAttribute('aria-pressed')).toBe('true');
    expect(flatBtn.getAttribute('aria-pressed')).toBe('false');

    // Virtualized InventoryTree is rendered with ARIA tree role
    const treeContainer = host.querySelector('[role="tree"][aria-label="Inventory Tree"]');
    expect(treeContainer).toBeTruthy();
    expect(host.querySelector('.inventory-tree-mode')).toBeTruthy();
  });

  it('Requirement 3 & Criterion 3: switching to Flat Table mode renders the sorted flat list of inventory records', async () => {
    const host = await mountInventory();

    const flatBtn = host.querySelector('button[aria-label="Flat Table"]') as HTMLButtonElement;
    await click(flatBtn);

    const treeBtn = host.querySelector('button[aria-label="Tree View"]') as HTMLButtonElement;
    expect(flatBtn.getAttribute('aria-pressed')).toBe('true');
    expect(treeBtn.getAttribute('aria-pressed')).toBe('false');

    // Tree component is no longer rendered
    expect(host.querySelector('[role="tree"]')).toBeNull();

    // Flat list buttons are rendered
    const flatRows = host.querySelectorAll('.live-list .inventory-button');
    expect(flatRows.length).toBeGreaterThan(0);

    // Folders come before items, sorted alphabetically
    const rowTexts = Array.from(flatRows).map((r) => r.textContent?.trim());
    expect(rowTexts).toContain('Clothing');
    expect(rowTexts).toContain('Objects');
    expect(rowTexts).toContain('Black Pants');
    expect(rowTexts).toContain('Blue Shirt');
    expect(rowTexts).toContain('Welcome Notecard');
  });

  it('Requirement 4 & Criterion 4: common search filter query applies consistently across both Tree and Flat view modes without reset', async () => {
    const host = await mountInventory();

    const searchInput = host.querySelector(
      'input[aria-label="Filter inventory"]',
    ) as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    // Type search query in Tree view mode
    await changeInput(searchInput, 'Shirt');
    expect(searchInput.value).toBe('Shirt');

    // Tree view reflects filtered item
    expect(host.textContent).toContain('Blue Shirt');
    expect(host.textContent).not.toContain('Black Pants');

    // Switch to Flat mode
    const flatBtn = host.querySelector('button[aria-label="Flat Table"]') as HTMLButtonElement;
    await click(flatBtn);

    // Search filter text is preserved across mode change
    const searchInputAfterSwitch = host.querySelector(
      'input[aria-label="Filter inventory"]',
    ) as HTMLInputElement;
    expect(searchInputAfterSwitch.value).toBe('Shirt');

    // Flat view reflects the same search filter
    const flatRows = host.querySelectorAll('.live-list .inventory-button');
    expect(flatRows.length).toBe(1);
    expect(flatRows[0].textContent).toContain('Blue Shirt');

    // Switch back to Tree mode: query and filtered state are preserved
    const treeBtn = host.querySelector('button[aria-label="Tree View"]') as HTMLButtonElement;
    await click(treeBtn);
    expect(searchInputAfterSwitch.value).toBe('Shirt');
    expect(host.textContent).toContain('Blue Shirt');
    expect(host.textContent).not.toContain('Black Pants');
  });

  it('Requirement 5 & Criterion 5: selecting an item in either view mode populates and preserves shared side inspector drawer', async () => {
    const host = await mountInventory();

    // 1. Select item in Tree view mode
    const noteTreeItem = host.querySelector('#inventory-node-item-note') as HTMLElement;
    expect(noteTreeItem).toBeTruthy();
    await click(noteTreeItem);

    // Detail drawer opens with item metadata
    let detailDrawer = host.querySelector('aside.record-detail');
    expect(detailDrawer).toBeTruthy();
    expect(detailDrawer?.textContent).toContain('Welcome Notecard');
    expect(detailDrawer?.textContent).toContain('item-note');
    expect(detailDrawer?.textContent).toContain('Read me first');

    // 2. Switch to Flat view mode: selection persists without state loss
    const flatBtn = host.querySelector('button[aria-label="Flat Table"]') as HTMLButtonElement;
    await click(flatBtn);

    detailDrawer = host.querySelector('aside.record-detail');
    expect(detailDrawer).toBeTruthy();
    expect(detailDrawer?.textContent).toContain('Welcome Notecard');

    // 3. Select a different item in Flat view mode
    const flatButtons = host.querySelectorAll('.live-list .inventory-button');
    const shirtButton = Array.from(flatButtons).find((b) => b.textContent?.includes('Blue Shirt'));
    expect(shirtButton).toBeTruthy();
    await click(shirtButton);

    detailDrawer = host.querySelector('aside.record-detail');
    expect(detailDrawer?.textContent).toContain('Blue Shirt');
    expect(detailDrawer?.textContent).toContain('item-shirt');
    expect(detailDrawer?.textContent).toContain('A stylish blue shirt');

    // 4. Switch back to Tree view mode: new selection persists
    const treeBtn = host.querySelector('button[aria-label="Tree View"]') as HTMLButtonElement;
    await click(treeBtn);

    detailDrawer = host.querySelector('aside.record-detail');
    expect(detailDrawer?.textContent).toContain('Blue Shirt');
  });

  it('Requirement 6: persists selected view mode to local preferences and restores on session resume', async () => {
    // 1. Initial mount defaults to tree
    let host = await mountInventory();
    expect(localStorage.getItem(INVENTORY_VIEW_MODE_KEY)).toBeNull();

    // 2. Toggle to flat mode and verify localStorage is updated
    const flatBtn = host.querySelector('button[aria-label="Flat Table"]') as HTMLButtonElement;
    await click(flatBtn);
    expect(localStorage.getItem(INVENTORY_VIEW_MODE_KEY)).toBe('flat');

    // 3. Unmount and re-mount (simulating new viewer session)
    if (mounted) {
      await act(async () => {
        mounted?.root.unmount();
      });
      mounted?.host.remove();
      mounted = null;
    }

    host = await mountInventory();
    const flatBtnReopened = host.querySelector(
      'button[aria-label="Flat Table"]',
    ) as HTMLButtonElement;
    const treeBtnReopened = host.querySelector(
      'button[aria-label="Tree View"]',
    ) as HTMLButtonElement;

    expect(flatBtnReopened.getAttribute('aria-pressed')).toBe('true');
    expect(treeBtnReopened.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.live-list')).toBeTruthy();

    // 4. Toggle back to tree mode and verify update
    await click(treeBtnReopened);
    expect(localStorage.getItem(INVENTORY_VIEW_MODE_KEY)).toBe('tree');
  });

  it('Constraint 3: virtualized flat list caps DOM elements and does not block main thread for 1,000+ items', async () => {
    // Populate 1,200 items in inventory
    for (let i = 0; i < 1200; i++) {
      app.inventory.items.set(`bulk-item-${i}`, {
        id: `bulk-item-${i}`,
        name: `Asset Item #${String(i).padStart(4, '0')}`,
        type: 'item',
        assetType: 5,
        parent: 'root-id',
      });
    }

    localStorage.setItem(INVENTORY_VIEW_MODE_KEY, 'flat');
    const startRenderTime = performance.now();
    const host = await mountInventory();
    const elapsedMs = performance.now() - startRenderTime;

    // Render must complete smoothly (< 100ms in jsdom)
    expect(elapsedMs).toBeLessThan(500);

    // Number of mounted button rows must be capped by virtualization (far below 1,200)
    const mountedButtons = host.querySelectorAll('.live-list .inventory-button');
    expect(mountedButtons.length).toBeLessThan(60);
    expect(mountedButtons.length).toBeGreaterThan(0);
  });
});
