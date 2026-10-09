import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const outfit = require('../../../core/sl-outfit.cjs');

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const id = (value: string) => ({ toString: () => value });
const item = (n: number, name: string, inventoryType: number, flags = 0, extra: any = {}) => ({
  itemID: id(uuid(n)),
  assetID: id(uuid(n + 1000)),
  name,
  inventoryType,
  flags,
  description: '',
  attachToAvatar: vi.fn(),
  detachFromAvatar: vi.fn(),
  ...extra,
});
const link = (n: number, target: any) => ({
  ...item(n, target.name, target.inventoryType, target.flags),
  assetID: target.itemID,
});

function world(cofItems: any[], inventory: any[], postResults: any[] = [{ success: true }]) {
  const sent: any[] = [];
  const cof: any = {
    folderID: id('cof'),
    version: 7,
    items: cofItems,
    removeItem: vi.fn(async (itemId: any) => {
      cof.items = cof.items.filter((i: any) => i.itemID !== itemId);
    }),
  };
  const post = vi.fn();
  postResults.forEach((r) => post.mockResolvedValueOnce(r));
  const circuit = {
    sessionID: id('sess'),
    sendMessage: vi.fn((m: any) => {
      sent.push(m);
    }),
    waitForMessage: vi.fn(async (_m: any, _t: number, _f: any) => {
      const last = sent.filter((m) => m.InventoryBlock).at(-1);
      return {
        InventoryData: [
          { CallbackID: last.InventoryBlock.CallbackID, ItemID: id(uuid(900 + sent.length)) },
        ],
      };
    }),
  };
  const region: any = {
    circuit,
    caps: { getCapability: vi.fn(async () => 'https://sim/cap'), capsPerformXMLPost: post },
    objects: { getObjectByUUID: vi.fn() },
  };
  const items = new Map(inventory.map((i) => [uuid(Number(i.itemID.toString().slice(-12))), i]));
  const bot: any = {
    agent: { agentID: id('me'), inventory: { main: { itemsByID: items, skeleton: new Map() } } },
    clientCommands: { agent: { getWearables: async () => cof, getAvatar: () => ({ ID: 50 }) } },
  };
  return { bot, region, cof, sent, post, circuit };
}

describe('wearing and removing', () => {
  it('replaces the worn shape instead of adding a second one, and rebuilds the appearance', async () => {
    const oldShape = item(1, 'Old shape', 18, 0);
    const newShape = item(2, 'New shape', 18, 0);
    const w = world([link(11, oldShape)], [oldShape, newShape]);
    const result = await outfit.wearItem(w.bot, w.region, { itemId: uuid(2) });
    expect(result).toEqual({ worn: 'New shape', baked: true });
    expect(w.sent.some((m) => m.InventoryData?.[0]?.ItemID?.toString() === uuid(11))).toBe(true); // old link removed
    const linkMessage = w.sent.find((m) => m.InventoryBlock);
    expect(linkMessage.InventoryBlock.OldItemID.toString()).toBe(uuid(2));
    expect(linkMessage.InventoryBlock.Type).toBe(24);
    expect(w.post).toHaveBeenCalledWith('https://sim/cap', { cof_version: 7 });
  });

  it('attaches an object and links it', async () => {
    const watch = item(3, 'Watch', 6);
    const w = world([], [watch]);
    await outfit.wearItem(w.bot, w.region, { itemId: uuid(3) });
    expect(watch.attachToAvatar).toHaveBeenCalledTimes(1);
    expect(w.sent.some((m) => m.InventoryBlock)).toBe(true);
  });

  it('retries the appearance update with the version the server expects, and reports a refusal', async () => {
    const jacket = item(4, 'Jacket', 18, 8);
    const w = world(
      [],
      [jacket],
      [{ success: false, error: 'Wrong COF version', expected: 9 }, { success: true }],
    );
    await expect(outfit.wearItem(w.bot, w.region, { itemId: uuid(4) })).resolves.toMatchObject({
      baked: true,
    });
    expect(w.post.mock.calls.map((c: any) => c[1].cof_version)).toEqual([7, 9]);

    const refused = world([], [jacket], [{ success: false, error: 'nope' }]);
    await expect(
      outfit.wearItem(refused.bot, refused.region, { itemId: uuid(4) }),
    ).resolves.toEqual({ worn: 'Jacket', baked: false, reason: 'nope' });
  });

  it('removes clothing and detaches attachments but never a body part', async () => {
    const jacket = item(5, 'Jacket', 18, 8);
    const watch = item(6, 'Watch', 6);
    const skin = item(7, 'Skin', 18, 1);
    const w = world([link(15, jacket), link(16, watch), link(17, skin)], [jacket, watch, skin]);
    await expect(outfit.removeWorn(w.bot, w.region, { linkId: uuid(17) })).rejects.toThrow(
      /cannot be taken off/,
    );
    await outfit.removeWorn(w.bot, w.region, { linkId: uuid(15) });
    await outfit.removeWorn(w.bot, w.region, { linkId: uuid(16) });
    expect(watch.detachFromAvatar).toHaveBeenCalledTimes(1);
    await expect(outfit.removeWorn(w.bot, w.region, { linkId: uuid(99) })).rejects.toThrow(
      /not part of the current outfit/,
    );
  });
});

describe('outfits, detach and teleport offers', () => {
  it('puts on a saved outfit: removes clothes not in it, keeps body parts, wears its items', async () => {
    const shape = item(1, 'Shape', 18, 0);
    const oldJacket = item(2, 'Old jacket', 18, 8);
    const hat = item(3, 'Hat', 6);
    const w = world([link(11, shape), link(12, oldJacket)], [shape, oldJacket, hat]);
    const outfitFolder = { folderID: id(uuid(500)), populate: vi.fn(), items: [link(21, hat)] };
    w.bot.agent.inventory.main.skeleton.set('o', outfitFolder);
    const result = await outfit.wearOutfit(w.bot, w.region, { folderId: uuid(500) });
    expect(result).toMatchObject({ worn: 1, baked: true });
    expect(w.sent.some((m) => m.InventoryData?.[0]?.ItemID?.toString() === uuid(12))).toBe(true); // jacket link removed
    expect(w.sent.some((m) => m.InventoryData?.[0]?.ItemID?.toString() === uuid(11))).toBe(false); // shape kept
    expect(hat.attachToAvatar).toHaveBeenCalled();
  });

  it('detaches only your own attachments', () => {
    const w = world([], []);
    w.region.objects.getObjectByUUID
      .mockReturnValueOnce({ ID: 77, ParentID: 50 })
      .mockReturnValueOnce({ ID: 78, ParentID: 12 })
      .mockReturnValueOnce(undefined);
    expect(outfit.detachAttachment(w.bot, w.region, { id: uuid(1) })).toEqual({
      detached: uuid(1),
    });
    expect(w.sent[0].ObjectData).toEqual([{ ObjectLocalID: 77 }]);
    expect(() => outfit.detachAttachment(w.bot, w.region, { id: uuid(2) })).toThrow(
      /not attached to you/,
    );
    expect(() => outfit.detachAttachment(w.bot, w.region, { id: uuid(3) })).toThrow(/not in view/);
  });

  it('offers a teleport to a resident', () => {
    const w = world([], []);
    outfit.offerTeleport(w.bot, w.region, { id: uuid(8), message: 'Join me' });
    const message = w.sent[0];
    expect(message.TargetData[0].TargetID.toString()).toBe(uuid(8));
    expect(message.Info.LureType).toBe(0);
    expect(() => outfit.offerTeleport(w.bot, w.region, { id: 'nope' })).toThrow(/UUID/);
  });
});
