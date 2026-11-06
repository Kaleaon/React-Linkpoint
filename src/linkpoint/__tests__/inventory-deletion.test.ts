import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { app } from '../app';
import { LLFolderType, LLAssetType } from '../inventory';
import { slBridge } from '../sl-bridge';
import { localCache } from '../local-cache';
import { indexedDBStore } from '../indexeddb-store';

const { callViewer, METHODS } = createRequire(import.meta.url)('../../../core/viewer-api.cjs');
const { ViewerSession } = createRequire(import.meta.url)('../../../core/viewer-session.cjs');
const { FolderType, UUID, PacketFlags } = createRequire(import.meta.url)(
  '@caspertech/node-metaverse',
);

describe('Viewer Session Inventory Deletion & Trash Purge RPC', () => {
  it('allow-lists deleteInventoryItem, deleteInventoryFolder, and purgeInventoryTrash in METHODS', () => {
    expect(METHODS.has('deleteInventoryItem')).toBe(true);
    expect(METHODS.has('deleteInventoryFolder')).toBe(true);
    expect(METHODS.has('purgeInventoryTrash')).toBe(true);
  });

  it('dispatches RemoveInventoryItemMessage via circuit.sendMessage with Reliable packet flag', async () => {
    const session = new ViewerSession(() => undefined);
    const sendMessage = vi.fn();
    const circuit = { sendMessage, sessionID: new UUID('11111111-1111-1111-1111-111111111111') };
    const agentID = new UUID('22222222-2222-2222-2222-222222222222');
    const targetItemId = '33333333-3333-3333-3333-333333333333';

    session.bot = {
      agent: {
        agentID,
        inventory: { main: { itemsByID: new Map([[targetItemId, { itemID: targetItemId }]]) } },
      },
      clientCommands: {},
    };
    session.currentRegion = () => ({ circuit });

    const result = await callViewer(session, 'deleteInventoryItem', { itemId: targetItemId });
    expect(result).toEqual({ success: true, itemId: targetItemId });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const [packet, flags] = sendMessage.mock.calls[0];
    expect(packet.name).toBe('RemoveInventoryItem');
    expect(packet.AgentData.AgentID.toString()).toBe(agentID.toString());
    expect(packet.AgentData.SessionID.toString()).toBe(circuit.sessionID.toString());
    expect(packet.InventoryData[0].ItemID.toString()).toBe(targetItemId);
    expect(flags).toBe(PacketFlags.Reliable);
  });

  it('refuses to delete root folder or standard system folders in deleteInventoryFolder', async () => {
    const session = new ViewerSession(() => undefined);
    const rootFolderId = '44444444-4444-4444-4444-444444444444';
    const trashFolderId = '55555555-5555-5555-5555-555555555555';

    session.bot = {
      agent: {
        agentID: new UUID('22222222-2222-2222-2222-222222222222'),
        inventory: {
          main: {
            skeleton: new Map([
              [trashFolderId, { folderID: new UUID(trashFolderId), typeDefault: FolderType.Trash }],
            ]),
          },
        },
      },
      clientCommands: {
        inventory: {
          getInventoryRoot: () => ({ folderID: new UUID(rootFolderId) }),
        },
      },
    };
    session.currentRegion = () => ({ circuit: { sendMessage: vi.fn(), sessionID: UUID.random() } });

    await expect(
      callViewer(session, 'deleteInventoryFolder', { folderId: rootFolderId }),
    ).rejects.toThrow(/Cannot delete root folder/);

    await expect(
      callViewer(session, 'deleteInventoryFolder', { folderId: trashFolderId }),
    ).rejects.toThrow(/Cannot delete standard system folders/);
  });

  it('dispatches RemoveInventoryFolderMessage for non-system user folder', async () => {
    const session = new ViewerSession(() => undefined);
    const sendMessage = vi.fn();
    const circuit = { sendMessage, sessionID: new UUID('11111111-1111-1111-1111-111111111111') };
    const agentID = new UUID('22222222-2222-2222-2222-222222222222');
    const userFolderId = '66666666-6666-6666-6666-666666666666';

    session.bot = {
      agent: {
        agentID,
        inventory: {
          main: {
            skeleton: new Map([
              [userFolderId, { folderID: new UUID(userFolderId), typeDefault: FolderType.None }],
            ]),
          },
        },
      },
      clientCommands: {
        inventory: {
          getInventoryRoot: () => ({
            folderID: new UUID('44444444-4444-4444-4444-444444444444'),
          }),
        },
      },
    };
    session.currentRegion = () => ({ circuit });

    const result = await callViewer(session, 'deleteInventoryFolder', { folderId: userFolderId });
    expect(result).toEqual({ success: true, folderId: userFolderId });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const [packet, flags] = sendMessage.mock.calls[0];
    expect(packet.name).toBe('RemoveInventoryFolder');
    expect(packet.AgentData.AgentID.toString()).toBe(agentID.toString());
    expect(packet.FolderData[0].FolderID.toString()).toBe(userFolderId);
    expect(flags).toBe(PacketFlags.Reliable);
  });

  it('dispatches PurgeInventoryDescendentsMessage to simulator for trash folder', async () => {
    const session = new ViewerSession(() => undefined);
    const sendMessage = vi.fn();
    const circuit = { sendMessage, sessionID: new UUID('11111111-1111-1111-1111-111111111111') };
    const agentID = new UUID('22222222-2222-2222-2222-222222222222');
    const trashFolderId = '55555555-5555-5555-5555-555555555555';

    session.bot = {
      agent: {
        agentID,
        inventory: {
          main: {
            skeleton: new Map([
              [trashFolderId, { folderID: new UUID(trashFolderId), typeDefault: FolderType.Trash }],
            ]),
          },
        },
      },
      clientCommands: {},
    };
    session.currentRegion = () => ({ circuit });

    const result = await callViewer(session, 'purgeInventoryTrash', {});
    expect(result).toEqual({ success: true, folderId: trashFolderId });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    const [packet, flags] = sendMessage.mock.calls[0];
    expect(packet.name).toBe('PurgeInventoryDescendents');
    expect(packet.AgentData.AgentID.toString()).toBe(agentID.toString());
    expect(packet.InventoryData.FolderID.toString()).toBe(trashFolderId);
    expect(flags).toBe(PacketFlags.Reliable);
  });
});

