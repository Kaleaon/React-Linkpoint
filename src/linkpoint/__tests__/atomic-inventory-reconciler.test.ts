import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryManager } from '../inventory';
import { app } from '../app';
import { localCache } from '../local-cache';

describe('Integrated Atomic Folder Reconciler and Snapshot Engine', () => {
  let invManager: InventoryManager;
  let mockProtocol: any;
  let mockAuth: any;

  beforeEach(() => {
    mockProtocol = {
      on: vi.fn(),
      getCapability: vi.fn(),
      agentId: 'agent-123-uuid',
      inventoryRoot: 'root-folder-uuid',
    };
    mockAuth = {
      isLoggedIn: () => true,
      user: { id: 'agent-123-uuid' },
    };
    invManager = new InventoryManager(mockProtocol, mockAuth);
  });

  describe('Atomic Snapshot Ingestion & Stale Child Purging', () => {
    it('purges stale child items and subfolders when a folder snapshot arrives', () => {
      const folderId = 'folder-outfits';

      // Setup initial state with 2 subfolders and 2 items
      invManager.createFolder(folderId, { name: 'Outfits', parentId: 'root-folder-uuid' });
      invManager.createFolder('sub-casual', { name: 'Casual', parentId: folderId });
      invManager.createFolder('sub-formal', { name: 'Formal', parentId: folderId });
      invManager.addItem('item-jeans', { name: 'Jeans', folderId, assetType: 5 });
      invManager.addItem('item-suit', { name: 'Suit', folderId, assetType: 5 });

      expect(invManager.folders.has('sub-casual')).toBe(true);
      expect(invManager.folders.has('sub-formal')).toBe(true);
      expect(invManager.items.has('item-jeans')).toBe(true);
      expect(invManager.items.has('item-suit')).toBe(true);

      // Server snapshot arrives: Casual subfolder moved/deleted, Jeans item deleted; Formal subfolder remains, shirt added
      const incomingFolders = [
        { id: 'sub-formal', name: 'Formal', parent: folderId },
        { id: 'sub-sporty', name: 'Sporty', parent: folderId },
      ];
      const incomingItems = [
        { id: 'item-suit', name: 'Suit', parent: folderId, assetType: 5 },
        { id: 'item-sneakers', name: 'Sneakers', parent: folderId, assetType: 5 },
      ];

      invManager.reconcileFolder(folderId, incomingFolders, incomingItems);

      // Stale items & subfolders deleted
      expect(invManager.folders.has('sub-casual')).toBe(false);
      expect(invManager.items.has('item-jeans')).toBe(false);

      // Remaining & new items exist
      expect(invManager.folders.has('sub-formal')).toBe(true);
      expect(invManager.folders.has('sub-sporty')).toBe(true);
      expect(invManager.items.has('item-suit')).toBe(true);
      expect(invManager.items.has('item-sneakers')).toBe(true);

      // Folder's children array updated atomically
      const outfitsFolder = invManager.folders.get(folderId);
      expect(outfitsFolder.children.sort()).toEqual(
        ['item-sneakers', 'item-suit', 'sub-formal', 'sub-sporty'].sort(),
      );
    });

    it('recursively purges nested subfolders and items in deep subtrees', () => {
      const rootFolderId = 'folder-textures';

      // Deep tree: textures -> sub1 -> sub2 -> item-deep
      invManager.createFolder(rootFolderId, { name: 'Textures', parentId: 'root' });
      invManager.createFolder('sub-1', { name: 'Sub 1', parentId: rootFolderId });
      invManager.createFolder('sub-2', { name: 'Sub 2', parentId: 'sub-1' });
      invManager.addItem('item-deep', { name: 'Deep Item', folderId: 'sub-2', assetType: 0 });

      expect(invManager.folders.has('sub-1')).toBe(true);
      expect(invManager.folders.has('sub-2')).toBe(true);
      expect(invManager.items.has('item-deep')).toBe(true);

      // Server snapshot for Textures folder excludes sub-1
      invManager.reconcileFolder(rootFolderId, [], []);

      // Entire subtree (sub-1, sub-2, item-deep) must be purged from both maps
      expect(invManager.folders.has('sub-1')).toBe(false);
      expect(invManager.folders.has('sub-2')).toBe(false);
      expect(invManager.items.has('item-deep')).toBe(false);
    });

    it('does not union stale children during atomic snapshot ingestion in non-merging mode', () => {
      const folderId = 'folder-gestures';

      // Existing folder with stale child 'stale-gesture'
      invManager.folders.set(folderId, {
        id: folderId,
        name: 'Gestures',
        type: 'folder',
        parent: 'root',
        children: ['stale-gesture', 'valid-gesture'],
      });

      // Server sends update with only 'valid-gesture'
      const rawIncomingFolder = {
        id: folderId,
        name: 'Gestures Updated',
        parent: 'root',
        children: ['valid-gesture'],
      };

      // Ingest in non-merging replacement mode (mergeChildren = false)
      (invManager as any)._addNormalizedFolder(rawIncomingFolder, 'root', false);

      const folder = invManager.folders.get(folderId);
      expect(folder.children).toEqual(['valid-gesture']);
      expect(folder.children).not.toContain('stale-gesture');
    });
  });

  describe('Paginated Chunk Buffering for FetchInventoryDescendents2', () => {
    it('buffers paginated response chunks and defers reconciliation until all descendents arrive', () => {
      const folderId = 'large-folder-uuid';

      // Initial state contains stale item
      invManager.addItem('stale-item-99', { name: 'Old Stale Item', folderId });

      // Chunk 1 of 3: total expected descendents = 3 (1 folder, 2 items)
      const chunk1 = {
        folder_id: folderId,
        descendents: 3,
        categories: [{ category_id: 'sub-chunk-1', name: 'Sub 1' }],
        items: [{ item_id: 'item-chunk-1', name: 'Item 1' }],
      };

      invManager.handleInventoryResponse(chunk1);

      // Atomic reconciliation should NOT run yet because 2 < 3 expected
      expect(invManager.folders.has('sub-chunk-1')).toBe(false);
      expect(invManager.items.has('item-chunk-1')).toBe(false);
      expect(invManager.items.has('stale-item-99')).toBe(true);

      // Chunk 2 of 3: remaining item arrives
      const chunk2 = {
        folder_id: folderId,
        descendents: 3,
        categories: [],
        items: [{ item_id: 'item-chunk-2', name: 'Item 2' }],
      };

      invManager.handleInventoryResponse(chunk2);

      // Now total buffered items (3) >= expected (3). Atomic reconciliation triggers!
      expect(invManager.folders.has('sub-chunk-1')).toBe(true);
      expect(invManager.items.has('item-chunk-1')).toBe(true);
      expect(invManager.items.has('item-chunk-2')).toBe(true);

      // Stale item purged atomically
      expect(invManager.items.has('stale-item-99')).toBe(false);
    });
  });

  describe('Incremental Delta Updates vs Full Folder Snapshots', () => {
    it('preserves existing folder contents when incremental inventory_update events arrive', () => {
      const folderId = 'folder-scripts';

      invManager.addItem('script-1', { name: 'Main Script', folderId });
      invManager.addItem('script-2', { name: 'Helper Script', folderId });

      // Incremental delta update arrives adding script-3
      const deltaUpdate = {
        items: [{ id: 'script-3', name: 'New Delta Script', parent: folderId }],
      };

      invManager.handleInventoryUpdate(deltaUpdate);

      // All scripts (script-1, script-2, script-3) must be preserved
      expect(invManager.items.has('script-1')).toBe(true);
      expect(invManager.items.has('script-2')).toBe(true);
      expect(invManager.items.has('script-3')).toBe(true);
    });
  });

  describe('Local Storage Persistence & Unified Store Parity', () => {
    it('persists reconciled folder state to localCache so purged items do not rehydrate', async () => {
      const spySave = vi.spyOn(localCache, 'saveInventory');

      invManager.createFolder('f-1', { name: 'Folder 1' });
      invManager.addItem('i-1', { name: 'Item 1', folderId: 'f-1' });

      invManager.reconcileFolder('f-1', [], []);

      expect(spySave).toHaveBeenCalled();
      const lastCallArg = spySave.mock.calls[spySave.mock.calls.length - 1][1];
      expect(lastCallArg.items.find((i: any) => i.id === 'i-1')).toBeUndefined();
    });

    it('ensures app.inventoryCore and app.inventory operate on the same unified store', () => {
      app.inventory.folders.clear();
      app.inventory.items.clear();

      app.inventory.createFolder('unified-f1', { name: 'Unified Folder' });
      expect(app.inventoryCore.getFolder('unified-f1')).not.toBeNull();
      expect(app.inventoryCore.getFolder('unified-f1').name).toBe('Unified Folder');

      app.inventoryCore.addItem('unified-i1', { name: 'Unified Item', folderId: 'unified-f1' });
      expect(app.inventory.items.has('unified-i1')).toBe(true);
    });
  });
});
