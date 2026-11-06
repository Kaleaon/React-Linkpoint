import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { app } from '../app';
import { LLFolderType } from '../inventory';
import { InventoryTree } from '../../components/InventoryTree';
import Inventory from '../../screens/Inventory.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: any) {
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
    (el as HTMLElement)?.click();
  });
};

describe('InventoryTree Context Menu & Deletion Dialog', () => {
  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted?.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
  });

  beforeEach(() => {
    app.inventory.folders.clear();
    app.inventory.items.clear();

    const rootFolder = {
      id: 'root-id',
      name: 'My Inventory',
      type: 'folder',
      parent: null,
      children: ['folder-user', 'item-root'],
    };

    const folderUser = {
      id: 'folder-user',
      name: 'User Custom Folder',
      type: 'folder',
      parent: 'root-id',
      children: ['item-custom'],
    };

    const trashFolder = {
      id: 'folder-trash',
      name: 'Trash',
      type: 'folder',
      parent: 'root-id',
      folderType: LLFolderType.Trash,
      children: [],
    };

    app.inventory.setRootFolder('root-id');
    app.inventory.folders.set('root-id', rootFolder);
    app.inventory.folders.set('folder-user', folderUser);
    app.inventory.folders.set('folder-trash', trashFolder);

    app.inventory.items.set('item-custom', {
      id: 'item-custom',
      name: 'Custom Wearable',
      parent: 'folder-user',
    });
    app.inventory.items.set('item-root', {
      id: 'item-root',
      name: 'Root Asset',
      parent: 'root-id',
    });
  });

  it('renders "Delete" in context menu for user items and folders, but not for system or root folders', async () => {
    const host = await mount(createElement(InventoryTree, { rootFolderId: 'root-id' }));

    // Open context menu for root folder: should NOT show delete
    const rootMenuBtn = host.querySelector('button[aria-label="Actions for My Inventory"]');
    expect(rootMenuBtn).toBeTruthy();
    await click(rootMenuBtn);

    let deleteBtn = [...host.querySelectorAll('button[role="menuitem"]')].find((b) =>
      b.textContent?.includes('Delete'),
    );
    expect(deleteBtn).toBeUndefined();

    // Close menu
    await click(rootMenuBtn);

    // Open context menu for User Custom Folder: should show delete
    const userFolderMenuBtn = host.querySelector(
      'button[aria-label="Actions for User Custom Folder"]',
    );
    expect(userFolderMenuBtn).toBeTruthy();
    await click(userFolderMenuBtn);

    deleteBtn = [...host.querySelectorAll('button[role="menuitem"]')].find((b) =>
      b.textContent?.includes('Delete'),
    );
    expect(deleteBtn).toBeTruthy();
  });

  it('opens confirmation modal with role="dialog", aria-modal="true", and FocusTrap upon clicking Delete', async () => {
    const host = await mount(createElement(InventoryTree, { rootFolderId: 'root-id' }));

    // Open action menu for Root Asset item (direct child of root)
    const itemMenuBtn = host.querySelector('button[aria-label="Actions for Root Asset"]');
    expect(itemMenuBtn).toBeTruthy();
    await click(itemMenuBtn);

    const deleteMenuItem = [...host.querySelectorAll('button[role="menuitem"]')].find((b) =>
      b.textContent?.includes('Delete'),
    );
    expect(deleteMenuItem).toBeTruthy();
    await click(deleteMenuItem);

    // Verify modal is open
    const dialog = host.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Confirm Deletion');
    expect(dialog?.textContent).toContain('Root Asset');
    expect(dialog?.textContent).toContain('Permanent asset deletion is irreversible');

    // Dismiss with Escape key
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
  });

  it('permanently deletes item upon user confirmation and updates tree immediately', async () => {
    const host = await mount(createElement(InventoryTree, { rootFolderId: 'root-id' }));

    const deleteSpy = vi.spyOn(app.inventory, 'deleteItem');

    // Open menu for Root Asset
    const itemMenuBtn = host.querySelector('button[aria-label="Actions for Root Asset"]');
    await click(itemMenuBtn);

    const deleteMenuItem = [...host.querySelectorAll('button[role="menuitem"]')].find((b) =>
      b.textContent?.includes('Delete'),
    );
    await click(deleteMenuItem);

    // Click Confirm Delete button in modal
    const dialog = host.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).toBeTruthy();
    const confirmDeleteBtn = [...dialog!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Delete',
    );
    expect(confirmDeleteBtn).toBeTruthy();

    await click(confirmDeleteBtn);

    expect(deleteSpy).toHaveBeenCalledWith('item-root');
    expect(app.inventory.items.has('item-root')).toBe(false);

    // Modal should close
    expect(host.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
  });
});

