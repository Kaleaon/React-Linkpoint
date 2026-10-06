// Apply the simulator's baked avatar textures to the shared object stream.
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const { TextureEntry } = require('@caspertech/node-metaverse/dist/lib/classes/TextureEntry');

function watchAvatarAppearance(getRegion, onUpdate, intervalMs = 2000) {
  let region = null, circuit = null, subscription = null;
  const appearances = new Map();
  const apply = (object) => {
    const id = object?.FullID?.toString?.()?.toLowerCase();
    const entry = appearances.get(id);
    if (entry) object.TextureEntry = entry;
  };
  const refresh = () => {
    const current = getRegion();
    if (current === region && current?.circuit === circuit) return;
    subscription?.unsubscribe();
    subscription = null;
    appearances.clear();
    region = current;
    circuit = current?.circuit;
    if (!circuit?.subscribeToMessages) return;
    subscription = circuit.subscribeToMessages([Message.AvatarAppearance], (packet) => {
      const message = packet?.message;
      const id = message?.Sender?.ID?.toString?.();
      const bytes = message?.ObjectData?.TextureEntry;
      if (message?.id !== Message.AvatarAppearance || !id || !bytes?.length) return;
      let entry;
      try { entry = TextureEntry.from(bytes); } catch { return; }
      if (!entry) return;
      appearances.set(id.toLowerCase(), entry);
      // Appearance may precede ObjectUpdate; apply() handles it when the object arrives.
      let object;
      try { object = region?.objects?.getObjectByUUID?.(id); } catch { return; }
      if (object) { apply(object); onUpdate({ localID: object.ID || object.localID, object }); }
    });
  };
  refresh();
  const timer = setInterval(refresh, intervalMs);
  timer.unref?.();
  return {
    apply(object) { refresh(); apply(object); },
    unsubscribe() { clearInterval(timer); subscription?.unsubscribe(); subscription = null; appearances.clear(); },
  };
}
module.exports = { watchAvatarAppearance };
