import { createRequire } from 'module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../auth';
import { corsHandler } from '../cors-handler';
import { InventoryManager } from '../inventory';
import { localCache } from '../local-cache';
import { slBridge } from '../sl-bridge';
import { SLConnectionFull } from '../sl-connection-full';
import {
  buildItemPermissionUpdate,
  chunkUpdatesForUdp,
  computeBatchPermissionStates,
  formatAcquisitionTimestamp,
  formatAvatarIdentity,
  MAX_BATCH_UPDATE_ITEMS,
  PERMISSION_BITS,
  UNRESOLVED_AVATAR_PLACEHOLDER,
  type InspectableInventoryItem,
} from '../services/inventory-properties-service';

const require = createRequire(import.meta.url);
const { ViewerSession } = require('../../../core/viewer-session.cjs') as {
  ViewerSession: new () => ViewerSessionTestInstance;
};
const { METHODS, callViewer } = require('../../../core/viewer-api.cjs') as {
  METHODS: Set<string>;
  callViewer: (
    session: unknown,
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
};
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags') as {
  PacketFlags: { Reliable: number };
};

interface SentUdpRecord {
  msg: {
    name: string;
    getSize: () => number;
    InventoryData: Array<{
      ItemID: { toString: () => string };
      GroupMask: number;
      EveryoneMask: number;
      NextOwnerMask: number;
      CRC: number;
      Name: Buffer;
      Description: Buffer;
    }>;
  };
  flags: number;
}

interface ViewerSessionTestInstance {
  identity: Record<string, unknown> | null;
  bot: Record<string, unknown> | null;
  updateInventoryItems: (params: {
    updates: Array<Record<string, unknown>>;
    timeout?: number;
  }) => Promise<{
    success: boolean;
    transport: 'capability' | 'udp';
    chunkCount: number;
    updatedCount: number;
    items: Array<Record<string, unknown>>;
  }>;
  resolveAvatarNames: (params: {
    ids: string[];
    timeout?: number;
  }) => Promise<{ names: Record<string, string> }>;
}

