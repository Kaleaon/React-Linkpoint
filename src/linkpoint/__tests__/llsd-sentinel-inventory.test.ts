import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLSD, LLSDUUID, LLSDUndef, LLSDURI, LLSDBinary } from '../llsd';
import { InventoryManager } from '../inventory';
import { localCache } from '../local-cache';

describe('Typed LLSD Sentinel Nodes & Unified Inventory Reconciler Store', () => {
  describe('LLSD Sentinel Serialization (LLSD-EDGE-001 and LLSD-EDGE-004)', () => {
    it('serializes LLSDUUID sentinel to <uuid> tag without regex inspection (LLSD-EDGE-001)', () => {
      const uuidStr = '11111111-2222-3333-4444-555555555555';
      const sentinel = new LLSDUUID(uuidStr);
      const xml = LLSD.buildXML({ id: sentinel });

      expect(xml).toContain(`<key>id</key><uuid>${uuidStr}</uuid>`);
    });

    it('serializes primitive strings matching UUID format as <string> tags without regex misclassification (LLSD-EDGE-001)', () => {
      const uuidLikeStr = '11111111-2222-3333-4444-555555555555';
      const xml = LLSD.buildXML({ itemName: uuidLikeStr });

      expect(xml).toContain(`<key>itemName</key><string>${uuidLikeStr}</string>`);
      expect(xml).not.toContain(`<uuid>${uuidLikeStr}</uuid>`);
    });

    it('serializes LLSDUndef sentinel and null/undefined values to <undef /> tag (LLSD-EDGE-004)', () => {
      const undefSentinel = new LLSDUndef();
      const xml = LLSD.buildXML({
        explicitUndef: undefSentinel,
        nullVal: null,
        undefVal: undefined,
      });

      expect(xml).toContain('<key>explicitUndef</key><undef />');
      expect(xml).toContain('<key>nullVal</key><undef />');
      expect(xml).toContain('<key>undefVal</key><undef />');
    });

    it('serializes string "undef" as <string>undef</string> rather than <undef /> (LLSD-EDGE-004)', () => {
      const xml = LLSD.buildXML({ textVal: 'undef' });
      expect(xml).toContain('<key>textVal</key><string>undef</string>');
    });

    it('preserves primitive string compatibility with toString() and valueOf()', () => {
      const uuidStr = 'abcdef12-3456-7890-abcd-ef1234567890';
      const sentinel = new LLSDUUID(uuidStr);

      expect(sentinel.toString()).toBe(uuidStr);
      expect(sentinel.valueOf()).toBe(uuidStr);
      expect(String(sentinel)).toBe(uuidStr);
      expect(`id: ${sentinel}`).toBe(`id: ${uuidStr}`);

      const undefSentinel = new LLSDUndef();
      expect(undefSentinel.toString()).toBe('');
      expect(undefSentinel.valueOf()).toBeNull();
    });
  });

  describe('FetchInventoryDescendents2 Capability Request Formatting', () => {
    it('generates explicit <uuid> tags for folder_id and owner_id in FetchInventoryDescendents2 payload', () => {
      const folderId = '00000000-0000-0000-0000-000000000001';
      const ownerId = '00000000-0000-0000-0000-000000000002';

      const requestData = {
        folders: [{
          folder_id: new LLSDUUID(folderId),
          owner_id: new LLSDUUID(ownerId),
          fetch_folders: true,
          fetch_items: true,
          sort_order: 1,
        }]
      };

      const xml = LLSD.buildXML(requestData);

      expect(xml).toContain(`<key>folder_id</key><uuid>${folderId}</uuid>`);
      expect(xml).toContain(`<key>owner_id</key><uuid>${ownerId}</uuid>`);
    });
  });

  describe('Dual-Path Unified Inventory Normalization', () => {
    let mockProtocol: any;
    let mockAuth: any;
    let invManager: InventoryManager;

    beforeEach(() => {
      mockProtocol = {
        on: vi.fn(),
        getCapability: vi.fn(),
        inventoryRoot: 'root-folder-uuid',
      };
      mockAuth = {
        isLoggedIn: () => true,
        user: { id: 'agent-owner-uuid' },
      };
      invManager = new InventoryManager(mockProtocol, mockAuth);
    });

    it('normalizes incoming capability HTTP responses (FetchInventoryDescendents2 format)', () => {
      const capResponseData = {
        folders: [{
          folder_id: 'folder-1-uuid',
          categories: [{
            category_id: 'subfolder-1-uuid',
            name: 'Textures Folder',
            parent_id: 'folder-1-uuid',
            type_default: 0,
            version: 1,
          }],
          items: [{
            item_id: 'item-1-uuid',
            name: 'Sample Texture',
            parent_id: 'folder-1-uuid',
            type_default: 0,
            asset_id: 'asset-1-uuid',
            desc: 'A high res texture',
            inv_type: 0,
            flags: 0,
            creation_date: 1672531199,
            owner_id: 'agent-owner-uuid',
          }]
        }]
      };

      invManager.handleInventoryResponse(capResponseData);

      const folder = invManager.folders.get('subfolder-1-uuid');
      expect(folder).toBeDefined();
      expect(folder.id).toBe('subfolder-1-uuid');
      expect(folder.name).toBe('Textures Folder');
      expect(folder.type).toBe('folder');
      expect(folder.parent).toBe('folder-1-uuid');

      const item = invManager.items.get('item-1-uuid');
      expect(item).toBeDefined();
      expect(item.id).toBe('item-1-uuid');
      expect(item.name).toBe('Sample Texture');
      expect(item.type).toBe('item');
      expect(item.assetType).toBe(0);
      expect(item.assetId).toBe('asset-1-uuid');
      expect(item.description).toBe('A high res texture');
      expect(item.parent).toBe('folder-1-uuid');
    });

    it('normalizes UDP slBridge responses and merges with folder hierarchy cleanly', () => {
      const udpFolder = {
        id: 'udp-folder-1',
        name: 'Objects',
        parent: 'root-folder-uuid',
        preferred_type: 6,
      };
      const udpItem = {
        id: 'udp-item-1',
        name: 'Chair Object',
        parent: 'udp-folder-1',
        asset_type: 6,
        asset_uuid: 'asset-chair-uuid',
        description: 'Mesh chair',
      };

      const normalizedF = invManager.normalizeFolder(udpFolder);
      const normalizedI = invManager.normalizeItem(udpItem);

      expect(normalizedF.id).toBe('udp-folder-1');
      expect(normalizedF.folderType).toBe(6);
      expect(normalizedF.type).toBe('folder');

      expect(normalizedI.id).toBe('udp-item-1');
      expect(normalizedI.assetType).toBe(6);
      expect(normalizedI.assetId).toBe('asset-chair-uuid');
      expect(normalizedI.type).toBe('item');
    });

    it('validates and normalizes asset and folder types against LLAssetType and LLFolderType enums', () => {
      const folderWithStr = invManager.normalizeFolder({ id: 'f-1', name: 'Trash', type: 'Trash' });
      expect(folderWithStr.folderType).toBe(13); // LLFolderType.Trash

      const itemWithStrType = invManager.normalizeItem({ id: 'i-1', name: 'My Texture', asset_type: 'texture' });
      expect(itemWithStrType.assetType).toBe(0); // LLAssetType.Texture

      const itemWithMeshStr = invManager.normalizeItem({ id: 'i-2', name: 'Mesh Prim', asset_type: 'mesh' });
      expect(itemWithMeshStr.assetType).toBe(49); // LLAssetType.Mesh

      const itemWithUnknownType = invManager.normalizeItem({ id: 'i-3', name: 'Unknown Asset', asset_type: 'invalid_custom_type' });
      expect(itemWithUnknownType.assetType).toBe(-1); // LLAssetType.Unknown
    });
  });

  describe('localCache Persistence & Rehydration Round-Trip', () => {
    it('preserves exact folder and item counts and field keys between persistence and rehydration', async () => {
      const agentId = 'test-agent-123';
      const originalPayload = {
        folders: [
          { id: 'f-root', name: 'My Inventory', parent: '', folderType: 8 },
          { id: 'f-clothing', name: 'Clothing', parent: 'f-root', folderType: 5 },
        ],
        items: [
          { id: 'i-shirt', name: 'Blue Shirt', parent: 'f-clothing', assetType: 5, assetId: 'asset-shirt-uuid', description: 'Casual shirt' },
          { id: 'i-pants', name: 'Jeans', parent: 'f-clothing', assetType: 5, assetId: 'asset-pants-uuid', description: 'Denim jeans' },
        ],
        rootId: 'f-root',
        rootName: 'My Inventory',
      };

      await localCache.saveInventory(agentId, originalPayload);
      const loaded = await localCache.loadInventory(agentId);

      expect(loaded).not.toBeNull();
      expect(loaded?.folders.length).toBe(originalPayload.folders.length);
      expect(loaded?.items.length).toBe(originalPayload.items.length);

      const loadedShirt = loaded?.items.find((i: any) => i.id === 'i-shirt');
      expect(loadedShirt).toBeDefined();
      expect(loadedShirt.name).toBe('Blue Shirt');
      expect(loadedShirt.assetType).toBe(5);
      expect(loadedShirt.assetId).toBe('asset-shirt-uuid');
      expect(loadedShirt.parent).toBe('f-clothing');
    });
  });
});
