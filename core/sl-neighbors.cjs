// Neighbouring regions, for cross-region voice. The viewer learns of a neighbour from two event-queue events
// (EnableSimulator: region handle, IP, port; EstablishAgentCommunication: that simulator's seed capability) and then
// asks its seed capability for the voice capabilities and its SimulatorFeatures (VoiceServerType).
// Sources: indra/newview/llworld.cpp (process_enable_simulator, LLEstablishAgentCommunication),
// indra/newview/llvoicewebrtc.cpp (isRegionWebRTCEnabled, estateSessionState::processConnectionStates).
const LLSD = require('@caspertech/llsd');

const VOICE_CAPS = ['ProvisionVoiceAccountRequest', 'VoiceSignalingRequest', 'SimulatorFeatures'];

/** Bytes of an LLSD binary, however the library hands it over. */
function bytesOf(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value.octets)) return Buffer.from(value.octets);
  if (Array.isArray(value)) return Buffer.from(value);
  if (typeof value === 'string') {
    const b = Buffer.from(value, 'base64');
    return b.length ? b : null;
  }
  return null;
}

/** A region handle (high 32 bits x, low 32 bits y, in metres) as a decimal string, or null. */
function decodeHandle(value) {
  if (typeof value === 'bigint') return BigInt.asUintN(64, value).toString();
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (
    value &&
    typeof value.toString === 'function' &&
    typeof value.high === 'number' &&
    typeof value.low === 'number'
  ) {
    return ((BigInt(value.high >>> 0) << 32n) | BigInt(value.low >>> 0)).toString();
  }
  const bytes = bytesOf(value);
  if (!bytes || bytes.length !== 8) return null;
  return bytes.readBigUInt64BE(0).toString();
}

const originOf = (handle) => {
  const h = BigInt(handle);
  return [Number(h >> 32n), Number(h & 0xffffffffn)];
};

/** Dotted IPv4 from the 4 bytes of an EnableSimulator IP, or a string passed through. */
function decodeIp(value) {
  if (typeof value === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(value)) return value;
  const bytes = bytesOf(value);
  return bytes && bytes.length === 4 ? [...bytes].join('.') : null;
}

/**
 * An object with the two Caps methods voice needs, over plain HTTP: the seed capability is asked for the voice
 * capabilities once, then each is posted to as LLSD/XML (what `Caps.capsPerformXMLPost` does).
 */
