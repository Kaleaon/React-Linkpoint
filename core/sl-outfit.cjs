'use strict';
/**
 * Changing what the avatar wears. Modern Second Life keeps the outfit as links in the Current
 * Outfit folder (COF); after changing it the viewer asks the server to rebuild the avatar with the
 * COF version. Attachments are also rezzed or detached directly. None of this has a high-level call
 * in the library, so the pieces are the raw messages the official viewer sends.
 */
const { UUID, AssetType } = require('@caspertech/node-metaverse');
const {
  LinkInventoryItemMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/LinkInventoryItem');
const {
  RemoveInventoryItemMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/RemoveInventoryItem');
const {
  ObjectDetachMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/ObjectDetach');
const {
  StartLureMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/StartLure');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');
const { FilterResponse } = require('@caspertech/node-metaverse/dist/lib/enums/FilterResponse');
const { FolderType } = require('@caspertech/node-metaverse/dist/lib/enums/FolderType');
const { Utils } = require('@caspertech/node-metaverse/dist/lib/classes/Utils');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INV_OBJECT = 6;
const INV_WEARABLE = 18;
const LINK_TYPE = 24;
/** Body parts have exactly one worn at a time: Shape, Skin, Hair, Eyes (and Physics). */
const SINGLE_SLOT = new Set([0, 1, 2, 3, 15]);
const BODY_PART = new Set([0, 1, 2, 3]);
const wearableType = (item) => Number(item.flags) & 0xff;
const idOf = (value) => String(value?.toString?.() ?? value ?? '').toLowerCase();

function requireUuid(value, label) {
  if (!UUID_PATTERN.test(String(value || ''))) throw new Error(`${label} must be a UUID`);
  return String(value);
}

function session(bot, region) {
  const circuit = region?.circuit;
  const agentID = bot?.agent?.agentID;
  if (!circuit?.sendMessage || !agentID)
    throw new Error('Not ready: the region has not loaded yet');
  return { circuit, agentID, sessionID: circuit.sessionID };
}

async function currentOutfitFolder(bot) {
  const folder = await bot.clientCommands.agent.getWearables();
  if (!folder) throw new Error('The Current Outfit folder could not be found');
  return folder;
}

function findItem(bot, itemId) {
  const id = idOf(requireUuid(itemId, 'item id'));
  const direct = bot.agent?.inventory?.main?.itemsByID?.get?.(id);
  if (direct) return direct;
  for (const [key, item] of bot.agent?.inventory?.main?.itemsByID || [])
    if (idOf(key) === id) return item;
  return null;
}

/** Create a link to `item` in the Current Outfit folder and wait for the grid to confirm it. */
async function addLink(bot, region, cof, item) {
  const { circuit, agentID, sessionID } = session(bot, region);
  const callbackID = Math.floor(Math.random() * 0x7fffffff);
  const message = new LinkInventoryItemMessage();
  message.AgentData = { AgentID: agentID, SessionID: sessionID };
  message.InventoryBlock = {
    CallbackID: callbackID,
    FolderID: cof.folderID,
    TransactionID: UUID.zero(),
    OldItemID: item.itemID,
    Type: LINK_TYPE,
    InvType: item.inventoryType,
    Name: Utils.StringToBuffer(item.name || ''),
    Description: Utils.StringToBuffer(item.description || ''),
  };
  circuit.sendMessage(message, PacketFlags.Reliable);
  const reply = await circuit.waitForMessage(Message.UpdateCreateInventoryItem, 10000, (m) =>
    (m.InventoryData || []).some((d) => d.CallbackID === callbackID)
      ? FilterResponse.Finish
      : FilterResponse.NoMatch,
  );
  return (reply.InventoryData || []).find((d) => d.CallbackID === callbackID)?.ItemID;
}

/** Delete one link from the Current Outfit folder. */
async function removeLink(bot, region, cof, link) {
  const { circuit, agentID, sessionID } = session(bot, region);
  const message = new RemoveInventoryItemMessage();
  message.AgentData = { AgentID: agentID, SessionID: sessionID };
  message.InventoryData = [{ ItemID: link.itemID }];
  circuit.sendMessage(message, PacketFlags.Reliable);
  try {
    await cof.removeItem(link.itemID, false);
  } catch {
    /* the cache entry is already gone */
  }
}

/**
 * Ask the server to rebuild the avatar from the Current Outfit folder. The server insists on the folder
 * version it expects; when ours is stale it says which one, so retry with that.
 */
async function updateAppearance(region, cof) {
  const caps = region?.caps;
  const url = await caps?.getCapability?.('UpdateAvatarAppearance');
  if (!url) return { baked: false, reason: 'This grid has no UpdateAvatarAppearance capability' };
  let version = Number(cof.version) || 0;
  let reason = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await caps.capsPerformXMLPost(url, { cof_version: version });
    if (!result || result.success !== false) return { baked: true };
    reason = String(result.error || 'The server did not accept the outfit version');
    const expected = Number(result.expected);
    if (!Number.isInteger(expected) || expected === version) break;
    version = expected;
  }
  return { baked: false, reason };
}

/** Link `item` into the COF (replacing a body part of the same type) and attach it when it is an object. */
async function wearOne(bot, region, cof, item) {
  if (item.inventoryType !== INV_OBJECT && item.inventoryType !== INV_WEARABLE)
    throw new Error(`${item.name || 'This item'} cannot be worn`);
  if (item.inventoryType === INV_WEARABLE && SINGLE_SLOT.has(wearableType(item))) {
    for (const link of [...(cof.items || [])]) {
      if (link.inventoryType === INV_WEARABLE && wearableType(link) === wearableType(item))
        await removeLink(bot, region, cof, link);
    }
  }
  if ((cof.items || []).some((link) => idOf(link.assetID) === idOf(item.itemID))) return;
  if (item.inventoryType === INV_OBJECT) await item.attachToAvatar(0);
  await addLink(bot, region, cof, item);
}

async function wearItem(bot, region, { itemId } = {}) {
  const item = findItem(bot, itemId);
  if (!item) throw new Error('That item is not loaded yet; open its folder in Inventory first');
  const cof = await currentOutfitFolder(bot);
  await wearOne(bot, region, cof, item);
  return { worn: item.name, ...(await updateAppearance(region, cof)) };
}

/** Take off one worn item, given the id of its link in the Current Outfit folder. Body parts can only be replaced. */
async function removeOne(bot, region, cof, link) {
  if (link.inventoryType === INV_WEARABLE && BODY_PART.has(wearableType(link))) {
    throw new Error(
      `${link.name || 'A body part'} cannot be taken off; wear another one to replace it`,
    );
  }
  if (link.inventoryType === INV_OBJECT) {
    const target = findItem(bot, idOf(link.assetID));
    if (target) await target.detachFromAvatar();
  }
  await removeLink(bot, region, cof, link);
}

async function removeWorn(bot, region, { linkId } = {}) {
  const id = idOf(requireUuid(linkId, 'link id'));
  const cof = await currentOutfitFolder(bot);
  const link = (cof.items || []).find((item) => idOf(item.itemID) === id);
  if (!link) throw new Error('That item is not part of the current outfit');
  await removeOne(bot, region, cof, link);
  return { removed: link.name, ...(await updateAppearance(region, cof)) };
}

/** Put on a saved outfit: clothes and attachments not in it come off, its items go on, body parts are replaced. */
async function wearOutfit(bot, region, { folderId } = {}) {
  const id = idOf(requireUuid(folderId, 'folder id'));
  const skeleton = bot.agent?.inventory?.main?.skeleton;
  const outfit = skeleton && [...skeleton.values()].find((f) => idOf(f.folderID) === id);
  if (!outfit) throw new Error('That outfit folder was not found');
  await outfit.populate(false);
  const cof = await currentOutfitFolder(bot);

  const wanted = (outfit.items || [])
    .map((link) => findItem(bot, idOf(link.assetID)))
    .filter(Boolean);
  if (!wanted.length) throw new Error('That outfit has no items that could be loaded');
  const keep = new Set(wanted.map((item) => idOf(item.itemID)));
  for (const link of [...(cof.items || [])]) {
    const isBody = link.inventoryType === INV_WEARABLE && BODY_PART.has(wearableType(link));
    if (!isBody && !keep.has(idOf(link.assetID))) await removeOne(bot, region, cof, link);
  }
  for (const item of wanted) await wearOne(bot, region, cof, item);
  return { worn: wanted.length, ...(await updateAppearance(region, cof)) };
}

/** Detach one of your own attachments by object id, back to inventory. */
function detachAttachment(bot, region, { id } = {}) {
  const { circuit, agentID, sessionID } = session(bot, region);
  const object = region.objects?.getObjectByUUID?.(requireUuid(id, 'object id'));
  const avatar = bot.clientCommands?.agent?.getAvatar?.();
  const localId = object?.ID ?? object?.localID;
  if (!object || !Number.isInteger(localId)) throw new Error('That object is not in view');
  if (!avatar || Number(object.ParentID) !== Number(avatar.ID ?? avatar.localID))
    throw new Error('That object is not attached to you');
  const message = new ObjectDetachMessage();
  message.AgentData = { AgentID: agentID, SessionID: sessionID };
  message.ObjectData = [{ ObjectLocalID: localId }];
  circuit.sendMessage(message, PacketFlags.Reliable);
  return { detached: idOf(id) };
}

/** Offer a teleport to another resident. */
function offerTeleport(bot, region, { id, message = '' } = {}) {
  const { circuit, agentID, sessionID } = session(bot, region);
  const lure = new StartLureMessage();
  lure.AgentData = { AgentID: agentID, SessionID: sessionID };
  lure.Info = { LureType: 0, Message: Utils.StringToBuffer(String(message).slice(0, 254)) };
  lure.TargetData = [{ TargetID: new UUID(requireUuid(id, 'resident id')) }];
  circuit.sendMessage(lure, PacketFlags.Reliable);
  return { offered: idOf(id) };
}

/** The Shape you are wearing as parameter id -> weight, read from its asset. */
async function getShape(bot) {
  const { LLWearable } = require('@caspertech/node-metaverse');
  const cof = await currentOutfitFolder(bot);
  const link = (cof.items || []).find(
    (item) => item.inventoryType === INV_WEARABLE && wearableType(item) === 0,
  );
  if (!link) throw new Error('No shape is worn');
  const target = findItem(bot, idOf(link.assetID)) || link;
  const buffer = await bot.clientCommands.asset.downloadAsset(AssetType.Bodypart, target.assetID);
  const wearable = new LLWearable(Buffer.from(buffer).toString('utf8'));
  return {
    itemId: idOf(target.itemID),
    name: wearable.name || target.name,
    values: { ...wearable.parameters },
  };
}

/**
 * Save edited shape values as a NEW Shape in the Body Parts folder, then wear it. The original is left
 * untouched, so a bad edit can always be undone by wearing it again.
 */
async function saveShape(bot, region, { values, name } = {}) {
  const { LLWearable, InventoryType } = require('@caspertech/node-metaverse');
  if (!values || typeof values !== 'object') throw new Error('Shape values are required');
  const cof = await currentOutfitFolder(bot);
  const link = (cof.items || []).find(
    (item) => item.inventoryType === INV_WEARABLE && wearableType(item) === 0,
  );
  if (!link) throw new Error('No shape is worn');
  const target = findItem(bot, idOf(link.assetID)) || link;
  const buffer = await bot.clientCommands.asset.downloadAsset(AssetType.Bodypart, target.assetID);
  const wearable = new LLWearable(Buffer.from(buffer).toString('utf8'));
  for (const [id, weight] of Object.entries(values)) {
    const number = Number(weight);
    if (!Number.isFinite(number)) throw new Error(`Parameter ${id} is not a number`);
    wearable.parameters[Number(id)] = number;
  }
  const skeleton = bot.agent?.inventory?.main?.skeleton;
  const folder =
    skeleton && [...skeleton.values()].find((f) => f.typeDefault === FolderType.BodyPart);
  if (!folder) throw new Error('The Body Parts folder was not found');
  const title = String(name || `${wearable.name || 'Shape'} (edited)`).slice(0, 63);
  wearable.name = title;
  const created = await folder.uploadAsset(
    AssetType.Bodypart,
    InventoryType.Wearable,
    Buffer.from(wearable.toAsset()),
    title,
    'Edited in Linkpoint',
    target.flags,
  );
  await wearOne(bot, region, cof, created);
  return { saved: title, ...(await updateAppearance(region, cof)) };
}

module.exports = {
  wearItem,
  removeWorn,
  wearOutfit,
  detachAttachment,
  offerTeleport,
  getShape,
  saveShape,
  updateAppearance,
  SINGLE_SLOT,
  BODY_PART,
};
