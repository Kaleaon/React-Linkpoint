const {
  Bot,
  BotOptionFlags,
  LoginParameters,
  PCode,
  AssetType,
} = require('@caspertech/node-metaverse');
const { decodeLLMesh, decodeSculpt, decodeJPEG2000 } = require('./sl-asset-decoder.cjs');

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function vector(value, fallback = [0, 0, 0]) {
  return value ? [finite(value.x), finite(value.y), finite(value.z)] : fallback;
}

function primAppearance(object) {
  const profile = finite(object.ProfileCurve) & 0x0f;
  const path = finite(object.PathCurve) & 0xf0;
  const rgba = object.TextureEntry?.defaultTexture?.rgba;
  const meshData = object.MeshData || object.extraParams?.meshData;
  const sculptData = object.SculptData || object.extraParams?.sculptData;
  const asset = meshData?.meshData || sculptData?.texture;
  const rawTextureId = object.TextureEntry?.defaultTexture?.textureID?.toString?.() || null;
  const textureId = rawTextureId && rawTextureId !== '00000000-0000-0000-0000-000000000000' ? rawTextureId : null;
  const component = (method, property, fallback) => {
    const value = typeof rgba?.[method] === 'function' ? rgba[method]() : rgba?.[property];
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  };
  return {
    shape: asset ? 'asset-proxy' : path === 0x20 && profile === 0x05 ? 'sphere' : path === 0x20 ? 'torus' : path === 0x10 && (profile === 0x02 || profile === 0x03 || profile === 0x04) ? 'prism' : path === 0x10 && profile === 0x00 ? 'cylinder' : 'cube',
    assetKind: meshData ? 'mesh' : sculptData ? 'sculpt' : null,
    assetId: asset?.toString?.() || null,
    textureId,
    color: rgba ? [component('getRed', 'red', 1), component('getGreen', 'green', 1), component('getBlue', 'blue', 1), component('getAlpha', 'alpha', 1)] : [1, 1, 1, 1],
    shapeParams: {
      pathCurve: object.PathCurve, profileCurve: object.ProfileCurve,
      pathBegin: object.PathBegin, pathEnd: object.PathEnd,
      pathScaleX: object.PathScaleX, pathScaleY: object.PathScaleY,
      profileBegin: object.ProfileBegin, profileEnd: object.ProfileEnd,
      profileHollow: object.ProfileHollow,
    },
  };
}

function serializeObject(event) {
  const object = event.object;
  const rotation = object.Rotation || { x: 0, y: 0, z: 0, w: 1 };
  return {
    id: object.FullID?.toString() || String(event.localID),
    localId: event.localID,
    parentId: object.ParentID || 0,
    pcode: object.PCode,
    avatar: object.PCode === PCode.Avatar,
    position: vector(object.Position),
    scale: vector(object.Scale, [0.5, 0.5, 0.5]),
    rotation: [finite(rotation.x), finite(rotation.y), finite(rotation.z), finite(rotation.w, 1)],
    name: object.name || '',
    ...primAppearance(object),
  };
}

class ViewerSession {
  constructor(send) {
    this.send = send;
    this.bot = null;
    this.subscriptions = [];
    this.assetRequests = new Map();
  }

  loadObjectAsset(object) {
    const appearance = primAppearance(object);
    if (!appearance.assetId || this.assetRequests.has(appearance.assetId)) return;
    const request = (async () => {
      const type = appearance.assetKind === 'mesh' ? AssetType.Mesh : AssetType.Texture;
      const buffer = await this.bot.clientCommands.asset.downloadAsset(type, appearance.assetId);
      const geometry = appearance.assetKind === 'mesh'
        ? await decodeLLMesh(buffer)
        : await decodeSculpt(buffer, (object.SculptData || object.extraParams?.sculptData)?.type);
      this.send('asset-ready', { assetId: appearance.assetId, assetKind: appearance.assetKind, geometry });
    })().catch((error) => this.send('asset-error', { assetId: appearance.assetId, message: error.message }));
    this.assetRequests.set(appearance.assetId, request);
  }

  loadObjectTexture(object) {
    const assetId = primAppearance(object).textureId;
    const key = `texture:${assetId}`;
    if (!assetId || this.assetRequests.has(key)) return;
    const request = (async () => {
      const buffer = await this.bot.clientCommands.asset.downloadAsset(AssetType.Texture, assetId);
      this.send('texture-ready', { assetId, ...await decodeJPEG2000(buffer) });
    })().catch((error) => this.send('asset-error', { assetId, message: error.message }));
    this.assetRequests.set(key, request);
  }

  streamObject(type, event) {
    this.send(type, serializeObject(event));
    this.loadObjectAsset(event.object);
    this.loadObjectTexture(event.object);
  }

  subscribe(subject, type, serialize = (value) => value) {
    this.subscriptions.push(subject.subscribe((value) => this.send(type, serialize(value))));
  }

  async connect({ loginUrl, username, password, start = 'last' }) {
    await this.close();
    const names = username.replace(/[._]/g, ' ').trim().split(/\s+/);
    const params = new LoginParameters();
    params.firstName = names[0];
    params.lastName = names[1] || 'Resident';
    params.password = password;
    params.start = start;
    params.url = loginUrl;

    // The full object store decodes ObjectUpdate, ObjectUpdateCompressed,
    // ObjectUpdateCached and terse updates from the simulator UDP circuit.
    this.bot = new Bot(params, BotOptionFlags.None);
    const events = this.bot.clientEvents;
    this.subscriptions.push(events.onNewObjectEvent.subscribe((event) => this.streamObject('object-add', event)));
    this.subscriptions.push(events.onObjectUpdatedEvent.subscribe((event) => this.streamObject('object-update', event)));
    this.subscribe(events.onObjectUpdatedTerseEvent, 'object-update', serializeObject);
    this.subscribe(events.onObjectKilledEvent, 'object-remove', (event) => ({
      id: event.objectID?.toString() || String(event.localID),
      localId: event.localID,
    }));
    this.subscribe(events.onNearbyChat, 'chat', (event) => ({
      fromId: event.from?.toString(),
      fromName: event.fromName,
      message: event.message,
      chatType: event.chatType,
      position: vector(event.position),
    }));
    this.subscribe(events.onDisconnected, 'disconnected', (event) => ({ message: event.message || 'Disconnected' }));

    const reply = await this.bot.login();
    await this.bot.connectToSim();
    const region = this.bot.currentRegion;
    return {
      login: true,
      agent_id: this.bot.agent.agentID.toString(),
      session_id: region.circuit.sessionID.toString(),
      circuit_code: region.circuit.circuitCode,
      sim_name: region.regionName || 'Unknown region',
      region_x: region.xCoordinate || 0,
      region_y: region.yCoordinate || 0,
      message: reply.loginMessage || 'Connected',
      native_scene: true,
    };
  }

  async sendChat(message, channel = 0, type = 1) {
    if (!this.bot) throw new Error('Not connected to a simulator');
    const communications = this.bot.clientCommands.comms;
    if (type === 0) await communications.whisper(message, channel);
    else if (type === 2) await communications.shout(message, channel);
    else await communications.say(message, channel);
  }

  async close() {
    for (const subscription of this.subscriptions.splice(0)) subscription.unsubscribe();
    if (!this.bot) return;
    const bot = this.bot;
    this.bot = null;
    this.assetRequests.clear();
    try { await bot.close(); } catch { /* circuit may already be closed */ }
  }
}

module.exports = { ViewerSession, serializeObject };