function createRemoteCaps(seedUrl, fetchImpl = globalThis.fetch) {
  let table;
  const post = async (url, body) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/llsd+xml' },
      body,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${url.split('?')[0]} answered HTTP ${response.status}`);
    return LLSD.LLSD.parseXML(text);
  };
  return {
    async getCapability(name) {
      table ||= post(seedUrl, LLSD.LLSD.formatXML(VOICE_CAPS));
      const caps = await table;
      if (!caps?.[name]) throw new Error(`Capability ${name} not available`);
      return String(caps[name]);
    },
    async capsPerformXMLPost(url, data) {
      return post(url, LLSD.LLSD.formatXML(data));
    },
    async capsPerformXMLGet(url) {
      const response = await fetchImpl(url);
      const text = await response.text();
      if (!response.ok) throw new Error(`${url.split('?')[0]} answered HTTP ${response.status}`);
      return LLSD.LLSD.parseXML(text);
    },
  };
}

class NeighborRegions {
  /**
   * `makeCaps(seedUrl)` builds the capability client for a region (tests replace it). `onChange(list)` is told whenever
   * the usable neighbours change.
   */
  constructor({ makeCaps = createRemoteCaps, onChange = () => {} } = {}) {
    this.makeCaps = makeCaps;
    this.onChange = onChange;
    this.byHandle = new Map(); // handle -> { handle, originX, originY, caps, webrtc }
    this.byHost = new Map(); // 'ip:port' -> handle
    this.seeds = new Map(); // 'ip:port' -> seed url, when it arrived before EnableSimulator
    this.current = null; // { handle, caps }: the region the avatar is in
  }

  /** The region the avatar is in changed: it is no longer a neighbour, and the previous one becomes one. */
  setCurrent(handle, caps) {
    if (handle === undefined || handle === null) return;
    const key = String(handle);
    if (this.current && this.current.handle !== key && this.current.caps) {
      const [originX, originY] = originOf(this.current.handle);
      this.byHandle.set(this.current.handle, {
        handle: this.current.handle,
        originX,
        originY,
        caps: this.current.caps,
        webrtc: this.current.webrtc ?? null,
      });
      this.resolveWebrtc(this.current.handle);
    }
    this.byHandle.delete(key);
    this.current = { handle: key, caps };
    this.emit();
  }

  /** Feed the events of one event-queue response. */
  handleEvents(events) {
    for (const event of events || []) {
      try {
        if (event?.message === 'EnableSimulator') this.onEnable(event.body);
        else if (event?.message === 'EstablishAgentCommunication') this.onEstablish(event.body);
      } catch (error) {
        console.warn('[neighbors] could not handle', event?.message, error?.message || error);
      }
    }
  }

  onEnable(body) {
    for (const info of body?.SimulatorInfo || []) {
      const handle = decodeHandle(info.Handle);
      const ip = decodeIp(info.IP);
      if (!handle || !ip || !Number.isFinite(Number(info.Port))) continue;
      const host = `${ip}:${Number(info.Port)}`;
      this.byHost.set(host, handle);
      if (!this.byHandle.has(handle) && handle !== this.current?.handle) {
        const [originX, originY] = originOf(handle);
        this.byHandle.set(handle, { handle, originX, originY, caps: null, webrtc: null });
      }
      const seed = this.seeds.get(host);
      if (seed) this.attachSeed(handle, seed);
    }
  }

  onEstablish(body) {
    const host = body?.['sim-ip-and-port'];
    const seed = body?.['seed-capability'];
    if (typeof host !== 'string' || typeof seed !== 'string' || !seed) return;
    this.seeds.set(host, seed);
    const handle = this.byHost.get(host);
    if (handle) this.attachSeed(handle, seed);
  }

  attachSeed(handle, seed) {
    const entry = this.byHandle.get(handle);
    if (!entry) return;
    entry.caps = this.makeCaps(seed);
    entry.webrtc = null;
    this.resolveWebrtc(handle);
  }

  /** `isRegionWebRTCEnabled`: the region's SimulatorFeatures say VoiceServerType is "webrtc". */
  async resolveWebrtc(handle) {
    const entry = this.byHandle.get(handle);
    if (!entry?.caps) return;
    const caps = entry.caps;
    try {
      const url = await caps.getCapability('SimulatorFeatures');
      const features = await caps.capsPerformXMLGet(url);
      if (this.byHandle.get(handle)?.caps !== caps) return;
      entry.webrtc = features?.VoiceServerType === 'webrtc';
    } catch {
      if (this.byHandle.get(handle)?.caps === caps) entry.webrtc = false;
    }
    this.emit();
  }

  emit() {
    this.onChange(this.list());
  }

  /** Neighbours whose voice is usable now. */
  list() {
    return [...this.byHandle.values()]
      .filter((e) => e.caps && e.webrtc === true)
      .map((e) => ({ handle: e.handle, originX: e.originX, originY: e.originY }));
  }

  /** Capability client for a region by handle: a neighbour's, or the current region's. */
  capsFor(handle) {
    const key = String(handle);
    if (this.current && this.current.handle === key) return this.current.caps;
    return this.byHandle.get(key)?.caps ?? null;
  }
}

let patched = false;
const observers = new Set();

/**
 * The library throws away the event-queue events it does not know. Wrap the one function every response passes
 * through so they can be seen too; the response is passed on untouched.
 */
function observeEventQueue(observer) {
  observers.add(observer);
  if (!patched) {
    try {
      const {
        EventQueueClient,
      } = require('@caspertech/node-metaverse/dist/lib/classes/EventQueueClient');
      const original = EventQueueClient.prototype.capsPostXML;
      EventQueueClient.prototype.capsPostXML = async function patchedCapsPostXML(
        capability,
        ...rest
      ) {
        const result = await original.call(this, capability, ...rest);
        if (capability === 'EventQueueGet' && result?.events) {
          for (const fn of observers) {
            try {
              fn(result.events);
            } catch {
              /* an observer must not break the queue */
            }
          }
        }
        return result;
      };
      patched = true;
    } catch (error) {
      console.warn('[neighbors] cannot observe the event queue:', error?.message || error);
    }
  }
  return () => {
    observers.delete(observer);
  };
}

module.exports = {
  NeighborRegions,
  createRemoteCaps,
  observeEventQueue,
  decodeHandle,
  decodeIp,
  originOf,
};
