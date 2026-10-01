// Relays the simulator's animation announcements to the viewer.
//
// AvatarAnimation lists what an avatar is playing; ObjectAnimation does the same
// for animated objects (Animesh). Both carry the subject's id, the animation
// UUIDs and a sequence number that changes whenever an animation is restarted.
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');

function serializeAnimationMessage(packet) {
  const message = packet?.message;
  if (!message) return null;
  const kind = message.id === Message.ObjectAnimation ? 'object' : message.id === Message.AvatarAnimation ? 'avatar' : null;
  const id = message.Sender?.ID?.toString?.();
  if (!kind || !id) return null;
  return {
    kind,
    id,
    animations: (message.AnimationList || []).map((entry) => ({
      id: entry.AnimID?.toString?.() || '',
      seq: Number(entry.AnimSequenceID) || 0,
    })).filter((entry) => entry.id),
  };
}

/**
 * Subscribe to animation messages on a region's circuit.
 * Returns the subscription (call `.unsubscribe()` to stop) or null if unavailable.
 */
function subscribeAnimations(region, send) {
  const circuit = region?.circuit;
  if (!circuit || typeof circuit.subscribeToMessages !== 'function') return null;
  return circuit.subscribeToMessages([Message.AvatarAnimation, Message.ObjectAnimation], (packet) => {
    const payload = serializeAnimationMessage(packet);
    if (payload) send('animations', payload);
  });
}

module.exports = { serializeAnimationMessage, subscribeAnimations };
