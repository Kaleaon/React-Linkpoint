// Relays the simulator's animation announcements to the viewer.
//
// AvatarAnimation lists what an avatar is playing; ObjectAnimation does the same
// for animated objects (Animesh). Both carry the subject's id, the animation
// UUIDs and a sequence number that changes whenever an animation is restarted.
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');

function serializeAnimationMessage(packet) {
  const message = packet?.message;
  if (!message) return null;
  const kind =
    message.id === Message.ObjectAnimation
      ? 'object'
      : message.id === Message.AvatarAnimation
        ? 'avatar'
        : null;
  const id = message.Sender?.ID?.toString?.();
  if (!kind || !id) return null;
  return {
    kind,
    id,
    animations: (message.AnimationList || [])
      .map((entry) => ({
        id: entry.AnimID?.toString?.() || '',
        seq: Number(entry.AnimSequenceID) || 0,
      }))
      .filter((entry) => entry.id),
  };
}

/**
 * Subscribe to animation messages on a region's circuit.
 * Returns the subscription (call `.unsubscribe()` to stop) or null if unavailable.
 */
function subscribeAnimations(region, send) {
  const circuit = region?.circuit;
  if (!circuit || typeof circuit.subscribeToMessages !== 'function') return null;
  return circuit.subscribeToMessages(
    [Message.AvatarAnimation, Message.ObjectAnimation],
    (packet) => {
      const payload = serializeAnimationMessage(packet);
      if (payload) send('animations', payload);
    },
  );
}

/**
 * Like subscribeAnimations, but follows the agent across regions: when the bot's current
 * region (and so its circuit) changes, the listener moves to the new circuit.
 */
function watchAnimations(getRegion, send, intervalMs = 2000) {
  let region = getRegion();
  let subscription = subscribeAnimations(region, send);
  const timer = setInterval(() => {
    const current = getRegion();
    if (!current || (current === region && current.circuit === (region && region.circuit))) return;
    if (subscription) subscription.unsubscribe();
    region = current;
    subscription = subscribeAnimations(region, send);
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return {
    unsubscribe() {
      clearInterval(timer);
      if (subscription) subscription.unsubscribe();
      subscription = null;
    },
  };
}

const MAX_ANIMATION_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const MAX_ANIMATION_LIST_CHUNK = 64;

/**
 * Send outbound AgentAnimation start/stop packets on the region circuit so the simulator
 * broadcasts custom avatar poses (such as client-side AO overrides) to nearby residents.
 */
function sendAgentAnimations(bot, region, animations) {
  if (!bot) throw new Error('Not connected to a simulator');
  const circuit = region?.circuit || bot?.circuit;
  const rawAgentId = bot?.agent?.agentID;
  const rawSessionId = circuit?.sessionID || bot?.sessionID;
  if (!circuit || typeof circuit.sendMessage !== 'function' || !rawAgentId || !rawSessionId) {
    throw new Error('Region circuit unavailable for AgentAnimation');
  }
  if (!Array.isArray(animations) || animations.length === 0) {
    throw new Error('animations must be a non-empty array');
  }

  const { UUID } = require('@caspertech/node-metaverse/dist/lib/classes/UUID');
  const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');
  const {
    AgentAnimationMessage,
  } = require('@caspertech/node-metaverse/dist/lib/classes/messages/AgentAnimation');

  const normalized = animations.map((item, idx) => {
    const id = String(item?.id || '')
      .trim()
      .toLowerCase();
    if (!UUID_PATTERN.test(id) || id === ZERO_UUID) {
      throw new Error(`animations[${idx}].id must be a valid non-zero UUID`);
    }
    if (typeof item?.start !== 'boolean') {
      throw new Error(`animations[${idx}].start must be a boolean`);
    }
    return { id, start: item.start };
  });

  const agentUUID = rawAgentId instanceof UUID ? rawAgentId : new UUID(String(rawAgentId));
  const sessionUUID = rawSessionId instanceof UUID ? rawSessionId : new UUID(String(rawSessionId));

  for (let offset = 0; offset < normalized.length; offset += MAX_ANIMATION_LIST_CHUNK) {
    const slice = normalized.slice(offset, offset + MAX_ANIMATION_LIST_CHUNK);
    const msg = new AgentAnimationMessage();
    msg.AgentData = {
      AgentID: agentUUID,
      SessionID: sessionUUID,
    };
    msg.AnimationList = slice.map((entry) => ({
      AnimID: new UUID(entry.id),
      StartAnim: entry.start,
    }));
    msg.PhysicalAvatarEventList = [];
    circuit.sendMessage(msg, PacketFlags.Reliable);
  }

  return { sent: true, count: normalized.length };
}

/** Download an animation asset from the simulator's asset service and return it base64-encoded. */
async function downloadAnimation(bot, id) {
  if (!bot) throw new Error('Not connected to a simulator');
  if (!UUID_PATTERN.test(String(id || ''))) throw new Error('Invalid animation id');
  const { AssetType, UUID } = require('@caspertech/node-metaverse');
  const asset = bot.clientCommands.asset;
  let buffer;
  try {
    buffer = await asset.downloadAsset(AssetType.Animation, id);
  } catch (viewerAssetError) {
    // Agni can reject otherwise readable animations at ViewerAsset with HTTP 403. The original
    // simulator TransferRequest path remains valid, so retry there before declaring the pose lost.
    if (typeof asset.transfer !== 'function') throw viewerAssetError;
    const {
      TransferChannelType,
    } = require('@caspertech/node-metaverse/dist/lib/enums/TransferChannelType');
    const {
      TransferSourceType,
    } = require('@caspertech/node-metaverse/dist/lib/enums/TransferSourceTypes');
    const params = Buffer.alloc(20);
    new UUID(id).writeToBuffer(params, 0);
    params.writeInt32LE(AssetType.Animation, 16);
    buffer = await asset.transfer(
      TransferChannelType.Asset,
      TransferSourceType.Asset,
      false,
      params,
    );
  }
  if (!buffer || buffer.length === 0) throw new Error('Animation asset is empty');
  if (buffer.length > MAX_ANIMATION_BYTES) throw new Error('Animation asset is too large');
  return Buffer.from(buffer).toString('base64');
}

module.exports = {
  serializeAnimationMessage,
  subscribeAnimations,
  watchAnimations,
  downloadAnimation,
  sendAgentAnimations,
};
