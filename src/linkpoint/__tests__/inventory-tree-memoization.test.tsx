import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { app } from '../app';
import { InventoryTree } from '../../components/InventoryTree';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(props: any = {}) {
  const host = document.createElement('div');
  host.style.height = '500px';
  host.style.overflow = 'auto';
  Object.defineProperty(host, 'clientHeight', { value: 500, configurable: true });
  document.body.appendChild(host);

  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(InventoryTree, props));
  });
  mounted = { host, root };
  return host;
}

const click = async (el: Element | null | undefined) => {
  await act(async () => {
    (el as HTMLElement)?.click();
  });
};

describe('InventoryTree Memoization & Selection Decoupling', () => {
  beforeEach(() => {
    app.inventory.folders.clear();
    app.inventory.items.clear();

    const rootFolder = {
      id: 'root-id',
      name: 'My Inventory',
      type: 'folder',
      parent: null,
      children: ['folder-clothes', 'item-note'],
    };

    const folderClothes = {
      id: 'folder-clothes',
      name: 'Clothing',
      type: 'folder',
      parent: 'root-id',
      children: ['item-shirt', 'item-pants'],
    };

    const itemShirt = {
      id: 'item-shirt',
      name: 'Blue Shirt',
      type: 'item',
      parent: 'folder-clothes',
    };

    const itemPants = {
      id: 'item-pants',
      name: 'Black Pants',
      type: 'item',
      parent: 'folder-clothes',
    };

    const itemNote = {
      id: 'item-note',
      name: 'Welcome Notecard',
      type: 'item',
      parent: 'root-id',
    };

    app.inventory.rootFolder = rootFolder;
    app.inventory.folders.set('root-id', rootFolder);
    app.inventory.folders.set('folder-clothes', folderClothes);
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

  it('updates row selection highlighting without re-executing recursive tree traversals', async () => {
    const host = await mount({ rootFolderId: 'root-id', selectedId: 'item-note' });

    // Expand Clothing folder so child items are part of the flat node tree
    const expandBtn = host.querySelector('button[aria-label="Expand Clothing"]');
    expect(expandBtn).not.toBeNull();
    await click(expandBtn);

    const noteRow = host.querySelector('#inventory-node-item-note');
    expect(noteRow?.getAttribute('aria-selected')).toBe('true');
    expect(noteRow?.classList.contains('selected')).toBe(true);

    // Spy on inventory lookups that occur during recursive tree traversal
    const folderSpy = vi.spyOn(app.inventory.folders, 'get');
    const itemSpy = vi.spyOn(app.inventory.items, 'get');

    // Change selectedId to item-shirt via re-render
    await act(async () => {
      mounted!.root.render(
        createElement(InventoryTree, {
          rootFolderId: 'root-id',
          selectedId: 'item-shirt',
        }),
      );
    });

    // Verification: structural tree traversal was NOT re-executed
    expect(folderSpy).not.toHaveBeenCalled();
    expect(itemSpy).not.toHaveBeenCalled();

    // Verification: DOM reflects selection update properly
    const updatedNoteRow = host.querySelector('#inventory-node-item-note');
    const shirtRow = host.querySelector('#inventory-node-item-shirt');

    expect(updatedNoteRow?.getAttribute('aria-selected')).toBe('false');
    expect(updatedNoteRow?.classList.contains('selected')).toBe(false);

    expect(shirtRow?.getAttribute('aria-selected')).toBe('true');
    expect(shirtRow?.classList.contains('selected')).toBe(true);
  });

  it('re-evaluates structural memoization when folder expansions change', async () => {
    const host = await mount({ rootFolderId: 'root-id' });

    const folderSpy = vi.spyOn(app.inventory.folders, 'get');
    const itemSpy = vi.spyOn(app.inventory.items, 'get');

    // Expand Clothing folder
    const expandBtn = host.querySelector('button[aria-label="Expand Clothing"]');
    await click(expandBtn);

    // Structural traversal MUST re-run when expansion changes
    expect(folderSpy).toHaveBeenCalled();
    expect(itemSpy).toHaveBeenCalled();

    // Verify children are now visible
    expect(host.textContent).toContain('Blue Shirt');
    expect(host.textContent).toContain('Black Pants');
  });

  it('re-evaluates structural memoization when search filter changes', async () => {
    const host = await mount({ rootFolderId: 'root-id', filter: '' });

    const folderSpy = vi.spyOn(app.inventory.folders, 'get');
    const itemSpy = vi.spyOn(app.inventory.items, 'get');

    // Apply filter
    await act(async () => {
      mounted!.root.render(
        createElement(InventoryTree, {
          rootFolderId: 'root-id',
          filter: 'shirt',
        }),
      );
    });

    // Structural traversal MUST re-run when filter changes
    expect(folderSpy).toHaveBeenCalled();
    expect(itemSpy).toHaveBeenCalled();

    expect(host.textContent).toContain('Blue Shirt');
    expect(host.textContent).not.toContain('Welcome Notecard');
  });

  it('re-evaluates structural memoization when inventory revision updates', async () => {
    const host = await mount({ rootFolderId: 'root-id' });

    const folderSpy = vi.spyOn(app.inventory.folders, 'get');

    // Trigger an inventory_updated event to bump revision
    await act(async () => {
      app.inventory.emit('inventory_updated');
    });

    // Structural traversal re-runs on inventory mutations
    expect(folderSpy).toHaveBeenCalled();
  });

  it('maintains virtual window slicing and row projection cleanly with decoupled selection', async () => {
    const TOTAL_ITEMS = 200;
    const itemIds: string[] = [];
    for (let i = 0; i < TOTAL_ITEMS; i++) {
      const id = `slice-item-${i}`;
      itemIds.push(id);
      app.inventory.items.set(id, {
        id,
        name: `Slice Item ${i}`,
        type: 'item',
        parent: 'root-id',
      });
    }

    const rootFolder = {
      id: 'root-id',
      name: 'Root',
      type: 'folder',
      parent: null,
      children: itemIds,
    };
    app.inventory.rootFolder = rootFolder;
    app.inventory.folders.set('root-id', rootFolder);

    const host = await mount({ rootFolderId: 'root-id', selectedId: 'slice-item-0' });

    // Item 0 is selected
    const item0 = host.querySelector('#inventory-node-slice-item-0');
    expect(item0?.getAttribute('aria-selected')).toBe('true');

    const folderSpy = vi.spyOn(app.inventory.folders, 'get');

    // Switch selection to slice-item-1
    await act(async () => {
      mounted!.root.render(
        createElement(InventoryTree, {
          rootFolderId: 'root-id',
          selectedId: 'slice-item-1',
        }),
      );
    });

    expect(folderSpy).not.toHaveBeenCalled();

    const updatedItem0 = host.querySelector('#inventory-node-slice-item-0');
    const item1 = host.querySelector('#inventory-node-slice-item-1');
    expect(updatedItem0?.getAttribute('aria-selected')).toBe('false');
    expect(item1?.getAttribute('aria-selected')).toBe('true');

    // Scroll to item 50
    const container = host.querySelector('.inventory-tree-container') as HTMLDivElement;
    await act(async () => {
      container.scrollTop = 50 * 36;
      container.dispatchEvent(new Event('scroll'));
    });

    // Visible window should include item 50
    expect(host.textContent).toContain('Slice Item 50');
  });
});
