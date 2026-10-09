// The simulator's wind layer.  The simulator sends it as a LayerData message of layer type '7' (see
// indra/newview/llvlmanager.cpp); the patch decoding itself happens client-side (src/linkpoint/wind.ts),
// so this only forwards the raw bytes of the current region's layer.
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');

const WIND_LAYER_TYPE = 0x37;

function serializeWindPacket(packet) {
  const message = packet?.message;
  if (!message || message.id !== Message.LayerData) return null;
  if (Number(message.LayerID?.Type) !== WIND_LAYER_TYPE) return null;
  const data = message.LayerData?.Data;
  if (!data?.length) return null;
  return { action: 'layer', data: Buffer.from(data).toString('base64') };
}

function watchWind(getRegion, send, intervalMs = 2000) {
  let region;
  let subscription;
  const attach = () => {
    const current = getRegion();
    if (!current || current === region) return;
    subscription?.unsubscribe();
    // A new region has its own wind; the old grid must not carry over while its layer is on the way.
    if (region) send('wind-layer', { action: 'reset' });
    region = current;
    subscription = current.circuit?.subscribeToMessages?.([Message.LayerData], (packet) => {
      const payload = serializeWindPacket(packet);
      if (payload) send('wind-layer', payload);
    });
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

module.exports = { serializeWindPacket, watchWind, WIND_LAYER_TYPE };
