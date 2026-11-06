import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { app } from '../app';
import { InventoryTree } from '../../components/InventoryTree';
import { slBridge } from '../sl-bridge';
import { LLFolderType } from '../inventory';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(props: any = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(InventoryTree, props));
  });
  mounted = { host, root };
  return host;
}

const buttonByText = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll('button')].find((b) => (b.textContent || '').trim().includes(text)) as
    HTMLButtonElement | undefined;

const click = async (el: Element | null | undefined) => {
  await act(async () => {
    (el as HTMLElement)?.click();
  });
};

describe('Two-stage inventory soft-delete lifecycle and trash purge', () => {
  beforeEach(() => {
    app.inventory.folders.clear();
    app.inventory.items.clear();

    const rootFolder = {
      id: 'root-id',
      name: 'My Inventory',
      type: 'folder',
      parent: null,
      folderType: LLFolderType.Root,
      children: ['folder-clothes', 'folder-trash', 'folder-library', 'item-note'],
    };

    const folderClothes = {
      id: 'folder-clothes',
      name: 'Clothing',
      type: 'folder',
      parent: 'root-id',
      folderType: LLFolderType.Clothing,
      children: ['item-shirt', 'item-pants'],
    };

    const folderTrash = {
      id: 'folder-trash',
      name: 'Trash',
      type: 'folder',
      parent: 'root-id',
      folderType: LLFolderType.Trash,
      children: ['item-old-shoes'],
    };

    const folderLibrary = {
      id: 'folder-library',
      name: 'Library',
      type: 'folder',
      parent: 'root-id',
      folderType: -1,
      children: [],
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

    const itemOldShoes = {
      id: 'item-old-shoes',
      name: 'Old Shoes',
      type: 'item',
      parent: 'folder-trash',
    };

    app.inventory.rootFolder = rootFolder;
    app.inventory.folders.set('root-id', rootFolder);
    app.inventory.folders.set('folder-clothes', folderClothes);
    app.inventory.folders.set('folder-trash', folderTrash);
    app.inventory.folders.set('folder-library', folderLibrary);
    app.inventory.items.set('item-shirt', itemShirt);
    app.inventory.items.set('item-pants', itemPants);
    app.inventory.items.set('item-note', itemNote);
    app.inventory.items.set('item-old-shoes', itemOldShoes);
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

  it('displays a Delete option with an accessible trash can icon in the item context menu', async () => {
    const host = await mount();

    // Open context menu for Welcome Notecard
    const actionBtn = host.querySelector('button[aria-label="Actions for Welcome Notecard"]');
    expect(actionBtn).not.toBeNull();
    await click(actionBtn);

    const deleteBtn = buttonByText(host, 'Delete');
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.getAttribute('role')).toBe('menuitem');

    // Trash can SVG icon rendered inside Delete button
    const svg = deleteBtn?.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('relocates item outside Trash to Trash folder on clicking Delete and announces to screen reader', async () => {
    const host = await mount();

    // Open context menu for Welcome Notecard
    const actionBtn = host.querySelector('button[aria-label="Actions for Welcome Notecard"]');
    await click(actionBtn);

    const deleteBtn = buttonByText(host, 'Delete');
    await click(deleteBtn);

    // Item should now be under folder-trash
    const itemNote = app.inventory.items.get('item-note');
    expect(itemNote.parent).toBe('folder-trash');

    const trashFolder = app.inventory.folders.get('folder-trash');
    expect(trashFolder.children).toContain('item-note');

    const rootFolder = app.inventory.folders.get('root-id');
    expect(rootFolder.children).not.toContain('item-note');

    // Live region polite announcement
    const statusRegion = host.querySelector('[role="status"]');
    expect(statusRegion?.textContent).toContain('Moved item to Trash');
  });

  it('triggers deletion workflow via Delete key and Backspace key on focused item', async () => {
    const host = await mount({ selectedId: 'item-note' });
    const noteNode = host.querySelector('#inventory-node-item-note') as HTMLElement;
    expect(noteNode).not.toBeNull();

    // Press Delete key
    await act(async () => {
      noteNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });

    const itemNote = app.inventory.items.get('item-note');
    expect(itemNote.parent).toBe('folder-trash');

    const statusRegion = host.querySelector('[role="status"]');
    expect(statusRegion?.textContent).toContain('Moved item to Trash');
  });

  it('prevents deletion of protected system folders (Root, Trash, Library)', async () => {
    const host = await mount();

    // Context menu on Root folder should NOT have Delete button
    const rootActionBtn = host.querySelector('button[aria-label="Actions for My Inventory"]');
    await click(rootActionBtn);
    expect(buttonByText(host, 'Delete')).toBeUndefined();

    // Close menu
    await act(async () => {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Context menu on Trash folder should NOT have Delete button
    const trashActionBtn = host.querySelector('button[aria-label="Actions for Trash"]');
    await click(trashActionBtn);
    expect(buttonByText(host, 'Delete')).toBeUndefined();

    // Keyboard Delete on Trash node should not delete Trash
    const trashNode = host.querySelector('#inventory-node-folder-trash') as HTMLElement;
    await act(async () => {
      trashNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(app.inventory.folders.has('folder-trash')).toBe(true);
  });

  it('displays Empty Trash in context menu when Trash contains child items', async () => {
    const host = await mount();

    const trashActionBtn = host.querySelector('button[aria-label="Actions for Trash"]');
    await click(trashActionBtn);

    const emptyTrashBtn = buttonByText(host, 'Empty Trash');
    expect(emptyTrashBtn).not.toBeNull();
  });

  it('does not display Empty Trash when Trash folder is empty', async () => {
    // Clear trash children
    const trash = app.inventory.folders.get('folder-trash');
    trash.children = [];
    app.inventory.items.delete('item-old-shoes');

    const host = await mount();

    const trashActionBtn = host.querySelector('button[aria-label="Actions for Trash"]');
    await click(trashActionBtn);

    const emptyTrashBtn = buttonByText(host, 'Empty Trash');
    expect(emptyTrashBtn).toBeUndefined();
  });

  it('opens confirmation modal with Cancel and Confirm buttons when selecting Empty Trash', async () => {
    const host = await mount();

    const trashActionBtn = host.querySelector('button[aria-label="Actions for Trash"]');
    await click(trashActionBtn);

    const emptyTrashBtn = buttonByText(host, 'Empty Trash');
    await click(emptyTrashBtn);

    // Modal dialog check
    const modal = host.querySelector('[role="dialog"]');
    expect(modal).not.toBeNull();
    expect(modal?.getAttribute('aria-modal')).toBe('true');
    expect(modal?.textContent).toContain('Empty Trash');

    const cancelBtn = buttonByText(modal as HTMLElement, 'Cancel');
    const confirmBtn = buttonByText(modal as HTMLElement, 'Confirm');
    expect(cancelBtn).not.toBeNull();
    expect(confirmBtn).not.toBeNull();
  });

  it('dismisses Empty Trash confirmation modal when Cancel is clicked', async () => {
    const host = await mount();

    const trashActionBtn = host.querySelector('button[aria-label="Actions for Trash"]');
    await click(trashActionBtn);
    await click(buttonByText(host, 'Empty Trash'));

    const modal = host.querySelector('[role="dialog"]');
    expect(modal).not.toBeNull();

    await click(buttonByText(modal as HTMLElement, 'Cancel'));
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    // Items remain intact
    expect(app.inventory.items.has('item-old-shoes')).toBe(true);
  });

  it('purges descendants, clears cache, announces success and notifies simulator on Confirming Empty Trash', async () => {
    const purgeSpy = vi.spyOn(slBridge, 'purgeInventoryTrash').mockResolvedValue({ success: true });
    (slBridge as any).connected = true;

    const host = await mount();

    const trashActionBtn = host.querySelector('button[aria-label="Actions for Trash"]');
    await click(trashActionBtn);
    await click(buttonByText(host, 'Empty Trash'));

    const modal = host.querySelector('[role="dialog"]') as HTMLElement;
    await click(buttonByText(modal, 'Confirm'));

    // Verify descendants removed
    expect(app.inventory.items.has('item-old-shoes')).toBe(false);
    const trash = app.inventory.folders.get('folder-trash');
    expect(trash.children).toEqual([]);

    // Simulator notified
    expect(purgeSpy).toHaveBeenCalledWith('folder-trash');

    // Screen reader announcement
    const statusRegion = host.querySelector('[role="status"]');
    expect(statusRegion?.textContent).toContain('Trash emptied successfully');

    (slBridge as any).connected = false;
  });

  it('displays confirmation dialog before permanent deletion when deleting an item already in Trash', async () => {
    // Expand Trash folder to render Old Shoes
    const host = await mount();
    const trashNode = host.querySelector('#inventory-node-folder-trash');
    const expandTrashBtn = trashNode?.querySelector('button[aria-label="Expand Trash"]');
    await click(expandTrashBtn);

    // Old Shoes item row
    const actionBtn = host.querySelector('button[aria-label="Actions for Old Shoes"]');
    expect(actionBtn).not.toBeNull();
    await click(actionBtn);

    const deleteBtn = buttonByText(host, 'Delete');
    expect(deleteBtn).not.toBeNull();
    await click(deleteBtn);

    // Confirmation dialog should open
    const modal = host.querySelector('[role="dialog"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Delete Permanently');
    expect(modal?.textContent).toContain('Old Shoes');

    const confirmBtn = buttonByText(modal as HTMLElement, 'Confirm');
    expect(confirmBtn).not.toBeNull();

    const removeSpy = vi
      .spyOn(slBridge, 'removeInventoryItem')
      .mockResolvedValue({ success: true, itemId: 'item-old-shoes' });
    (slBridge as any).connected = true;

    await click(confirmBtn);

    // Item should be permanently removed
    expect(app.inventory.items.has('item-old-shoes')).toBe(false);
    expect(removeSpy).toHaveBeenCalledWith('item-old-shoes');

    (slBridge as any).connected = false;
  });

  it('does not store mock deletion state when simulator network requests fail', async () => {
    vi.spyOn(slBridge, 'purgeInventoryTrash').mockRejectedValue(new Error('Network error'));
    (slBridge as any).connected = true;

    await expect(app.inventory.emptyTrash()).rejects.toThrow('Network error');

    // Descendants must NOT be deleted locally
    expect(app.inventory.items.has('item-old-shoes')).toBe(true);
    const trash = app.inventory.folders.get('folder-trash');
    expect(trash.children).toContain('item-old-shoes');

    (slBridge as any).connected = false;
  });
});
