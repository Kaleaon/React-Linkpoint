// The Second Life viewer session: one implementation for every host.
//
// The Electron main process and the web server both create a ViewerSession and hand it a `send`
// function that delivers `(type, data)` events to the client (IPC or Server-Sent Events). They then
// expose its methods through the shared method table in ./viewer-api.cjs. Nothing in here knows
// which host it runs under, so desktop, web and mobile (which talks to the web server) cannot drift.
const crypto = require('node:crypto');
const {
  Bot,
  BotOptionFlags,
  PCode,
  AssetType,
  UUID,
} = require('@caspertech/node-metaverse');
const { decodeLLMesh, decodeGLTFMaterial, decodeSculpt, decodeJPEG2000 } = require('./sl-asset-decoder.cjs');
const actions = require('./sl-actions.cjs');
const interactions = require('./sl-interactions.cjs');
const { watchAnimations, downloadAnimation } = require('./sl-animations.cjs');
const { serializeTerrainMaterials } = require('./sl-terrain.cjs');
const {
  finite, vector, serializeEnvironment, serializeTerrain, primAppearance, serializeObject, serializeFriend,
} = require('./serializers.cjs');

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
    this.decodedAssets = new Map();
    this.friendPresence = new Map();
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

  // ---- asset streaming --------------------------------------------------------------------------

  /** Download, decode and stream one asset once; failures are reported to the client as `asset-error`. */
  streamAsset(key, kind, assetId, download, ready) {
    if (this.assetRequests.has(key)) return;
    const request = (async () => {
      const buffer = await this.bot.clientCommands.asset.downloadAsset(kind, assetId);
      await ready(buffer);
    })().catch((error) => this.send('asset-error', { assetId, message: error.message }));
    this.assetRequests.set(key, request);
  }

  loadTexture(assetId) {
    if (!assetId) return;
    this.streamAsset(`texture:${assetId}`, AssetType.Texture, assetId, null, async (buffer) => {
      this.send('texture-ready', { assetId, ...await decodeJPEG2000(buffer) });
    });
  }

  loadObjectAsset(object) {
    const appearance = primAppearance(object);
    if (!appearance.assetId) return;
    const kind = appearance.assetKind === 'mesh' ? AssetType.Mesh : AssetType.Texture;
    this.streamAsset(appearance.assetId, kind, appearance.assetId, null, async (buffer) => {
      const geometry = appearance.assetKind === 'mesh'
        ? await decodeLLMesh(buffer)
        : await decodeSculpt(buffer, (object.SculptData || object.extraParams?.sculptData)?.type);
      this.send('asset-ready', { assetId: appearance.assetId, assetKind: appearance.assetKind, geometry });
    });
  }

  loadObjectTexture(object) {
    const appearance = primAppearance(object);
    const ids = new Set([appearance.textureId, ...appearance.faceTextures.map((face) => face.textureId)].filter(Boolean));
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
      if (!this.bot.currentRegion) throw error;
      console.warn('[SL Session] connectToSim warning:', error);
    }
    const region = this.bot.currentRegion;
    const animations = watchAnimations(() => this.bot?.currentRegion, (type, data) => this.send(type, data));
    if (animations) this.subscriptions.push(animations);

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
  getBalance() { return actions.getBalance(this.requireBot()); }
  respondScriptDialog(params = {}) { return interactions.respondScriptDialog(this.requireBot(), this.pending, params); }
  acceptLure(params = {}) { return interactions.acceptLure(this.requireBot(), this.pending, params); }
  dismissInteraction(params) { return interactions.dismissInteraction(this.pending, params); }

  async fetchAnimation({ id }) {
    return { id, data: await downloadAnimation(this.requireBot(), id) };
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
    const region = this.bot.currentRegion;
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
    const objects = this.bot?.currentRegion?.objects;
    if (!objects) return [];
    try {
      return (objects.getAllObjects({ includeAvatars: true }) || []).map((object) => {
        const localId = object.ID || object.localID;
        return serializeObject({ localID: localId, object });
      });
    } catch (error) {
      console.warn('[SL Session] getAllObjects warning:', error);
      return [];
    }
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
    this.decodedAssets.clear();
    this.pending.clear();
    if (!this.bot) return;
    const bot = this.bot;
    this.bot = null;
    try { await bot.close(); } catch { /* circuit may already be closed */ }
  }
}

module.exports = { ViewerSession, serializeObject, serializeEnvironment, serializeTerrain, serializeFriend, serializeTerrainMaterials, PCode };
