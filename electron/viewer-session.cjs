const {
  Bot,
  BotOptionFlags,
  LoginParameters,
  PCode,
  AssetType,
} = require('@caspertech/node-metaverse');
const { decodeLLMesh, decodeGLTFMaterial, decodeSculpt, decodeJPEG2000 } = require('./sl-asset-decoder.cjs');
const actions = require('./sl-actions.cjs');

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function vector(value, fallback = [0, 0, 0]) {
  return value ? [finite(value.x), finite(value.y), finite(value.z)] : fallback;
}

function serializableValue(value) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value, serializableValue);
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), serializableValue(item)]));
  if (typeof value?.toArray === 'function') return value.toArray().map(serializableValue);
  if (typeof value?.toJSON === 'function') return serializableValue(value.toJSON());
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== 'function' && !key.startsWith('_')) result[key] = serializableValue(item);
    }
    return result;
  }
  return undefined;
}

function serializeEnvironment(environment) {
  if (!environment) return null;
  const cycle = environment.dayCycle;
  const frames = cycle?.frames instanceof Map ? [...cycle.frames.values()] : [];
  const sky = frames.find((frame) => frame?.type === 'sky') || frames.find((frame) => frame?.sunlightColor || frame?.blueHorizon);
  const water = frames.find((frame) => frame?.type === 'water') || frames.find((frame) => frame?.waterFogColor);
  return {
    regionId: environment.regionID?.toString?.() || null,
    parcelId: (environment.parcelID?.toString?.() || environment.parcelID) ?? null,
    dayLength: finite(environment.dayLength), dayOffset: finite(environment.dayOffset),
    trackAltitudes: serializableValue(environment.trackAltitudes) || null,
    currentSky: serializableValue(sky), water: serializableValue(water),
    dayCycle: serializableValue(cycle),
  };
}

function serializeTerrain(region) {
  const size = 256;
  if (!region?.terrain || region.terrain.length < size) return null;
  const heights = new Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) heights[y * size + x] = finite(region.terrain[x]?.[y]);
  return { size, heights };
}

function primAppearance(object) {
  const profile = finite(object.ProfileCurve) & 0x0f;
  const path = finite(object.PathCurve) & 0xf0;
  const rgba = object.TextureEntry?.defaultTexture?.rgba;
  const meshData = object.MeshData || object.extraParams?.meshData;
  const sculptData = object.SculptData || object.extraParams?.sculptData;
  const renderMaterials = object.RenderMaterialData || object.extraParams?.renderMaterialData;
  const reflection = object.ReflectionProbeData || object.extraParams?.reflectionProbeData;
  const asset = meshData?.meshData || sculptData?.texture;
  const rawTextureId = object.TextureEntry?.defaultTexture?.textureID?.toString?.() || null;
  const textureId = rawTextureId && rawTextureId !== '00000000-0000-0000-0000-000000000000' ? rawTextureId : null;
  const component = (method, property, fallback) => {
    const value = typeof rgba?.[method] === 'function' ? rgba[method]() : rgba?.[property];
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  };
  const faceCount = Math.max(1, object.TextureEntry?.faces?.length || 0);
  const faceTextures = Array.from({ length: faceCount }, (_, faceIndex) => {
    const face = object.TextureEntry?.getEffectiveEntryForFace?.(faceIndex) || object.TextureEntry?.faces?.[faceIndex] || object.TextureEntry?.defaultTexture;
    const faceRgba = face?.rgba;
    const channel = (method, property, fallback) => {
      const value = typeof faceRgba?.[method] === 'function' ? faceRgba[method]() : faceRgba?.[property];
      return Number.isFinite(Number(value)) ? Number(value) : fallback;
    };
    const id = face?.textureID?.toString?.();
    const materialParam = renderMaterials?.params?.find((param) => Number(param.textureIndex) === faceIndex);
    const override = object.TextureEntry?.gltfMaterialOverrides?.get?.(faceIndex) || null;
    return {
      textureId: id && id !== '00000000-0000-0000-0000-000000000000' ? id : null,
      color: [channel('getRed', 'red', 1), channel('getGreen', 'green', 1), channel('getBlue', 'blue', 1), channel('getAlpha', 'alpha', 1)],
      repeat: [finite(face?.repeatU, 1), finite(face?.repeatV, 1)],
      offset: [finite(face?.offsetU), finite(face?.offsetV)], rotation: finite(face?.rotation), fullBright: Boolean(face?.fullBright),
      materialId: materialParam?.textureUUID?.toString?.() || null,
      materialOverride: override ? JSON.parse(JSON.stringify(override)) : null,
    };
  });
  return {
    shape: asset ? 'asset-proxy' : path === 0x20 && profile === 0x05 ? 'sphere' : path === 0x20 ? 'torus' : path === 0x10 && (profile === 0x02 || profile === 0x03 || profile === 0x04) ? 'prism' : path === 0x10 && profile === 0x00 ? 'cylinder' : 'cube',
    assetKind: meshData ? 'mesh' : sculptData ? 'sculpt' : null,
    assetId: asset?.toString?.() || null,
    textureId,
    faceTextures,
    reflectionProbe: reflection ? {
      ambiance: finite(reflection.ambiance), clipDistance: finite(reflection.clipDistance), flags: finite(reflection.flags),
      box: Boolean(reflection.flags & 1), dynamic: Boolean(reflection.flags & 2), mirror: Boolean(reflection.flags & 4),
    } : null,
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
    ...actions.attachmentInfo(object),
    pcode: object.PCode,
    avatar: object.PCode === PCode.Avatar,
    position: vector(object.Position),
    scale: vector(object.Scale, [0.5, 0.5, 0.5]),
    rotation: [finite(rotation.x), finite(rotation.y), finite(rotation.z), finite(rotation.w, 1)],
    name: object.name || '',
    ...primAppearance(object),
  };
}

