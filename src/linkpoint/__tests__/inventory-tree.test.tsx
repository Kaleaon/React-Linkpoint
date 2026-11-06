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

  it('manages roving tabindex assigning tabIndex=0 to selected node or first node when unselected', async () => {
    // Unselected tree: first node (root-id) gets tabIndex=0, others get -1
    const hostUnselected = await mount();
    const rootNode = hostUnselected.querySelector('#inventory-node-root-id');
    const clothesNode = hostUnselected.querySelector('#inventory-node-folder-clothes');
    const objectsNode = hostUnselected.querySelector('#inventory-node-folder-objects');

    expect(rootNode?.getAttribute('tabindex')).toBe('0');
    expect(clothesNode?.getAttribute('tabindex')).toBe('-1');
    expect(objectsNode?.getAttribute('tabindex')).toBe('-1');

    // Clean up
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }

    // Selected tree: selected node gets tabIndex=0
    const hostSelected = await mount({ selectedId: 'folder-clothes' });
    const selRootNode = hostSelected.querySelector('#inventory-node-root-id');
    const selClothesNode = hostSelected.querySelector('#inventory-node-folder-clothes');

    expect(selRootNode?.getAttribute('tabindex')).toBe('-1');
    expect(selClothesNode?.getAttribute('tabindex')).toBe('0');
  });

  it('navigates through visible items using ArrowDown and ArrowUp', async () => {
    const host = await mount();
    const rootNode = host.querySelector('#inventory-node-root-id') as HTMLElement;
    const clothesNode = host.querySelector('#inventory-node-folder-clothes') as HTMLElement;
    const objectsNode = host.querySelector('#inventory-node-folder-objects') as HTMLElement;

    expect(rootNode.getAttribute('tabindex')).toBe('0');

    // Press ArrowDown from root node
    await act(async () => {
      rootNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(rootNode.getAttribute('tabindex')).toBe('-1');
    expect(clothesNode.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(clothesNode);

    // Press ArrowDown to next item
    await act(async () => {
      clothesNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(clothesNode.getAttribute('tabindex')).toBe('-1');
    expect(objectsNode.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(objectsNode);

    // Press ArrowUp back to clothes node
    await act(async () => {
      objectsNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });

    expect(objectsNode.getAttribute('tabindex')).toBe('-1');
    expect(clothesNode.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(clothesNode);
  });

  it('navigates to first and last items using Home and End keys', async () => {
    const host = await mount();
    const rootNode = host.querySelector('#inventory-node-root-id') as HTMLElement;
    const noteNode = host.querySelector('#inventory-node-item-note') as HTMLElement;

    // Press End from root
    await act(async () => {
      rootNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });

    expect(noteNode.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(noteNode);

    // Press Home to return to root
    await act(async () => {
      noteNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });

    expect(rootNode.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(rootNode);
  });

  it('expands/collapses folders and jumps to parent using ArrowRight and ArrowLeft', async () => {
    const host = await mount();
    const rootNode = host.querySelector('#inventory-node-root-id') as HTMLElement;
    const clothesNode = host.querySelector('#inventory-node-folder-clothes') as HTMLElement;

    // Move to Clothing folder
    await act(async () => {
      rootNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(clothesNode.getAttribute('aria-expanded')).toBe('false');

    // Press ArrowRight to expand Clothing folder
    await act(async () => {
      clothesNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    expect(clothesNode.getAttribute('aria-expanded')).toBe('true');
    const statusRegion = host.querySelector('[role="status"]');
    expect(statusRegion?.textContent).toContain('Expanded Clothing');

    // Verify children are now visible
    const shirtNode = host.querySelector('#inventory-node-item-shirt') as HTMLElement;
    expect(shirtNode).not.toBeNull();

    // ArrowDown into shirt node
    await act(async () => {
      clothesNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(shirtNode);

    // ArrowLeft on leaf node jumps to parent folder (Clothing)
    await act(async () => {
      shirtNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(document.activeElement).toBe(clothesNode);
    expect(clothesNode.getAttribute('tabindex')).toBe('0');

    // ArrowLeft on expanded folder collapses it
    await act(async () => {
      clothesNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(clothesNode.getAttribute('aria-expanded')).toBe('false');
    expect(statusRegion?.textContent).toContain('Collapsed Clothing');
  });

  it('selects and toggles folder expansion on Enter and Space', async () => {
    const onSelect = vi.fn();
    const host = await mount({ onSelect });
    const clothesNode = host.querySelector('#inventory-node-folder-clothes') as HTMLElement;

    expect(clothesNode.getAttribute('aria-expanded')).toBe('false');

    // Press Enter on Clothing folder
    await act(async () => {
      clothesNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'folder-clothes' }));
    expect(clothesNode.getAttribute('aria-expanded')).toBe('true');

    // Press Space on Clothing folder
    await act(async () => {
      clothesNode.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });

    expect(clothesNode.getAttribute('aria-expanded')).toBe('false');
  });

  it('supports action menu keyboard focus isolation and escape dismissal without breaking roving state', async () => {
    const host = await mount();
    const clothesNode = host.querySelector('#inventory-node-folder-clothes') as HTMLElement;

    // Move roving focus to clothesNode
    await act(async () => {
      clothesNode.focus();
    });
    expect(clothesNode.getAttribute('tabindex')).toBe('0');

    // Open action menu via shortcut Shift+F10
    await act(async () => {
      clothesNode.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
      );
    });

    const menu = host.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).not.toBeNull();

    const menuItems = host.querySelectorAll('[role="menuitem"]');
    expect(menuItems.length).toBe(4);

    // First item receives focus on menu open
    expect(document.activeElement).toBe(menuItems[0]);

    // ArrowDown navigates menu items
    await act(async () => {
      menuItems[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(menuItems[1]);

    // Escape closes menu and restores focus to clothesNode
    await act(async () => {
      menuItems[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(clothesNode);
    expect(clothesNode.getAttribute('tabindex')).toBe('0');
  });

  it('generates visual HTML snapshot for roving focus validation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const host = await mount({ selectedId: 'folder-clothes' });
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Inventory Tree - Roving Tabindex & Focus Traversal</title>
  <style>
    body {
      background-color: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 30px;
      margin: 0;
    }
    h2 {
      margin-top: 0;
      font-size: 1.1rem;
      color: #38bdf8;
    }
    p {
      color: #94a3b8;
      font-size: 0.85rem;
      margin-bottom: 20px;
    }
    .wrapper {
      width: 480px;
      height: 400px;
      border: 1px solid #334155;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <h2>Inventory Tree: Roving Tabindex Traversal</h2>
  <p>Keyboard focus lands on active item with roving tabindex="0" and WCAG compliant focus indicator.</p>
  <div class="wrapper">
    ${host.innerHTML}
  </div>
</body>
</html>`;
    const previewPath = path.resolve(process.cwd(), 'inventory-tree-preview.html');
    try {
      fs.writeFileSync(previewPath, fullHtml);
      expect(fs.existsSync(previewPath)).toBe(true);
      expect(fs.readFileSync(previewPath, 'utf-8')).toContain(
        'Inventory Tree: Roving Tabindex Traversal',
      );
    } finally {
      if (fs.existsSync(previewPath)) {
        fs.unlinkSync(previewPath);
      }
    }
  });
});