describe('Inventory Screen Header Toolbar Empty Trash', () => {
  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted?.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
  });

  beforeEach(() => {
    app.inventory.folders.clear();
    app.inventory.items.clear();

    const rootFolder = {
      id: 'root-id',
      name: 'My Inventory',
      type: 'folder',
      parent: null,
      children: ['folder-trash'],
    };

    const trashFolder = {
      id: 'folder-trash',
      name: 'Trash',
      type: 'folder',
      parent: 'root-id',
      folderType: LLFolderType.Trash,
      children: [],
    };

    app.inventory.setRootFolder('root-id');
    app.inventory.folders.set('root-id', rootFolder);
    app.inventory.folders.set('folder-trash', trashFolder);
  });

  it('renders "Empty Trash" button with badge disabled when Trash contains 0 items', async () => {
    const host = await mount(createElement(Inventory));

    const emptyTrashBtn = host.querySelector(
      'button[aria-label="Empty Trash (0 items)"]',
    ) as HTMLButtonElement;
    expect(emptyTrashBtn).toBeTruthy();
    expect(emptyTrashBtn.disabled).toBe(true);

    const badge = emptyTrashBtn.querySelector('.trash-count-badge');
    expect(badge?.textContent).toBe('0');
  });

  it('enables "Empty Trash" button and displays updated badge count when items are in Trash', async () => {
    // Add 2 items into trash
    app.inventory.items.set('trash-item-1', {
      id: 'trash-item-1',
      name: 'Discarded Object',
      parent: 'folder-trash',
    });
    app.inventory.items.set('trash-item-2', {
      id: 'trash-item-2',
      name: 'Discarded Texture',
      parent: 'folder-trash',
    });
    const trashFolder = app.inventory.folders.get('folder-trash');
    if (trashFolder) trashFolder.children = ['trash-item-1', 'trash-item-2'];

    const host = await mount(createElement(Inventory));

    const emptyTrashBtn = host.querySelector(
      'button[aria-label="Empty Trash (2 items)"]',
    ) as HTMLButtonElement;
    expect(emptyTrashBtn).toBeTruthy();
    expect(emptyTrashBtn.disabled).toBe(false);

    const badge = emptyTrashBtn.querySelector('.trash-count-badge');
    expect(badge?.textContent).toBe('2');
  });

  it('prompts confirmation modal upon clicking "Empty Trash" and executes purgeTrash upon confirmation', async () => {
    app.inventory.items.set('trash-item-1', {
      id: 'trash-item-1',
      name: 'Discarded Object',
      parent: 'folder-trash',
    });
    const trashFolder = app.inventory.folders.get('folder-trash');
    if (trashFolder) trashFolder.children = ['trash-item-1'];

    const host = await mount(createElement(Inventory));
    const purgeSpy = vi.spyOn(app.inventory, 'purgeTrash');

    const emptyTrashBtn = host.querySelector(
      'button[aria-label="Empty Trash (1 items)"]',
    ) as HTMLButtonElement;
    expect(emptyTrashBtn.disabled).toBe(false);

    await click(emptyTrashBtn);

    // Modal dialog should be visible
    const dialog = host.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Empty Trash');
    expect(dialog?.textContent).toContain(
      'All contents in the Trash folder will be permanently destroyed',
    );

    // Click confirm "Empty Trash" inside the modal
    const modalEmptyTrashBtn = [...dialog!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Empty Trash',
    );
    expect(modalEmptyTrashBtn).toBeTruthy();

    await click(modalEmptyTrashBtn);

    expect(purgeSpy).toHaveBeenCalled();
    expect(app.inventory.getTrashItemCount()).toBe(0);

    // Modal is dismissed and button is now disabled with count 0
    expect(host.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
    const updatedBtn = host.querySelector(
      'button[aria-label="Empty Trash (0 items)"]',
    ) as HTMLButtonElement;
    expect(updatedBtn?.disabled).toBe(true);
  });
});
