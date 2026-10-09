// Simulator sound messages and assets.  The wire shapes follow the Linden viewer's
// SoundTrigger/AttachedSound handling; playback policy and spatialisation stay client-side.
const { AssetType } = require('@caspertech/node-metaverse');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');

const ZERO = '00000000-0000-0000-0000-000000000000';
const id = (value) => value?.toString?.() || '';
const position = (value) =>
  value ? [Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0] : [0, 0, 0];

function serializeSoundPacket(packet) {
  const message = packet?.message;
  if (!message) return null;
  if (message.id === Message.SoundTrigger) {
    const data = message.SoundData;
    const payload = {
      action: 'trigger',
      soundId: id(data.SoundID),
      objectId: id(data.ObjectID),
      ownerId: id(data.OwnerID),
      parentId: id(data.ParentID),
      position: position(data.Position),
      gain: Number(data.Gain) || 0,
      flags: 0,
    };
    // The region handle turns the region-local position into a global one (high word x, low word y).
    if (data.Handle !== undefined && data.Handle !== null)
      payload.handle = BigInt.asUintN(64, BigInt(data.Handle.toString())).toString();
    return payload;
  }
  if (message.id === Message.AttachedSound) {
    // A null sound id is not always a stop: the viewer's setAttachedSound decides from the flags (see sound-standards.ts).
    const data = message.DataBlock;
    return {
      action: 'attached',
      soundId: id(data.SoundID),
      objectId: id(data.ObjectID),
      ownerId: id(data.OwnerID),
      gain: Number(data.Gain) || 0,
      flags: Number(data.Flags) || 0,
    };
  }
  if (message.id === Message.AttachedSoundGainChange) {
    return {
      action: 'gain',
      objectId: id(message.DataBlock.ObjectID),
      gain: Number(message.DataBlock.Gain) || 0,
    };
  }
  if (message.id === Message.PreloadSound) {
    return {
      action: 'preload',
      sounds: (message.DataBlock || [])
        .map((data) => ({
          soundId: id(data.SoundID),
          objectId: id(data.ObjectID),
          ownerId: id(data.OwnerID),
        }))
        .filter((sound) => sound.soundId && sound.soundId !== ZERO),
    };
  }
  return null;
}

function watchSounds(getRegion, send, loadSound, intervalMs = 2000) {
  let region;
  let subscription;
  const attach = () => {
    const current = getRegion();
    if (!current || current === region) return;
    subscription?.unsubscribe();
    region = current;
    subscription = current.circuit?.subscribeToMessages?.(
      [
        Message.SoundTrigger,
        Message.AttachedSound,
        Message.AttachedSoundGainChange,
        Message.PreloadSound,
      ],
      (packet) => {
        const payload = serializeSoundPacket(packet);
        if (!payload) return;
        send('sound-event', payload);
        if (payload.soundId) loadSound(payload.soundId);
        for (const sound of payload.sounds || []) loadSound(sound.soundId);
      },
    );
  };
  attach();
  const timer = setInterval(attach, intervalMs);
  timer.unref?.();
  return {
    unsubscribe() {
      clearInterval(timer);
      subscription?.unsubscribe();
      subscription = null;
    },
  };
}

function downloadSound(bot, soundId, ready, failed) {
  return bot.clientCommands.asset
    .downloadAsset(AssetType.Sound, soundId)
    .then((buffer) => ready(Buffer.from(buffer)))
    .catch(failed);
}

module.exports = { serializeSoundPacket, watchSounds, downloadSound };
