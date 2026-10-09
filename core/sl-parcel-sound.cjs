// What the client needs to apply "sound local" parcels: the region's parcel overlay (one byte per 4 m cell, which
// carries each parcel's PARCEL_SOUND_LOCAL bit) and the agent's own parcel (its cell bitmap and flags). Forwarded raw
// from ParcelOverlay and ParcelProperties; src/linkpoint/parcel-sound.ts applies the viewer's rules
// (indra/newview/llviewerparcelmgr.cpp: processParcelOverlay, processParcelProperties, canHearSound).
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');

function serializeParcelPacket(packet) {
  const message = packet?.message;
  if (!message) return null;
  if (message.id === Message.ParcelOverlay) {
    const data = message.ParcelData?.Data;
    if (!data?.length) return null;
    return {
      action: 'overlay',
      sequenceId: Number(message.ParcelData.SequenceID),
      data: Buffer.from(data).toString('base64'),
    };
  }
  if (message.id === Message.ParcelProperties) {
    const d = message.ParcelData;
    if (!d) return null;
    return {
      action: 'parcel',
      sequenceId: Number(d.SequenceID),
      requestResult: Number(d.RequestResult),
      localId: Number(d.LocalID),
      flags: Number(d.ParcelFlags) >>> 0,
      bitmap: d.Bitmap?.length ? Buffer.from(d.Bitmap).toString('base64') : '',
    };
  }
  return null;
}

function watchParcelSound(getRegion, send, intervalMs = 2000) {
  let region;
  let subscription;
  const attach = () => {
    const current = getRegion();
    if (!current || current === region) return;
    subscription?.unsubscribe();
    if (region) send('parcel-sound', { action: 'reset' });
    region = current;
    subscription = current.circuit?.subscribeToMessages?.(
      [Message.ParcelOverlay, Message.ParcelProperties],
      (packet) => {
        const payload = serializeParcelPacket(packet);
        if (payload) send('parcel-sound', payload);
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

module.exports = { serializeParcelPacket, watchParcelSound };