describe('Inventory Properties Service & Batch Capability / UDP Updates', () => {
  let protocol: SLConnectionFull;
  let auth: AuthManager;
  let inventory: InventoryManager;

  beforeEach(() => {
    protocol = new SLConnectionFull();
    auth = new AuthManager(protocol);
    inventory = new InventoryManager(protocol, auth);
    slBridge.connected = false;
    slBridge.sessionId = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    slBridge.connected = false;
    slBridge.sessionId = null;
  });

  it('computes tri-state permission indicators and preserves untouched indeterminate bits per item', () => {
    const itemA: InspectableInventoryItem = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Mesh Jacket - Red',
      description: 'v1.0',
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        groupMask: PERMISSION_BITS.MODIFY | PERMISSION_BITS.COPY,
        everyoneMask: 0,
        nextOwnerMask: PERMISSION_BITS.MODIFY | PERMISSION_BITS.COPY | PERMISSION_BITS.TRANSFER,
      },
    };
    const itemB: InspectableInventoryItem = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Mesh Jacket - Blue',
      description: 'v1.0',
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        groupMask: 0,
        everyoneMask: 0,
        nextOwnerMask: PERMISSION_BITS.COPY,
      },
    };

    const summary = computeBatchPermissionStates([itemA, itemB]);
    expect(summary.hasConflicts).toBe(true);
    expect(summary.states.groupShare).toBe('indeterminate');
    expect(summary.states.everyoneCopy).toBe('unchecked');
    expect(summary.states.nextOwnerModify).toBe('indeterminate');
    expect(summary.states.nextOwnerCopy).toBe('checked');
    expect(summary.states.nextOwnerTransfer).toBe('indeterminate');

    // Merchant sets Next Owner to Copy-only while leaving groupShare indeterminate
    const draft = {
      states: {
        groupShare: 'indeterminate' as const,
        everyoneCopy: 'unchecked' as const,
        nextOwnerModify: 'unchecked' as const,
        nextOwnerCopy: 'checked' as const,
        nextOwnerTransfer: 'unchecked' as const,
      },
    };

    const patchA = buildItemPermissionUpdate(itemA, draft, false);
    const patchB = buildItemPermissionUpdate(itemB, draft, false);

    // Untouched groupShare bit preserved individually on each item
    expect(patchA.permissions.groupMask).toBe(PERMISSION_BITS.MODIFY | PERMISSION_BITS.COPY);
    expect(patchB.permissions.groupMask).toBe(0);

    // Next owner permissions updated to Copy-only on both items
    expect(patchA.permissions.nextOwnerMask & PERMISSION_BITS.COPY).toBe(PERMISSION_BITS.COPY);
    expect(patchA.permissions.nextOwnerMask & PERMISSION_BITS.MODIFY).toBe(0);
    expect(patchA.permissions.nextOwnerMask & PERMISSION_BITS.TRANSFER).toBe(0);

    expect(patchB.permissions.nextOwnerMask & PERMISSION_BITS.COPY).toBe(PERMISSION_BITS.COPY);
    expect(patchB.permissions.nextOwnerMask & PERMISSION_BITS.MODIFY).toBe(0);
    expect(patchB.permissions.nextOwnerMask & PERMISSION_BITS.TRANSFER).toBe(0);
  });

  it('formats avatar identities and timestamps honestly using "―" for unresolvable data', () => {
    const resolved = {
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': 'Clara Maker',
    };
    expect(formatAvatarIdentity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', resolved)).toBe(
      'Clara Maker',
    );
    expect(formatAvatarIdentity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', resolved)).toBe(
      UNRESOLVED_AVATAR_PLACEHOLDER,
    );
    expect(formatAvatarIdentity('00000000-0000-0000-0000-000000000000', resolved)).toBe(
      UNRESOLVED_AVATAR_PLACEHOLDER,
    );
    expect(formatAvatarIdentity('', resolved, 'Unknown Avatar')).toBe(
      UNRESOLVED_AVATAR_PLACEHOLDER,
    );

    expect(formatAcquisitionTimestamp(0)).toBe(UNRESOLVED_AVATAR_PLACEHOLDER);
    expect(formatAcquisitionTimestamp(undefined)).toBe(UNRESOLVED_AVATAR_PLACEHOLDER);
    expect(formatAcquisitionTimestamp(1700000000)).toBe('2023-11-14 22:13 UTC');
  });

  it('dispatches batch updates via UpdateInventoryItem capability and updates cache immediately', async () => {
    const itemId = '33333333-3333-4333-8333-333333333333';
    const parentId = '44444444-4444-4444-8444-444444444444';
    inventory.items.set(
      itemId,
      inventory.normalizeItem({
        id: itemId,
        parent: parentId,
        name: 'Product Crate',
        description: 'Release v1',
        permissions: {
          baseMask: PERMISSION_BITS.ALL,
          ownerMask: PERMISSION_BITS.ALL,
          groupMask: 0,
          everyoneMask: 0,
          nextOwnerMask: PERMISSION_BITS.ALL,
        },
      }),
    );

    protocol.capabilities = {
      UpdateInventoryItem: 'https://sim1001.agni.lindenlab.com:12043/cap/update-inv',
    };

    const makeReqSpy = vi.spyOn(corsHandler, 'makeRequest').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<llsd><map><key>success</key><boolean>1</boolean></map></llsd>',
    } as Response);

    const saveCacheSpy = vi.spyOn(localCache, 'saveInventory').mockResolvedValue();
    const progressPercentages: number[] = [];

    const updatePayload = buildItemPermissionUpdate(
      inventory.items.get(itemId),
      {
        states: {
          nextOwnerModify: 'unchecked',
          nextOwnerCopy: 'checked',
          nextOwnerTransfer: 'unchecked',
        },
      },
      false,
    );

    const result = await inventory.batchUpdateItemProperties([updatePayload], {
      onProgress: (p) => progressPercentages.push(p.percent),
    });

    expect(result.success).toBe(true);
    expect(result.transport).toBe('capability');
    expect(makeReqSpy).toHaveBeenCalledTimes(1);
    expect(makeReqSpy.mock.calls[0][0]).toBe(
      'https://sim1001.agni.lindenlab.com:12043/cap/update-inv',
    );
    expect(String(makeReqSpy.mock.calls[0][1]?.body)).toContain(itemId);
    expect(saveCacheSpy).toHaveBeenCalledTimes(1);
    expect(progressPercentages[progressPercentages.length - 1]).toBe(100);

    const updatedItem = inventory.items.get(itemId);
    expect(updatedItem.permissions.nextOwnerMask & PERMISSION_BITS.COPY).toBe(PERMISSION_BITS.COPY);
    expect(updatedItem.permissions.nextOwnerMask & PERMISSION_BITS.TRANSFER).toBe(0);
  });

  it('rolls back modified items in memory and cache when batch update fails', async () => {
    const itemId = '55555555-5555-4555-8555-555555555555';
    const originalNextOwnerMask =
      PERMISSION_BITS.MODIFY | PERMISSION_BITS.COPY | PERMISSION_BITS.TRANSFER;

    inventory.items.set(
      itemId,
      inventory.normalizeItem({
        id: itemId,
        parent: '66666666-6666-4666-8666-666666666666',
        name: 'Fragile Asset',
        description: 'Original desc',
        permissions: {
          baseMask: PERMISSION_BITS.ALL,
          ownerMask: PERMISSION_BITS.ALL,
          groupMask: 0,
          everyoneMask: 0,
          nextOwnerMask: originalNextOwnerMask,
        },
      }),
    );

    protocol.capabilities = {
      UpdateInventoryItem: 'https://sim1001.agni.lindenlab.com:12043/cap/update-inv',
    };

    vi.spyOn(corsHandler, 'makeRequest').mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal simulator error',
    } as Response);
    const saveCacheSpy = vi.spyOn(localCache, 'saveInventory').mockResolvedValue();

    const updatePayload = buildItemPermissionUpdate(
      inventory.items.get(itemId),
      {
        name: 'Mutated Name',
        description: 'Mutated Desc',
        states: {
          nextOwnerModify: 'unchecked',
          nextOwnerCopy: 'checked',
          nextOwnerTransfer: 'unchecked',
        },
      },
      true,
    );

    await expect(inventory.batchUpdateItemProperties([updatePayload])).rejects.toThrow(
      /UpdateInventoryItem capability failed/,
    );

    const rolledBack = inventory.items.get(itemId);
    expect(rolledBack.name).toBe('Fragile Asset');
    expect(rolledBack.description).toBe('Original desc');
    expect(rolledBack.permissions.nextOwnerMask).toBe(originalNextOwnerMask);
    expect(saveCacheSpy).toHaveBeenCalledTimes(1);
  });

  it('enforces the 100-item batch limit guardrail in both service and ViewerSession', async () => {
    const oversized = Array.from({ length: MAX_BATCH_UPDATE_ITEMS + 1 }, (_, i) => ({
      itemId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name: `Item ${i}`,
      description: '',
      groupOwned: false,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        groupMask: 0,
        everyoneMask: 0,
        nextOwnerMask: PERMISSION_BITS.COPY,
        groupOwned: false,
      },
    }));

    await expect(inventory.batchUpdateItemProperties(oversized)).rejects.toThrow(
      /limited to 100 items/,
    );

    const session = new ViewerSession();
    await expect(session.updateInventoryItems({ updates: oversized })).rejects.toThrow(
      /limited to 100 items/,
    );
  });

  it('chunks reliable UDP UpdateInventoryItemMessage packets under MTU when capability is unavailable', async () => {
    expect(METHODS.has('updateInventoryItems')).toBe(true);
    expect(METHODS.has('resolveAvatarNames')).toBe(true);

    const sentPackets: SentUdpRecord[] = [];
    const ackedSeqs: number[] = [];

    const skeletonItems = Array.from({ length: 20 }, (_, idx) => {
      const id = `77777777-7777-4777-8777-${String(idx + 1).padStart(12, '0')}`;
      return {
        itemID: { toString: () => id },
        parentID: { toString: () => '88888888-8888-4888-8888-888888888888' },
        assetID: { toString: () => '99999999-9999-4999-8999-999999999999' },
        name: `Release Asset Component #${idx + 1}`,
        description: 'Merchant release build v2.4',
        type: 6,
        inventoryType: 6,
        flags: 0,
        saleType: 0,
        salePrice: 0,
        created: new Date('2025-05-01T12:00:00Z'),
        permissions: {
          creator: { toString: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
          owner: { toString: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
          group: { toString: () => '00000000-0000-0000-0000-000000000000' },
          baseMask: PERMISSION_BITS.ALL,
          ownerMask: PERMISSION_BITS.ALL,
          groupMask: 0,
          everyoneMask: 0,
          nextOwnerMask: PERMISSION_BITS.ALL,
          groupOwned: false,
        },
      };
    });

    const skeletonMap = new Map([
      ['88888888-8888-4888-8888-888888888888', { items: skeletonItems }],
    ]);

    const session = new ViewerSession();
    session.identity = { agent_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    session.bot = {
      agent: {
        agentID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        inventory: { main: { skeleton: skeletonMap } },
      },
      currentRegion: {
        caps: {
          isCapAvailable: async () => false,
        },
        circuit: {
          sessionID: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          sendMessage: (msg: SentUdpRecord['msg'], flags: number) => {
            sentPackets.push({ msg, flags });
            return sentPackets.length;
          },
          waitForAck: async (seq: number) => {
            ackedSeqs.push(seq);
          },
        },
      },
    };

    const updates = skeletonItems.map((it) => ({
      itemId: it.itemID.toString(),
      name: it.name,
      description: it.description,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        groupMask: 0,
        everyoneMask: 0,
        nextOwnerMask: PERMISSION_BITS.COPY,
        groupOwned: false,
      },
    }));

    const result = (await callViewer(session, 'updateInventoryItems', {
      updates,
    })) as {
      success: boolean;
      transport: string;
      chunkCount: number;
      updatedCount: number;
    };

    expect(result.success).toBe(true);
    expect(result.transport).toBe('udp');
    expect(result.updatedCount).toBe(20);
    expect(sentPackets.length).toBeGreaterThan(1);
    expect(result.chunkCount).toBe(sentPackets.length);
    expect(ackedSeqs).toHaveLength(sentPackets.length);

    let totalDispatchedItems = 0;
    for (const pkt of sentPackets) {
      expect(pkt.msg.name).toBe('UpdateInventoryItem');
      expect(pkt.flags).toBe(PacketFlags.Reliable);
      // Every UDP batch packet must stay safely below the 1200-byte SL MTU
      expect(pkt.msg.getSize()).toBeLessThanOrEqual(1100);
      for (const block of pkt.msg.InventoryData) {
        expect(block.NextOwnerMask).toBe(PERMISSION_BITS.COPY);
        expect(block.CRC).toBeGreaterThan(0);
        totalDispatchedItems += 1;
      }
    }
    expect(totalDispatchedItems).toBe(20);
    expect(skeletonItems[0].permissions.nextOwnerMask).toBe(PERMISSION_BITS.COPY);
    expect(skeletonItems[19].permissions.nextOwnerMask).toBe(PERMISSION_BITS.COPY);

    // Client-side chunker produces matching bounded chunks
    const clientChunks = chunkUpdatesForUdp(
      updates.map((u) => ({
        ...u,
        groupOwned: false,
      })),
    );
    expect(clientChunks.length).toBe(sentPackets.length);
  });

  it('routes ViewerSession.updateInventoryItems to region UpdateInventoryItem capability with LLSD UUIDs when available', async () => {
    const itemId = 'abababab-abab-4bab-8bab-abababababab';
    const parentId = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
    let postedCapName = '';
    let postedPayload: Record<string, unknown> | null = null;
    const sendMessageSpy = vi.fn();

    const session = new ViewerSession();
    session.identity = { agent_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    session.bot = {
      agent: {
        agentID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        inventory: {
          main: {
            skeleton: new Map([
              [
                parentId,
                {
                  items: [
                    {
                      itemID: { toString: () => itemId },
                      parentID: { toString: () => parentId },
                      name: 'Sculpted Column',
                      description: 'v1',
                      permissions: {
                        baseMask: PERMISSION_BITS.ALL,
                        ownerMask: PERMISSION_BITS.ALL,
                        groupMask: 0,
                        everyoneMask: 0,
                        nextOwnerMask: PERMISSION_BITS.ALL,
                        groupOwned: false,
                      },
                    },
                  ],
                },
              ],
            ]),
          },
        },
      },
      currentRegion: {
        caps: {
          isCapAvailable: async (name: string) => name === 'UpdateInventoryItem',
          getCapability: async (name: string) =>
            name === 'UpdateInventoryItem'
              ? 'https://sim1001.agni.lindenlab.com:12043/cap/update-item'
              : '',
          capsPostXML: async (capName: string, payload: Record<string, unknown>) => {
            postedCapName = capName;
            postedPayload = payload;
            return { updates: [{ item_id: itemId }] };
          },
        },
        circuit: {
          sendMessage: sendMessageSpy,
        },
      },
    };

    const res = await session.updateInventoryItems({
      updates: [
        {
          itemId,
          parentId,
          name: 'Sculpted Column',
          description: 'v2',
          permissions: {
            baseMask: PERMISSION_BITS.ALL,
            ownerMask: PERMISSION_BITS.ALL,
            groupMask: 0,
            everyoneMask: 0,
            nextOwnerMask: PERMISSION_BITS.COPY,
            groupOwned: false,
          },
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(res.transport).toBe('capability');
    expect(postedCapName).toBe('UpdateInventoryItem');
    expect(postedPayload).not.toBeNull();
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('resolves avatar names via ViewerSession and omits unresolvable UUIDs without placeholders', async () => {
    const resolvedId = '12121212-1212-4212-8212-121212121212';
    const unknownId = '34343434-3434-4434-8434-343434343434';

    const session = new ViewerSession();
    session.identity = {
      agent_id: '90909090-9090-4090-8090-909090909090',
      display_name: 'Builder Self',
    };
    session.bot = {
      currentRegion: {
        caps: {
          isCapAvailable: async () => false,
        },
      },
      clientCommands: {
        grid: {
          avatarKey2Name: async () => [
            {
              getKey: () => ({ toString: () => resolvedId }),
              getName: () => 'Evelyn Sculptor',
            },
            {
              getKey: () => ({ toString: () => unknownId }),
              getName: () => 'Loading...',
            },
          ],
        },
      },
    };

    const res = await session.resolveAvatarNames({
      ids: [
        '90909090-9090-4090-8090-909090909090',
        resolvedId,
        unknownId,
        '00000000-0000-0000-0000-000000000000',
      ],
    });

    expect(res.names['90909090-9090-4090-8090-909090909090']).toBe('Builder Self');
    expect(res.names[resolvedId]).toBe('Evelyn Sculptor');
    expect(res.names[unknownId]).toBeUndefined();
  });
});