describe('InventoryManager Direct Item Deletion & Trash Purge', () => {
  beforeEach(() => {
    app.inventory.folders.clear();
    app.inventory.items.clear();
  });

  it('correctly identifies system folders and root folder as undeletable', () => {
    app.inventory.setRootFolder('root-folder');
    expect(app.inventory.isSystemFolder('root-folder')).toBe(true);

    const trashFolder = {
      id: 'trash-id',
      name: 'Trash',
      parent: 'root-folder',
      folderType: LLFolderType.Trash,
    };
    app.inventory.folders.set('trash-id', trashFolder);
    expect(app.inventory.isSystemFolder(trashFolder)).toBe(true);

    const customFolder = {
      id: 'custom-folder',
      name: 'My Custom Outfits',
      parent: 'root-folder',
      folderType: LLFolderType.None,
    };
    app.inventory.folders.set('custom-folder', customFolder);
    expect(app.inventory.isSystemFolder(customFolder)).toBe(false);
  });

  it('tracks Trash item count accurately across nested subfolders and items', () => {
    app.inventory.setRootFolder('root-folder');

    const trashFolder = {
      id: 'trash-id',
      name: 'Trash',
      parent: 'root-folder',
      folderType: LLFolderType.Trash,
      children: ['trash-subfolder', 'trash-item-1'],
    };
    const trashSubfolder = {
      id: 'trash-subfolder',
      name: 'Old Stuff',
      parent: 'trash-id',
      folderType: LLFolderType.None,
      children: ['trash-item-2', 'trash-item-3'],
    };

    app.inventory.folders.set('trash-id', trashFolder);
    app.inventory.folders.set('trash-subfolder', trashSubfolder);

    app.inventory.items.set('trash-item-1', {
      id: 'trash-item-1',
      name: 'Old Texture',
      parent: 'trash-id',
    });
    app.inventory.items.set('trash-item-2', {
      id: 'trash-item-2',
      name: 'Old Notecard',
      parent: 'trash-subfolder',
    });
    app.inventory.items.set('trash-item-3', {
      id: 'trash-item-3',
      name: 'Old Script',
      parent: 'trash-subfolder',
    });

    expect(app.inventory.getTrashFolder()?.id).toBe('trash-id');
    // 3 items + 1 subfolder = 4 entries in Trash
    expect(app.inventory.getTrashItemCount()).toBe(4);
  });

  it('deletes an individual item and evicts it from cache and parent children list within 300ms', async () => {
    app.inventory.setRootFolder('root-folder');
    const folder = {
      id: 'user-folder',
      name: 'User Folder',
      parent: 'root-folder',
      children: ['item-to-delete', 'item-to-keep'],
    };
    app.inventory.folders.set('user-folder', folder);

    app.inventory.items.set('item-to-delete', {
      id: 'item-to-delete',
      name: 'Delete Me',
      parent: 'user-folder',
    });
    app.inventory.items.set('item-to-keep', {
      id: 'item-to-keep',
      name: 'Keep Me',
      parent: 'user-folder',
    });

    const evictSpy = vi.spyOn(localCache, 'evictItem');
    const bridgeSpy = vi.spyOn(slBridge, 'deleteInventoryItem');
    const updateEventPromise = new Promise((resolve) => {
      app.inventory.once('inventory_updated', resolve);
    });

    const startTime = performance.now();
    const success = await app.inventory.deleteItem('item-to-delete');
    const duration = performance.now() - startTime;

    expect(success).toBe(true);
    expect(duration).toBeLessThan(300); // Meets < 300ms requirement
    expect(app.inventory.items.has('item-to-delete')).toBe(false);
    expect(folder.children).toEqual(['item-to-keep']);
    expect(evictSpy).toHaveBeenCalledWith(expect.any(String), 'item-to-delete');

    await expect(updateEventPromise).resolves.toBeDefined();
  });

  it('refuses to delete root or standard system folders via deleteFolder', async () => {
    app.inventory.setRootFolder('root-folder');
    const trashFolder = {
      id: 'trash-id',
      name: 'Trash',
      parent: 'root-folder',
      folderType: LLFolderType.Trash,
    };
    app.inventory.folders.set('trash-id', trashFolder);

    await expect(app.inventory.deleteFolder('root-folder')).rejects.toThrow(
      /Cannot delete root or standard system folders/,
    );
    await expect(app.inventory.deleteFolder('trash-id')).rejects.toThrow(
      /Cannot delete root or standard system folders/,
    );
  });

  it('purges all contents in Trash and resets Trash item count to 0', async () => {
    app.inventory.setRootFolder('root-folder');
    const trashFolder = {
      id: 'trash-id',
      name: 'Trash',
      parent: 'root-folder',
      folderType: LLFolderType.Trash,
      children: ['trash-subfolder', 'trash-item-1'],
    };
    const trashSubfolder = {
      id: 'trash-subfolder',
      name: 'Old Stuff',
      parent: 'trash-id',
      folderType: LLFolderType.None,
      children: ['trash-item-2'],
    };

    app.inventory.folders.set('trash-id', trashFolder);
    app.inventory.folders.set('trash-subfolder', trashSubfolder);

    app.inventory.items.set('trash-item-1', {
      id: 'trash-item-1',
      name: 'Old Texture',
      parent: 'trash-id',
    });
    app.inventory.items.set('trash-item-2', {
      id: 'trash-item-2',
      name: 'Old Notecard',
      parent: 'trash-subfolder',
    });

    expect(app.inventory.getTrashItemCount()).toBe(3);

    const purgeSpy = vi.spyOn(localCache, 'purgeTrash');
    const success = await app.inventory.purgeTrash();

    expect(success).toBe(true);
    expect(app.inventory.getTrashItemCount()).toBe(0);
    expect(app.inventory.folders.has('trash-subfolder')).toBe(false);
    expect(app.inventory.items.has('trash-item-1')).toBe(false);
    expect(app.inventory.items.has('trash-item-2')).toBe(false);
    expect(trashFolder.children).toEqual([]);
    expect(purgeSpy).toHaveBeenCalledWith(expect.any(String), 'trash-id');
  });

  it('supports Set data structure for folder children during item/folder deletion and trash purge', async () => {
    app.inventory.setRootFolder('root-folder');
    const rootFolder = {
      id: 'root-folder',
      name: 'My Inventory',
      parent: null,
      children: new Set(['trash-id', 'parent-set-folder']),
    };
    const trashFolder = {
      id: 'trash-id',
      name: 'Trash',
      parent: 'root-folder',
      folderType: LLFolderType.Trash,
      children: new Set(['trash-set-item', 'trash-set-subfolder']),
    };
    const trashSetSubfolder = {
      id: 'trash-set-subfolder',
      name: 'Trash Subfolder',
      parent: 'trash-id',
      children: new Set(['trash-nested-item']),
    };
    const parentSetFolder = {
      id: 'parent-set-folder',
      name: 'Parent Folder',
      parent: 'root-folder',
      children: new Set(['item-in-set', 'folder-in-set']),
    };
    const folderInSet = {
      id: 'folder-in-set',
      name: 'Child Folder',
      parent: 'parent-set-folder',
      children: new Set(),
    };

    app.inventory.folders.set('root-folder', rootFolder);
    app.inventory.folders.set('trash-id', trashFolder);
    app.inventory.folders.set('trash-set-subfolder', trashSetSubfolder);
    app.inventory.folders.set('parent-set-folder', parentSetFolder);
    app.inventory.folders.set('folder-in-set', folderInSet);

    app.inventory.items.set('item-in-set', {
      id: 'item-in-set',
      name: 'Item In Set',
      parent: 'parent-set-folder',
    });
    app.inventory.items.set('trash-set-item', {
      id: 'trash-set-item',
      name: 'Trash Item',
      parent: 'trash-id',
    });
    app.inventory.items.set('trash-nested-item', {
      id: 'trash-nested-item',
      name: 'Trash Nested Item',
      parent: 'trash-set-subfolder',
    });

    // Verify Set traversal in getTrashItemCount
    expect(app.inventory.getTrashItemCount()).toBe(3); // 2 items + 1 subfolder

    // Test deleteItem with Set children
    const deleteItemSuccess = await app.inventory.deleteItem('item-in-set');
    expect(deleteItemSuccess).toBe(true);
    expect(parentSetFolder.children.has('item-in-set')).toBe(false);
    expect(app.inventory.items.has('item-in-set')).toBe(false);

    // Test deleteFolder with Set children
    const deleteFolderSuccess = await app.inventory.deleteFolder('folder-in-set');
    expect(deleteFolderSuccess).toBe(true);
    expect(parentSetFolder.children.has('folder-in-set')).toBe(false);
    expect(app.inventory.folders.has('folder-in-set')).toBe(false);

    // Test purgeTrash with Set children
    const purgeSuccess = await app.inventory.purgeTrash();
    expect(purgeSuccess).toBe(true);
    expect(trashFolder.children instanceof Set).toBe(true);
    expect((trashFolder.children as Set<string>).size).toBe(0);
    expect(app.inventory.getTrashItemCount()).toBe(0);
  });
});