function serializeFriend(friend, rights = {}) {
  return {
    id: friend?.getKey?.()?.toString?.() || friend?.buddyID?.toString?.() || rights.id || null,
    name: friend?.getName?.() || friend?.name || 'Friend',
    onlineStatus: friend?.online ? 'online' : 'offline',
    rightsGiven: Boolean(rights.rightsGiven ?? friend?.myRights),
    rightsHas: Boolean(rights.rightsHas ?? friend?.theirRights),
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
    const appearance = primAppearance(object);
    const assetIds = new Set([appearance.textureId, ...appearance.faceTextures.map((face) => face.textureId)].filter(Boolean));
    for (const assetId of assetIds) {
      const key = `texture:${assetId}`;
      if (this.assetRequests.has(key)) continue;
      const request = (async () => {
        const buffer = await this.bot.clientCommands.asset.downloadAsset(AssetType.Texture, assetId);
        this.send('texture-ready', { assetId, ...await decodeJPEG2000(buffer) });
      })().catch((error) => this.send('asset-error', { assetId, message: error.message }));
      this.assetRequests.set(key, request);
    }
  }

  loadObjectMaterials(object) {
    const appearance = primAppearance(object);
    const ids = new Set(appearance.faceTextures.map((face) => face.materialId).filter(Boolean));
    for (const assetId of ids) {
      const key = `material:${assetId}`;
      if (this.assetRequests.has(key)) continue;
      const request = (async () => {
        const buffer = await this.bot.clientCommands.asset.downloadAsset(AssetType.Material, assetId);
        const material = decodeGLTFMaterial(buffer);
        this.send('material-ready', { assetId, material });
        for (const texture of Object.values(material.textures || {})) {
          const textureId = texture?.textureId;
          const textureKey = `texture:${textureId}`;
          if (!textureId || this.assetRequests.has(textureKey)) continue;
          const textureRequest = this.bot.clientCommands.asset.downloadAsset(AssetType.Texture, textureId)
            .then((image) => decodeJPEG2000(image))
            .then((decoded) => this.send('texture-ready', { assetId: textureId, ...decoded }))
            .catch((error) => this.send('asset-error', { assetId: textureId, message: error.message }));
          this.assetRequests.set(textureKey, textureRequest);
        }
      })().catch((error) => this.send('asset-error', { assetId, message: error.message }));
      this.assetRequests.set(key, request);
    }
  }

  streamObject(type, event) {
    this.send(type, serializeObject(event));
    this.loadObjectAsset(event.object);
    this.loadObjectTexture(event.object);
    this.loadObjectMaterials(event.object);
  }

  subscribe(subject, type, serialize = (value) => value) {
    this.subscriptions.push(subject.subscribe((value) => this.send(type, serialize(value))));
  }

  async connect(request) {
    await this.close();
    const params = actions.buildLoginParams(request);

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
    this.subscribe(events.onInstantMessage, 'im', (event) => ({
      fromId: event.from?.toString(), fromName: event.fromName || 'Resident',
      message: event.message, dialog: event.dialog, timestamp: Date.now(),
    }));
    this.subscribe(events.onFriendOnline, 'friend-status', (event) => ({
      id: event.friend?.getKey?.()?.toString?.(), online: Boolean(event.online),
    }));
    this.subscribe(events.onFriendRequest, 'friend-request', (event) => ({
      fromId: event.from?.toString(), fromName: event.fromName,
      requestId: event.requestID?.toString(), message: event.message,
    }));
    this.subscribe(events.onFriendRemoved, 'friend-remove', (event) => ({
      id: event.friend?.getKey?.()?.toString?.(),
    }));
    this.subscribe(events.onDisconnected, 'disconnected', (event) => ({ message: event.message || 'Disconnected' }));

    let reply;
    try {
      reply = await this.bot.login();
    } catch (error) {
      throw actions.loginFailure(error);
    }
    await this.bot.connectToSim();
    const region = this.bot.currentRegion;
    const worldData = {
      region: { name: region.regionName || null, x: region.xCoordinate, y: region.yCoordinate },
      environment: serializeEnvironment(region.environment),
    };
    queueMicrotask(() => this.send('world-data', worldData));
    region.waitForTerrain().then(() => this.send('terrain', serializeTerrain(region))).catch(() => {});
    return {
      login: true,
      mfa_hash: (reply && reply.mfaHash) || null,
      agent_id: this.bot.agent.agentID.toString(),
      session_id: region.circuit.sessionID.toString(),
      circuit_code: region.circuit.circuitCode,
      sim_name: region.regionName || 'Unknown region',
      region_x: region.xCoordinate || 0,
      region_y: region.yCoordinate || 0,
      message: reply.loginMessage || 'Connected',
      native_scene: true,
      world_data: worldData,
    };
  }

  async sendChat(message, channel = 0, type = 1) {
    if (!this.bot) throw new Error('Not connected to a simulator');
    const communications = this.bot.clientCommands.comms;
    if (type === 0) await communications.whisper(message, channel);
    else if (type === 2) await communications.shout(message, channel);
    else await communications.say(message, channel);
  }

  async sendInstantMessage(recipientId, message) {
    if (!this.bot) throw new Error('Not connected to a simulator');
    await this.bot.clientCommands.comms.sendInstantMessage(recipientId, message);
  }

  teleport(params) { return actions.teleport(this.requireBot(), params); }
  touchObject(params) { return actions.touchObject(this.requireBot(), params); }
  sit(params) { return actions.sit(this.requireBot(), params); }
  stand() { return actions.stand(this.requireBot()); }
  getBalance() { return actions.getBalance(this.requireBot()); }

  requireBot() {
    if (!this.bot) throw new Error('Not connected to a simulator');
    return this.bot;
  }

  async sendFriendRequest(recipientId, message = '') {
    if (!this.bot) throw new Error('Not connected to a simulator');
    await this.bot.clientCommands.friends.sendFriendRequest(recipientId, message);
  }

  getFriends() {
    if (!this.bot) throw new Error('Not connected to a simulator');
    return (this.bot.agent?.buddyList || []).map((buddy) => {
      const friend = this.bot.clientCommands.friends.getFriend(buddy.buddyID);
      return serializeFriend(friend || buddy, {
        id: buddy.buddyID?.toString?.(), rightsGiven: buddy.buddyRightsGiven, rightsHas: buddy.buddyRightsHas,
      });
    });
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

module.exports = { ViewerSession, serializeObject, serializeEnvironment, serializeTerrain, serializeFriend };
