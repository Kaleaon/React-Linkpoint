// The Second Life viewer session: one implementation for every host.
//
// The Electron main process and the web server both create a ViewerSession and hand it a `send`
// function that delivers `(type, data)` events to the client (IPC or Server-Sent Events). They then
// expose its methods through the shared method table in ./viewer-api.cjs. Nothing in here knows
// which host it runs under, so desktop, web and mobile (which talks to the web server) cannot drift.
const crypto = require('node:crypto');
// Lifecycle scripts can be disabled by package managers and deployment hosts. Apply the
// node-metaverse compatibility/identity patches before its module is loaded so a skipped
// postinstall cannot leave the viewer unable to log in (or identifying as the library itself).
require('../scripts/patch-metaverse.cjs').applyPatches({ strict: true });
const LLSD = require('@caspertech/llsd');
if (LLSD?.LLSD?.type) {
  const origType = LLSD.LLSD.type;
  LLSD.LLSD.type = function (value) {
    if (value && typeof value === 'object' && (typeof value.mUUID === 'string' || value.constructor?.name === 'UUID')) {
      return 'uuid';
    }
    return origType.call(this, value);
  };
}
const {
  Bot,
  BotOptionFlags,
  PCode,
  AssetType,
  ControlFlags,
  UUID,
} = require('@caspertech/node-metaverse');
const { decodeLLMesh, decodeGLTFMaterial, decodeSculpt, decodeJPEG2000 } = require('./sl-asset-decoder.cjs');
const actions = require('./sl-actions.cjs');
const interactions = require('./sl-interactions.cjs');
const { watchAnimations, downloadAnimation } = require('./sl-animations.cjs');
const { watchSounds, downloadSound } = require('./sl-sounds.cjs');
const { serializeTerrainMaterials } = require('./sl-terrain.cjs');
const {
  finite, vector, serializeEnvironment, serializeTerrain, primAppearance, serializeObject, serializeFriend,
} = require('./serializers.cjs');
const { DirFindQueryMessage } = require('@caspertech/node-metaverse/dist/lib/classes/messages/DirFindQuery');
const { DirPlacesQueryMessage } = require('@caspertech/node-metaverse/dist/lib/classes/messages/DirPlacesQuery');
const { DirFindFlags } = require('@caspertech/node-metaverse/dist/lib/enums/DirFindFlags');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');
const { FilterResponse } = require('@caspertech/node-metaverse/dist/lib/enums/FilterResponse');
const { Utils } = require('@caspertech/node-metaverse/dist/lib/classes/Utils');

const NOT_CONNECTED = 'Not connected to Second Life';

const newId = () => crypto.randomUUID();

class ViewerSession {
  /**
   * @param send host callback `(type, data) => void` that delivers an event to the client
   * @param options `replay: true` keeps decoded assets so a client that connects late (a browser
   *   tab opened after login) can be caught up with `getSceneSnapshot()`
   */
  constructor(send, options = {}) {
    this.sendEvent = send;
    this.replay = Boolean(options.replay);
    this.bot = null;
    this.subscriptions = [];
    this.assetRequests = new Map();
    this.assetFailures = new Map();
    this.assetDownloadQueue = [];
    this.activeAssetDownloads = 0;
    this.decodedAssets = new Map();
    this.friendPresence = new Map();
    this.soundRequests = new Set();
    this.objectSounds = new Map();
    this.transactions = [];
    this.pending = new interactions.PendingInteractions();
    /** Filled in by connect(): who is logged in and where. */
    this.identity = { agentId: '', firstName: '', lastName: '', simName: '', inventoryRootId: '' };
  }

  /** Deliver an event to the client, remembering replayable assets for late joiners. */
  send(type, data) {
    if (this.replay) {
      if (type === 'asset-ready' && data?.assetId) this.decodedAssets.set(data.assetId, { type, data });
      else if (type === 'texture-ready' && data?.assetId) this.decodedAssets.set(`texture:${data.assetId}`, { type, data });
      else if (type === 'material-ready' && data?.assetId) this.decodedAssets.set(`material:${data.assetId}`, { type, data });
      else if (type === 'terrain' || type === 'world-data') this.decodedAssets.set(type, { type, data });
    }
    this.sendEvent(type, data);
  }

  requireBot() {
    if (!this.bot) throw new Error(NOT_CONNECTED);
    return this.bot;
  }

  /** Reading Bot.currentRegion throws while login/teleport teardown has no active region. */
  currentRegion() {
    try { return this.bot?.currentRegion || null; } catch { return null; }
  }

  // ---- asset streaming --------------------------------------------------------------------------

  /**
   * Simulator asset capabilities rate-limit bursts aggressively. Keep mesh, texture, material and
   * animation downloads behind one queue so entering a mesh-heavy region cannot starve attachments.
   */
  queueAssetDownload(download) {
    return new Promise((resolve, reject) => {
      this.assetDownloadQueue.push({ download, resolve, reject });
      this.pumpAssetDownloads();
    });
  }

  pumpAssetDownloads() {
    while (this.activeAssetDownloads < 4 && this.assetDownloadQueue.length) {
      const job = this.assetDownloadQueue.shift();
      this.activeAssetDownloads++;
      Promise.resolve().then(job.download).then(job.resolve, job.reject).finally(() => {
        this.activeAssetDownloads--;
        this.pumpAssetDownloads();
      });
    }
  }

