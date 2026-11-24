// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FolderType } from '@caspertech/node-metaverse';
import { PacketFlags } from '@caspertech/node-metaverse/dist/lib/enums/PacketFlags';
import Inventory, { INVENTORY_VIEW_MODE_KEY } from '../../screens/Inventory.jsx';
import { InventoryTree } from '../../components/InventoryTree';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import Toast from '../../components/Toast.jsx';
import { app } from '../app';
import { slBridge } from '../sl-bridge';
import { LLFolderType } from '../inventory';
import { localCache } from '../local-cache';

const require = createRequire(import.meta.url);
const { METHODS, callViewer } = require('../../../core/viewer-api.cjs');
const { ViewerSession } = require('../../../core/viewer-session.cjs');

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mountInventoryScreen() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider as any,
        null,
        createElement(ThemeProvider as any, null, createElement(Inventory), createElement(Toast)),
      ),
    );
  });
  mounted = { host, root };
  return host;
}

async function mountStandaloneTree(props: any = {}) {
  const host = document.createElement('div');
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

const changeInput = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const changeSelect = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value',
    )?.set;
    if (setter) {
      setter.call(select, value);
    } else {
      select.value = value;
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const buttonByText = (container: ParentNode, text: string) =>
  Array.from(container.querySelectorAll('button')).find(
    (b) => (b.textContent || '').trim() === text || (b.textContent || '').trim().includes(text),
  ) as HTMLButtonElement | undefined;

describe('Modal Dialog Folder Creation via Context Menu and Header Toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    app.inventory.folders.clear();
    app.inventory.items.clear();
    app.inventory.isLoading = false;
    (slBridge as any).connected = false;

    const rootFolder = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'My Inventory',
      type: 'folder',
      parent: null,
      folderType: LLFolderType.Root,
      children: [
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555555',
        'item-note',
      ],
    };

    const folderClothes = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Clothing',
      type: 'folder',
      parent: rootFolder.id,
      folderType: LLFolderType.Clothing,
      children: ['item-shirt'],
    };

    const folderObjects = {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Objects',
      type: 'folder',
      parent: rootFolder.id,
      folderType: LLFolderType.Object,
      children: [],
    };

    const folderTrash = {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Trash',
      type: 'folder',
      parent: rootFolder.id,
      folderType: LLFolderType.Trash,
      children: ['66666666-6666-4666-8666-666666666666'],
    };

    const folderInTrash = {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Discarded Folder',
      type: 'folder',
      parent: folderTrash.id,
      folderType: LLFolderType.None,
      children: [],
    };

    const folderLibrary = {
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Library',
      type: 'folder',
      parent: rootFolder.id,
      folderType: LLFolderType.None,
      children: [],
    };

    const itemShirt = {
      id: 'item-shirt',
      name: 'Blue Shirt',
      type: 'item',
      assetType: 5,
      parent: folderClothes.id,
    };

    const itemNote = {
      id: 'item-note',
      name: 'Welcome Notecard',
      type: 'item',
      assetType: 7,
      parent: rootFolder.id,
    };

    app.inventory.rootFolder = rootFolder;
    app.inventory.folders.set(rootFolder.id, rootFolder);
    app.inventory.folders.set(folderClothes.id, folderClothes);
    app.inventory.folders.set(folderObjects.id, folderObjects);
    app.inventory.folders.set(folderTrash.id, folderTrash);
    app.inventory.folders.set(folderInTrash.id, folderInTrash);
    app.inventory.folders.set(folderLibrary.id, folderLibrary);
    app.inventory.items.set(itemShirt.id, itemShirt);
    app.inventory.items.set(itemNote.id, itemNote);
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
    (slBridge as any).connected = false;
    vi.restoreAllMocks();
  });

  describe('Context Menu & Primary User Journey', () => {
    it('Requirement 1 & Criterion 1: offers New Folder action via both action button and right-click on non-trash writable folders, and omits it on Trash, Library, and items', async () => {
      const host = await mountStandaloneTree();

      // 1. Tap more actions button on Clothing -> displays New Folder
      const clothesActionBtn = host.querySelector('button[aria-label="Actions for Clothing"]');
      await click(clothesActionBtn);
      let menu = host.querySelector('[role="menu"]') as HTMLElement;
      expect(menu).toBeTruthy();
      expect(buttonByText(menu, 'New Folder')).toBeTruthy();

      // Close menu
      await click(clothesActionBtn);
      expect(host.querySelector('[role="menu"]')).toBeNull();

      // 2. Right-click (contextmenu) on Objects folder -> displays New Folder
      const objectsRow = host.querySelector(
        '#inventory-node-33333333-3333-4333-8333-333333333333',
      ) as HTMLElement;
      await act(async () => {
        objectsRow.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
        );
      });
      menu = host.querySelector('[role="menu"]') as HTMLElement;
      expect(menu).toBeTruthy();
      expect(menu.getAttribute('aria-label')).toBe('Actions menu for Objects');
      expect(buttonByText(menu, 'New Folder')).toBeTruthy();

      // Close menu
      await act(async () => {
        objectsRow.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
        );
      });

      // 3. Trash folder must NOT display New Folder
      const trashActionBtn = host.querySelector('button[aria-label="Actions for Trash"]');
      await click(trashActionBtn);
      menu = host.querySelector('[role="menu"]') as HTMLElement;
      expect(buttonByText(menu, 'New Folder')).toBeUndefined();
      await click(trashActionBtn);

      // 4. Subfolder inside Trash must NOT display New Folder
      const expandTrashBtn = host.querySelector('button[aria-label="Expand Trash"]');
      await click(expandTrashBtn);
      const inTrashActionBtn = host.querySelector(
        'button[aria-label="Actions for Discarded Folder"]',
      );
      await click(inTrashActionBtn);
      menu = host.querySelector('[role="menu"]') as HTMLElement;
      expect(buttonByText(menu, 'New Folder')).toBeUndefined();
      await click(inTrashActionBtn);

      // 5. Library folder must NOT display New Folder
      const libraryActionBtn = host.querySelector('button[aria-label="Actions for Library"]');
      await click(libraryActionBtn);
      menu = host.querySelector('[role="menu"]') as HTMLElement;
      expect(buttonByText(menu, 'New Folder')).toBeUndefined();
      await click(libraryActionBtn);

      // 6. Regular item must NOT display New Folder
      const noteActionBtn = host.querySelector('button[aria-label="Actions for Welcome Notecard"]');
      await click(noteActionBtn);
      menu = host.querySelector('[role="menu"]') as HTMLElement;
      expect(buttonByText(menu, 'New Folder')).toBeUndefined();
      await click(noteActionBtn);

      // 7. Snapshots folder (LLFolderType.Snapshot = 14) MUST allow New Folder
      const folderSnapshots = {
        id: '88888888-8888-4888-8888-888888888888',
        name: 'Snapshots',
        type: 'folder',
        parent: '11111111-1111-4111-8111-111111111111',
        folderType: LLFolderType.Snapshot,
        children: [],
      };
      expect(app.inventory.canCreateFolderIn(folderSnapshots)).toBe(true);
    });

    it('Scenario 1 & Criteria 2, 4: context menu opens modal with focus on input, creates Summer Outfits, expands Clothing, and reconciles local cache', async () => {
      const saveCacheSpy = vi.spyOn(localCache, 'saveInventory').mockResolvedValue();
      const createRpcSpy = vi.spyOn(slBridge, 'createInventoryFolder').mockResolvedValue({
        success: true,
        folderId: '77777777-7777-4777-8777-777777777777',
        parentId: '22222222-2222-4222-8222-222222222222',
        name: 'Summer Outfits',
      });
      (slBridge as any).connected = true;

      const host = await mountInventoryScreen();

      // Clothing is initially collapsed
      const clothesNode = host.querySelector(
        '#inventory-node-22222222-2222-4222-8222-222222222222',
      ) as HTMLElement;
      expect(clothesNode.getAttribute('aria-expanded')).toBe('false');

      // Open Clothing context menu and click New Folder
      await click(host.querySelector('button[aria-label="Actions for Clothing"]'));
      const newFolderItem = buttonByText(host.querySelector('[role="menu"]')!, 'New Folder');
      expect(newFolderItem).toBeTruthy();
      await click(newFolderItem);

      // Modal opens with focus on folder name input field
      const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      const nameInput = dialog.querySelector('#new-folder-name-input') as HTMLInputElement;
      expect(nameInput).toBeTruthy();
      expect(document.activeElement).toBe(nameInput);

      // Destination defaults to Clothing
      const destSelect = dialog.querySelector(
        '#new-folder-destination-select',
      ) as HTMLSelectElement;
      expect(destSelect.value).toBe('22222222-2222-4222-8222-222222222222');

      // Protected folders (Trash, Discarded Folder, Library) are excluded from destination selector
      const optionValues = Array.from(destSelect.options).map((o) => o.value);
      expect(optionValues).not.toContain('44444444-4444-4444-8444-444444444444');
      expect(optionValues).not.toContain('66666666-6666-4666-8666-666666666666');
      expect(optionValues).not.toContain('55555555-5555-4555-8555-555555555555');

      // Type "Summer Outfits" and submit
      await changeInput(nameInput, 'Summer Outfits');
      const submitBtn = buttonByText(dialog, 'Create Folder')!;
      expect(submitBtn.disabled).toBe(false);
      await click(submitBtn);

      // Modal closes
      expect(host.querySelector('[role="dialog"]')).toBeNull();

      // RPC invoked with Clothing parentId and Summer Outfits name
      expect(createRpcSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: '22222222-2222-4222-8222-222222222222',
          name: 'Summer Outfits',
        }),
      );

      // Clothing expands and Summer Outfits appears in Tree View
      const updatedClothesNode = host.querySelector(
        '#inventory-node-22222222-2222-4222-8222-222222222222',
      );
      expect(updatedClothesNode?.getAttribute('aria-expanded')).toBe('true');
      const newSubfolderNode = host.querySelector(
        '#inventory-node-77777777-7777-4777-8777-777777777777',
      );
      expect(newSubfolderNode).toBeTruthy();
      expect(newSubfolderNode?.textContent).toContain('Summer Outfits');

      // Reconciled into store and persisted to cache
      expect(app.inventory.folders.get('77777777-7777-4777-8777-777777777777')?.name).toBe(
        'Summer Outfits',
      );
      expect(app.inventory.folders.get('22222222-2222-4222-8222-222222222222')?.children).toContain(
        '77777777-7777-4777-8777-777777777777',
      );
      expect(saveCacheSpy).toHaveBeenCalled();

      // Switch to Flat Table view: Summer Outfits immediately appears in Flat Table as well
      await click(host.querySelector('button[aria-label="Flat Table"]'));
      const flatRows = Array.from(host.querySelectorAll('.live-list .inventory-button')).map((r) =>
        r.textContent?.trim(),
      );
      expect(flatRows).toContain('Summer Outfits');
    });
  });

  describe('Header Toolbar Journey & Destination Selection', () => {
    it('Scenario 2 & Requirement 2: toolbar New Folder button defaults destination to selected folder, allows changing target, creates folder, and selects it', async () => {
      const host = await mountInventoryScreen();

      const toolbarNewFolderBtn = host.querySelector(
        'button[aria-label="New Folder"]',
      ) as HTMLButtonElement;
      expect(toolbarNewFolderBtn).toBeTruthy();

      // Select Clothing folder first
      const clothesNode = host.querySelector(
        '#inventory-node-22222222-2222-4222-8222-222222222222',
      );
      await click(clothesNode);

      // Click New Folder in toolbar -> destination defaults to Clothing
      await click(toolbarNewFolderBtn);
      const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      const destSelect = dialog.querySelector(
        '#new-folder-destination-select',
      ) as HTMLSelectElement;
      expect(destSelect.value).toBe('22222222-2222-4222-8222-222222222222');

      // User changes destination to Objects folder
      await changeSelect(destSelect, '33333333-3333-4333-8333-333333333333');
      expect(destSelect.value).toBe('33333333-3333-4333-8333-333333333333');

      const nameInput = dialog.querySelector('#new-folder-name-input') as HTMLInputElement;
      await changeInput(nameInput, 'Gadgets');
      await click(buttonByText(dialog, 'Create Folder'));

      // Objects folder expands, Gadgets is created under Objects and selected in tree & inspector
      const objectsNode = host.querySelector(
        '#inventory-node-33333333-3333-4333-8333-333333333333',
      );
      expect(objectsNode?.getAttribute('aria-expanded')).toBe('true');

      const createdEntry = Array.from(app.inventory.folders.values()).find(
        (f) => f.name === 'Gadgets',
      );
      expect(createdEntry).toBeTruthy();
      expect(createdEntry?.parent).toBe('33333333-3333-4333-8333-333333333333');

      const createdNode = host.querySelector(`#inventory-node-${createdEntry!.id}`);
      expect(createdNode?.getAttribute('aria-selected')).toBe('true');
      expect(host.querySelector('aside.record-detail')?.textContent).toContain('Gadgets');
    });

    it('creates folder directly while in Flat Table mode and shows it immediately', async () => {
      localStorage.setItem(INVENTORY_VIEW_MODE_KEY, 'flat');
      const host = await mountInventoryScreen();

      await click(host.querySelector('button[aria-label="New Folder"]'));
      const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      const nameInput = dialog.querySelector('#new-folder-name-input') as HTMLInputElement;
      await changeInput(nameInput, 'Landmarks Archive');
      await click(buttonByText(dialog, 'Create Folder'));

      const flatRows = Array.from(host.querySelectorAll('.live-list .inventory-button')).map((r) =>
        r.textContent?.trim(),
      );
      expect(flatRows).toContain('Landmarks Archive');
    });
  });

  describe('Accessibility, Validation, Touch Targets & Dismissal', () => {
    it('Constraint 2 & Criterion 6: disables Create Folder for empty, whitespace-only, or >63 character names and blocks network calls', async () => {
      const rpcSpy = vi.spyOn(slBridge, 'createInventoryFolder');
      (slBridge as any).connected = true;

      const host = await mountInventoryScreen();
      await click(host.querySelector('button[aria-label="New Folder"]'));

      const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      const nameInput = dialog.querySelector('#new-folder-name-input') as HTMLInputElement;
      const submitBtn = buttonByText(dialog, 'Create Folder')!;
      const form = dialog.querySelector('form')!;

      // Initially empty -> disabled
      expect(submitBtn.disabled).toBe(true);

      // Whitespace-only -> disabled and prevents form submit
      await changeInput(nameInput, '     ');
      expect(submitBtn.disabled).toBe(true);
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(rpcSpy).not.toHaveBeenCalled();

      // > 63 characters -> disabled and shows error
      await changeInput(nameInput, 'x'.repeat(64));
      expect(submitBtn.disabled).toBe(true);
      expect(dialog.textContent).toContain('63 characters');
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(rpcSpy).not.toHaveBeenCalled();

      // Exactly 63 characters -> valid and enabled
      await changeInput(nameInput, 'a'.repeat(63));
      expect(submitBtn.disabled).toBe(false);
    });

    it('Constraint 3 & Criterion 5: traps keyboard Tab focus and dismisses on Escape or Cancel without creating a folder', async () => {
      const rpcSpy = vi.spyOn(slBridge, 'createInventoryFolder');
      (slBridge as any).connected = true;
      const initialFolderCount = app.inventory.folders.size;

      const host = await mountInventoryScreen();
      await click(host.querySelector('button[aria-label="New Folder"]'));

      let dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog).toBeTruthy();

      const nameInput = dialog.querySelector('#new-folder-name-input') as HTMLInputElement;
      await changeInput(nameInput, 'Temp Name');

      // Focus trap wraps Tab from last focusable element back to first focusable element
      const submitBtn = buttonByText(dialog, 'Create Folder')!;
      submitBtn.focus();
      expect(document.activeElement).toBe(submitBtn);
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      });
      const closeBtn = dialog.querySelector('button[aria-label="Close dialog"]');
      expect(document.activeElement).toBe(closeBtn);

      // Escape dismisses modal without creating folder
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      expect(app.inventory.folders.size).toBe(initialFolderCount);
      expect(rpcSpy).not.toHaveBeenCalled();

      // Reopen and click Cancel -> dismisses without creating folder
      await click(host.querySelector('button[aria-label="New Folder"]'));
      dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      await changeInput(
        dialog.querySelector('#new-folder-name-input') as HTMLInputElement,
        'Cancelled Folder',
      );
      await click(buttonByText(dialog, 'Cancel'));
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      expect(app.inventory.folders.size).toBe(initialFolderCount);
      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it('Constraint 4: interactive toolbar, context menu, and modal buttons enforce minimum 44x44px touch targets', async () => {
      const host = await mountInventoryScreen();

      const toolbarBtn = host.querySelector('button[aria-label="New Folder"]') as HTMLButtonElement;
      expect(parseInt(toolbarBtn.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(toolbarBtn.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);

      // Context menu New Folder button
      await click(host.querySelector('button[aria-label="Actions for Clothing"]'));
      const menuBtn = buttonByText(host.querySelector('[role="menu"]')!, 'New Folder')!;
      expect(parseInt(menuBtn.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(menuBtn.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);

      await click(menuBtn);
      const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      const closeBtn = dialog.querySelector(
        'button[aria-label="Close dialog"]',
      ) as HTMLButtonElement;
      const cancelBtn = buttonByText(dialog, 'Cancel')!;
      const createBtn = buttonByText(dialog, 'Create Folder')!;

      for (const btn of [closeBtn, cancelBtn, createBtn]) {
        expect(parseInt(btn.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
        expect(parseInt(btn.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);
      }
    });
  });

  describe('Optimistic Insertion & Rollback on Network Failure', () => {
    it('Scenario 3, Requirement 8 & Criterion 7: shows optimistic folder immediately, reverts on RPC rejection, and displays alert notification', async () => {
      let rejectRpc!: (err: Error) => void;
      vi.spyOn(slBridge, 'createInventoryFolder').mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectRpc = reject;
          }),
      );
      (slBridge as any).connected = true;

      const host = await mountInventoryScreen();

      // Open modal from Clothing context menu
      await click(host.querySelector('button[aria-label="Actions for Clothing"]'));
      await click(buttonByText(host.querySelector('[role="menu"]')!, 'New Folder'));

      const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
      await changeInput(
        dialog.querySelector('#new-folder-name-input') as HTMLInputElement,
        'Volatile Subfolder',
      );
      await click(buttonByText(dialog, 'Create Folder'));

      // While network request is in flight, optimistic folder IS visible in tree and store
      expect(host.textContent).toContain('Volatile Subfolder');
      expect(
        Array.from(app.inventory.folders.values()).some((f) => f.name === 'Volatile Subfolder'),
      ).toBe(true);

      // Simulator rejects / times out
      await act(async () => {
        rejectRpc(new Error('Circuit ack timeout'));
      });

      // Optimistic folder is completely removed from store, parent children, and DOM
      expect(
        Array.from(app.inventory.folders.values()).some((f) => f.name === 'Volatile Subfolder'),
      ).toBe(false);
      expect(app.inventory.folders.get('22222222-2222-4222-8222-222222222222')?.children).toEqual([
        'item-shirt',
      ]);
      expect(host.textContent).not.toContain('Volatile Subfolder');

      // Alert notification displayed to user
      const alertBanner = host.querySelector('[role="alert"]');
      expect(alertBanner).toBeTruthy();
      expect(alertBanner?.textContent).toContain('Failed to create folder: Circuit ack timeout');
    });
  });

  describe('Backend RPC Allowlist & ViewerSession Packet Construction', () => {
    it('Requirement 5 & 6, Criterion 3: permits createInventoryFolder in viewer-api and dispatches reliable CreateInventoryFolderMessage packet', async () => {
      expect(METHODS.has('createInventoryFolder')).toBe(true);

      const session = new ViewerSession(() => undefined);
      const sendMessage = vi.fn(() => 42);
      const waitForAck = vi.fn(async () => true);

      const clothingFolder = {
        folderID: '22222222-2222-4222-8222-222222222222',
        parentID: '11111111-1111-4111-8111-111111111111',
        name: 'Clothing',
        typeDefault: FolderType.Clothing,
        folders: [] as any[],
      };
      const trashFolder = {
        folderID: '44444444-4444-4444-8444-444444444444',
        parentID: '11111111-1111-4111-8111-111111111111',
        name: 'Trash',
        typeDefault: FolderType.Trash,
        folders: [] as any[],
      };
      const skeleton = new Map<string, any>([
        [clothingFolder.folderID, clothingFolder],
        [trashFolder.folderID, trashFolder],
      ]);

      session.identity = { agent_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
      session.bot = {
        currentRegion: {
          circuit: {
            sessionID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            sendMessage,
            waitForAck,
          },
        },
        agent: {
          inventory: {
            main: {
              skeleton,
            },
          },
        },
      };

      const result = await callViewer(session, 'createInventoryFolder', {
        parentId: clothingFolder.folderID,
        name: 'Summer Outfits',
      });

      expect(result.success).toBe(true);
      expect(result.name).toBe('Summer Outfits');
      expect(result.parentId).toBe(clothingFolder.folderID);
      expect(result.folderId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      // Verify CreateInventoryFolder packet sent with PacketFlags.Reliable
      expect(sendMessage).toHaveBeenCalledTimes(1);
      const [sentMsg, flags] = sendMessage.mock.calls[0] as unknown as [any, number];
      expect(sentMsg.name).toBe('CreateInventoryFolder');
      expect(flags).toBe(PacketFlags.Reliable);
      expect(sentMsg.AgentData.AgentID.toString()).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
      expect(sentMsg.AgentData.SessionID.toString()).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(sentMsg.FolderData.ParentID.toString()).toBe(clothingFolder.folderID);
      expect(sentMsg.FolderData.FolderID.toString()).toBe(result.folderId);
      expect(sentMsg.FolderData.Type).toBe(FolderType.None);
      expect(Buffer.from(sentMsg.FolderData.Name).toString('utf8').replace(/\0+$/, '')).toBe(
        'Summer Outfits',
      );
      expect(waitForAck).toHaveBeenCalledWith(42, 5000);

      // Registered in skeleton and parent folders list
      expect(skeleton.has(result.folderId)).toBe(true);
      expect(clothingFolder.folders.length).toBe(1);

      // Rejects protected Trash folder on backend as well
      await expect(
        callViewer(session, 'createInventoryFolder', {
          parentId: trashFolder.folderID,
          name: 'Illegal Folder',
        }),
      ).rejects.toThrow(/protected system folders/);

      // Rejects empty and >63-char names
      await expect(
        callViewer(session, 'createInventoryFolder', {
          parentId: clothingFolder.folderID,
          name: '   ',
        }),
      ).rejects.toThrow(/Folder name is required/);

      await expect(
        callViewer(session, 'createInventoryFolder', {
          parentId: clothingFolder.folderID,
          name: 'z'.repeat(64),
        }),
      ).rejects.toThrow(/63 characters/);
    });

    it('propagates simulator circuit waitForAck timeout errors without mutating skeleton', async () => {
      const session = new ViewerSession(() => undefined);
      const skeleton = new Map<string, any>([
        [
          '22222222-2222-4222-8222-222222222222',
          {
            folderID: '22222222-2222-4222-8222-222222222222',
            name: 'Clothing',
            typeDefault: FolderType.Clothing,
            folders: [],
          },
        ],
      ]);

      session.identity = { agent_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
      session.bot = {
        currentRegion: {
          circuit: {
            sessionID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            sendMessage: vi.fn(() => 99),
            waitForAck: vi.fn(async () => {
              throw new Error('Timeout');
            }),
          },
        },
        agent: {
          inventory: {
            main: { skeleton },
          },
        },
      };

      await expect(
        callViewer(session, 'createInventoryFolder', {
          parentId: '22222222-2222-4222-8222-222222222222',
          name: 'Lost Packet Folder',
        }),
      ).rejects.toThrow('Timeout');

      expect(skeleton.size).toBe(1);
    });
  });
});
