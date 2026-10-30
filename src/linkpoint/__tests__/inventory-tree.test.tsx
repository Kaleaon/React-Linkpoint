import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { app } from '../app';
import { InventoryTree } from '../../components/InventoryTree';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(props: any = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(ThemeProvider, null, createElement(InventoryTree, props)),
      ),
    );
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

describe('InventoryTree Accessibility & Single-Pointer Movement', () => {
  beforeEach(() => {
    // Set up test inventory state
    app.inventory.folders.clear();
    app.inventory.items.clear();

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

  it('renders ARIA tree container with role="tree"', async () => {
    const host = await mount();
    const tree = host.querySelector('[role="tree"]');
    expect(tree).not.toBeNull();
    expect(tree?.getAttribute('aria-label')).toBe('Inventory Tree');
  });

  it('renders nodes with role="treeitem", aria-expanded, aria-selected, and aria-labelledby', async () => {
    const host = await mount({ selectedId: 'folder-clothes' });
    const treeItems = host.querySelectorAll('[role="treeitem"]');
    expect(treeItems.length).toBeGreaterThan(0);

    const rootNode = host.querySelector('#inventory-node-root-id');
    expect(rootNode).not.toBeNull();

    // Root folder should have aria-expanded="true" (expanded by default)
    expect(rootNode?.getAttribute('aria-expanded')).toBe('true');

    // Label element ID check
    const labelId = rootNode?.getAttribute('aria-labelledby');
    expect(labelId).toBe('inventory-label-root-id');
    const labelEl = host.querySelector(`#${labelId}`);
    expect(labelEl?.textContent).toBe('My Inventory');

    // Selected node should have aria-selected="true"
    const clothesNode = host.querySelector('#inventory-node-folder-clothes');
    expect(clothesNode?.getAttribute('aria-selected')).toBe('true');
  });

  it('toggles aria-expanded when a folder expand button is clicked', async () => {
    const host = await mount();
    const clothesNode = host.querySelector('#inventory-node-folder-clothes');
    expect(clothesNode?.getAttribute('aria-expanded')).toBe('false');

    const expandBtn = clothesNode?.querySelector('button[aria-label="Expand Clothing"]');
    expect(expandBtn).not.toBeNull();

    await click(expandBtn);

    expect(clothesNode?.getAttribute('aria-expanded')).toBe('true');
    expect(host.textContent).toContain('Blue Shirt');
    expect(host.textContent).toContain('Black Pants');
  });

  it('provides single-pointer Move Up and Move Down buttons in context menu and updates order', async () => {
    const host = await mount();

    // Action button for Clothing folder
    const actionBtn = host.querySelector('button[aria-label="Actions for Clothing"]');
    expect(actionBtn).not.toBeNull();

    await click(actionBtn);

    // Context menu should show Move Up, Move Down, Move to Folder
    const menu = host.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();

    const moveDownBtn = buttonByText(host, 'Move Down');
    expect(moveDownBtn).not.toBeNull();

    // Click Move Down for Clothing
    await click(moveDownBtn);

    // Check rootFolder children order: Clothing ('folder-clothes') should now be after Objects ('folder-objects')
    const rootFolder = app.inventory.folders.get('root-id');
    expect(rootFolder.children).toEqual(['folder-objects', 'folder-clothes', 'item-note']);

    // Check status announcement region
    const statusRegion = host.querySelector('[role="status"]');
    expect(statusRegion?.textContent).toContain('Moved Clothing down');
  });

  it('provides single-pointer Move to Folder option and moves item to target folder', async () => {
    const host = await mount();

    // Open context menu for Welcome Notecard
    const actionBtn = host.querySelector('button[aria-label="Actions for Welcome Notecard"]');
    expect(actionBtn).not.toBeNull();
    await click(actionBtn);

    const moveToFolderBtn = buttonByText(host, 'Move to Folder');
    expect(moveToFolderBtn).not.toBeNull();
    await click(moveToFolderBtn);

    // Target Folder Dialog should open
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Select target folder for Welcome Notecard');

    const select = dialog?.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();

    // Select Objects folder as destination
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(select, 'folder-objects');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const confirmBtn = buttonByText(dialog as HTMLElement, 'Move to Folder');
    expect(confirmBtn).not.toBeNull();
    await click(confirmBtn);

    // Check item-note was moved into folder-objects
    const itemNote = app.inventory.items.get('item-note');
    expect(itemNote.parent).toBe('folder-objects');

    const objectsFolder = app.inventory.folders.get('folder-objects');
    expect(objectsFolder.children).toContain('item-note');

    const rootFolder = app.inventory.folders.get('root-id');
    expect(rootFolder.children).not.toContain('item-note');

    // Live region check
    const statusRegion = host.querySelector('[role="status"]');
    expect(statusRegion?.textContent).toContain('Moved Welcome Notecard to folder Objects');
  });

  it('applies theme tokens from ThemeProvider to InventoryTree container, rows, icons, and menus', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(
          AppProvider,
          null,
          createElement(
            ThemeProvider,
            null,
            createElement(InventoryTree, { rootFolderId: 'root-id', selectedId: 'folder-clothes' }),
          ),
        ),
      );
    });

    const container = host.querySelector('.inventory-tree-container') as HTMLElement;
    expect(container).not.toBeNull();
    expect(container.style.backgroundColor).toBeTruthy();

    const selectedRow = host.querySelector('#inventory-node-folder-clothes') as HTMLElement;
    expect(selectedRow).not.toBeNull();
    expect(selectedRow.style.backgroundColor).toBeTruthy();

    // Open context menu to check popover theme tokens
    const actionBtn = selectedRow.querySelector(
      'button[aria-label="Actions for Clothing"]',
    ) as HTMLButtonElement;
    expect(actionBtn).not.toBeNull();
    await click(actionBtn);

    const menu = host.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.style.backgroundColor).toBeTruthy();
    expect(menu.style.border).toBeTruthy();

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(host);
  });
});