  /** Download, decode and stream one asset once; failures are reported to the client as `asset-error`. */
  streamAsset(key, kind, assetId, download, ready) {
    if (this.replay && this.decodedAssets.has(key)) {
      const cached = this.decodedAssets.get(key);
      if (cached) this.sendEvent(cached.type, cached.data);
      return;
    }
    if (this.assetRequests.has(key)) return;
    const nextRetry = this.assetFailures.get(key) || 0;
    if (Date.now() < nextRetry) return;
    const request = (async () => {
      const buffer = await this.queueAssetDownload(() => download
        ? download()
        : this.bot.clientCommands.asset.downloadAsset(kind, assetId));
      await ready(buffer);
      this.assetFailures.delete(key);
    })().catch((error) => {
      // A failed promise must not poison this asset for the rest of the session. Object updates can
      // retry it after a short backoff, which is important while region capabilities are settling.
      this.assetRequests.delete(key);
      const msg = String(error?.message || error);
      // A 403 can be produced by a stale ViewerAsset cap during a region crossing. The official
      // viewer retries it, so let a later object update try again instead of suppressing it for an hour.
      const isPermanent = msg.includes('404') || msg.includes('unavailable');
      const backoffMs = isPermanent ? 3600000 : 5000;
      this.assetFailures.set(key, Date.now() + backoffMs);
      this.send('asset-error', { assetId, message: msg });
    });
    this.assetRequests.set(key, request);
  }

