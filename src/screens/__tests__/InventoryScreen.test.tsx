// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import Inventory from '../Inventory.jsx';
import { app } from '../../linkpoint/app';
import {
  mountScreen,
  unmount,
  click,
  typeInto,
  flush,
  type Mounted,
} from '../../linkpoint/__tests__/ui-helpers';

let mounted: Mounted | null = null;

describe('Inventory Screen Hierarchical Tree Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    app.inventory.folders.clear();
    app.inventory.items.clear();
    app.inventory.isLoading = false;

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
      parent: 'folder-clothes',
      assetType: 5,
      description: 'A stylish silk shirt',
    };

    const itemPants = {
      id: 'item-pants',
      name: 'Black Pants',
      type: 'item',
      parent: 'folder-clothes',
      assetType: 5,
    };

    const itemNote = {
      id: 'item-note',
      name: 'Welcome Notecard',
      type: 'item',
      parent: 'root-id',
      assetType: 7,
      description: 'Welcome to the grid',
      data: 'Welcome text body',
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
      await unmount(mounted);
      mounted = null;
    }
    vi.restoreAllMocks();
  });

  it('renders root folder tree instead of an un-nested flat button list', async () => {
    mounted = await mountScreen(Inventory);

    // Verifies ARIA tree role
    const tree = mounted.host.querySelector('[role="tree"]');
    expect(tree).not.toBeNull();
    expect(tree?.getAttribute('aria-label')).toBe('Inventory Tree');

    // Initially root is expanded, showing its immediate children
    const visibleTreeItems = mounted.host.querySelectorAll('[role="treeitem"]');
    expect(visibleTreeItems.length).toBeGreaterThan(1);
    expect(mounted.host.textContent).toContain('My Inventory');
    expect(mounted.host.textContent).toContain('Clothing');
    expect(mounted.host.textContent).toContain('Objects');
    expect(mounted.host.textContent).toContain('Welcome Notecard');

    // Sub-items of collapsed folder 'Clothing' should not be rendered yet
    expect(mounted.host.textContent).not.toContain('Blue Shirt');
  });

  it('allows expanding and collapsing folders in the tree hierarchy', async () => {
    mounted = await mountScreen(Inventory);

    // Expand Clothing folder
    const clothingRow = mounted.host.querySelector('#inventory-node-folder-clothes');
    expect(clothingRow).not.toBeNull();
    const expandBtn = clothingRow?.querySelector('button[aria-label="Expand Clothing"]');
    expect(expandBtn).not.toBeNull();

    await click(expandBtn);

    // Now 'Blue Shirt' and 'Black Pants' are visible
    expect(mounted.host.textContent).toContain('Blue Shirt');
    expect(mounted.host.textContent).toContain('Black Pants');

    // Collapse Clothing folder
    const collapseBtn = clothingRow?.querySelector('button[aria-label="Collapse Clothing"]');
    expect(collapseBtn).not.toBeNull();
    await click(collapseBtn);

    // 'Blue Shirt' is hidden again
    expect(mounted.host.textContent).not.toContain('Blue Shirt');
  });

  it('filters tree nodes dynamically by name when typing into search input', async () => {
    mounted = await mountScreen(Inventory);

    const searchInput = mounted.host.querySelector(
      'input[aria-label="Filter inventory"]',
    ) as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    await typeInto(searchInput, 'Shirt');
    await flush();

    // In filtered mode, matching nodes are projected
    expect(mounted.host.textContent).toContain('Blue Shirt');
    expect(mounted.host.textContent).not.toContain('Welcome Notecard');
  });

  it('selecting a tree item opens the record-detail aside drawer with AssetContainer metadata', async () => {
    mounted = await mountScreen(Inventory);

    // Select 'Welcome Notecard'
    const noteNode = mounted.host.querySelector('#inventory-node-item-note') as HTMLElement;
    expect(noteNode).not.toBeNull();

    await click(noteNode);

    // Aside detail drawer should open
    const drawer = mounted.host.querySelector('aside.record-detail');
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain('Welcome Notecard');
    expect(drawer?.textContent).toContain('item-note'); // UUID
    expect(drawer?.textContent).toContain('Welcome to the grid'); // Description

    // Close detail drawer
    const closeBtn = mounted.host.querySelector('.detail-close');
    expect(closeBtn).not.toBeNull();
    await click(closeBtn);

    expect(mounted.host.querySelector('aside.record-detail')).toBeNull();
  });

  it('keyboard navigation traverses tree with Arrow keys and Enter', async () => {
    mounted = await mountScreen(Inventory);

    const rootNode = mounted.host.querySelector('#inventory-node-root-id') as HTMLElement;
    expect(rootNode).not.toBeNull();

    // Roving focus starts at root or first visible node
    await act(async () => {
      rootNode.focus();
    });

    // Press ArrowDown to move to Clothing folder
    await act(async () => {
      rootNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    const clothingNode = mounted.host.querySelector(
      '#inventory-node-folder-clothes',
    ) as HTMLElement;
    expect(clothingNode).not.toBeNull();

    // Press ArrowRight to expand Clothing folder
    await act(async () => {
      clothingNode.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });

    expect(mounted.host.textContent).toContain('Blue Shirt');

    // Press ArrowDown to move to Blue Shirt
    await act(async () => {
      clothingNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    const shirtNode = mounted.host.querySelector('#inventory-node-item-shirt') as HTMLElement;
    expect(shirtNode).not.toBeNull();

    // Press Enter to select Blue Shirt
    await act(async () => {
      shirtNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    // Asset detail drawer opens
    const drawer = mounted.host.querySelector('aside.record-detail');
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain('Blue Shirt');
  });

  it('clicking the sync button triggers app.inventory.load', async () => {
    const loadSpy = vi.spyOn(app.inventory, 'load').mockResolvedValue(undefined);
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);

    mounted = await mountScreen(Inventory);

    const syncBtn = mounted.host.querySelector(
      'button[title="Reload Second Life inventory"]',
    ) as HTMLButtonElement;
    expect(syncBtn).not.toBeNull();
    expect(syncBtn.disabled).toBe(false);

    await click(syncBtn);

    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('displays SkeletonLoader rows while inventory fetches initial data', async () => {
    app.inventory.folders.clear();
    app.inventory.items.clear();
    app.inventory.isLoading = true;

    mounted = await mountScreen(Inventory);

    const skeletonRows = mounted.host.querySelectorAll('[data-testid="skeleton-row"]');
    expect(skeletonRows.length).toBeGreaterThan(0);
  });

  it('displays empty state message when inventory has no items', async () => {
    app.inventory.folders.clear();
    app.inventory.items.clear();
    app.inventory.isLoading = false;

    mounted = await mountScreen(Inventory);

    const empty = mounted.host.querySelector('.honest-empty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('Connect to a grid to load inventory.');
  });
});
