import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { InventoryManager, LLAssetType, LLFolderType } from '../inventory';
import { slBridge } from '../sl-bridge';
import {
  truncateUtf8Bytes as clientTruncateUtf8Bytes,
  getUtf8ByteLength,
  MAX_LANDMARK_DESC_BYTES,
} from '../landmark';

const require = createRequire(import.meta.url);
const { METHODS, callViewer } = require('../../../core/viewer-api.cjs');
const {
  ViewerSession,
  CreateInventoryItemMessage,
  truncateUtf8Bytes: serverTruncateUtf8Bytes,
} = require('../../../core/viewer-session.cjs');
const { UUID } = require('@caspertech/node-metaverse');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const { FilterResponse } = require('@caspertech/node-metaverse/dist/lib/enums/FilterResponse');

describe('ViewerSession.createLandmark & InventoryManager Landmark Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers createLandmark in core/viewer-api.cjs METHODS allow-list', async () => {
    expect(METHODS.has('createLandmark')).toBe(true);
    const mockSession = {
      createLandmark: vi.fn().mockResolvedValue({ success: true, itemId: 'lm-1' }),
    };
    const res = await callViewer(mockSession, 'createLandmark', { name: 'Gallery' });
    expect(mockSession.createLandmark).toHaveBeenCalledWith({ name: 'Gallery' });
    expect(res).toEqual({ success: true, itemId: 'lm-1' });
  });

  describe('UTF-8 127-byte description truncation', () => {
    it('truncates ASCII and multi-byte UTF-8 descriptions cleanly at <= 127 bytes', () => {
      const longAscii = 'A'.repeat(200);
      const clientAscii = clientTruncateUtf8Bytes(longAscii, MAX_LANDMARK_DESC_BYTES);
      const serverAscii = serverTruncateUtf8Bytes(longAscii, MAX_LANDMARK_DESC_BYTES);
      expect(Buffer.byteLength(clientAscii, 'utf8')).toBe(127);
      expect(Buffer.byteLength(serverAscii, 'utf8')).toBe(127);
      expect(clientAscii).toBe(serverAscii);

      // 4-byte emoji straddling byte 127 (31 * 4 = 124 bytes + 'ab' = 126 bytes + '📍' (4 bytes) -> must stop at 126 bytes)
      const emojiInput = '📍'.repeat(31) + 'ab' + '📍extra';
      const clientEmoji = clientTruncateUtf8Bytes(emojiInput, MAX_LANDMARK_DESC_BYTES);
      const serverEmoji = serverTruncateUtf8Bytes(emojiInput, MAX_LANDMARK_DESC_BYTES);
      expect(getUtf8ByteLength(clientEmoji)).toBe(126);
      expect(Buffer.byteLength(serverEmoji, 'utf8')).toBe(126);
      expect(clientEmoji).not.toContain('\uFFFD');
      expect(serverEmoji).toBe(clientEmoji);
    });
  });

  describe('Dual-Transport Capability Negotiation & UDP Fallback', () => {
    const AGENT_UUID = '11111111-2222-3333-4444-555555555555';
    const SESSION_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const FOLDER_UUID = '22222222-3333-4444-5555-666666666666';
    const REGION_UUID = '33333333-4444-5555-6666-777777777777';
    const RETURNED_ITEM_UUID = '88888888-9999-aaaa-bbbb-cccccccccccc';
    const RETURNED_ASSET_UUID = '99999999-aaaa-bbbb-cccc-dddddddddddd';

    let sentEvents: Array<{ type: string; data: any }>;
    let session: any;
    let mockCircuit: any;
    let mockCaps: any;
    let skeletonMap: Map<string, any>;

    beforeEach(() => {
      sentEvents = [];
      mockCircuit = {
        sessionID: new UUID(SESSION_UUID),
        sendMessage: vi.fn(),
      };
      mockCaps = {
        getCapability: vi.fn(),
        capsPerformXMLPost: vi.fn(),
        capsRequestUpload: vi.fn(),
      };
      skeletonMap = new Map([
        [
          FOLDER_UUID,
          {
            folderID: new UUID(FOLDER_UUID),
            name: 'Landmarks',
            typeDefault: 3,
            items: [],
          },
        ],
      ]);

      session = new ViewerSession((type: string, data: any) => {
        sentEvents.push({ type, data });
      });
      session.bot = {
        agent: {
          agentID: new UUID(AGENT_UUID),
          position: { x: 144, y: 92, z: 28 },
          inventory: {
            main: {
              skeleton: skeletonMap,
            },
          },
        },
        currentRegion: {
          regionName: 'Nautilus Plaza',
          regionID: new UUID(REGION_UUID),
          simAccess: 21,
          circuit: mockCircuit,
          caps: mockCaps,
        },
      };
    });

    it('posts LLSD landmark parameters to CreateLandmark HTTP capability when supported', async () => {
      mockCaps.getCapability.mockImplementation(async (cap: string) =>
        cap === 'CreateLandmark' ? 'https://sim.agni.example/cap/create-landmark' : null,
      );
      mockCaps.capsPerformXMLPost.mockResolvedValue({
        item_id: RETURNED_ITEM_UUID,
        asset_id: RETURNED_ASSET_UUID,
      });

      const longDesc = 'Event venue notes — '.repeat(12); // > 127 bytes
      const res = await session.createLandmark({
        name: 'Jazz Stage',
        description: longDesc,
        folderId: FOLDER_UUID,
        position: [144, 92, 28],
        regionId: REGION_UUID,
      });

      expect(mockCaps.getCapability).toHaveBeenCalledWith('CreateLandmark');
      expect(mockCaps.capsPerformXMLPost).toHaveBeenCalledTimes(1);
      const [endpoint, payload] = mockCaps.capsPerformXMLPost.mock.calls[0];
      expect(endpoint).toBe('https://sim.agni.example/cap/create-landmark');
      expect(payload).toMatchObject({
        asset_type: 'landmark',
        inventory_type: 'landmark',
        name: 'Jazz Stage',
        pos: [144, 92, 28],
        position: [144, 92, 28],
      });
      expect(Buffer.byteLength(payload.description, 'utf8')).toBeLessThanOrEqual(127);
      expect(mockCircuit.sendMessage).not.toHaveBeenCalled();

      expect(res).toMatchObject({
        success: true,
        transport: 'capability',
        capability: 'CreateLandmark',
        itemId: RETURNED_ITEM_UUID,
        assetId: RETURNED_ASSET_UUID,
        folderId: FOLDER_UUID,
      });
      expect(sentEvents.some((e) => e.type === 'inventory_update')).toBe(true);
    });

    it('supports NewAgentInventory two-stage uploader capability when CreateLandmark is absent', async () => {
      mockCaps.getCapability.mockImplementation(async (cap: string) =>
        cap === 'NewAgentInventory' ? 'https://sim.agni.example/cap/new-agent-inv' : null,
      );
      mockCaps.capsPerformXMLPost.mockResolvedValue({
        state: 'upload',
        uploader: 'https://sim.agni.example/cap/uploader-99',
      });
      mockCaps.capsRequestUpload.mockResolvedValue({
        state: 'complete',
        new_inventory_item: RETURNED_ITEM_UUID,
        new_asset: RETURNED_ASSET_UUID,
      });

      const res = await session.createLandmark({
        name: 'Harbor Pier',
        description: 'Docking slip 4',
        folderId: FOLDER_UUID,
        position: [64, 180, 22],
        regionId: REGION_UUID,
      });

      expect(mockCaps.capsPerformXMLPost).toHaveBeenCalledTimes(1);
      expect(mockCaps.capsRequestUpload).toHaveBeenCalledTimes(1);
      const [uploaderUrl, uploadedBuf] = mockCaps.capsRequestUpload.mock.calls[0];
      expect(uploaderUrl).toBe('https://sim.agni.example/cap/uploader-99');
      expect(uploadedBuf.toString('utf8')).toContain('Landmark version 2');
      expect(uploadedBuf.toString('utf8')).toContain(`region_id ${REGION_UUID}`);
      expect(uploadedBuf.toString('utf8')).toContain('local_pos 64 180 22');
      expect(mockCircuit.sendMessage).not.toHaveBeenCalled();

      expect(res).toMatchObject({
        success: true,
        transport: 'capability',
        capability: 'NewAgentInventory',
        itemId: RETURNED_ITEM_UUID,
        assetId: RETURNED_ASSET_UUID,
      });
    });

    it('falls back to UDP CreateInventoryItem within 2 seconds when HTTP capability hangs or is unavailable', async () => {
      // Simulate hanging capability endpoint exceeding capability timeout
      mockCaps.getCapability.mockResolvedValue('https://sim.agni.example/cap/stalled');
      mockCaps.capsPerformXMLPost.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000)),
      );

      let capturedCallbackId = 0;
      mockCircuit.sendMessage.mockImplementation((msg: any) => {
        capturedCallbackId = msg.InventoryBlock.CallbackID;
      });
      mockCircuit.waitForMessage = vi
        .fn()
        .mockImplementation(
          async (msgType: number, _timeout: number, filterFn: (m: any) => any) => {
            expect(msgType).toBe(Message.UpdateCreateInventoryItem);
            const reply = {
              AgentData: { SimApproved: true },
              InventoryData: [
                {
                  CallbackID: capturedCallbackId || 2,
                  ItemID: new UUID(RETURNED_ITEM_UUID),
                  AssetID: new UUID(RETURNED_ASSET_UUID),
                  FolderID: new UUID(FOLDER_UUID),
                  CreationDate: 1730000000,
                },
              ],
            };
            filterFn(reply);
            return reply;
          },
        );

      const startedAt = Date.now();
      const res = await session.createLandmark({
        name: 'Fallback Overlook',
        description: 'Created over reliable UDP',
        folderId: FOLDER_UUID,
        timeout: 250,
      });
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs).toBeLessThan(2000);
      expect(mockCircuit.sendMessage).toHaveBeenCalledTimes(1);
      const [udpMsg, flags] = mockCircuit.sendMessage.mock.calls[0];
      expect(flags).toBe(PacketFlags.Reliable);
      expect(udpMsg).toBeInstanceOf(CreateInventoryItemMessage);
      expect(udpMsg.InventoryBlock.Type).toBe(3);
      expect(udpMsg.InventoryBlock.InvType).toBe(3);
      expect(udpMsg.InventoryBlock.FolderID.toString()).toBe(FOLDER_UUID);
      expect(udpMsg.InventoryBlock.Name.toString('utf8')).toBe('Fallback Overlook');
      expect(udpMsg.InventoryBlock.Description.toString('utf8')).toBe('Created over reliable UDP');

      expect(res).toMatchObject({
        success: true,
        transport: 'udp',
        itemId: RETURNED_ITEM_UUID,
        assetId: RETURNED_ASSET_UUID,
        folderId: FOLDER_UUID,
      });
      expect(FilterResponse.Finish).toBeDefined();
    });
  });

  describe('InventoryManager immediate cache insertion & non-blocking folder tree', () => {
    it('builds large hierarchical folder trees asynchronously, excludes Trash, and defaults to Landmarks', async () => {
      const mockProtocol: any = { on: vi.fn(), off: vi.fn(), connected: true };
      const mockAuth: any = { isLoggedIn: () => true, user: { id: 'agent-1' } };
      const inv = new InventoryManager(mockProtocol, mockAuth);

      inv.setRootFolder('root-id');
      inv.createFolder('landmarks-id', {
        name: 'Landmarks',
        parent: 'root-id',
        folderType: LLFolderType.Landmark,
      });
      inv.createFolder('events-id', {
        name: 'Events 2026',
        parent: 'landmarks-id',
        folderType: LLFolderType.None,
      });
      inv.createFolder('trash-id', {
        name: 'Trash',
        parent: 'root-id',
        folderType: LLFolderType.Trash,
      });
      inv.createFolder('trashed-sub', {
        name: 'Discarded Places',
        parent: 'trash-id',
        folderType: LLFolderType.None,
      });

      // Add 320 custom folders to exercise chunked non-blocking yield
      for (let i = 0; i < 320; i++) {
        inv.createFolder(`custom-${i}`, {
          name: `Folder ${String(i).padStart(3, '0')}`,
          parent: 'root-id',
          folderType: LLFolderType.None,
        });
      }

      const { options, defaultFolderId } = await inv.getFolderHierarchyOptions({ chunkSize: 100 });
      expect(defaultFolderId).toBe('landmarks-id');
      expect(options.some((o) => o.id === 'trash-id')).toBe(false);
      expect(options.some((o) => o.id === 'trashed-sub')).toBe(false);
      expect(options.some((o) => o.id === 'events-id' && o.depth === 2)).toBe(true);
      expect(options.length).toBe(323); // root + Landmarks + Events 2026 + 320 custom folders

      // Also verify ViewerSession.getInventory camelCase typeDefault=3 skeleton folders resolve even when localized
      const localizedInv = new InventoryManager(mockProtocol, mockAuth);
      localizedInv.reconcileFolder(
        'root-loc',
        [
          { id: 'localized-lm', name: 'Repères', parent: 'root-loc', typeDefault: 3, folder: true },
          {
            id: 'localized-trash',
            name: 'Corbeille',
            parent: 'root-loc',
            typeDefault: 13,
            folder: true,
          },
        ],
        [],
      );
      const localizedHierarchy = await localizedInv.getFolderHierarchyOptions();
      expect(localizedHierarchy.defaultFolderId).toBe('localized-lm');
      expect(localizedHierarchy.options.some((o) => o.id === 'localized-trash')).toBe(false);
    });

    it('inserts confirmed landmark into client inventory cache immediately and emits inventory_updated', async () => {
      const mockProtocol: any = { on: vi.fn(), off: vi.fn(), connected: false };
      const mockAuth: any = { isLoggedIn: () => true, user: { id: 'agent-1' } };
      const inv = new InventoryManager(mockProtocol, mockAuth);

      inv.setRootFolder('root-id');
      inv.createFolder('landmarks-id', {
        name: 'Landmarks',
        parent: 'root-id',
        folderType: LLFolderType.Landmark,
      });
      inv.createFolder('venues-id', {
        name: 'Music Venues',
        parent: 'landmarks-id',
        folderType: LLFolderType.None,
      });

      vi.spyOn(slBridge, 'createLandmark').mockResolvedValue({
        success: true,
        transport: 'capability',
        capability: 'CreateLandmark',
        itemId: 'new-lm-uuid-1',
        assetId: 'new-lm-asset-1',
        folderId: 'venues-id',
      });

      const updatedSpy = vi.fn();
      inv.on('inventory_updated', updatedSpy);

      const created = await inv.createLandmark({
        name: 'Blue Note Club',
        description: 'Friday night jazz set',
        folderId: 'venues-id',
        position: [100, 150, 30],
      });

      expect(slBridge.createLandmark).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Blue Note Club',
          description: 'Friday night jazz set',
          folderId: 'venues-id',
        }),
      );
      expect(created.itemId).toBe('new-lm-uuid-1');
      const cachedItem = inv.getItem('new-lm-uuid-1');
      expect(cachedItem).toBeTruthy();
      expect(cachedItem.name).toBe('Blue Note Club');
      expect(cachedItem.assetType).toBe(LLAssetType.Landmark);
      expect(cachedItem.parent).toBe('venues-id');
      expect(inv.listFolderContents('venues-id').items.some((i) => i.id === 'new-lm-uuid-1')).toBe(
        true,
      );
      expect(updatedSpy).toHaveBeenCalled();
    });
  });
});