  /** Download through ViewerAsset, matching the official viewer, and reacquire the current region
   * between retries so a region crossing cannot leave us using a stale capability URL. */
  async downloadViewerAsset(type, assetId) {
    let lastError;
    for (const delay of [0, 1000, 3000, 7000]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        return await this.bot.clientCommands.asset.downloadAsset(type, assetId);
      } catch (error) {
        lastError = error;
        const message = String(error?.message || error);
        if (!/(?:403|Forbidden|404|Not Found|429|Too Many Requests)/i.test(message)) throw error;
      }
    }
    throw lastError;
  }

  async downloadTexture(assetId) {
    try {
      return await this.downloadViewerAsset(AssetType.Texture, assetId);
    } catch (error) {
      const message = String(error?.message || error);
      // OpenSim grids may expose the older GetTexture cap without ViewerAsset.
      if (!/ViewerAsset.*(?:not available|unavailable)/i.test(message)) throw error;
    }
    const caps = this.currentRegion()?.caps;
    if (caps?.getCapability && caps?.requestGet) {
      const capability = await caps.getCapability('GetTexture');
      if (capability) {
        const response = await caps.requestGet(`${String(capability).replace(/\/?$/, '/')}?texture_id=${encodeURIComponent(assetId)}`);
        if (response?.body) return Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
      }
    }
    throw new Error(`Texture ${assetId} unavailable: ViewerAsset and GetTexture capabilities are unavailable`);
  }

  /**
   * Download an uploaded mesh using ViewerAsset. GetMesh2/GetMesh are retained only for OpenSim
   * compatibility; current Second Life viewers use ViewerAsset for both meshes and textures.
   */
  async downloadMesh(assetId) {
    try {
      return await this.downloadViewerAsset(AssetType.Mesh, assetId);
    } catch (error) {
      const message = String(error?.message || error);
      if (!/ViewerAsset.*(?:not available|unavailable)/i.test(message)) throw error;
    }
    const caps = this.currentRegion()?.caps;
    if (caps?.getCapability && caps?.requestGet) {
      for (const capName of ['GetMesh2', 'GetMesh']) {
        try {
          const capability = await caps.getCapability(capName);
          if (capability) {
            const response = await caps.requestGet(`${String(capability).replace(/\/?$/, '/')}?mesh_id=${encodeURIComponent(assetId)}`, { responseType: 'buffer' });
            if (response?.body) return Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
          }
        } catch (error) {
          const msg = String(error?.message || error);
          if (msg.includes('403') || msg.includes('Forbidden') || msg.includes('404')) {
            throw new Error(`Mesh ${assetId} unavailable: ${msg}`);
          }
          console.warn(`[SL Session] ${capName} failed for ${assetId}; trying next:`, msg);
        }
      }
    }
    throw new Error(`Mesh ${assetId} unavailable: ViewerAsset and mesh capabilities are unavailable`);
  }

  loadTexture(assetId) {
    if (!assetId) return;
    this.streamAsset(`texture:${assetId}`, AssetType.Texture, assetId, () => this.downloadTexture(assetId), async (buffer) => {
      this.send('texture-ready', { assetId, ...await decodeJPEG2000(buffer) });
    });
  }

  loadSound(assetId) {
    if (!assetId || this.soundRequests.has(assetId)) return;
    this.soundRequests.add(assetId);
    downloadSound(this.bot, assetId, (buffer) => {
      // Second Life sound assets are Ogg Vorbis. Browsers decode these directly through Web Audio.
      this.send('sound-asset', { assetId, contentType: 'audio/ogg', data: buffer.toString('base64') });
    }, (error) => {
      this.soundRequests.delete(assetId);
      this.send('asset-error', { assetId, message: error.message });
    });
  }

  loadObjectAsset(object) {
    const appearance = primAppearance(object);
    if (!appearance.assetId) return;
    const kind = appearance.assetKind === 'mesh' ? AssetType.Mesh : AssetType.Texture;
    const download = appearance.assetKind === 'sculpt'
      ? () => this.downloadTexture(appearance.assetId)
      : () => this.downloadMesh(appearance.assetId);
    this.streamAsset(appearance.assetId, kind, appearance.assetId, download, async (buffer) => {
      const geometry = appearance.assetKind === 'mesh'
        ? await decodeLLMesh(buffer)
        : await decodeSculpt(buffer, appearance.sculptType);
      this.send('asset-ready', { assetId: appearance.assetId, assetKind: appearance.assetKind, geometry });
    });
  }

  loadObjectTexture(object) {
    const appearance = primAppearance(object);
    // GLTF material overrides carry replacement texture UUIDs on the object,
    // rather than in the referenced material asset. Request those alongside
    // legacy face textures or the renderer can only bind its white fallback.
    const overrideTextures = appearance.faceTextures.flatMap((face) => {
      const textures = face.materialOverride?.textures;
      const values = Array.isArray(textures) ? textures : Object.values(textures || {});
      return values.map((texture) => texture?.textureId || texture?.id || texture).filter(Boolean);
    });
    const ids = new Set([
      appearance.textureId,
      appearance.particles?.textureId,
      ...appearance.faceTextures.map((face) => face.textureId),
      ...overrideTextures,
    ].filter(Boolean).map(String));
    for (const assetId of ids) this.loadTexture(assetId);
  }

  /** The region's four terrain detail textures; they arrive like any other texture. */
  loadTerrainTextures(materials) {
    for (const assetId of materials?.textureIds || []) this.loadTexture(assetId);
  }

  loadObjectMaterials(object) {
    const appearance = primAppearance(object);
    const ids = new Set(appearance.faceTextures.map((face) => face.materialId).filter(Boolean));
    for (const assetId of ids) {
      this.streamAsset(`material:${assetId}`, AssetType.Material, assetId, null, async (buffer) => {
        const material = decodeGLTFMaterial(buffer);
        this.send('material-ready', { assetId, material });
        for (const texture of Object.values(material.textures || {})) this.loadTexture(texture?.textureId);
      });
    }
  }

  streamObject(type, event) {
    this.send(type, serializeObject(event));
    this.loadObjectAsset(event.object);
    this.loadObjectTexture(event.object);
    this.loadObjectMaterials(event.object);
    const soundId = event.object?.Sound?.toString?.();
    const objectId = event.object?.FullID?.toString?.() || String(event.localID);
    const liveSound = soundId && soundId !== '00000000-0000-0000-0000-000000000000' ? soundId : '';
    const signature = `${liveSound}:${Number(event.object?.SoundGain) || 0}:${Number(event.object?.SoundFlags) || 0}`;
    if (this.objectSounds.get(objectId) !== signature) {
      this.objectSounds.set(objectId, signature);
      this.send('sound-event', liveSound ? { action: 'attached', soundId: liveSound, objectId,
        position: vector(event.object?.Position), gain: Number(event.object?.SoundGain) || 0,
        flags: Number(event.object?.SoundFlags) || 0 } : { action: 'stop', objectId });
      if (liveSound) this.loadSound(liveSound);
    }
  }

  subscribe(subject, type, serialize = (value) => value) {
    this.subscriptions.push(subject.subscribe((value) => this.send(type, serialize(value))));
  }

  // ---- connecting -------------------------------------------------------------------------------

  /** Wire every simulator event the client understands. Emits nothing by itself. */
  subscribeEvents(events) {
    // Objects: the full object store decodes ObjectUpdate, compressed, cached and terse updates.
    this.subscriptions.push(events.onNewObjectEvent.subscribe((event) => this.streamObject('object-add', event)));
    this.subscriptions.push(events.onObjectUpdatedEvent.subscribe((event) => this.streamObject('object-update', event)));
    this.subscribe(events.onObjectUpdatedTerseEvent, 'object-update', serializeObject);
    this.subscribe(events.onObjectKilledEvent, 'object-remove', (event) => ({
      id: event.objectID?.toString() || String(event.localID),
      localId: event.localID,
    }));

    this.subscribe(events.onNearbyChat, 'chat', (event) => ({
      id: newId(),
      fromId: event.from?.toString(),
      fromName: event.fromName || 'Unknown',
      message: event.message,
      chatType: event.chatType ?? 1,
      channel: event.channel ?? 0,
      position: vector(event.position),
      timestamp: Date.now(),
    }));
    this.subscribe(events.onInstantMessage, 'im', (event) => ({
      id: newId(),
      fromId: event.from?.toString(),
      fromName: event.fromName || 'Resident',
      message: event.message,
      dialog: event.dialog,
      timestamp: Date.now(),
    }));

    this.subscribe(events.onParcelPropertiesEvent, 'parcel-properties', (parcel) => ({
      id: parcel.LocalID,
      name: parcel.Name || '',
      description: parcel.Desc || '',
      area: parcel.Area,
      ownerId: parcel.OwnerID?.toString?.() || null,
      groupId: parcel.GroupID?.toString?.() || null,
      maxPrims: parcel.MaxPrims,
      totalPrims: parcel.TotalPrims,
      musicUrl: parcel.MusicURL || '',
      mediaUrl: parcel.MediaURL || '',
    }));

    this.subscriptions.push(events.onAvatarEnteredRegion.subscribe((avatar) => this.trackAvatar(avatar)));

    this.subscriptions.push(events.onFriendOnline.subscribe((event) => {
      const id = event.friend?.getKey?.()?.toString() || event.friend?.id?.toString() || event.friend?.uuid?.toString();
      if (id) this.friendPresence.set(id.toLowerCase(), Boolean(event.online));
      this.send('friend-status', { id, name: event.friend?.name || event.friend?.getName?.() || 'Resident', online: Boolean(event.online) });
    }));
    this.subscribe(events.onFriendRequest, 'friend-request', (event) => ({
      requestId: event.requestID?.toString(),
      fromId: event.from?.toString(),
      fromName: event.fromName || 'Resident',
      message: event.message,
    }));
    this.subscribe(events.onFriendResponse, 'friend-response', (event) => ({
      fromId: event.from?.toString(),
      fromName: event.fromName || 'Resident',
      accepted: Boolean(event.accepted),
    }));
    this.subscribe(events.onFriendRemoved, 'friend-remove', (event) => ({
      id: event.friend?.getKey?.()?.toString() || event.friend?.id?.toString(),
    }));

    // Script dialogs (llDialog, llTextBox), teleport lures and group notices
    this.subscriptions.push(...interactions.subscribeInteractions(events, this.pending, (type, data) => this.send(type, data)));
    if (events?.onBalanceUpdated) {
      this.subscriptions.push(events.onBalanceUpdated.subscribe((event) => {
        const record = {
          id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          balance: event.balance,
          amount: event.transaction?.amount ?? 0,
          description: event.transaction?.description || 'Balance updated',
          from: event.transaction?.from?.toString?.() || '',
          to: event.transaction?.to?.toString?.() || '',
          type: event.transaction?.type || 'balance',
          status: event.transaction?.success !== false ? 'success' : 'failed',
          timestamp: Date.now(),
        };
        this.transactions.unshift(record);
        this.send('balance_updated', { balance: event.balance, transaction: record });
      }));
    }
    this.subscribe(events.onDisconnected, 'disconnected', (event) => ({ message: event.message || 'Disconnected from Second Life' }));
  }

  /** Nearby avatars: announce arrivals, movement and departures as presence events. */
  trackAvatar(avatar) {
    const id = avatar.getKey?.()?.toString?.() || avatar.id?.toString?.() || avatar.uuid?.toString?.();
    const name = avatar.getName?.() || [avatar.firstName, avatar.lastName].filter(Boolean).join(' ') || '';
    const position = vector(avatar.coarsePosition || avatar.position);
    this.send('coarse-avatar', { id, name, position });
    this.send('avatar_presence', { id, agentId: id, name, coordinates: position, position, presence: 'entered', online: true });
    if (typeof avatar.onMoved?.subscribe === 'function') {
      this.subscriptions.push(avatar.onMoved.subscribe((moved) => {
        const at = vector(moved.position || moved.coarsePosition);
        this.send('avatar_presence', { id, agentId: id, name, coordinates: at, position: at, presence: 'online', online: true });
      }));
    }
    if (typeof avatar.onLeftRegion?.subscribe === 'function') {
      this.subscriptions.push(avatar.onLeftRegion.subscribe(() => {
        this.send('avatar_presence', { id, agentId: id, name, presence: 'left', online: false, left: true });
      }));
    }
  }

  /** The logged-in agent's UUID, whichever way this node-metaverse build exposes it. */
  agentId() {
    const text = (value) => {
      try { return value ? String(value.toString()) : ''; } catch { return ''; }
    };
    const valid = (id) => id && !id.includes('function') && !id.includes('agentID()');
    let id = '';
    try { if (typeof this.bot.agentID === 'function') id = text(this.bot.agentID()); } catch { /* try the next source */ }
    if (!valid(id)) id = text(this.bot.agent?.agentID);
    return valid(id) ? id : '';
  }

  async connect(request) {
    await this.close();
    // Name, start location and MFA fields are validated and normalised in one shared place.
    const { firstName, lastName } = actions.parseLoginName(request.username);
    const params = actions.buildLoginParams(request);
    this.bot = new Bot(params, BotOptionFlags.None);
    this.subscribeEvents(this.bot.clientEvents);

    let reply;
    try {
      reply = await this.bot.login();
    } catch (error) {
      // Keep the grid's reason (wrong password, MFA required, already logged in...) for the interface.
      throw actions.loginFailure(error);
    }
    try {
      await this.bot.connectToSim();
    } catch (error) {
      if (!this.currentRegion()) throw error;
      console.warn('[SL Session] connectToSim warning:', error);
    }
    const region = this.currentRegion();
    const animations = watchAnimations(() => this.currentRegion(), (type, data) => this.send(type, data));
    if (animations) this.subscriptions.push(animations);
    this.subscriptions.push(watchSounds(() => this.currentRegion(), (type, data) => this.send(type, data), (id) => this.loadSound(id)));

    let inventoryRootId = '';
    try { inventoryRootId = this.bot.clientCommands?.inventory?.getInventoryRoot()?.folderID?.toString() || ''; } catch { /* fetched on demand */ }
    this.identity = {
      agentId: this.agentId() || newId(),
      firstName, lastName,
      simName: region?.regionName || '',
      inventoryRootId,
    };

    const worldData = {
      region: { name: region?.regionName || null, x: region?.xCoordinate, y: region?.yCoordinate },
      environment: serializeEnvironment(region?.environment),
      terrainMaterials: serializeTerrainMaterials(region),
    };
    queueMicrotask(() => this.send('world-data', worldData));
    this.loadTerrainTextures(worldData.terrainMaterials);
    region?.waitForTerrain?.().then(() => this.send('terrain', serializeTerrain(region))).catch(() => {});

    return {
      login: true,
      // Returned after a successful multi-factor login so this device is not asked again.
      mfa_hash: reply?.mfaHash || null,
      agent_id: this.identity.agentId,
      first_name: firstName,
      last_name: lastName,
      session_id: region?.circuit?.sessionID?.toString?.() || null,
      circuit_code: region?.circuit?.circuitCode ?? null,
      sim_name: region?.regionName || 'Unknown region',
      region_x: finite(region?.xCoordinate),
      region_y: finite(region?.yCoordinate),
      inventory_root: inventoryRootId,
      message: reply?.loginMessage || 'Connected to Second Life',
      world_data: worldData,
    };
  }

  // ---- communication ----------------------------------------------------------------------------

  async sendChat({ message, channel = 0, type = 1 }) {
    const comms = this.requireBot().clientCommands?.comms;
    if (!comms) throw new Error('Second Life communications interface unavailable');
    if (type === 0) await comms.whisper(message, channel);
    else if (type === 2) await comms.shout(message, channel);
    else await comms.say(message, channel);
  }

  async sendInstantMessage({ recipientId, message }) {
    const comms = this.requireBot().clientCommands?.comms;
    if (!comms) throw new Error('Second Life communications interface unavailable');
    await comms.sendInstantMessage(recipientId, message);
  }

  async sendGroupMessage({ groupId, message }) {
    const comms = this.requireBot().clientCommands?.comms;
    if (!comms) throw new Error('Second Life communications interface unavailable');
    if (!groupId || !String(message || '').trim()) throw new Error('Group and message are required');
    if (typeof comms.sendGroupMessage !== 'function') throw new Error('Group messaging not supported by this connection');
    // Starts the group chat session on first use, then sends within it.
    await comms.sendGroupMessage(groupId, message);
  }

  async sendFriendRequest({ recipientId, message = '' }) {
    const friends = this.requireBot().clientCommands?.friends;
    if (!friends) throw new Error('Second Life friends interface unavailable');
    await friends.sendFriendRequest(recipientId, message);
  }

  // ---- agent actions ----------------------------------------------------------------------------

  teleport(params) { return actions.teleport(this.requireBot(), params); }
  touchObject(params) { return actions.touchObject(this.requireBot(), params); }
  sit(params = {}) { return actions.sit(this.requireBot(), params); }
  stand() { return actions.stand(this.requireBot()); }
  setMovement(params = {}) {
    const agent = this.requireBot().agent;
    if (!agent?.setControlFlag || !agent?.clearControlFlag || !agent?.sendAgentUpdate) throw new Error('Avatar movement unavailable');
    const directional = [
      ControlFlags.AGENT_CONTROL_AT_POS, ControlFlags.AGENT_CONTROL_AT_NEG,
      ControlFlags.AGENT_CONTROL_LEFT_POS, ControlFlags.AGENT_CONTROL_LEFT_NEG,
      ControlFlags.AGENT_CONTROL_UP_POS, ControlFlags.AGENT_CONTROL_UP_NEG,
      ControlFlags.AGENT_CONTROL_TURN_LEFT, ControlFlags.AGENT_CONTROL_TURN_RIGHT,
      ControlFlags.AGENT_CONTROL_FAST_AT, ControlFlags.AGENT_CONTROL_FAST_LEFT, ControlFlags.AGENT_CONTROL_FAST_UP,
    ];
    for (const flag of directional) agent.clearControlFlag(flag);
    const choose = (value, positive, negative) => {
      if (Number(value) > 0) agent.setControlFlag(positive);
      else if (Number(value) < 0) agent.setControlFlag(negative);
    };
    choose(params.forward, ControlFlags.AGENT_CONTROL_AT_POS, ControlFlags.AGENT_CONTROL_AT_NEG);
    // SL names strafe flags from the left axis: positive right is LEFT_NEG.
    choose(params.right, ControlFlags.AGENT_CONTROL_LEFT_NEG, ControlFlags.AGENT_CONTROL_LEFT_POS);
    choose(params.up, ControlFlags.AGENT_CONTROL_UP_POS, ControlFlags.AGENT_CONTROL_UP_NEG);
    choose(params.turn, ControlFlags.AGENT_CONTROL_TURN_RIGHT, ControlFlags.AGENT_CONTROL_TURN_LEFT);
    if (params.run && params.forward) agent.setControlFlag(ControlFlags.AGENT_CONTROL_FAST_AT);
    if (params.run && params.right) agent.setControlFlag(ControlFlags.AGENT_CONTROL_FAST_LEFT);
    if (params.run && params.up) agent.setControlFlag(ControlFlags.AGENT_CONTROL_FAST_UP);
    agent.sendAgentUpdate();
    return { moving: Boolean(params.forward || params.right || params.up || params.turn) };
  }
  getBalance() { return actions.getBalance(this.requireBot()); }
  async payObject(params = {}) {
    const res = await actions.payObject(this.requireBot(), params);
    const record = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: res.amount,
      description: res.description,
      targetId: res.targetId,
      targetType: 'object',
      type: 'payment',
      status: 'success',
      timestamp: Date.now(),
    };
    this.transactions.unshift(record);
    this.send('transaction-recorded', record);
    return { ...res, transaction: record };
  }
  async payAvatar(params = {}) {
    const res = await actions.payAvatar(this.requireBot(), params);
    const record = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: res.amount,
      description: res.description,
      targetId: res.targetId,
      targetType: 'avatar',
      type: 'tip',
      status: 'success',
      timestamp: Date.now(),
    };
    this.transactions.unshift(record);
    this.send('transaction-recorded', record);
    return { ...res, transaction: record };
  }
  async getTransactionHistory(params = {}) {
    let balance = 0;
    try {
      const b = await this.getBalance();
      balance = b.balance;
    } catch {
      // Ignore if offline/mock
    }
    return { balance, transactions: this.transactions };
  }
  respondScriptDialog(params = {}) { return interactions.respondScriptDialog(this.requireBot(), this.pending, params); }
  acceptLure(params = {}) { return interactions.acceptLure(this.requireBot(), this.pending, params); }
  acceptInventoryOffer(params = {}) { return interactions.acceptInventoryOffer(this.requireBot(), this.pending, params); }
  acceptGroupInvite(params = {}) { return interactions.acceptGroupInvite(this.requireBot(), this.pending, params); }
  dismissInteraction(params) { return interactions.dismissInteraction(this.pending, params); }

  /**
   * Region names, ratings and map image ids for a block of the grid, as the official map asks for
   * them (MapBlockRequest). Regions that do not exist are simply absent from the answer.
   */
  async getMapBlocks({ minX, minY, maxX, maxY } = {}) {
    const bot = this.requireBot();
    const clamp = (value) => Math.max(0, Math.min(65535, Math.floor(Number(value))));
    const [x0, y0, x1, y1] = [minX, minY, maxX, maxY].map(clamp);
    if (![x0, y0, x1, y1].every(Number.isFinite) || x1 < x0 || y1 < y0) throw new Error('Invalid map range');
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) throw new Error('Map range too large');
    const reply = await bot.clientCommands.grid.getRegionMapInfoRange(x0, y0, x1, y1);
    const seen = new Map();
    for (const block of reply?.regions || []) {
      if (!block?.name || !Number.isFinite(block.x) || !Number.isFinite(block.y)) continue;
      if (seen.has(`${block.x},${block.y}`)) continue; // a block can be repeated across reply packets
      seen.set(`${block.x},${block.y}`, {
        x: block.x, y: block.y, name: block.name,
        access: finite(block.accessFlags), waterHeight: finite(block.waterHeight), regionFlags: finite(block.regionFlags),
        mapImage: block.mapImage?.toString?.() || null,
      });
    }
    return [...seen.values()];
  }

  async fetchAnimation({ id }) {
    const bot = this.requireBot();
    return { id, data: await this.queueAssetDownload(() => downloadAnimation(bot, id)) };
  }

  async voiceProvision({ sdp, parcelLocalId } = {}) {
    if (!sdp) throw new Error('A WebRTC offer is required');
    const caps = this.currentRegion()?.caps;
    const url = await caps?.getCapability?.('ProvisionVoiceAccountRequest');
    if (!url) throw new Error('Voice is not available in this region');
    return caps.capsPerformXMLPost(url, { jsep: { type: 'offer', sdp }, channel_type: 'local',
      voice_server_type: 'webrtc', ...(Number.isInteger(parcelLocalId) ? { parcel_local_id: parcelLocalId } : {}) });
  }

  async voiceSignal({ viewerSession, candidates, completed } = {}) {
    if (!viewerSession) throw new Error('Voice session is required');
    const caps = this.currentRegion()?.caps;
    const url = await caps?.getCapability?.('VoiceSignalingRequest');
    if (!url) throw new Error('Voice signaling is not available in this region');
    const body = { viewer_session: viewerSession, voice_server_type: 'webrtc' };
    if (Array.isArray(candidates) && candidates.length) body.candidates = candidates;
    if (completed) body.candidate = { completed: true };
    return caps.capsPerformXMLPost(url, body);
  }

  async voiceLogout({ viewerSession } = {}) {
    if (!viewerSession) return { loggedOut: true };
    const caps = this.currentRegion()?.caps;
    const url = await caps?.getCapability?.('ProvisionVoiceAccountRequest');
    if (url) await caps.capsPerformXMLPost(url, { logout: true, viewer_session: viewerSession, voice_server_type: 'webrtc' });
    return { loggedOut: true };
  }

  // ---- friends, groups, inventory -----------------------------------------------------------------

  async getFriends() {
    const bot = this.requireBot();
    const buddyList = bot.agent?.buddyList || [];
    const friendCommands = bot.clientCommands?.friends;
    const results = [];
    const rights = (buddy) => ({
      rightsGiven: Boolean(buddy?.buddyRightsGiven),
      rightsHas: Boolean(buddy?.buddyRightsHas),
      rightsGivenMask: Number(buddy?.buddyRightsGiven) || 0,
      rightsHasMask: Number(buddy?.buddyRightsHas) || 0,
    });
    const online = (id, fallback = false) => ((this.friendPresence.get(String(id).toLowerCase()) ?? fallback) ? 'online' : 'offline');

    const unresolved = [];
    for (const buddy of buddyList) {
      const id = buddy.buddyID?.toString();
      const friend = friendCommands?.getFriend(buddy.buddyID);
      if (friend) {
        results.push({ ...serializeFriend(friend, { id }), onlineStatus: online(id, Boolean(friend.online)), ...rights(buddy) });
      } else {
        unresolved.push(buddy.buddyID);
      }
    }

    // Names for friends the library has not resolved yet, in batches.
    if (unresolved.length && bot.clientCommands?.grid) {
      const BATCH = 50;
      for (let i = 0; i < unresolved.length; i += BATCH) {
        const batch = unresolved.slice(i, i + BATCH);
        try {
          const resolved = await bot.clientCommands.grid.avatarKey2Name(batch);
          for (const res of Array.isArray(resolved) ? resolved : [resolved]) {
            if (!res) continue;
            const id = res.getKey?.()?.toString();
            const name = res.getName?.() || `${res.getFirstName?.() || ''} ${res.getLastName?.() || ''}`.trim() || 'Resident';
            results.push({ id, name, onlineStatus: online(id), ...rights(buddyList.find((b) => b.buddyID?.toString() === id)) });
          }
        } catch (error) {
          console.warn('[SL Session] avatarKey2Name batch resolution warning:', error);
          for (const key of batch) {
            const id = key.toString();
            if (!results.some((r) => r.id === id)) {
              results.push({ id, name: `Resident (${id.slice(0, 8)})`, onlineStatus: online(id), ...rights(buddyList.find((b) => b.buddyID?.toString() === id)) });
            }
          }
        }
      }
    }
    return results;
  }

  async getGroups() {
    const bot = this.requireBot();
    if (!bot.clientCommands?.agent) return [];
    try {
      const raw = await bot.clientCommands.agent.getAvatarGroups(this.identity.agentId || bot.agent?.agentID);
      return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((group) => ({
        id: group.GroupID?.toString?.() || String(group.GroupID),
        name: group.GroupName || 'Group',
        title: group.GroupTitle || '',
        insignia: group.GroupInsigniaID?.toString?.() || '',
        acceptNotices: Boolean(group.AcceptNotices),
        powers: group.GroupPowers?.toString?.() || '',
      }));
    } catch (error) {
      console.warn('[SL Session] getAvatarGroups warning:', error);
      return [];
    }
  }

  async getInventory({ folderId } = {}) {
    const bot = this.requireBot();
    const commands = bot.clientCommands?.inventory;
    if (!commands) throw new Error('Second Life inventory interface unavailable');
    const root = commands.getInventoryRoot();
    if (!root) return { folders: [], items: [] };

    const rootId = root.folderID.toString();
    let folder = root;
    if (folderId && folderId !== rootId) {
      try {
        const skeletonFolder = bot.agent?.inventory?.main?.skeleton?.get(folderId);
        folder = skeletonFolder || root.findFolder(new UUID(folderId)) || root;
      } catch { /* fall back to the root */ }
    }
    try { await folder.populate(); } catch (error) { console.warn('[SL Inventory] folder.populate warning:', error); }

    const toFolder = (f) => ({ id: f.folderID?.toString(), name: f.name || 'Unnamed Folder', parent: f.parentID?.toString(), typeDefault: f.typeDefault, folder: true });
    const skeleton = bot.agent?.inventory?.main?.skeleton;
    const folders = skeleton && (!folderId || folderId === rootId)
      ? Array.from(skeleton.values()).map(toFolder)
      : (folder.getChildFolders() || []).map(toFolder);
    const items = (folder.items || []).map((item) => ({
      id: item.itemID?.toString(), name: item.name || 'Unnamed Item', parent: item.parentID?.toString(),
      assetType: item.assetType, inventoryType: item.inventoryType, description: item.description || '', folder: false,
    }));
    return { folderId: folder.folderID?.toString(), folderName: folder.name, folders, items };
  }

  // ---- diagnostics and scene catch-up -------------------------------------------------------------

  getDiagnostics() {
    if (!this.bot) {
      return { connected: false, state: 'DISCONNECTED', latencyMs: null, packetLossPct: null, capabilities: 0, circuitCode: null, simAddress: '', simPort: null };
    }
    const region = this.currentRegion();
    const circuit = region?.circuit;
    return {
      connected: true,
      state: 'CONNECTED',
      latencyMs: typeof circuit?.ping === 'number' ? circuit.ping : null,
      packetLossPct: typeof circuit?.packetLoss === 'number' ? circuit.packetLoss : null,
      capabilities: Object.keys(region?.caps || region?.capabilities || {}).length,
      circuitCode: circuit?.circuitCode || null,
      simAddress: region?.ip || circuit?.ip || '',
      simPort: region?.port || circuit?.port || null,
      regionName: region?.regionName || region?.name || '',
      fps: typeof region?.fps === 'number' ? region.fps : null,
      timeDilation: typeof region?.timeDilation === 'number' ? region.timeDilation : null,
    };
  }

  /** Every object currently in the region, serialised exactly like the live `object-add` events. */
  getSceneObjects() {
    const objects = this.currentRegion()?.objects;
    if (!objects) return [];
    try {
      return (objects.getAllObjects({ includeAvatars: true }) || []).map((object) => {
        const localId = object.ID || object.localID;
        this.loadObjectAsset(object);
        this.loadObjectTexture(object);
        this.loadObjectMaterials(object);
        return serializeObject({ localID: localId, object });
      });
    } catch (error) {
      console.warn('[SL Session] getAllObjects warning:', error);
      return [];
    }
  }

  /** Directory search, with a grid that never answers reported as such rather than as a raw packet timeout. */
  async searchDir(params = {}) {
    try {
      return await this.runDirectorySearch(params);
    } catch (error) {
      if (/^Timeout waiting for message/.test(error?.message || '')) {
        throw new Error('This grid did not answer the search. It may not run a search service.');
      }
      throw error;
    }
  }

  async runDirectorySearch(params = {}) {
    const category = String(params.category || 'people').toLowerCase();
    const query = String(params.query || '').trim();
    const start = Number(params.start) || 0;
    if (!query) return { results: [], hasMore: false };

    if (!this.bot) {
      throw new Error(NOT_CONNECTED);
    }
    // The circuit belongs to the region the avatar is in, not to the Bot itself.
    const circuit = this.currentRegion()?.circuit;
    if (!circuit && category !== 'groups') throw new Error(NOT_CONNECTED);

    if (category === 'people') {
      const msg = new DirFindQueryMessage();
      msg.AgentData = {
        AgentID: this.bot.agent.agentID,
        SessionID: circuit.sessionID,
      };
      const queryID = UUID.random();
      msg.QueryData = {
        QueryID: queryID,
        QueryText: Utils.StringToBuffer(query),
        QueryFlags: DirFindFlags.People | DirFindFlags.IncludePG | DirFindFlags.IncludeMature | DirFindFlags.IncludeAdult,
        QueryStart: start,
      };
      circuit.sendMessage(msg, PacketFlags.Reliable);
      const reply = await circuit.waitForMessage(Message.DirPeopleReply, 10000, (dpr) => {
        return dpr.QueryData?.QueryID?.equals(queryID) ? FilterResponse.Finish : FilterResponse.NoMatch;
      });
      const results = [];
      for (const p of reply.QueryReplies || []) {
        if (!p.AgentID || p.AgentID.isZero()) continue;
        const firstName = Utils.BufferToStringSimple(p.FirstName || '');
        const lastName = Utils.BufferToStringSimple(p.LastName || '');
        const group = Utils.BufferToStringSimple(p.Group || '');
        const username = lastName && lastName !== 'Resident' ? `${firstName} ${lastName}` : firstName;
        const displayName = `${firstName} ${lastName}`.trim();
        results.push({
          id: p.AgentID.toString(),
          name: displayName || username,
          displayName,
          username,
          firstName,
          lastName,
          group,
          online: Boolean(p.Online),
          type: 'people',
        });
      }
      return { results, hasMore: results.length >= 100 };
    } else if (category === 'groups') {
      const rawResults = await this.bot.clientCommands.group.searchGroups(query, start);
      const results = (rawResults || []).map((g) => ({
        id: g.GroupID?.toString?.() || g.id || crypto.randomUUID(),
        name: g.GroupName || g.name || query,
        members: g.Members ?? g.members ?? 0,
        type: 'groups',
      }));
      return { results, hasMore: results.length >= 100 };
    } else if (category === 'places') {
      const msg = new DirPlacesQueryMessage();
      msg.AgentData = {
        AgentID: this.bot.agent.agentID,
        SessionID: circuit.sessionID,
      };
      const queryID = UUID.random();
      msg.QueryData = {
        QueryID: queryID,
        QueryText: Utils.StringToBuffer(query),
        QueryFlags: DirFindFlags.IncludePG | DirFindFlags.IncludeMature | DirFindFlags.IncludeAdult,
        Category: 0,
        SimName: Buffer.from(''),
        QueryStart: start,
      };
      circuit.sendMessage(msg, PacketFlags.Reliable);
      const reply = await circuit.waitForMessage(Message.DirPlacesReply, 10000, (dpr) => {
        const qids = dpr.QueryData || [];
        for (const q of qids) {
          if (q.QueryID?.equals(queryID)) return FilterResponse.Finish;
        }
        return FilterResponse.NoMatch;
      });
      const results = [];
      for (const place of reply.QueryReplies || []) {
        results.push({
          id: place.ParcelID?.toString() || crypto.randomUUID(),
          name: Utils.BufferToStringSimple(place.Name || ''),
          dwell: place.Dwell || 0,
          forSale: Boolean(place.ForSale),
          type: 'places',
        });
      }
      return { results, hasMore: results.length >= 100 };
    }

    return { results: [], hasMore: false };
  }

  /** Objects and decoded assets, for a client that connected after they were first announced. */
  getSceneSnapshot() {
    return { objects: this.getSceneObjects(), assets: Array.from(this.decodedAssets.values()) };
  }

  async close() {
    for (const subscription of this.subscriptions.splice(0)) {
      try { subscription.unsubscribe(); } catch { /* already gone */ }
    }
    this.assetRequests.clear();
    this.assetFailures.clear();
    this.decodedAssets.clear();
    this.pending.clear();
    if (!this.bot) return;
    const bot = this.bot;
    this.bot = null;
    try { await bot.close(); } catch { /* circuit may already be closed */ }
  }
}

module.exports = { ViewerSession, serializeObject, serializeEnvironment, serializeTerrain, serializeFriend, serializeTerrainMaterials, PCode };
