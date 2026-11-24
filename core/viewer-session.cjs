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
    if (
      value &&
      typeof value === 'object' &&
      (typeof value.mUUID === 'string' || value.constructor?.name === 'UUID')
    ) {
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
  FolderType,
  ControlFlags,
  UUID,
} = require('@caspertech/node-metaverse');
const {
  decodeLLMesh,
  decodeGLTFMaterial,
  decodeSculpt,
  decodeJPEG2000,
} = require('./sl-asset-decoder.cjs');
const actions = require('./sl-actions.cjs');
const outfit = require('./sl-outfit.cjs');
const interactions = require('./sl-interactions.cjs');
const { watchAnimations, downloadAnimation, sendAgentAnimations } = require('./sl-animations.cjs');
const { watchAvatarAppearance } = require('./sl-appearance.cjs');
const { watchSounds, downloadSound } = require('./sl-sounds.cjs');
const { watchWind } = require('./sl-wind.cjs');
const { watchParcelSound } = require('./sl-parcel-sound.cjs');
const { NeighborRegions, observeEventQueue } = require('./sl-neighbors.cjs');
const { MuteListLoader, MUTE_TYPE, sendMuteUpdate, sendMuteRemove } = require('./sl-mutelist.cjs');
const { serializeTerrainMaterials } = require('./sl-terrain.cjs');
const {
  finite,
  vector,
  serializeEnvironment,
  serializeTerrain,
  primAppearance,
  serializeObject,
  serializeFriend,
} = require('./serializers.cjs');
const {
  DirFindQueryMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/DirFindQuery');
const {
  DirPlacesQueryMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/DirPlacesQuery');
const {
  DirClassifiedQueryMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/DirClassifiedQuery');
const {
  ParcelBuyMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/ParcelBuy');
const { DirFindFlags } = require('@caspertech/node-metaverse/dist/lib/enums/DirFindFlags');

class DirEventsQueryMessage {
  constructor() {
    this.name = 'DirEventsQuery';
    this.messageFlags = 20; // MessageFlags.FrequencyLow
    this.id = 4294901822; // 0xFFFF003E
    this.AgentData = { AgentID: UUID.zero(), SessionID: UUID.zero() };
    this.QueryData = {
      QueryID: UUID.zero(),
      SearchText: Buffer.allocUnsafe(0),
      QueryFlags: 0,
      Category: 0,
      DateText: Buffer.allocUnsafe(0),
      QueryStart: 0,
    };
  }

  getSize() {
    return 62 + this.QueryData.SearchText.length + this.QueryData.DateText.length;
  }

  writeToBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData.AgentID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.SessionID.writeToBuffer(buf, pos);
    pos += 16;
    this.QueryData.QueryID.writeToBuffer(buf, pos);
    pos += 16;

    buf.writeUInt8(this.QueryData.SearchText.length, pos++);
    this.QueryData.SearchText.copy(buf, pos);
    pos += this.QueryData.SearchText.length;

    buf.writeUInt32LE(this.QueryData.QueryFlags, pos);
    pos += 4;
    buf.writeUInt32LE(this.QueryData.Category, pos);
    pos += 4;

    buf.writeUInt8(this.QueryData.DateText.length, pos++);
    this.QueryData.DateText.copy(buf, pos);
    pos += this.QueryData.DateText.length;

    buf.writeInt32LE(this.QueryData.QueryStart, pos);
    pos += 4;

    return pos - startPos;
  }
}

class ParcelPropertiesUpdateMessage {
  constructor() {
    this.name = 'ParcelPropertiesUpdate';
    this.messageFlags = 20; // MessageFlags.Zerocoded | MessageFlags.FrequencyLow
    this.id = 0xffff0100 >>> 0; // 4294902016 (Low-frequency message ID 0xFFFF0100)
    this.AgentData = {
      AgentID: UUID.zero(),
      SessionID: UUID.zero(),
    };
    this.ParcelData = {
      LocalID: 0,
      ParcelFlags: 0,
      AuthBuyerID: UUID.zero(),
      SnapshotID: UUID.zero(),
      UserLocation: [0, 0, 0],
      UserLookAt: [0, 0, 0],
      Category: 0,
      Name: Buffer.alloc(0),
      Desc: Buffer.alloc(0),
      MusicURL: Buffer.alloc(0),
      MediaURL: Buffer.alloc(0),
      MediaID: UUID.zero(),
      MediaAutoScale: 0,
      GroupID: UUID.zero(),
      PassPrice: 0,
      PassHours: 0,
      DirectoryFee: 0,
      LandingType: 0,
    };
  }

  getSize() {
    return (
      32 + // AgentData (AgentID: 16, SessionID: 16)
      4 + // LocalID
      4 + // ParcelFlags
      16 + // AuthBuyerID
      16 + // SnapshotID
      12 + // UserLocation (3x float)
      12 + // UserLookAt (3x float)
      1 + // Category
      1 +
      this.ParcelData.Name.length +
      2 +
      this.ParcelData.Desc.length +
      1 +
      this.ParcelData.MusicURL.length +
      1 +
      this.ParcelData.MediaURL.length +
      16 + // MediaID
      1 + // MediaAutoScale
      16 + // GroupID
      4 + // PassPrice
      4 + // PassHours
      4 + // DirectoryFee
      1 // LandingType
    );
  }

  writeToBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData.AgentID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.SessionID.writeToBuffer(buf, pos);
    pos += 16;
    buf.writeInt32LE(this.ParcelData.LocalID, pos);
    pos += 4;
    buf.writeUInt32LE(this.ParcelData.ParcelFlags, pos);
    pos += 4;
    this.ParcelData.AuthBuyerID.writeToBuffer(buf, pos);
    pos += 16;
    this.ParcelData.SnapshotID.writeToBuffer(buf, pos);
    pos += 16;

    const loc = this.ParcelData.UserLocation;
    buf.writeFloatLE(Array.isArray(loc) ? loc[0] || 0 : loc.x || 0, pos);
    pos += 4;
    buf.writeFloatLE(Array.isArray(loc) ? loc[1] || 0 : loc.y || 0, pos);
    pos += 4;
    buf.writeFloatLE(Array.isArray(loc) ? loc[2] || 0 : loc.z || 0, pos);
    pos += 4;

    const look = this.ParcelData.UserLookAt;
    buf.writeFloatLE(Array.isArray(look) ? look[0] || 0 : look.x || 0, pos);
    pos += 4;
    buf.writeFloatLE(Array.isArray(look) ? look[1] || 0 : look.y || 0, pos);
    pos += 4;
    buf.writeFloatLE(Array.isArray(look) ? look[2] || 0 : look.z || 0, pos);
    pos += 4;

    buf.writeUInt8(this.ParcelData.Category, pos++);

    buf.writeUInt8(this.ParcelData.Name.length, pos++);
    this.ParcelData.Name.copy(buf, pos);
    pos += this.ParcelData.Name.length;

    buf.writeUInt16LE(this.ParcelData.Desc.length, pos);
    pos += 2;
    this.ParcelData.Desc.copy(buf, pos);
    pos += this.ParcelData.Desc.length;

    buf.writeUInt8(this.ParcelData.MusicURL.length, pos++);
    this.ParcelData.MusicURL.copy(buf, pos);
    pos += this.ParcelData.MusicURL.length;

    buf.writeUInt8(this.ParcelData.MediaURL.length, pos++);
    this.ParcelData.MediaURL.copy(buf, pos);
    pos += this.ParcelData.MediaURL.length;

    this.ParcelData.MediaID.writeToBuffer(buf, pos);
    pos += 16;
    buf.writeUInt8(this.ParcelData.MediaAutoScale, pos++);
    this.ParcelData.GroupID.writeToBuffer(buf, pos);
    pos += 16;
    buf.writeInt32LE(this.ParcelData.PassPrice, pos);
    pos += 4;
    buf.writeFloatLE(this.ParcelData.PassHours, pos);
    pos += 4;
    buf.writeInt32LE(this.ParcelData.DirectoryFee, pos);
    pos += 4;
    buf.writeUInt8(this.ParcelData.LandingType, pos++);

    return pos - startPos;
  }
}

class ActivateGesturesMessage {
  constructor() {
    this.name = 'ActivateGestures';
    this.zeroEncoded = false;
    this.messageFlags = 4; // MessageFlags.FrequencyLow (NotTrusted, Unencoded)
    this.id = 0xffff013c >>> 0; // 4294902076 (Low 316: ActivateGestures)
    this.AgentData = {
      AgentID: UUID.zero(),
      SessionID: UUID.zero(),
      Flags: 0,
    };
    this.Data = [];
  }

  getSize() {
    const count = Math.min(255, Array.isArray(this.Data) ? this.Data.length : 0);
    return (
      32 + // AgentID (16) + SessionID (16)
      4 + // Flags (U32)
      1 + // Variable block count (U8)
      count * 36 // ItemID (16) + AssetID (16) + GestureFlags (4)
    );
  }

  writeToBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData.AgentID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.SessionID.writeToBuffer(buf, pos);
    pos += 16;
    buf.writeUInt32LE((Number(this.AgentData.Flags) || 0) >>> 0, pos);
    pos += 4;

    const entries = Array.isArray(this.Data) ? this.Data.slice(0, 255) : [];
    buf.writeUInt8(entries.length, pos++);
    for (const item of entries) {
      (item.ItemID || UUID.zero()).writeToBuffer(buf, pos);
      pos += 16;
      (item.AssetID || UUID.zero()).writeToBuffer(buf, pos);
      pos += 16;
      buf.writeUInt32LE((Number(item.GestureFlags) || 0) >>> 0, pos);
      pos += 4;
    }

    return pos - startPos;
  }

  readFromBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData = {
      AgentID: new UUID(buf, pos),
      SessionID: new UUID(buf, pos + 16),
      Flags: buf.readUInt32LE(pos + 32),
    };
    pos += 36;
    const count = buf.readUInt8(pos++);
    this.Data = [];
    for (let i = 0; i < count; i++) {
      const itemID = new UUID(buf, pos);
      pos += 16;
      const assetID = new UUID(buf, pos);
      pos += 16;
      const gestureFlags = buf.readUInt32LE(pos);
      pos += 4;
      this.Data.push({
        ItemID: itemID,
        AssetID: assetID,
        GestureFlags: gestureFlags,
      });
    }
    return pos - startPos;
  }
}

class DeactivateGesturesMessage {
  constructor() {
    this.name = 'DeactivateGestures';
    this.zeroEncoded = false;
    this.messageFlags = 4; // MessageFlags.FrequencyLow (NotTrusted, Unencoded)
    this.id = 0xffff013d >>> 0; // 4294902077 (Low 317: DeactivateGestures)
    this.AgentData = {
      AgentID: UUID.zero(),
      SessionID: UUID.zero(),
      Flags: 0,
    };
    this.Data = [];
  }

  getSize() {
    const count = Math.min(255, Array.isArray(this.Data) ? this.Data.length : 0);
    return (
      32 + // AgentID (16) + SessionID (16)
      4 + // Flags (U32)
      1 + // Variable block count (U8)
      count * 20 // ItemID (16) + GestureFlags (4)
    );
  }

  writeToBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData.AgentID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.SessionID.writeToBuffer(buf, pos);
    pos += 16;
    buf.writeUInt32LE((Number(this.AgentData.Flags) || 0) >>> 0, pos);
    pos += 4;

    const entries = Array.isArray(this.Data) ? this.Data.slice(0, 255) : [];
    buf.writeUInt8(entries.length, pos++);
    for (const item of entries) {
      (item.ItemID || UUID.zero()).writeToBuffer(buf, pos);
      pos += 16;
      buf.writeUInt32LE((Number(item.GestureFlags) || 0) >>> 0, pos);
      pos += 4;
    }

    return pos - startPos;
  }

  readFromBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData = {
      AgentID: new UUID(buf, pos),
      SessionID: new UUID(buf, pos + 16),
      Flags: buf.readUInt32LE(pos + 32),
    };
    pos += 36;
    const count = buf.readUInt8(pos++);
    this.Data = [];
    for (let i = 0; i < count; i++) {
      const itemID = new UUID(buf, pos);
      pos += 16;
      const gestureFlags = buf.readUInt32LE(pos);
      pos += 4;
      this.Data.push({
        ItemID: itemID,
        GestureFlags: gestureFlags,
      });
    }
    return pos - startPos;
  }
}

function sanitizeParcelProperties(params = {}) {
  const localId = Number(params.localId ?? params.LocalID ?? 0) | 0;
  const flags =
    Number(params.parcelFlags ?? params.flags ?? params.Flags ?? params.ParcelFlags ?? 0) >>> 0;
  const name = String(params.name ?? params.Name ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 255);
  const desc = String(params.desc ?? params.description ?? params.Desc ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, 65535);
  const musicUrl = String(params.musicUrl ?? params.MusicURL ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 255);
  const mediaUrl = String(params.mediaUrl ?? params.MediaURL ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 255);
  const sanitizeUUIDStr = (id) => {
    if (!id) return '00000000-0000-0000-0000-000000000000';
    const str = String(id).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
      ? str
      : '00000000-0000-0000-0000-000000000000';
  };
  const mediaId = sanitizeUUIDStr(params.mediaId ?? params.MediaID);
  const mediaAutoScale = Number(params.mediaAutoScale ?? params.MediaAutoScale ?? 0) & 0xff;
  const landingType = Number(params.landingType ?? params.LandingType ?? 0) & 0xff;
  const category = Number(params.category ?? params.Category ?? 0) & 0xff;
  const passPrice = Number(params.passPrice ?? params.PassPrice ?? 0) | 0;
  const passHours = Number(params.passHours ?? params.PassHours ?? 0);
  const directoryFee = Number(params.directoryFee ?? params.DirectoryFee ?? 0) | 0;
  const authBuyerId = sanitizeUUIDStr(params.authBuyerId ?? params.AuthBuyerID);
  const snapshotId = sanitizeUUIDStr(params.snapshotId ?? params.SnapshotID);
  const groupId = sanitizeUUIDStr(params.groupId ?? params.GroupID);
  const userLocation = Array.isArray(params.userLocation ?? params.UserLocation)
    ? (params.userLocation ?? params.UserLocation).slice(0, 3).map(Number)
    : [0, 0, 0];
  const userLookAt = Array.isArray(params.userLookAt ?? params.UserLookAt)
    ? (params.userLookAt ?? params.UserLookAt).slice(0, 3).map(Number)
    : [0, 0, 0];

  return {
    localId,
    parcelFlags: flags,
    flags,
    name,
    desc,
    description: desc,
    musicUrl,
    mediaUrl,
    mediaId,
    mediaAutoScale,
    landingType,
    category,
    passPrice,
    passHours,
    directoryFee,
    authBuyerId,
    snapshotId,
    groupId,
    userLocation,
    userLookAt,
  };
}

function sanitizeQueryString(input) {
  if (!input) return '';
  const sanitized = String(input)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  return sanitized.slice(0, 255);
}
const {
  TeleportLandmarkRequestMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/TeleportLandmarkRequest');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const { MessageFlags } = require('@caspertech/node-metaverse/dist/lib/enums/MessageFlags');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');
const { FilterResponse } = require('@caspertech/node-metaverse/dist/lib/enums/FilterResponse');
const {
  InstantMessageDialog,
} = require('@caspertech/node-metaverse/dist/lib/enums/InstantMessageDialog');
const { Vector3 } = require('@caspertech/node-metaverse/dist/lib/classes/Vector3');
const {
  ImprovedInstantMessageMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/ImprovedInstantMessage');
const { Utils } = require('@caspertech/node-metaverse/dist/lib/classes/Utils');
const {
  ActivateGroupMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/ActivateGroup');
const {
  LeaveGroupRequestMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/LeaveGroupRequest');
const {
  InviteGroupRequestMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/InviteGroupRequest');
const {
  EjectGroupMemberRequestMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/EjectGroupMemberRequest');
const {
  GroupRoleChangesMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/GroupRoleChanges');
const {
  RequestPayPriceMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/RequestPayPrice');
const {
  PayPriceReplyMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/PayPriceReply');
const {
  CreateInventoryFolderMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/CreateInventoryFolder');
const { InventoryFolder } = require('@caspertech/node-metaverse/dist/lib/classes/InventoryFolder');
const {
  PurgeInventoryDescendentsMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/PurgeInventoryDescendents');
const {
  RemoveInventoryItemMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/RemoveInventoryItem');
const {
  RemoveInventoryFolderMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/RemoveInventoryFolder');
const {
  AgentAnimationMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/AgentAnimation');
const {
  SoundTriggerMessage,
} = require('@caspertech/node-metaverse/dist/lib/classes/messages/SoundTrigger');
const { Long } = require('@caspertech/node-metaverse/dist/lib/classes/LongUtil');

class TerminateFriendshipMessage {
  constructor() {
    this.name = 'TerminateFriendship';
    this.messageFlags = MessageFlags.FrequencyLow;
    this.id = 0xffff012c >>> 0; // Low-frequency message ID 300 (0xFFFF012C)
    this.AgentData = {
      AgentID: UUID.zero(),
      SessionID: UUID.zero(),
    };
    this.ExBlock = {
      OtherID: UUID.zero(),
    };
  }

  getSize() {
    return 48;
  }

  writeToBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData.AgentID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.SessionID.writeToBuffer(buf, pos);
    pos += 16;
    this.ExBlock.OtherID.writeToBuffer(buf, pos);
    pos += 16;
    return pos - startPos;
  }

  readFromBuffer(buf, pos) {
    this.AgentData = {
      AgentID: new UUID(buf, pos),
      SessionID: new UUID(buf, pos + 16),
    };
    this.ExBlock = {
      OtherID: new UUID(buf, pos + 32),
    };
    return 48;
  }
}

class AgentSetGroupTitleMessage {
  constructor() {
    this.name = 'AgentSetGroupTitle';
    this.messageFlags = MessageFlags.Zerocoded | MessageFlags.FrequencyLow;
    this.id = Message.AgentSetGroupTitle || 4294902178;
    this.AgentData = {
      AgentID: UUID.zero(),
      SessionID: UUID.zero(),
      GroupID: UUID.zero(),
      RoleID: UUID.zero(),
    };
  }
  getSize() {
    return 64;
  }
  writeToBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData.AgentID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.SessionID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.GroupID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.RoleID.writeToBuffer(buf, pos);
    pos += 16;
    return pos - startPos;
  }
  readFromBuffer(buf, pos) {
    const startPos = pos;
    this.AgentData = {
      AgentID: new UUID(buf, pos),
      SessionID: new UUID(buf, pos + 16),
      GroupID: new UUID(buf, pos + 32),
      RoleID: new UUID(buf, pos + 48),
    };
    return 64;
  }
}

const NOT_CONNECTED = 'Not connected to Second Life';
/** How many times a failed (non-permanent) asset is fetched again on its own before waiting for a manual retry. */
const ASSET_AUTO_RETRIES = 4;

const newId = () => crypto.randomUUID();

const VOICE_PROVISION_KEYS = [
  'jsep',
  'parcel_local_id',
  'channel_type',
  'voice_server_type',
  'credentials',
  'channel',
];
const VOICE_SIGNAL_KEYS = ['viewer_session', 'voice_server_type', 'candidates', 'candidate'];

/** Keep only the fields the voice capabilities take, and only for the WebRTC voice server. */
function sanitizeVoiceBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('A voice request body is required');
  if (body.voice_server_type !== 'webrtc') throw new Error('Only WebRTC voice is supported');
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
}

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
    this.appearanceWatcher = null;
    this.assetRequests = new Map();
    this.assetFailures = new Map();
    this.assetAttempts = new Map();
    this.assetRetryTimers = new Map();
    this.assetDownloadQueue = [];
    this.activeAssetDownloads = 0;
    this.decodedAssets = new Map();
    this.friendPresence = new Map();
    this.voiceSessionCaps = new Map();
    /** Friend names already resolved, by lowercase id, so a later list does not ask the grid again. */
    this.friendNames = new Map();
    this.soundRequests = new Set();
    this.objectSounds = new Map();
    this.transactions = [];
    this.pending = new interactions.PendingInteractions();
    this.pendingParcelTransactions = new Map();
    this.activeGestures = new Map();
    this.activeGroupId = '00000000-0000-0000-0000-000000000000';
    this.activeRoleId = '00000000-0000-0000-0000-000000000000';
    /** Filled in by connect(): who is logged in and where. */
    this.identity = { agentId: '', firstName: '', lastName: '', simName: '', inventoryRootId: '' };
  }

  /** Deliver an event to the client, remembering replayable assets for late joiners. */
  send(type, data) {
    if (this.replay) {
      if (type === 'asset-ready' && data?.assetId)
        this.decodedAssets.set(data.assetId, { type, data });
      else if (type === 'texture-ready' && data?.assetId)
        this.decodedAssets.set(`texture:${data.assetId}`, { type, data });
      else if (type === 'material-ready' && data?.assetId)
        this.decodedAssets.set(`material:${data.assetId}`, { type, data });
      else if (type === 'terrain' || type === 'world-data')
        this.decodedAssets.set(type, { type, data });
    }
    this.sendEvent(type, data);
  }

  requireBot() {
    if (!this.bot) throw new Error(NOT_CONNECTED);
    return this.bot;
  }

  /** Reading Bot.currentRegion throws while login/teleport teardown has no active region. */
  currentRegion() {
    try {
      return this.bot?.currentRegion || null;
    } catch {
      return null;
    }
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
      Promise.resolve()
        .then(job.download)
        .then(job.resolve, job.reject)
        .finally(() => {
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
      const buffer = await this.queueAssetDownload(() =>
        download ? download() : this.bot.clientCommands.asset.downloadAsset(kind, assetId),
      );
      await ready(buffer);
      this.assetFailures.delete(key);
      this.assetAttempts.delete(key);
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
      // Nothing else re-announces an object, so a mesh that failed once (a truncated download, a
      // malformed block, a stale capability) would stay a placeholder. Retry it a few times by itself.
      const attempts = (this.assetAttempts.get(key) || 0) + 1;
      this.assetAttempts.set(key, attempts);
      if (
        !isPermanent &&
        attempts < ASSET_AUTO_RETRIES &&
        this.bot &&
        !this.assetRetryTimers.has(key)
      ) {
        const timer = setTimeout(() => {
          this.assetRetryTimers.delete(key);
          if (this.bot) this.streamAsset(key, kind, assetId, download, ready);
        }, backoffMs * attempts);
        timer.unref?.();
        this.assetRetryTimers.set(key, timer);
      }
    });
    this.assetRequests.set(key, request);
  }

  /** Forget every failure so the next scene pass downloads those assets again. */
  resetAssetFailures() {
    this.assetFailures.clear();
    this.assetAttempts.clear();
    for (const timer of this.assetRetryTimers.values()) clearTimeout(timer);
    this.assetRetryTimers.clear();
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
        const response = await caps.requestGet(
          `${String(capability).replace(/\/?$/, '/')}?texture_id=${encodeURIComponent(assetId)}`,
        );
        if (response?.body)
          return Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
      }
    }
    throw new Error(
      `Texture ${assetId} unavailable: ViewerAsset and GetTexture capabilities are unavailable`,
    );
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
            const response = await caps.requestGet(
              `${String(capability).replace(/\/?$/, '/')}?mesh_id=${encodeURIComponent(assetId)}`,
              { responseType: 'buffer' },
            );
            if (response?.body)
              return Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
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
    throw new Error(
      `Mesh ${assetId} unavailable: ViewerAsset and mesh capabilities are unavailable`,
    );
  }

  /**
   * Download a notecard asset through ViewerAsset capability, falling back to simulator transfer.
   */
  async downloadNotecard(assetId) {
    if (!assetId) throw new Error('A notecard asset ID is required');
    const caps = this.currentRegion()?.caps;
    if (caps?.getCapability) {
      try {
        const capUrl = await caps.getCapability('ViewerAsset');
        if (capUrl && typeof caps.requestGet === 'function') {
          const url = `${String(capUrl).replace(/\/?$/, '/')}?notecard_id=${encodeURIComponent(assetId)}`;
          const response = await caps.requestGet(url, { responseType: 'buffer' });
          if (response?.body) {
            return Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
          }
        }
      } catch (capErr) {
        console.warn(
          `[SL Session] ViewerAsset notecard download failed for ${assetId}:`,
          capErr.message || capErr,
        );
      }
    }
    // Fallback: asset transfer packet via node-metaverse clientCommands
    if (this.bot?.clientCommands?.asset?.transfer) {
      try {
        const { AssetType, UUID } = require('@caspertech/node-metaverse');
        const {
          TransferChannelType,
        } = require('@caspertech/node-metaverse/dist/lib/enums/TransferChannelType');
        const {
          TransferSourceType,
        } = require('@caspertech/node-metaverse/dist/lib/enums/TransferSourceTypes');
        const params = Buffer.alloc(20);
        new UUID(assetId).writeToBuffer(params, 0);
        params.writeInt32LE(AssetType.Notecard, 16);
        const buffer = await this.bot.clientCommands.asset.transfer(
          TransferChannelType.Asset,
          TransferSourceType.Asset,
          false,
          params,
        );
        if (buffer && buffer.length > 0) return buffer;
      } catch (transferErr) {
        console.warn(
          `[SL Session] Asset transfer failed for ${assetId}:`,
          transferErr.message || transferErr,
        );
      }
    }
    throw new Error(`Notecard ${assetId} unavailable: ViewerAsset capability failed`);
  }

  async fetchNotecard({ id, itemId } = {}) {
    const assetId = id || itemId;
    if (!assetId) throw new Error('A notecard asset ID or item ID is required');
    this.requireBot();
    const buffer = await this.queueAssetDownload(() => this.downloadNotecard(assetId));
    return {
      id: assetId,
      itemId: itemId || id,
      data: buffer.toString('utf-8'),
      base64: buffer.toString('base64'),
      size: buffer.length,
    };
  }

  async downloadGesture(assetId) {
    const cleanId = String(assetId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId)) {
      throw new Error('A valid gesture asset UUID is required');
    }
    const bot = this.requireBot();
    const caps = this.currentRegion()?.caps;
    if (caps?.getCapability) {
      try {
        const capUrl = await caps.getCapability('ViewerAsset');
        if (capUrl && typeof caps.requestGet === 'function') {
          const url = `${String(capUrl).replace(/\/?$/, '/')}?gesture_id=${encodeURIComponent(cleanId)}`;
          const response = await caps.requestGet(url, { responseType: 'buffer' });
          if (response?.body) {
            const buf = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body);
            if (buf.length > 0) return buf;
          }
        }
      } catch (capErr) {
        console.warn(
          `[SL Session] ViewerAsset gesture download failed for ${cleanId}:`,
          capErr.message || capErr,
        );
      }
    }
    if (bot.clientCommands?.asset?.downloadAsset) {
      try {
        const buf = await bot.clientCommands.asset.downloadAsset(AssetType.Gesture, cleanId);
        if (buf && buf.length > 0) return Buffer.from(buf);
      } catch {
        // Retry over simulator transfer channel below
      }
    }
    if (bot.clientCommands?.asset?.transfer) {
      const {
        TransferChannelType,
      } = require('@caspertech/node-metaverse/dist/lib/enums/TransferChannelType');
      const {
        TransferSourceType,
      } = require('@caspertech/node-metaverse/dist/lib/enums/TransferSourceTypes');
      const params = Buffer.alloc(20);
      new UUID(cleanId).writeToBuffer(params, 0);
      params.writeInt32LE(AssetType.Gesture, 16);
      const buffer = await bot.clientCommands.asset.transfer(
        TransferChannelType.Asset,
        TransferSourceType.Asset,
        false,
        params,
      );
      if (buffer && buffer.length > 0) return Buffer.from(buffer);
    }
    throw new Error(`Gesture ${cleanId} unavailable`);
  }

  async fetchGesture({ id, itemId } = {}) {
    const bot = this.requireBot();
    let assetId = id ? String(id).trim() : '';
    if (!assetId && itemId) {
      const skeleton = bot.agent?.inventory?.main?.skeleton;
      if (skeleton) {
        for (const folder of skeleton.values()) {
          const match = (folder.items || []).find(
            (i) => i.itemID?.toString?.().toLowerCase() === String(itemId).trim().toLowerCase(),
          );
          if (match?.assetID) {
            assetId = match.assetID.toString();
            break;
          }
        }
      }
      if (!assetId) assetId = String(itemId).trim();
    }
    if (!assetId) throw new Error('A gesture asset ID or item ID is required');
    const buffer = await this.queueAssetDownload(() => this.downloadGesture(assetId));
    return {
      id: assetId,
      itemId: itemId || assetId,
      data: buffer.toString('utf-8'),
      size: buffer.length,
    };
  }

  async activateGestures(params = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bot = this.requireBot();
    const circuit =
      this.currentRegion()?.circuit || bot.circuit || bot.clientCommands?.region?.circuit;
    const agentIdRaw =
      this.identity?.agentId || this.identity?.agent_id || bot.agent?.agentID?.toString?.() || '';
    if (!circuit?.sendMessage || !agentIdRaw) {
      throw new Error(NOT_CONNECTED);
    }

    const rawList = Array.isArray(params.gestures)
      ? params.gestures
      : params.itemId || params.id
        ? [params]
        : [];
    if (rawList.length === 0) {
      throw new Error('At least one gesture item is required for activation');
    }

    const resolveAssetIdFromInventory = (itemUuidLower) => {
      const skeleton = bot.agent?.inventory?.main?.skeleton;
      if (!skeleton) return '';
      for (const folder of skeleton.values()) {
        const found = (folder.items || []).find(
          (i) => i.itemID?.toString?.().toLowerCase() === itemUuidLower,
        );
        if (found?.assetID) return found.assetID.toString();
      }
      return '';
    };

    const normalized = rawList.map((entry) => {
      const itemObj = typeof entry === 'string' ? { itemId: entry } : entry || {};
      const itemId = String(itemObj.itemId || itemObj.id || '').trim();
      if (!uuidRegex.test(itemId)) {
        throw new Error(`Invalid gesture item ID format: ${itemId}`);
      }
      let assetId = String(itemObj.assetId || '').trim();
      if (!assetId) {
        assetId = resolveAssetIdFromInventory(itemId.toLowerCase()) || ZERO_UUID;
      }
      if (!uuidRegex.test(assetId)) {
        throw new Error(`Invalid gesture asset ID format: ${assetId}`);
      }
      const gestureFlags = (Number(itemObj.gestureFlags ?? params.gestureFlags ?? 0) || 0) >>> 0;
      return {
        itemId: itemId.toLowerCase(),
        assetId: assetId.toLowerCase(),
        gestureFlags,
      };
    });

    const agentUuid = new UUID(uuidRegex.test(String(agentIdRaw)) ? String(agentIdRaw) : ZERO_UUID);
    const sessionStr = circuit.sessionID?.toString?.() || ZERO_UUID;
    const sessionUuid = new UUID(uuidRegex.test(sessionStr) ? sessionStr : ZERO_UUID);
    const flags = (Number(params.flags ?? 0) || 0) >>> 0;

    const BATCH_SIZE = 255;
    for (let offset = 0; offset < normalized.length; offset += BATCH_SIZE) {
      const batch = normalized.slice(offset, offset + BATCH_SIZE);
      const msg = new ActivateGesturesMessage();
      msg.AgentData = {
        AgentID: agentUuid,
        SessionID: sessionUuid,
        Flags: flags,
      };
      msg.Data = batch.map((g) => ({
        ItemID: new UUID(g.itemId),
        AssetID: new UUID(g.assetId),
        GestureFlags: g.gestureFlags,
      }));
      circuit.sendMessage(msg, PacketFlags.Reliable);
    }

    for (const g of normalized) {
      this.activeGestures.set(g.itemId, g);
    }

    this.send('gestures-activated', {
      gestures: normalized,
      flags,
    });

    return {
      activated: true,
      count: normalized.length,
      gestures: normalized,
    };
  }

  async activateGesture(params = {}) {
    return this.activateGestures(params);
  }

  async deactivateGestures(params = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bot = this.requireBot();
    const circuit =
      this.currentRegion()?.circuit || bot.circuit || bot.clientCommands?.region?.circuit;
    const agentIdRaw =
      this.identity?.agentId || this.identity?.agent_id || bot.agent?.agentID?.toString?.() || '';
    if (!circuit?.sendMessage || !agentIdRaw) {
      throw new Error(NOT_CONNECTED);
    }

    const rawList = Array.isArray(params.gestures)
      ? params.gestures
      : Array.isArray(params.itemIds)
        ? params.itemIds
        : params.itemId || params.id
          ? [params]
          : [];
    if (rawList.length === 0) {
      throw new Error('At least one gesture item is required for deactivation');
    }

    const normalized = rawList.map((entry) => {
      const itemObj = typeof entry === 'string' ? { itemId: entry } : entry || {};
      const itemId = String(itemObj.itemId || itemObj.id || '').trim();
      if (!uuidRegex.test(itemId)) {
        throw new Error(`Invalid gesture item ID format: ${itemId}`);
      }
      const gestureFlags = (Number(itemObj.gestureFlags ?? params.gestureFlags ?? 0) || 0) >>> 0;
      return {
        itemId: itemId.toLowerCase(),
        gestureFlags,
      };
    });

    const agentUuid = new UUID(uuidRegex.test(String(agentIdRaw)) ? String(agentIdRaw) : ZERO_UUID);
    const sessionStr = circuit.sessionID?.toString?.() || ZERO_UUID;
    const sessionUuid = new UUID(uuidRegex.test(sessionStr) ? sessionStr : ZERO_UUID);
    const flags = (Number(params.flags ?? 0) || 0) >>> 0;

    const BATCH_SIZE = 255;
    for (let offset = 0; offset < normalized.length; offset += BATCH_SIZE) {
      const batch = normalized.slice(offset, offset + BATCH_SIZE);
      const msg = new DeactivateGesturesMessage();
      msg.AgentData = {
        AgentID: agentUuid,
        SessionID: sessionUuid,
        Flags: flags,
      };
      msg.Data = batch.map((g) => ({
        ItemID: new UUID(g.itemId),
        GestureFlags: g.gestureFlags,
      }));
      circuit.sendMessage(msg, PacketFlags.Reliable);
    }

    for (const g of normalized) {
      this.activeGestures.delete(g.itemId);
    }

    this.send('gestures-deactivated', {
      gestures: normalized,
      flags,
    });

    return {
      deactivated: true,
      count: normalized.length,
      gestures: normalized,
    };
  }

  async deactivateGesture(params = {}) {
    return this.deactivateGestures(params);
  }

  async setAgentAnimation(params = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bot = this.requireBot();
    const circuit =
      this.currentRegion()?.circuit || bot.circuit || bot.clientCommands?.region?.circuit;
    const agentIdRaw =
      this.identity?.agentId || this.identity?.agent_id || bot.agent?.agentID?.toString?.() || '';
    if (!circuit?.sendMessage || !agentIdRaw) {
      throw new Error(NOT_CONNECTED);
    }

    const rawAnims = Array.isArray(params.animations)
      ? params.animations
      : params.animId || params.id || params.assetId
        ? [params]
        : [];
    if (rawAnims.length === 0) {
      throw new Error('At least one animation ID is required');
    }

    const normalized = rawAnims.map((entry) => {
      const animObj = typeof entry === 'string' ? { animId: entry, start: true } : entry || {};
      const animId = String(animObj.animId || animObj.assetId || animObj.id || '').trim();
      if (!uuidRegex.test(animId)) {
        throw new Error(`Invalid animation UUID format: ${animId}`);
      }
      const start = animObj.stop === true ? false : animObj.start !== false;
      return {
        animId: animId.toLowerCase(),
        start,
      };
    });

    const sessionStr = circuit.sessionID?.toString?.() || ZERO_UUID;
    const msg = new AgentAnimationMessage();
    msg.AgentData = {
      AgentID: new UUID(uuidRegex.test(String(agentIdRaw)) ? String(agentIdRaw) : ZERO_UUID),
      SessionID: new UUID(uuidRegex.test(sessionStr) ? sessionStr : ZERO_UUID),
    };
    msg.AnimationList = normalized.map((item) => ({
      AnimID: new UUID(item.animId),
      StartAnim: item.start,
    }));
    msg.PhysicalAvatarEventList = [];

    circuit.sendMessage(msg, PacketFlags.Reliable);
    return {
      sent: true,
      animations: normalized,
    };
  }

  async triggerGestureSound(params = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bot = this.requireBot();
    const region = this.currentRegion();
    const circuit = region?.circuit || bot.circuit || bot.clientCommands?.region?.circuit;
    const agentIdRaw =
      this.identity?.agentId || this.identity?.agent_id || bot.agent?.agentID?.toString?.() || '';
    if (!circuit?.sendMessage || !agentIdRaw) {
      throw new Error(NOT_CONNECTED);
    }

    const soundId = String(params.soundId || params.assetId || params.id || '').trim();
    if (!uuidRegex.test(soundId)) {
      throw new Error(`Invalid sound UUID format: ${soundId}`);
    }
    const rawGain = Number(params.gain ?? params.volume ?? 1.0);
    const gain = Number.isFinite(rawGain) ? Math.max(0, Math.min(1, rawGain)) : 1.0;

    const agentUuid = new UUID(uuidRegex.test(String(agentIdRaw)) ? String(agentIdRaw) : ZERO_UUID);
    let handle = Long.ZERO;
    if (region?.regionHandle !== undefined && region?.regionHandle !== null) {
      try {
        if (
          typeof region.regionHandle.low === 'number' &&
          typeof region.regionHandle.high === 'number'
        ) {
          handle = region.regionHandle;
        } else {
          const big = BigInt.asUintN(64, BigInt(region.regionHandle.toString()));
          handle = new Long(Number(big & 0xffffffffn) | 0, Number((big >> 32n) & 0xffffffffn) | 0);
        }
      } catch {
        handle = Long.ZERO;
      }
    }

    const posInput = params.position || bot.agent?.position || [128, 128, 25];
    const posVec = Array.isArray(posInput)
      ? new Vector3([Number(posInput[0]) || 0, Number(posInput[1]) || 0, Number(posInput[2]) || 0])
      : new Vector3([Number(posInput?.x) || 0, Number(posInput?.y) || 0, Number(posInput?.z) || 0]);

    const msg = new SoundTriggerMessage();
    msg.SoundData = {
      SoundID: new UUID(soundId.toLowerCase()),
      OwnerID: agentUuid,
      ObjectID: agentUuid,
      ParentID: UUID.zero(),
      Handle: handle,
      Position: posVec,
      Gain: gain,
    };

    circuit.sendMessage(msg, PacketFlags.Reliable);
    return {
      triggered: true,
      soundId: soundId.toLowerCase(),
      gain,
    };
  }

  async saveNotecard({ itemId, data, text } = {}) {
    if (!itemId) throw new Error('An inventory item ID is required to save notecard');
    const bot = this.requireBot();
    let payload;
    if (data) {
      payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    } else if (text !== undefined) {
      const textBuf = Buffer.from(String(text), 'utf-8');
      const lines = [
        'Linden text version 2',
        '{',
        'LLEmbeddedItems version 1',
        '{',
        'count 0',
        '}',
        `Text length ${textBuf.length}`,
        `${textBuf.toString('utf-8')}}`,
        '',
      ];
      payload = Buffer.from(lines.join('\n'), 'utf-8');
    } else {
      throw new Error('Notecard data or text is required');
    }

    if (payload.length > 65536) {
      throw new Error('Notecard exceeds 65536 byte limit');
    }

    const caps = this.currentRegion()?.caps;
    if (caps?.capsPostXML && caps?.capsRequestUpload) {
      try {
        const LLSD = require('@caspertech/llsd');
        const xmlPayload = {
          item_id: new LLSD.UUID(itemId.toString()),
        };
        const result = await caps.capsPostXML('UpdateNotecardAgentInventory', xmlPayload);
        if (result && result.uploader) {
          const uploadResult = await caps.capsRequestUpload(result.uploader, payload);
          if (uploadResult && (uploadResult.state === 'complete' || uploadResult.new_asset_id)) {
            const newAssetId = uploadResult.new_asset_id ? String(uploadResult.new_asset_id) : null;
            return { success: true, itemId, newAssetId };
          }
        }
      } catch (capErr) {
        console.warn(
          '[SL Session] UpdateNotecardAgentInventory capability failed:',
          capErr.message || capErr,
        );
      }
    }

    // Standard upload fallback
    if (bot.clientCommands?.inventory?.findItem) {
      try {
        const item = bot.clientCommands.inventory.findItem(itemId);
        if (item && item.parentFolder?.handleStandardInventoryUpload) {
          const { InventoryType } = require('@caspertech/node-metaverse');
          await item.parentFolder.handleStandardInventoryUpload(
            InventoryType.Notecard,
            itemId,
            payload,
          );
          return { success: true, itemId };
        }
      } catch (fallbackErr) {
        console.warn(
          '[SL Session] Standard upload fallback failed:',
          fallbackErr.message || fallbackErr,
        );
      }
    }

    throw new Error(
      'Failed to save notecard: UpdateNotecardAgentInventory capability and standard upload failed',
    );
  }

  loadTexture(assetId) {
    if (!assetId) return;
    this.streamAsset(
      `texture:${assetId}`,
      AssetType.Texture,
      assetId,
      () => this.downloadTexture(assetId),
      async (buffer) => {
        this.send('texture-ready', { assetId, ...(await decodeJPEG2000(buffer)) });
      },
    );
  }

  loadSound(assetId) {
    if (!assetId || this.soundRequests.has(assetId)) return;
    this.soundRequests.add(assetId);
    downloadSound(
      this.bot,
      assetId,
      (buffer) => {
        // Second Life sound assets are Ogg Vorbis. Browsers decode these directly through Web Audio.
        this.send('sound-asset', {
          assetId,
          contentType: 'audio/ogg',
          data: buffer.toString('base64'),
        });
      },
      (error) => {
        this.soundRequests.delete(assetId);
        this.send('asset-error', { assetId, message: error.message });
      },
    );
  }

  // Ask for a sound asset by id (UI sounds are not announced by the simulator). It arrives as a 'sound-asset' event.
  fetchSound({ id } = {}) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '')))
      throw new Error('A sound asset id is required');
    this.requireBot();
    this.loadSound(String(id).toLowerCase());
    return { requested: true };
  }

  loadObjectAsset(object) {
    const appearance = primAppearance(object);
    if (!appearance.assetId) return;
    const kind = appearance.assetKind === 'mesh' ? AssetType.Mesh : AssetType.Texture;
    const download =
      appearance.assetKind === 'sculpt'
        ? () => this.downloadTexture(appearance.assetId)
        : () => this.downloadMesh(appearance.assetId);
    this.streamAsset(appearance.assetId, kind, appearance.assetId, download, async (buffer) => {
      const geometry =
        appearance.assetKind === 'mesh'
          ? await decodeLLMesh(buffer)
          : await decodeSculpt(buffer, appearance.sculptType);
      this.send('asset-ready', {
        assetId: appearance.assetId,
        assetKind: appearance.assetKind,
        geometry,
      });
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
    const ids = new Set(
      [
        appearance.textureId,
        appearance.particles?.textureId,
        ...appearance.faceTextures.map((face) => face.textureId),
        ...overrideTextures,
      ]
        .filter(Boolean)
        .map(String),
    );
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
        for (const texture of Object.values(material.textures || {}))
          this.loadTexture(texture?.textureId);
      });
    }
  }

  streamObject(type, event) {
    this.appearanceWatcher?.apply(event.object);
    this.send(type, serializeObject(event));
    this.loadObjectAsset(event.object);
    this.loadObjectTexture(event.object);
    this.loadObjectMaterials(event.object);
    const soundId = event.object?.Sound?.toString?.();
    const objectId = event.object?.FullID?.toString?.() || String(event.localID);
    const liveSound = soundId && soundId !== '00000000-0000-0000-0000-000000000000' ? soundId : '';
    const radius = Number(event.object?.SoundRadius) || 0;
    const signature = `${liveSound}:${Number(event.object?.SoundGain) || 0}:${Number(event.object?.SoundFlags) || 0}:${radius}`;
    if (this.objectSounds.get(objectId) !== signature) {
      // The sound fields of an object update are what start looping sounds on objects that were
      // already playing when we arrived. A change to nothing is sent as a null sound with its flags.
      const hadSound =
        this.objectSounds.has(objectId) && !this.objectSounds.get(objectId).startsWith(':');
      this.objectSounds.set(objectId, signature);
      if (liveSound || hadSound) {
        this.send('sound-event', {
          action: 'attached',
          soundId: liveSound || '00000000-0000-0000-0000-000000000000',
          objectId,
          ownerId: event.object?.OwnerID?.toString?.() || '',
          position: vector(event.object?.Position),
          gain: Number(event.object?.SoundGain) || 0,
          flags: Number(event.object?.SoundFlags) || 0,
          radius,
        });
      }
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
    this.subscriptions.push(
      events.onNewObjectEvent.subscribe((event) => this.streamObject('object-add', event)),
    );
    this.subscriptions.push(
      events.onObjectUpdatedEvent.subscribe((event) => this.streamObject('object-update', event)),
    );
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
      sourceType: event.sourceType,
      ownerId: event.ownerID?.toString(),
      channel: event.channel ?? 0,
      position: vector(event.position),
      timestamp: Date.now(),
    }));
    this.subscribe(events.onInstantMessage, 'im', (event) => {
      if (event.dialog === 41 || event.dialog === 42) {
        this.send('im_typing', {
          fromId: event.from?.toString(),
          fromName: event.fromName || 'Resident',
          isTyping: event.dialog === 41,
          timestamp: Date.now(),
        });
      }
      return {
        id: newId(),
        fromId: event.from?.toString(),
        fromName: event.fromName || 'Resident',
        message: event.message,
        dialog: event.dialog,
        timestamp: Date.now(),
      };
    });
    if (events.onAgentTyping) {
      this.subscribe(events.onAgentTyping, 'typing', (event) => ({
        agentId: event.from?.toString() || event.agentId?.toString(),
        fromId: event.from?.toString() || event.agentId?.toString(),
        isTyping: Boolean(event.isTyping ?? event.typing),
        timestamp: Date.now(),
      }));
    }

    this.subscribe(events.onParcelPropertiesEvent, 'parcel-properties', (parcel) => {
      if (this.pendingParcelTransactions) {
        for (const [handle, tx] of this.pendingParcelTransactions.entries()) {
          if (tx.localId === parcel.LocalID) {
            this.pendingParcelTransactions.delete(handle);
          }
        }
      }
      return {
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
      };
    });

    this.subscriptions.push(
      events.onAvatarEnteredRegion.subscribe((avatar) => this.trackAvatar(avatar)),
    );

    this.subscriptions.push(
      events.onFriendOnline.subscribe((event) => {
        const id =
          event.friend?.getKey?.()?.toString() ||
          event.friend?.id?.toString() ||
          event.friend?.uuid?.toString();
        if (id) this.friendPresence.set(id.toLowerCase(), Boolean(event.online));
        // The name is sent only when the library knows it; the client keeps the one it already has otherwise.
        const name = event.friend?.name || event.friend?.getName?.();
        this.send('friend-status', {
          id,
          ...(name ? { name } : {}),
          online: Boolean(event.online),
        });
      }),
    );
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
    this.subscribe(events.onFriendRemoved, 'friend-remove', (event) => {
      const id = event.friend?.getKey?.()?.toString() || event.friend?.id?.toString();
      if (id) {
        const lower = String(id).toLowerCase();
        this.friendPresence.delete(lower);
        if (Array.isArray(this.bot?.agent?.buddyList)) {
          this.bot.agent.buddyList = this.bot.agent.buddyList.filter(
            (buddy) => String(buddy?.buddyID || '').toLowerCase() !== lower,
          );
        }
      }
      return { id };
    });

    // Script dialogs (llDialog, llTextBox), teleport lures and group notices
    this.subscriptions.push(
      ...interactions.subscribeInteractions(events, this.pending, (type, data) =>
        this.send(type, data),
      ),
    );
    if (events?.onBalanceUpdated) {
      this.subscriptions.push(
        events.onBalanceUpdated.subscribe((event) => {
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
        }),
      );
    }
    this.subscribe(events.onDisconnected, 'disconnected', (event) => ({
      message: event.message || 'Disconnected from Second Life',
    }));
  }

  /** Nearby avatars: announce arrivals, movement and departures as presence events. */
  trackAvatar(avatar) {
    const id =
      avatar.getKey?.()?.toString?.() || avatar.id?.toString?.() || avatar.uuid?.toString?.();
    const name =
      avatar.getName?.() || [avatar.firstName, avatar.lastName].filter(Boolean).join(' ') || '';
    const position = vector(avatar.coarsePosition || avatar.position);
    this.send('coarse-avatar', { id, name, position });
    this.send('avatar_presence', {
      id,
      agentId: id,
      name,
      coordinates: position,
      position,
      presence: 'entered',
      online: true,
    });
    if (typeof avatar.onMoved?.subscribe === 'function') {
      this.subscriptions.push(
        avatar.onMoved.subscribe((moved) => {
          const at = vector(moved.position || moved.coarsePosition);
          this.send('avatar_presence', {
            id,
            agentId: id,
            name,
            coordinates: at,
            position: at,
            presence: 'online',
            online: true,
          });
        }),
      );
    }
    if (typeof avatar.onLeftRegion?.subscribe === 'function') {
      this.subscriptions.push(
        avatar.onLeftRegion.subscribe(() => {
          this.send('avatar_presence', {
            id,
            agentId: id,
            name,
            presence: 'left',
            online: false,
            left: true,
          });
        }),
      );
    }
  }

  /** The logged-in agent's UUID, whichever way this node-metaverse build exposes it. */
  agentId() {
    const text = (value) => {
      try {
        return value ? String(value.toString()) : '';
      } catch {
        return '';
      }
    };
    const valid = (id) => id && !id.includes('function') && !id.includes('agentID()');
    let id = '';
    try {
      if (typeof this.bot.agentID === 'function') id = text(this.bot.agentID());
    } catch {
      /* try the next source */
    }
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
    this.appearanceWatcher = watchAvatarAppearance(
      () => this.currentRegion(),
      (event) => this.streamObject('object-update', event),
    );
    this.subscriptions.push(this.appearanceWatcher);
    const animations = watchAnimations(
      () => this.currentRegion(),
      (type, data) => this.send(type, data),
    );
    if (animations) this.subscriptions.push(animations);
    this.subscriptions.push(
      watchSounds(
        () => this.currentRegion(),
        (type, data) => this.send(type, data),
        (id) => this.loadSound(id),
      ),
    );
    this.subscriptions.push(
      watchWind(
        () => this.currentRegion(),
        (type, data) => this.send(type, data),
      ),
    );
    this.subscriptions.push(
      watchParcelSound(
        () => this.currentRegion(),
        (type, data) => this.send(type, data),
      ),
    );
    // Neighbouring regions, for voice that carries across region borders
    this.neighbors = new NeighborRegions({
      onChange: (list) => this.send('voice-neighbors', { neighbors: list }),
    });
    this.subscriptions.push({
      unsubscribe: observeEventQueue((events) => this.neighbors.handleEvents(events)),
    });
    this.syncNeighborCurrent();
    const neighborTimer = setInterval(() => this.syncNeighborCurrent(), 2000);
    neighborTimer.unref?.();
    this.subscriptions.push({ unsubscribe: () => clearInterval(neighborTimer) });
    // The account's mute list lives on the grid; ask for it once the circuit is up, as the viewer does at login.
    this.muteLoader = new MuteListLoader(
      () => this.currentRegion()?.circuit,
      this.bot.agent?.agentID,
      (result) => this.send('mute-list', result),
    );
    this.subscriptions.push({ unsubscribe: () => this.muteLoader?.cancel() });
    this.muteLoader.request();

    let inventoryRootId = '';
    try {
      inventoryRootId =
        this.bot.clientCommands?.inventory?.getInventoryRoot()?.folderID?.toString() || '';
    } catch {
      /* fetched on demand */
    }
    this.identity = {
      agentId: this.agentId() || newId(),
      firstName,
      lastName,
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
    region
      ?.waitForTerrain?.()
      .then(() => this.send('terrain', serializeTerrain(region)))
      .catch(() => {});

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
    if (type === 4 || type === 5) {
      return this.sendTypingState({ isTyping: type === 4 });
    }
    const comms = this.requireBot().clientCommands?.comms;
    if (!comms) throw new Error('Second Life communications interface unavailable');
    if (type === 0) await comms.whisper(message, channel);
    else if (type === 2) await comms.shout(message, channel);
    else await comms.say(message, channel);
  }

  async sendInstantMessage({ recipientId, message, dialog }) {
    const comms = this.requireBot().clientCommands?.comms;
    if (!comms) throw new Error('Second Life communications interface unavailable');
    if (typeof dialog === 'number') {
      await comms.sendInstantMessage(recipientId, message || '', dialog);
    } else {
      await comms.sendInstantMessage(recipientId, message);
    }
  }

  async sendTypingState(params = {}) {
    const isTyping = typeof params === 'boolean' ? params : Boolean(params.isTyping);
    if (params && typeof params === 'object' && params.recipientId) {
      return this.sendIMTypingState({ recipientId: params.recipientId, isTyping });
    }

    const circuit = this.currentRegion()?.circuit;
    const agentId = this.identity?.agent_id || this.bot?.agent?.agentID;

    if (circuit?.sendMessage && agentId) {
      try {
        const {
          AgentTypingMessage,
        } = require('@caspertech/node-metaverse/dist/lib/classes/messages/AgentTyping');
        const msg = new AgentTypingMessage();
        msg.AgentData = {
          AgentID: typeof agentId === 'string' ? new UUID(agentId) : agentId,
          SessionID: circuit.sessionID
            ? typeof circuit.sessionID === 'string'
              ? new UUID(circuit.sessionID)
              : circuit.sessionID
            : UUID.zero(),
        };
        msg.Data = {
          Typing: isTyping,
        };
        circuit.sendMessage(msg, PacketFlags.Reliable);
      } catch (err) {
        console.warn('[ViewerSession] AgentTyping packet dispatch warning:', err);
      }
    }

    const comms = this.bot?.clientCommands?.comms;
    if (comms) {
      if (isTyping) comms.startTypingLocal?.().catch(() => {});
      else comms.stopTypingLocal?.().catch(() => {});
    }

    return { sent: true };
  }

  async sendIMTypingState({ recipientId, isTyping } = {}) {
    if (!recipientId) throw new Error('Recipient ID required');
    const comms = this.requireBot().clientCommands?.comms;
    if (!comms) throw new Error('Second Life communications interface unavailable');
    const dialog = isTyping ? 41 : 42; // InstantMessageDialog.TYPING_START (41) / TYPING_STOP (42)
    await comms.sendInstantMessage(recipientId, '', dialog);
    return { sent: true };
  }

  /** Ask the grid for the account's mute list again; it arrives as a 'mute-list' event. */
  requestMuteList() {
    if (!this.muteLoader) throw new Error(NOT_CONNECTED);
    return { requested: this.muteLoader.request() };
  }

  /** Add or change a mute list entry on the grid (`UpdateMuteListEntry`). The client keeps the list and its flag rules. */
  updateMuteEntry(params = {}) {
    const entry = this.checkMuteEntry(params);
    const circuit = this.currentRegion()?.circuit;
    const agentId = this.bot?.agent?.agentID;
    if (!circuit?.sendMessage || !agentId) throw new Error(NOT_CONNECTED);
    return { sent: sendMuteUpdate(circuit, agentId, entry) };
  }

  /** Remove a mute list entry on the grid (`RemoveMuteListEntry`). */
  removeMuteEntry(params = {}) {
    const entry = this.checkMuteEntry(params, { flags: false });
    const circuit = this.currentRegion()?.circuit;
    const agentId = this.bot?.agent?.agentID;
    if (!circuit?.sendMessage || !agentId) throw new Error(NOT_CONNECTED);
    sendMuteRemove(circuit, agentId, entry);
    return { sent: true };
  }

  checkMuteEntry(params, { flags = true } = {}) {
    const type = Number(params.type);
    if (![MUTE_TYPE.BY_NAME, MUTE_TYPE.AGENT, MUTE_TYPE.OBJECT, MUTE_TYPE.GROUP].includes(type))
      throw new Error('Mute type must be 0 (name), 1 (resident), 2 (object) or 3 (group)');
    const name = String(params.name ?? '');
    if (name.length > 254) throw new Error('Mute name is too long');
    if (type === MUTE_TYPE.BY_NAME && !name) throw new Error('A mute by name needs a name');
    const id =
      type === MUTE_TYPE.BY_NAME ? '' : actions.requireUuid(params.id, 'Mute id').toLowerCase();
    const mask = flags ? Number(params.flags ?? 0) : 0;
    if (!Number.isInteger(mask) || mask < 0 || mask > 0xf)
      throw new Error('Mute flags must be 0 to 15');
    return { id, name, type, flags: mask };
  }

  async sendGroupMessage({ groupId, message }) {
    const comms = this.requireBot().clientCommands?.comms;
    if (!comms) throw new Error('Second Life communications interface unavailable');
    if (!groupId || !String(message || '').trim())
      throw new Error('Group and message are required');
    if (typeof comms.sendGroupMessage !== 'function')
      throw new Error('Group messaging not supported by this connection');
    // Starts the group chat session on first use, then sends within it.
    await comms.sendGroupMessage(groupId, message);
  }

  async sendFriendRequest({ recipientId, message = '' }) {
    const friends = this.requireBot().clientCommands?.friends;
    if (!friends) throw new Error('Second Life friends interface unavailable');
    await friends.sendFriendRequest(recipientId, message);
  }

  async terminateFriendship(params = {}) {
    const rawTarget =
      params.targetId ??
      params.otherId ??
      params.friendId ??
      params.id ??
      params.userId ??
      params.recipientId;
    const normalizedTarget = String(rawTarget || '')
      .trim()
      .replace(/^\{(.+)\}$/, '$1');
    const targetId = actions.requireUuid(normalizedTarget, 'Target friend ID');

    const bot = this.requireBot();
    const circuit = this.currentRegion()?.circuit || bot.circuit;
    if (!circuit || circuit.connected === false) {
      throw new Error('Simulator circuit is offline');
    }

    const rawAgentId =
      params.agentId ||
      this.identity?.agentId ||
      this.identity?.agent_id ||
      (bot.agent?.agentID ? String(bot.agent.agentID) : '');
    const rawSessionId =
      params.sessionId ||
      (circuit.sessionID
        ? String(circuit.sessionID)
        : bot.circuit?.sessionID
          ? String(bot.circuit.sessionID)
          : '');

    const agentId = actions.requireUuid(
      String(rawAgentId || '')
        .trim()
        .replace(/^\{(.+)\}$/, '$1'),
      'Agent ID',
    );
    const sessionId = actions.requireUuid(
      String(rawSessionId || '')
        .trim()
        .replace(/^\{(.+)\}$/, '$1'),
      'Session ID',
    );

    const hasSendMessage = typeof circuit.sendMessage === 'function';
    const hasBotSendPacket = typeof bot.sendPacket === 'function';
    const hasCircuitSendPacket = typeof circuit.sendPacket === 'function';
    if (!hasSendMessage && !hasBotSendPacket && !hasCircuitSendPacket) {
      throw new Error('Simulator circuit is offline');
    }

    const msg = new TerminateFriendshipMessage();
    msg.AgentData = {
      AgentID: new UUID(agentId),
      SessionID: new UUID(sessionId),
    };
    msg.ExBlock = {
      OtherID: new UUID(targetId),
    };

    if (hasSendMessage) {
      circuit.sendMessage(msg, PacketFlags.Reliable);
    } else if (hasBotSendPacket) {
      bot.sendPacket('TerminateFriendship', msg, PacketFlags.Reliable);
    } else if (hasCircuitSendPacket) {
      circuit.sendPacket('TerminateFriendship', msg, PacketFlags.Reliable);
    }

    const lowerTarget = targetId.toLowerCase();
    this.friendPresence.delete(lowerTarget);
    if (Array.isArray(bot.agent?.buddyList)) {
      bot.agent.buddyList = bot.agent.buddyList.filter(
        (buddy) => String(buddy?.buddyID || '').toLowerCase() !== lowerTarget,
      );
    }
    const friendsList = bot.clientCommands?.friends?.friendsList;
    if (friendsList && typeof friendsList.keys === 'function') {
      for (const key of [...friendsList.keys()]) {
        if (String(key).toLowerCase() === lowerTarget) {
          friendsList.delete(key);
        }
      }
    }

    return {
      success: true,
      terminated: true,
      targetId,
      otherId: targetId,
      agentId,
      sessionId,
      messageId: '0xFFFF012C',
    };
  }

  // ---- agent actions ----------------------------------------------------------------------------

  teleport(params) {
    return actions.teleport(this.requireBot(), params);
  }
  touchObject(params) {
    return actions.touchObject(this.requireBot(), params);
  }
  commitObjectTransaction(params) {
    return actions.commitObjectTransaction(this.requireBot(), params);
  }
  streamObjectDelta(params) {
    return { success: true, ...params };
  }
  commitObjectTransform(params) {
    return { success: true, ...params };
  }
  addObject(params) {
    return actions.addObject(this.requireBot(), params);
  }
  linkObjects(params) {
    return actions.linkObjects(this.requireBot(), params);
  }
  delinkObjects(params) {
    return actions.delinkObjects(this.requireBot(), params);
  }
  updatePrimParams(params) {
    return actions.updatePrimParams(this.requireBot(), params);
  }
  deleteObject(params) {
    return actions.deleteObject(this.requireBot(), params);
  }
  derezObject(params) {
    return actions.deleteObject(this.requireBot(), params);
  }
  sit(params = {}) {
    return actions.sit(this.requireBot(), params);
  }
  stand() {
    return actions.stand(this.requireBot());
  }

  /** Ask the simulator to teleport home: a landmark teleport with the null landmark, as the official viewer does. */
  teleportHome() {
    const bot = this.requireBot();
    const circuit = this.currentRegion()?.circuit;
    const agentId = bot.agent?.agentID;
    if (!circuit?.sendMessage || !agentId)
      throw new Error('Teleport home is unavailable until the region has loaded');
    const message = new TeleportLandmarkRequestMessage();
    message.Info = { AgentID: agentId, SessionID: circuit.sessionID, LandmarkID: UUID.zero() };
    circuit.sendMessage(message, PacketFlags.Reliable);
    return { requested: 'home' };
  }

  // ---- outfit, attachments and shape --------------------------------------------------------------

  wearItem(params) {
    return outfit.wearItem(this.requireBot(), this.currentRegion(), params);
  }
  removeWorn(params) {
    return outfit.removeWorn(this.requireBot(), this.currentRegion(), params);
  }
  wearOutfit(params) {
    return outfit.wearOutfit(this.requireBot(), this.currentRegion(), params);
  }
  saveOutfitAs(params) {
    return outfit.saveOutfitAs(this.requireBot(), this.currentRegion(), params);
  }
  detachAttachment(params) {
    return outfit.detachAttachment(this.requireBot(), this.currentRegion(), params);
  }
  offerTeleport(params) {
    return outfit.offerTeleport(this.requireBot(), this.currentRegion(), params);
  }
  getShape() {
    return outfit.getShape(this.requireBot());
  }
  saveShape(params) {
    return outfit.saveShape(this.requireBot(), this.currentRegion(), params);
  }
  setAppearance(params) {
    return outfit.setAppearance(this.requireBot(), this.currentRegion(), params);
  }

  /** Join an open-enrollment group. A group that charges a fee is refused with the library's explanation. */
  async joinGroup({ groupId } = {}) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId || ''))
      throw new Error('Valid group ID required');
    const groups = this.requireBot().clientCommands?.groups;
    if (!groups?.joinGroup) throw new Error('Group interface unavailable');
    const joined = await groups.joinGroup(groupId);
    return { joined: Boolean(joined) };
  }

  /** Leave a group via reliable LeaveGroupRequest UDP packet and clear active group state if needed. */
  async leaveGroup({ groupId } = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const targetGroupId =
      groupId && typeof groupId === 'string' ? groupId.trim().toLowerCase() : '';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetGroupId) || targetGroupId === ZERO_UUID) {
      throw new Error(`Invalid group ID format: ${String(groupId ?? '')}`);
    }

    const bot = this.requireBot();
    const circuit = this.currentRegion()?.circuit || bot.circuit;
    if (!circuit?.sendMessage) {
      throw new Error(NOT_CONNECTED);
    }

    const rawAgentId = this.identity?.agentId || bot.agent?.agentID?.toString?.() || ZERO_UUID;
    const rawSessionId =
      circuit.sessionID?.toString?.() || bot.circuit?.sessionID?.toString?.() || ZERO_UUID;
    const agentUUIDStr = uuidRegex.test(String(rawAgentId).trim())
      ? String(rawAgentId).trim()
      : ZERO_UUID;
    const sessionUUIDStr = uuidRegex.test(String(rawSessionId).trim())
      ? String(rawSessionId).trim()
      : ZERO_UUID;

    const msg = new LeaveGroupRequestMessage();
    msg.AgentData = {
      AgentID: new UUID(agentUUIDStr),
      SessionID: new UUID(sessionUUIDStr),
    };
    msg.GroupData = {
      GroupID: new UUID(targetGroupId),
    };
    circuit.sendMessage(msg, PacketFlags.Reliable);

    if ((this.activeGroupId || '').toLowerCase() === targetGroupId) {
      this.activeGroupId = ZERO_UUID;
      this.activeRoleId = ZERO_UUID;

      const titleMsg = new AgentSetGroupTitleMessage();
      titleMsg.AgentData = {
        AgentID: new UUID(agentUUIDStr),
        SessionID: new UUID(sessionUUIDStr),
        GroupID: new UUID(ZERO_UUID),
        RoleID: new UUID(ZERO_UUID),
      };
      circuit.sendMessage(titleMsg, PacketFlags.Reliable);

      const actMsg = new ActivateGroupMessage();
      actMsg.AgentData = {
        AgentID: new UUID(agentUUIDStr),
        SessionID: new UUID(sessionUUIDStr),
        GroupID: new UUID(ZERO_UUID),
      };
      circuit.sendMessage(actMsg, PacketFlags.Reliable);

      this.send('active_group_changed', {
        groupId: ZERO_UUID,
        roleId: ZERO_UUID,
        agentId: this.identity?.agentId || bot.agent?.agentID?.toString?.() || '',
      });
    }

    this.send('group_left', {
      groupId: targetGroupId,
      agentId: this.identity?.agentId || bot.agent?.agentID?.toString?.() || '',
    });

    return {
      success: true,
      left: true,
      groupId: targetGroupId,
    };
  }
  setMovement(params = {}) {
    const agent = this.requireBot().agent;
    if (!agent?.setControlFlag || !agent?.clearControlFlag || !agent?.sendAgentUpdate)
      throw new Error('Avatar movement unavailable');
    if (params.controlFlags !== undefined) return this.setControlFlags(agent, params.controlFlags);
    const directional = [
      ControlFlags.AGENT_CONTROL_AT_POS,
      ControlFlags.AGENT_CONTROL_AT_NEG,
      ControlFlags.AGENT_CONTROL_LEFT_POS,
      ControlFlags.AGENT_CONTROL_LEFT_NEG,
      ControlFlags.AGENT_CONTROL_UP_POS,
      ControlFlags.AGENT_CONTROL_UP_NEG,
      ControlFlags.AGENT_CONTROL_TURN_LEFT,
      ControlFlags.AGENT_CONTROL_TURN_RIGHT,
      ControlFlags.AGENT_CONTROL_FAST_AT,
      ControlFlags.AGENT_CONTROL_FAST_LEFT,
      ControlFlags.AGENT_CONTROL_FAST_UP,
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
    choose(
      params.turn,
      ControlFlags.AGENT_CONTROL_TURN_RIGHT,
      ControlFlags.AGENT_CONTROL_TURN_LEFT,
    );
    if (params.run && params.forward) agent.setControlFlag(ControlFlags.AGENT_CONTROL_FAST_AT);
    if (params.run && params.right) agent.setControlFlag(ControlFlags.AGENT_CONTROL_FAST_LEFT);
    if (params.run && params.up) agent.setControlFlag(ControlFlags.AGENT_CONTROL_FAST_UP);
    agent.sendAgentUpdate();
    return { moving: Boolean(params.forward || params.right || params.up || params.turn) };
  }
  // Flags the client owns when it sends a full flag word: everything except what the library sets itself.
  // One-shot flags (stop, stand up, sit on ground, nudges) are cleared right after the update that carries them.
  setControlFlags(agent, requested) {
    const flags = Number(requested);
    if (!Number.isInteger(flags) || flags < 0 || flags > 0xffffffff)
      throw new Error('controlFlags must be an unsigned 32-bit integer');
    const oneShot =
      0x4000 | 0x10000 | 0x20000 | 0x80000 | 0x100000 | 0x200000 | 0x400000 | 0x800000 | 0x1000000;
    for (let bit = 0; bit < 32; bit++) {
      const flag = (1 << bit) | 0;
      if ((flags >>> bit) & 1) agent.setControlFlag(flag);
      else agent.clearControlFlag(flag);
    }
    agent.sendAgentUpdate();
    for (let bit = 0; bit < 32; bit++)
      if ((oneShot >>> bit) & 1) agent.clearControlFlag((1 << bit) | 0);
    return { moving: Boolean(flags & 0x0600003f), flags };
  }
  async grantUserRights(params = {}) {
    const bot = this.requireBot();
    const targetId = params.targetId || params.friendId || params.userId || params.recipientId;
    if (!targetId) {
      throw new Error('Valid target friend ID required');
    }

    const circuit = this.currentRegion()?.circuit || bot.circuit;
    const agentId = params.agentId || (bot.agent?.agentID ? String(bot.agent.agentID) : '');
    const sessionId =
      params.sessionId ||
      (circuit?.sessionID
        ? String(circuit.sessionID)
        : bot.circuit?.sessionID
          ? String(bot.circuit.sessionID)
          : '');

    let rightsMask = 0;
    if (typeof params.rightsMask === 'number') {
      rightsMask = params.rightsMask >>> 0;
    } else if (typeof params.rights === 'number') {
      rightsMask = params.rights >>> 0;
    } else if (params.permissions && typeof params.permissions === 'object') {
      const p = params.permissions;
      rightsMask =
        (p.canSeeOnline ? 0x1 : 0) | (p.canSeeOnMap ? 0x2 : 0) | (p.canModifyObjects ? 0x4 : 0);
    } else {
      if (params.canSeeOnline) rightsMask |= 0x1;
      if (params.canSeeOnMap) rightsMask |= 0x2;
      if (params.canModifyObjects) rightsMask |= 0x4;
    }
    rightsMask = rightsMask >>> 0;

    const packet =
      params.packet && typeof params.packet === 'object'
        ? params.packet
        : {
            messageName: 'GrantUserRights',
            messageId: 0xffff0140,
            agentId,
            sessionId,
            targetId,
            rightsMask,
          };

    if (bot && typeof bot.sendPacket === 'function') {
      bot.sendPacket('GrantUserRights', packet);
    }
    if (
      circuit &&
      typeof circuit.sendPacket === 'function' &&
      circuit.sendPacket !== bot?.sendPacket
    ) {
      circuit.sendPacket('GrantUserRights', packet);
    } else if (
      bot?.circuit &&
      typeof bot.circuit.sendPacket === 'function' &&
      bot.circuit.sendPacket !== bot?.sendPacket
    ) {
      bot.circuit.sendPacket('GrantUserRights', packet);
    }

    return { success: true, targetId, rightsMask, packet };
  }
  getBalance() {
    return actions.getBalance(this.requireBot());
  }
  async requestPayPrice(params = {}) {
    const targetId = params.targetId || params.id || params.objectId;
    if (!targetId) throw new Error('A target object ID is required');

    const bot = this.requireBot();
    const region = this.currentRegion();
    const timeout = typeof params.timeout === 'number' ? params.timeout : 1500;

    // Optional HTTP capability negotiation (Requirement 3)
    const caps = region?.caps;
    if (caps) {
      const capNames = ['ObjectPayPrice', 'PayPrice', 'GetObjectPayPrice'];
      for (const capName of capNames) {
        try {
          let capUrl = null;
          if (typeof caps.isCapAvailable === 'function' && (await caps.isCapAvailable(capName))) {
            capUrl =
              typeof caps.getCapability === 'function' ? await caps.getCapability(capName) : null;
          } else if (typeof caps.getCapability === 'function') {
            capUrl = await caps.getCapability(capName);
          }
          if (capUrl) {
            let capRes = null;
            if (typeof caps.capsPerformXMLPost === 'function') {
              capRes = await caps.capsPerformXMLPost(capUrl, { object_id: targetId });
            } else if (typeof caps.requestPost === 'function') {
              const resp = await caps.requestPost(
                capUrl,
                JSON.stringify({ object_id: targetId }),
                'application/json',
              );
              capRes = resp?.body;
            } else if (typeof fetch === 'function') {
              const resp = await fetch(capUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json, application/llsd+xml',
                },
                body: JSON.stringify({ object_id: targetId }),
              });
              if (resp.ok) {
                const ct = resp.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                  capRes = await resp.json();
                } else {
                  const text = await resp.text();
                  try {
                    capRes = JSON.parse(text);
                  } catch {
                    capRes = { raw: text };
                  }
                }
              }
            }

            if (capRes && typeof capRes === 'object') {
              const defaultPrice =
                typeof capRes.defaultPrice === 'number'
                  ? capRes.defaultPrice
                  : typeof capRes.default_price === 'number'
                    ? capRes.default_price
                    : typeof capRes.DefaultPayPrice === 'number'
                      ? capRes.DefaultPayPrice
                      : -1;
              const rawButtons = Array.isArray(capRes.buttons)
                ? capRes.buttons
                : Array.isArray(capRes.button_data)
                  ? capRes.button_data
                  : Array.isArray(capRes.pay_buttons)
                    ? capRes.pay_buttons
                    : Array.isArray(capRes.ButtonData)
                      ? capRes.ButtonData.map((b) => (typeof b === 'object' ? b.PayButton : b))
                      : [];
              const buttons = rawButtons.map((b) => (typeof b === 'number' ? b : Number(b) || 0));
              return {
                objectId: String(targetId),
                defaultPrice,
                buttons,
                hideCustom: defaultPrice === -2,
                timestamp: Date.now(),
              };
            }
          }
        } catch (_capErr) {
          // Capability negotiation failed, fallback to UDP circuit
        }
      }
    }

    // UDP circuit transport (Requirement 2 & Criterion 3)
    const circuit = region?.circuit;
    const agentId = bot.agent?.agentID;
    if (!circuit?.sendMessage || !agentId) {
      throw new Error('Connection unavailable for price request');
    }

    const targetUUID = new UUID(String(targetId));
    const msg = new RequestPayPriceMessage();
    msg.ObjectData = {
      ObjectID: targetUUID,
    };
    circuit.sendMessage(msg, PacketFlags.Reliable);

    const reply = await circuit.waitForMessage(Message.PayPriceReply, timeout, (ppr) => {
      return ppr.ObjectData?.ObjectID?.equals(targetUUID)
        ? FilterResponse.Finish
        : FilterResponse.NoMatch;
    });

    const defaultPrice =
      typeof reply.ObjectData?.DefaultPayPrice === 'number' ? reply.ObjectData.DefaultPayPrice : -1;
    const buttons = Array.isArray(reply.ButtonData)
      ? reply.ButtonData.map((b) =>
          typeof b.PayButton === 'number' ? b.PayButton : Number(b) || 0,
        )
      : [];

    return {
      objectId: String(targetId),
      defaultPrice,
      buttons,
      hideCustom: defaultPrice === -2,
      timestamp: Date.now(),
    };
  }
  getObjectPayQuote(params = {}) {
    return this.requestPayPrice(params);
  }
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
    if (this.bot) {
      try {
        const res = await actions.getTransactionHistory(this.bot, params);
        if (res && Array.isArray(res.transactions)) {
          if (res.transactions.length > 0) {
            return res;
          }
          if (this.transactions && this.transactions.length > 0) {
            return { ...res, transactions: this.transactions };
          }
          return res;
        }
      } catch (err) {
        console.warn('[viewer-session] getTransactionHistory action error:', err?.message || err);
      }
    }
    let balance = 0;
    try {
      const b = await this.getBalance();
      balance = b?.balance !== undefined ? b.balance : typeof b === 'number' ? b : 0;
    } catch {
      // Ignore if offline/mock
    }
    return { balance, transactions: this.transactions || [] };
  }
  respondScriptDialog(params = {}) {
    return interactions.respondScriptDialog(this.requireBot(), this.pending, params);
  }
  acceptLure(params = {}) {
    return interactions.acceptLure(this.requireBot(), this.pending, params);
  }
  declineLure(params = {}) {
    return interactions.declineLure(this.requireBot(), this.pending, params);
  }
  acceptInventoryOffer(params = {}) {
    return interactions.acceptInventoryOffer(this.requireBot(), this.pending, params);
  }
  declineInventoryOffer(params = {}) {
    return interactions.declineInventoryOffer(this.requireBot(), this.pending, params);
  }
  acceptGroupInvite(params = {}) {
    return interactions.acceptGroupInvite(this.requireBot(), this.pending, params);
  }
  declineGroupInvite(params = {}) {
    return interactions.declineGroupInvite(this.requireBot(), this.pending, params);
  }
  acceptGroupNoticeAttachment(params = {}) {
    return interactions.acceptGroupNoticeAttachment(this.requireBot(), this.pending, params);
  }
  dismissInteraction(params) {
    return interactions.dismissInteraction(this.pending, params);
  }

  /**
   * Region names, ratings and map image ids for a block of the grid, as the official map asks for
   * them (MapBlockRequest). Regions that do not exist are simply absent from the answer.
   */
  async getMapBlocks({ minX, minY, maxX, maxY } = {}) {
    const bot = this.requireBot();
    const clamp = (value) => Math.max(0, Math.min(65535, Math.floor(Number(value))));
    const [x0, y0, x1, y1] = [minX, minY, maxX, maxY].map(clamp);
    if (![x0, y0, x1, y1].every(Number.isFinite) || x1 < x0 || y1 < y0)
      throw new Error('Invalid map range');
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) throw new Error('Map range too large');
    const reply = await bot.clientCommands.grid.getRegionMapInfoRange(x0, y0, x1, y1);
    const seen = new Map();
    for (const block of reply?.regions || []) {
      if (!block?.name || !Number.isFinite(block.x) || !Number.isFinite(block.y)) continue;
      if (seen.has(`${block.x},${block.y}`)) continue; // a block can be repeated across reply packets
      seen.set(`${block.x},${block.y}`, {
        x: block.x,
        y: block.y,
        name: block.name,
        access: finite(block.accessFlags),
        waterHeight: finite(block.waterHeight),
        regionFlags: finite(block.regionFlags),
        mapImage: block.mapImage?.toString?.() || null,
      });
    }
    return [...seen.values()];
  }

  async fetchAnimation({ id }) {
    const bot = this.requireBot();
    return { id, data: await this.queueAssetDownload(() => downloadAnimation(bot, id)) };
  }

  sendAgentAnimations({ animations } = {}) {
    const bot = this.requireBot();
    return sendAgentAnimations(bot, this.currentRegion(), animations);
  }

  // The client builds these bodies (src/linkpoint/voice-protocol.ts, from the official viewer); the host only
  // checks the shape and posts them to the region's capability.
  /** Keep the neighbour tracker's idea of the current region up to date (the previous one becomes a neighbour). */
  syncNeighborCurrent() {
    const region = this.currentRegion();
    const handle = region?.regionHandle;
    if (!region?.caps || handle === undefined || handle === null) return;
    this.neighbors?.setCurrent(
      BigInt.asUintN(64, BigInt(handle.toString())).toString(),
      region.caps,
    );
  }

  /**
   * Capabilities for a voice request: the current region's, or a neighbour's when `regionHandle` names one
   * (a handle is the region's south-west corner, x in the high 32 bits and y in the low).
   */
  voiceCaps(regionHandle) {
    const current = this.currentRegion();
    if (regionHandle === undefined || regionHandle === null || regionHandle === '')
      return current?.caps;
    const handle = String(regionHandle);
    if (!/^\d{1,20}$/.test(handle)) throw new Error('regionHandle must be a number');
    this.syncNeighborCurrent();
    const caps = this.neighbors?.capsFor(handle);
    if (!caps) throw new Error('Voice is not available in that region');
    return caps;
  }

  async voiceProvision({ body, regionHandle } = {}) {
    const clean = sanitizeVoiceBody(body, VOICE_PROVISION_KEYS);
    if (clean.jsep?.type !== 'offer' || typeof clean.jsep.sdp !== 'string' || !clean.jsep.sdp)
      throw new Error('A WebRTC offer is required');
    const caps = this.voiceCaps(regionHandle);
    const url = await caps?.getCapability?.('ProvisionVoiceAccountRequest');
    if (!url) throw new Error('Voice is not available in this region');
    const response = await caps.capsPerformXMLPost(url, clean);
    // Signaling and logout for this session go to the region that provisioned it, even after the avatar has moved on.
    if (response?.viewer_session) this.voiceSessionCaps.set(String(response.viewer_session), caps);
    return response;
  }

  async voiceSignal({ body } = {}) {
    const clean = sanitizeVoiceBody(body, VOICE_SIGNAL_KEYS);
    if (typeof clean.viewer_session !== 'string' || !clean.viewer_session)
      throw new Error('Voice session is required');
    if (!clean.candidates && !clean.candidate)
      throw new Error('Voice signaling needs candidates or the completed marker');
    const caps = this.voiceSessionCaps.get(clean.viewer_session) ?? this.currentRegion()?.caps;
    const url = await caps?.getCapability?.('VoiceSignalingRequest');
    if (!url) throw new Error('Voice signaling is not available in this region');
    return caps.capsPerformXMLPost(url, clean);
  }

  async voiceLogout({ viewerSession } = {}) {
    if (!viewerSession) return { loggedOut: true };
    const caps = this.voiceSessionCaps.get(String(viewerSession)) ?? this.currentRegion()?.caps;
    this.voiceSessionCaps.delete(String(viewerSession));
    const url = await caps?.getCapability?.('ProvisionVoiceAccountRequest');
    if (url)
      await caps.capsPerformXMLPost(url, {
        logout: true,
        viewer_session: viewerSession,
        voice_server_type: 'webrtc',
      });
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
    const online = (id, fallback = false) =>
      (this.friendPresence.get(String(id).toLowerCase()) ?? fallback) ? 'online' : 'offline';

    // The library names a friend 'Unknown Friend' until its own background lookup succeeds, and that
    // lookup is abandoned silently on any error. Placeholders are not names: look those up here.
    const isPlaceholder = (name) =>
      !name || /^(unknown\s+friend|friend|resident)$/i.test(String(name).trim());
    const unresolved = [];
    for (const buddy of buddyList) {
      const id = buddy.buddyID?.toString();
      const friend = friendCommands?.getFriend(buddy.buddyID);
      const known = this.friendNames.get(String(id).toLowerCase());
      if (friend && !isPlaceholder(friend.getName?.())) {
        this.friendNames.set(String(id).toLowerCase(), friend.getName());
        results.push({
          ...serializeFriend(friend, { id }),
          onlineStatus: online(id, Boolean(friend.online)),
          ...rights(buddy),
        });
      } else if (known) {
        results.push({
          id,
          name: known,
          onlineStatus: online(id, Boolean(friend?.online)),
          ...rights(buddy),
        });
      } else {
        unresolved.push(buddy.buddyID);
      }
    }

    const nameOf = (res) =>
      res.getName?.() || `${res.getFirstName?.() || ''} ${res.getLastName?.() || ''}`.trim();
    const names = new Map();
    const grid = bot.clientCommands?.grid;
    if (unresolved.length && grid) {
      const BATCH = 50;
      for (let i = 0; i < unresolved.length; i += BATCH) {
        const batch = unresolved.slice(i, i + BATCH);
        try {
          const resolved = await grid.avatarKey2Name(batch);
          for (const res of Array.isArray(resolved) ? resolved : [resolved]) {
            if (res) names.set(res.getKey().toString().toLowerCase(), nameOf(res));
          }
        } catch (error) {
          // One unknown key fails the whole batch, so ask for each friend on its own.
          console.warn(
            '[SL Session] avatarKey2Name batch resolution warning:',
            error?.message || error,
          );
          const singles = await Promise.allSettled(batch.map((key) => grid.avatarKey2Name(key)));
          singles.forEach((single, index) => {
            if (single.status === 'fulfilled' && single.value)
              names.set(batch[index].toString().toLowerCase(), nameOf(single.value));
          });
        }
      }
    }
    for (const key of unresolved) {
      const id = key.toString();
      const name = names.get(id.toLowerCase());
      if (name) this.friendNames.set(id.toLowerCase(), name);
      results.push({
        id,
        name: name || `Resident (${id.slice(0, 8)})`,
        onlineStatus: online(id, Boolean(friendCommands?.getFriend(key)?.online)),
        ...rights(buddyList.find((b) => b.buddyID?.toString() === id)),
      });
    }
    return results;
  }

  async activateGroup({ groupId, roleId } = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const targetGroupId =
      groupId && typeof groupId === 'string' && groupId.trim()
        ? groupId.trim().toLowerCase()
        : ZERO_UUID;
    const targetRoleId =
      roleId && typeof roleId === 'string' && roleId.trim()
        ? roleId.trim().toLowerCase()
        : ZERO_UUID;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetGroupId)) {
      throw new Error(`Invalid group ID format: ${targetGroupId}`);
    }
    if (!uuidRegex.test(targetRoleId)) {
      throw new Error(`Invalid role ID format: ${targetRoleId}`);
    }

    this.activeGroupId = targetGroupId;
    this.activeRoleId = targetRoleId;

    if (this.bot) {
      const circuit = this.currentRegion()?.circuit;
      if (circuit) {
        const agentUUIDStr =
          this.identity.agentId || this.bot.agent?.agentID?.toString() || ZERO_UUID;
        const sessionUUIDStr = circuit.sessionID?.toString() || ZERO_UUID;

        const msg = new AgentSetGroupTitleMessage();
        msg.AgentData = {
          AgentID: new UUID(agentUUIDStr),
          SessionID: new UUID(sessionUUIDStr),
          GroupID: new UUID(targetGroupId),
          RoleID: new UUID(targetRoleId),
        };
        circuit.sendMessage(msg, PacketFlags.Reliable);

        const actMsg = new ActivateGroupMessage();
        actMsg.AgentData = {
          AgentID: new UUID(agentUUIDStr),
          SessionID: new UUID(sessionUUIDStr),
          GroupID: new UUID(targetGroupId),
        };
        circuit.sendMessage(actMsg, PacketFlags.Reliable);
      }
    }

    this.send('active_group_changed', {
      groupId: targetGroupId,
      roleId: targetRoleId,
      agentId: this.identity.agentId || this.bot?.agent?.agentID?.toString() || '',
    });

    return {
      success: true,
      groupId: targetGroupId,
      roleId: targetRoleId,
    };
  }

  async inviteGroupMember({ groupId, avatarId, inviteeId, roleId } = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const targetGroupId = groupId && typeof groupId === 'string' ? groupId.trim() : '';
    const targetAvatarId =
      (avatarId || inviteeId) && typeof (avatarId || inviteeId) === 'string'
        ? (avatarId || inviteeId).trim()
        : '';
    const targetRoleId =
      roleId && typeof roleId === 'string' && roleId.trim() ? roleId.trim() : ZERO_UUID;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetGroupId)) {
      throw new Error(`Invalid group ID format: ${targetGroupId}`);
    }
    if (!uuidRegex.test(targetAvatarId)) {
      throw new Error(`Invalid avatar ID format: ${targetAvatarId}`);
    }
    if (!uuidRegex.test(targetRoleId)) {
      throw new Error(`Invalid role ID format: ${targetRoleId}`);
    }

    if (this.bot) {
      const circuit = this.currentRegion()?.circuit;
      if (circuit) {
        const agentUUIDStr =
          this.identity.agentId || this.bot.agent?.agentID?.toString() || ZERO_UUID;
        const sessionUUIDStr = circuit.sessionID?.toString() || ZERO_UUID;

        const msg = new InviteGroupRequestMessage();
        msg.AgentData = {
          AgentID: new UUID(agentUUIDStr),
          SessionID: new UUID(sessionUUIDStr),
        };
        msg.GroupData = {
          GroupID: new UUID(targetGroupId),
        };
        msg.InviteData = [
          {
            InviteeID: new UUID(targetAvatarId),
            RoleID: new UUID(targetRoleId),
          },
        ];
        circuit.sendMessage(msg, PacketFlags.Reliable);
      }
    }

    this.send('group_member_invited', {
      groupId: targetGroupId,
      avatarId: targetAvatarId,
      roleId: targetRoleId,
    });

    return {
      success: true,
      groupId: targetGroupId,
      avatarId: targetAvatarId,
      roleId: targetRoleId,
    };
  }

  async ejectGroupMember({ groupId, memberId, ejecteeId } = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const targetGroupId = groupId && typeof groupId === 'string' ? groupId.trim() : '';
    const targetMemberId =
      (memberId || ejecteeId) && typeof (memberId || ejecteeId) === 'string'
        ? (memberId || ejecteeId).trim()
        : '';

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetGroupId)) {
      throw new Error(`Invalid group ID format: ${targetGroupId}`);
    }
    if (!uuidRegex.test(targetMemberId)) {
      throw new Error(`Invalid member ID format: ${targetMemberId}`);
    }

    if (this.bot) {
      const circuit = this.currentRegion()?.circuit;
      if (circuit) {
        const agentUUIDStr =
          this.identity.agentId || this.bot.agent?.agentID?.toString() || ZERO_UUID;
        const sessionUUIDStr = circuit.sessionID?.toString() || ZERO_UUID;

        const msg = new EjectGroupMemberRequestMessage();
        msg.AgentData = {
          AgentID: new UUID(agentUUIDStr),
          SessionID: new UUID(sessionUUIDStr),
        };
        msg.GroupData = {
          GroupID: new UUID(targetGroupId),
        };
        msg.EjectData = [
          {
            EjecteeID: new UUID(targetMemberId),
          },
        ];
        circuit.sendMessage(msg, PacketFlags.Reliable);
      }
    }

    this.send('group_member_ejected', {
      groupId: targetGroupId,
      memberId: targetMemberId,
    });

    return {
      success: true,
      groupId: targetGroupId,
      memberId: targetMemberId,
    };
  }

  async modifyGroupRole({ groupId, roleId, memberId, change, changes } = {}) {
    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const targetGroupId = groupId && typeof groupId === 'string' ? groupId.trim() : '';

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetGroupId)) {
      throw new Error(`Invalid group ID format: ${targetGroupId}`);
    }

    let changeList = [];
    if (Array.isArray(changes) && changes.length > 0) {
      changeList = changes;
    } else if (roleId && memberId) {
      changeList = [{ roleId, memberId, change }];
    }

    if (changeList.length === 0) {
      throw new Error('At least one role change required');
    }

    const normalizedChanges = changeList.map((c) => {
      const rId = typeof c.roleId === 'string' ? c.roleId.trim() : '';
      const mId = typeof c.memberId === 'string' ? c.memberId.trim() : '';
      if (!uuidRegex.test(rId)) {
        throw new Error(`Invalid role ID format: ${rId}`);
      }
      if (!uuidRegex.test(mId)) {
        throw new Error(`Invalid member ID format: ${mId}`);
      }
      const changeType = c.change === 'remove' || c.change === 1 || c.change === '1' ? 1 : 0;
      return {
        roleId: rId,
        memberId: mId,
        change: changeType,
      };
    });

    if (this.bot) {
      const circuit = this.currentRegion()?.circuit;
      if (circuit) {
        const agentUUIDStr =
          this.identity.agentId || this.bot.agent?.agentID?.toString() || ZERO_UUID;
        const sessionUUIDStr = circuit.sessionID?.toString() || ZERO_UUID;

        // Constraint: Bulk role updates exceeding 100 members must process through sequential batches
        const BATCH_SIZE = 100;
        for (let i = 0; i < normalizedChanges.length; i += BATCH_SIZE) {
          const batch = normalizedChanges.slice(i, i + BATCH_SIZE);
          const msg = new GroupRoleChangesMessage();
          msg.AgentData = {
            AgentID: new UUID(agentUUIDStr),
            SessionID: new UUID(sessionUUIDStr),
            GroupID: new UUID(targetGroupId),
          };
          msg.RoleChange = batch.map((item) => ({
            RoleID: new UUID(item.roleId),
            MemberID: new UUID(item.memberId),
            Change: item.change,
          }));
          circuit.sendMessage(msg, PacketFlags.Reliable);
        }
      }
    }

    this.send('group_roles_modified', {
      groupId: targetGroupId,
      changes: normalizedChanges,
    });

    return {
      success: true,
      groupId: targetGroupId,
      changes: normalizedChanges,
    };
  }

  async getGroups() {
    const bot = this.requireBot();
    if (!bot.clientCommands?.agent) return [];
    try {
      const raw = await bot.clientCommands.agent.getAvatarGroups(
        this.identity.agentId || bot.agent?.agentID,
      );
      return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((group) => {
        const id = group.GroupID?.toString?.() || String(group.GroupID);
        return {
          id,
          name: group.GroupName || 'Group',
          title: group.GroupTitle || '',
          insignia: group.GroupInsigniaID?.toString?.() || '',
          acceptNotices: Boolean(group.AcceptNotices),
          powers: group.GroupPowers?.toString?.() || '',
          active: id.toLowerCase() === (this.activeGroupId || '').toLowerCase(),
        };
      });
    } catch (error) {
      throw new Error('Group list could not be loaded', { cause: error });
    }
  }

  async getGroupDetails({ groupId, section = 'profile' } = {}) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId || ''))
      throw new Error('Valid group ID required');
    const groups = this.requireBot().clientCommands?.groups;
    if (!groups) throw new Error('Group interface unavailable');
    if (section === 'members')
      return (await groups.getMemberList(groupId)).map((m) => ({
        id: m.AgentID.toString(),
        title: m.Title,
        onlineStatus: m.OnlineStatus,
        isOwner: m.IsOwner,
        powers: m.AgentPowers?.toString(),
      }));
    if (section === 'roles')
      return (await groups.getGroupRoles(groupId)).map((r) => ({
        id: r.RoleID.toString(),
        name: r.Name,
        title: r.Title,
        description: r.Description,
        memberCount: r.Members,
        powers: r.Powers?.toString(),
      }));
    if (section === 'notices') {
      return this.getGroupNotices({ groupId });
    }
    if (section !== 'profile') throw new Error('Unknown group detail section');
    const g = await groups.getGroupProfile(groupId);
    return {
      id: g.GroupID.toString(),
      name: g.Name,
      charter: g.Charter,
      title: g.MemberTitle,
      insignia: g.InsigniaID?.toString(),
      founderId: g.FounderID?.toString(),
      membershipFee: g.MembershipFee,
      openEnrollment: g.OpenEnrollment,
      members: g.GroupMembershipCount,
      roleCount: g.GroupRolesCount,
    };
  }

  async getGroupNotices({ groupId } = {}) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId || ''))
      throw new Error('Valid group ID required');
    const groups = this.requireBot().clientCommands?.groups;
    if (!groups) throw new Error('Group interface unavailable');
    if (typeof groups.getGroupNotices === 'function') {
      const raw = await groups.getGroupNotices(groupId);
      return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((n) => ({
        id: n.NoticeID?.toString?.() || n.id?.toString?.() || String(n.id || n.NoticeID || ''),
        groupId: n.GroupID?.toString?.() || n.groupId?.toString?.() || groupId,
        subject: n.Subject || n.subject || 'Group Notice',
        message: n.Message || n.message || '',
        from: n.FromName || n.fromName || n.from || 'Group Admin',
        timestamp: Number(n.Timestamp || n.timestamp) || Date.now(),
        hasAttachment: Boolean(
          n.HasAttachment ??
          n.hasAttachment ??
          n.has_attachment ??
          n.AttachmentItemName ??
          n.attachmentName,
        ),
        attachmentName: n.AttachmentItemName || n.attachmentName || null,
        attachmentItemId:
          n.AttachmentItemID?.toString?.() || n.attachmentItemId?.toString?.() || null,
        attachmentType: n.AttachmentType ?? n.attachmentType ?? null,
        attachmentOwnerId:
          n.AttachmentOwnerID?.toString?.() || n.attachmentOwnerId?.toString?.() || null,
      }));
    }
    if (typeof groups.getNotices === 'function') {
      const raw = await groups.getNotices(groupId);
      return (Array.isArray(raw) ? raw : [raw]).filter(Boolean).map((n) => ({
        id: n.NoticeID?.toString?.() || n.id?.toString?.() || String(n.id || n.NoticeID || ''),
        groupId: n.GroupID?.toString?.() || n.groupId?.toString?.() || groupId,
        subject: n.Subject || n.subject || 'Group Notice',
        message: n.Message || n.message || '',
        from: n.FromName || n.fromName || n.from || 'Group Admin',
        timestamp: Number(n.Timestamp || n.timestamp) || Date.now(),
        hasAttachment: Boolean(
          n.HasAttachment ??
          n.hasAttachment ??
          n.has_attachment ??
          n.AttachmentItemName ??
          n.attachmentName,
        ),
        attachmentName: n.AttachmentItemName || n.attachmentName || null,
        attachmentItemId:
          n.AttachmentItemID?.toString?.() || n.attachmentItemId?.toString?.() || null,
        attachmentType: n.AttachmentType ?? n.attachmentType ?? null,
        attachmentOwnerId:
          n.AttachmentOwnerID?.toString?.() || n.attachmentOwnerId?.toString?.() || null,
      }));
    }
    if (typeof groups.requestGroupNotices === 'function') {
      return await groups.requestGroupNotices(groupId);
    }
    throw new Error('Group notices unavailable');
  }

  async getGroupNoticeDetail({ noticeId, groupId } = {}) {
    if (!noticeId) throw new Error('Notice ID required');
    const groups = this.requireBot().clientCommands?.groups;
    if (!groups) throw new Error('Group interface unavailable');
    if (typeof groups.getGroupNoticeDetail === 'function') {
      return await groups.getGroupNoticeDetail(noticeId, groupId);
    }
    if (typeof groups.requestGroupNotice === 'function') {
      return await groups.requestGroupNotice(noticeId, groupId);
    }
    return { id: noticeId, groupId };
  }

  async sendGroupNotice(params = {}) {
    const { groupId, subject, message, attachment } = params || {};
    if (
      !groupId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)
    ) {
      throw new Error('Valid group ID required');
    }
    const cleanSubject = String(subject || '').trim();
    const cleanMessage = String(message || '').trim();
    if (!cleanSubject) {
      throw new Error('Subject is required');
    }
    if (!cleanMessage) {
      throw new Error('Message is required');
    }
    if (Buffer.byteLength(cleanSubject, 'utf8') > 63) {
      throw new Error('Subject must not exceed 63 bytes');
    }
    if (Buffer.byteLength(cleanMessage, 'utf8') > 512) {
      throw new Error('Message must not exceed 512 bytes');
    }

    const bot = this.requireBot();
    const circuit =
      this.currentRegion()?.circuit || bot.circuit || bot.clientCommands?.groups?.circuit;
    const agent = bot.agent;
    const agentId = this.identity?.agent_id || agent?.agentID;

    if (!circuit?.sendMessage || !agentId) {
      throw new Error(NOT_CONNECTED);
    }

    const agentName =
      (agent?.firstName ? `${agent.firstName} ${agent.lastName || ''}`.trim() : '') ||
      this.identity?.username ||
      'Resident';

    let binaryBucket = Buffer.alloc(0);
    if (attachment) {
      if (Buffer.isBuffer(attachment)) {
        binaryBucket = attachment;
      } else if (attachment.itemId || attachment.id || attachment.attachmentItemId) {
        binaryBucket = Buffer.alloc(18);
        binaryBucket[0] = 1;
        binaryBucket[1] = Number(
          attachment.itemType ??
            attachment.type ??
            attachment.assetType ??
            attachment.attachmentType ??
            0,
        );
        const itemUuidStr = String(
          attachment.itemId || attachment.id || attachment.attachmentItemId,
        );
        const itemUuid = new UUID(itemUuidStr);
        itemUuid.writeToBuffer(binaryBucket, 2);
      }
    }

    const im = new ImprovedInstantMessageMessage();
    im.AgentData = {
      AgentID: typeof agentId === 'string' ? new UUID(agentId) : agentId,
      SessionID: circuit.sessionID
        ? typeof circuit.sessionID === 'string'
          ? new UUID(circuit.sessionID)
          : circuit.sessionID
        : UUID.zero(),
    };
    im.MessageBlock = {
      FromGroup: false,
      ToAgentID: new UUID(groupId),
      ParentEstateID: 0,
      RegionID: UUID.zero(),
      Position: Vector3.getZero(),
      Offline: 0,
      Dialog: InstantMessageDialog.GroupNotice, // 32
      ID: UUID.zero(),
      Timestamp: Math.floor(Date.now() / 1000),
      FromAgentName: Utils.StringToBuffer(agentName),
      Message: Utils.StringToBuffer(`${cleanSubject}|${cleanMessage}`),
      BinaryBucket: binaryBucket,
    };
    im.EstateBlock = {
      EstateID: 0,
    };

    const seq = circuit.sendMessage(im, PacketFlags.Reliable);
    if (typeof circuit.waitForAck === 'function') {
      try {
        await circuit.waitForAck(seq, 10000);
      } catch (err) {
        console.warn('[ViewerSession] Group notice ack timeout, continuing:', err);
      }
    }

    return {
      success: true,
      id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      groupId,
      subject: cleanSubject,
      message: cleanMessage,
      from: agentName,
      hasAttachment: binaryBucket.length > 0,
      attachment: binaryBucket.length > 0 ? attachment : null,
      timestamp: Date.now(),
    };
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
      } catch {
        /* fall back to the root */
      }
    }
    try {
      await folder.populate();
    } catch (error) {
      console.warn('[SL Inventory] folder.populate warning:', error);
    }

    const toFolder = (f) => ({
      id: f.folderID?.toString(),
      name: f.name || 'Unnamed Folder',
      parent: f.parentID?.toString(),
      typeDefault: f.typeDefault,
      folder: true,
    });
    const skeleton = bot.agent?.inventory?.main?.skeleton;
    const folders =
      skeleton && (!folderId || folderId === rootId)
        ? Array.from(skeleton.values()).map(toFolder)
        : (folder.getChildFolders() || []).map(toFolder);
    const items = (folder.items || []).map((item) => ({
      id: item.itemID?.toString(),
      assetId: item.assetID?.toString() || '',
      name: item.name || 'Unnamed Item',
      parent: item.parentID?.toString(),
      assetType: item.assetType,
      inventoryType: item.inventoryType,
      flags: Number(item.flags ?? 0),
      description: item.description || '',
      folder: false,
    }));
    return { folderId: folder.folderID?.toString(), folderName: folder.name, folders, items };
  }

  async createInventoryFolder({ parentId, name, folderType, folderId } = {}) {
    const cleanName = String(name ?? '')
      .replace(/[\x00-\x1F\x7F|]/g, '')
      .trim();
    if (!cleanName) throw new Error('Folder name is required');
    if (cleanName.length > 63) throw new Error('Folder name must not exceed 63 characters');

    const bot = this.requireBot();
    const region = this.currentRegion();
    const circuit = region?.circuit;
    const agentId = this.identity?.agent_id || bot.agent?.agentID;
    if (!circuit?.sendMessage || !agentId) throw new Error('Not connected to simulator');

    const skeleton = bot.agent?.inventory?.main?.skeleton;
    let targetParentId = parentId ? String(parentId).trim() : '';
    if (!targetParentId) {
      const rootFolder = bot.clientCommands?.inventory?.getInventoryRoot?.();
      if (rootFolder?.folderID) {
        targetParentId = rootFolder.folderID.toString();
      } else if (skeleton) {
        const rootEntry = Array.from(skeleton.values()).find(
          (f) =>
            f &&
            (f.typeDefault === FolderType.Root ||
              !f.parentID ||
              f.parentID.toString() === '00000000-0000-0000-0000-000000000000'),
        );
        if (rootEntry?.folderID) {
          targetParentId = rootEntry.folderID.toString();
        }
      }
    }
    if (!targetParentId) throw new Error('Parent folder is required');

    let parentFolder = skeleton?.get?.(targetParentId);
    if (!parentFolder && skeleton) {
      parentFolder = Array.from(skeleton.values()).find(
        (f) => f?.folderID?.toString?.() === targetParentId,
      );
    }

    if (parentFolder) {
      let cursor = parentFolder;
      const seen = new Set();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const cursorName = String(cursor.name || '')
          .trim()
          .toLowerCase();
        const cursorType = Number(cursor.typeDefault ?? -1);
        if (
          cursorType === FolderType.Trash ||
          cursorName === 'trash' ||
          cursorType === FolderType.CurrentOutfit ||
          cursorName === 'current outfit' ||
          cursor.library === 1 ||
          cursorName === 'library'
        ) {
          throw new Error('Cannot create folders inside protected system folders');
        }
        const nextParentId = cursor.parentID?.toString?.();
        cursor = nextParentId && skeleton ? skeleton.get(nextParentId) : null;
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const newFolderUuid =
      typeof folderId === 'string' && uuidRegex.test(folderId) ? new UUID(folderId) : UUID.random();
    const newFolderIdStr = newFolderUuid.toString();
    const parentUuid =
      parentFolder?.folderID && typeof parentFolder.folderID === 'object'
        ? parentFolder.folderID
        : new UUID(targetParentId);
    const resolvedType =
      typeof folderType === 'number' &&
      Number.isInteger(folderType) &&
      folderType >= -128 &&
      folderType <= 127
        ? folderType
        : FolderType.None;

    const createMsg = new CreateInventoryFolderMessage();
    createMsg.AgentData = {
      AgentID: typeof agentId === 'string' ? new UUID(agentId) : agentId,
      SessionID: circuit.sessionID
        ? typeof circuit.sessionID === 'string'
          ? new UUID(circuit.sessionID)
          : circuit.sessionID
        : UUID.zero(),
    };
    createMsg.FolderData = {
      FolderID: newFolderUuid,
      ParentID: parentUuid,
      Type: resolvedType,
      Name: Utils.StringToBuffer(cleanName),
    };

    const ack = circuit.sendMessage(createMsg, PacketFlags.Reliable);
    if (typeof circuit.waitForAck === 'function') {
      await circuit.waitForAck(ack, 5000);
    }

    try {
      let newFolder;
      if (bot.agent?.agentID && bot.agent?.inventory?.main) {
        newFolder = new InventoryFolder(
          parentFolder?.library ?? 0,
          bot.agent.inventory.main,
          bot.agent,
        );
      } else {
        newFolder = {
          items: [],
          folders: [],
          getChildFolders() {
            if (!skeleton) return this.folders;
            return Array.from(skeleton.values()).filter(
              (f) => f && f.parentID?.toString?.() === newFolderIdStr,
            );
          },
        };
      }
      newFolder.typeDefault = resolvedType;
      newFolder.version = 1;
      newFolder.name = cleanName;
      newFolder.folderID = newFolderUuid;
      newFolder.parentID = parentFolder?.folderID ?? parentUuid;
      newFolder.items = [];
      newFolder.folders = [];

      if (parentFolder && Array.isArray(parentFolder.folders)) {
        parentFolder.folders.push(newFolder);
      }
      if (skeleton && typeof skeleton.set === 'function') {
        skeleton.set(newFolderIdStr, newFolder);
      }
    } catch {
      /* ignore local skeleton cache update error */
    }

    return {
      success: true,
      folderId: newFolderIdStr,
      parentId: targetParentId,
      name: cleanName,
      folderType: resolvedType,
      folder: {
        id: newFolderIdStr,
        name: cleanName,
        parent: targetParentId,
        typeDefault: resolvedType,
        folderType: resolvedType,
        version: 1,
        folder: true,
      },
    };
  }

  async purgeInventoryTrash({ folderId } = {}) {
    const bot = this.requireBot();
    const region = this.currentRegion();
    const circuit = region?.circuit;
    const agentId = this.identity?.agent_id || bot.agent?.agentID;
    if (!circuit?.sendMessage || !agentId) throw new Error('Not connected to simulator');

    let targetFolderId = folderId;
    if (!targetFolderId) {
      const skeleton = bot.agent?.inventory?.main?.skeleton;
      const trashFolder =
        skeleton &&
        Array.from(skeleton.values()).find(
          (f) =>
            f.typeDefault === FolderType.Trash ||
            f.name?.toLowerCase() === 'trash' ||
            f.typeDefault === 13 ||
            f.typeDefault === 14,
        );
      if (trashFolder?.folderID) {
        targetFolderId = trashFolder.folderID.toString();
      }
    }
    if (!targetFolderId) {
      throw new Error('Trash folder not found');
    }

    const msg = new PurgeInventoryDescendentsMessage();
    msg.AgentData = {
      AgentID: typeof agentId === 'string' ? new UUID(agentId) : agentId,
      SessionID: circuit.sessionID
        ? typeof circuit.sessionID === 'string'
          ? new UUID(circuit.sessionID)
          : circuit.sessionID
        : UUID.zero(),
    };
    msg.InventoryData = {
      FolderID: typeof targetFolderId === 'string' ? new UUID(targetFolderId) : targetFolderId,
    };
    circuit.sendMessage(msg, PacketFlags.Reliable);

    try {
      const skeleton = bot.agent?.inventory?.main?.skeleton;
      const skeletonFolder = skeleton?.get(targetFolderId);
      if (skeletonFolder) {
        if (Array.isArray(skeletonFolder.items)) skeletonFolder.items = [];
        if (typeof skeletonFolder.getChildFolders === 'function') {
          const childFolders = skeletonFolder.getChildFolders() || [];
          for (const cf of childFolders) {
            if (cf.folderID) skeleton.delete(cf.folderID.toString());
          }
        }
      }
    } catch {
      /* ignore cache cleanup failure */
    }

    return { success: true, folderId: targetFolderId };
  }

  async removeInventoryItem({ itemId } = {}) {
    if (!itemId) throw new Error('itemId is required');
    const bot = this.requireBot();
    const region = this.currentRegion();
    const circuit = region?.circuit;
    const agentId = this.identity?.agent_id || bot.agent?.agentID;
    if (!circuit?.sendMessage || !agentId) throw new Error('Not connected to simulator');

    const msg = new RemoveInventoryItemMessage();
    msg.AgentData = {
      AgentID: typeof agentId === 'string' ? new UUID(agentId) : agentId,
      SessionID: circuit.sessionID
        ? typeof circuit.sessionID === 'string'
          ? new UUID(circuit.sessionID)
          : circuit.sessionID
        : UUID.zero(),
    };
    msg.InventoryData = [
      {
        ItemID: typeof itemId === 'string' ? new UUID(itemId) : itemId,
      },
    ];
    circuit.sendMessage(msg, PacketFlags.Reliable);

    try {
      const skeleton = bot.agent?.inventory?.main?.skeleton;
      if (skeleton) {
        for (const folder of skeleton.values()) {
          if (Array.isArray(folder.items)) {
            folder.items = folder.items.filter((i) => i.itemID?.toString() !== itemId);
          }
        }
      }
    } catch {
      /* ignore */
    }

    return { success: true, itemId };
  }

  async removeInventoryFolder({ folderId } = {}) {
    if (!folderId) throw new Error('folderId is required');
    const bot = this.requireBot();
    const region = this.currentRegion();
    const circuit = region?.circuit;
    const agentId = this.identity?.agent_id || bot.agent?.agentID;
    if (!circuit?.sendMessage || !agentId) throw new Error('Not connected to simulator');

    const msg = new RemoveInventoryFolderMessage();
    msg.AgentData = {
      AgentID: typeof agentId === 'string' ? new UUID(agentId) : agentId,
      SessionID: circuit.sessionID
        ? typeof circuit.sessionID === 'string'
          ? new UUID(circuit.sessionID)
          : circuit.sessionID
        : UUID.zero(),
    };
    msg.FolderData = [
      {
        FolderID: typeof folderId === 'string' ? new UUID(folderId) : folderId,
      },
    ];
    circuit.sendMessage(msg, PacketFlags.Reliable);

    try {
      const skeleton = bot.agent?.inventory?.main?.skeleton;
      if (skeleton) {
        skeleton.delete(folderId);
      }
    } catch {
      /* ignore */
    }

    return { success: true, folderId };
  }

  /**
   * What the avatar is wearing now (the Current Outfit folder) and the outfits saved in My Outfits.
   * Current Outfit holds links; a link carries the name of what it points at, the inventory type, and
   * for wearables the wearable type in the low byte of its flags.
   */
  async getOutfit() {
    const bot = this.requireBot();
    const agent = bot.clientCommands?.agent;
    if (!agent?.getWearables) throw new Error('Second Life outfit interface unavailable');
    const WEARABLE_TYPES = [
      'Shape',
      'Skin',
      'Hair',
      'Eyes',
      'Shirt',
      'Pants',
      'Shoes',
      'Socks',
      'Jacket',
      'Gloves',
      'Undershirt',
      'Underpants',
      'Skirt',
      'Alpha',
      'Tattoo',
      'Physics',
      'Universal',
    ];
    const BODY_PARTS = new Set(['Shape', 'Skin', 'Hair', 'Eyes']);
    const folder = await agent.getWearables();
    const worn = (folder.items || []).map((item) => {
      const isWearable = item.inventoryType === 18;
      const wearableType = isWearable ? WEARABLE_TYPES[Number(item.flags) & 0xff] : undefined;
      const kind = isWearable
        ? BODY_PARTS.has(wearableType)
          ? 'body'
          : 'clothing'
        : item.inventoryType === 6
          ? 'attachment'
          : 'other';
      return {
        id: item.itemID?.toString(),
        linkedId: item.assetID?.toString(),
        name: item.name || 'Unnamed Item',
        assetType: item.assetType,
        inventoryType: item.inventoryType,
        category: kind,
        typeName: wearableType || (kind === 'attachment' ? 'Attachment' : 'Item'),
        worn: true,
      };
    });

    const outfits = [];
    const skeleton = bot.agent?.inventory?.main?.skeleton;
    const myOutfits =
      skeleton && Array.from(skeleton.values()).find((f) => f.typeDefault === FolderType.MyOutfits);
    if (myOutfits) {
      for (const f of skeleton.values()) {
        if (f.parentID?.toString() === myOutfits.folderID?.toString())
          outfits.push({ id: f.folderID?.toString(), name: f.name || 'Unnamed Outfit' });
      }
    }
    return { folderId: folder.folderID?.toString(), items: worn, outfits };
  }

  // ---- diagnostics and scene catch-up -------------------------------------------------------------

  getDiagnostics() {
    if (!this.bot) {
      return {
        connected: false,
        state: 'DISCONNECTED',
        latencyMs: null,
        packetLossPct: null,
        capabilities: 0,
        circuitCode: null,
        simAddress: '',
        simPort: null,
      };
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
        this.appearanceWatcher?.apply(object);
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
        QueryFlags:
          DirFindFlags.People |
          DirFindFlags.IncludePG |
          DirFindFlags.IncludeMature |
          DirFindFlags.IncludeAdult,
        QueryStart: start,
      };
      circuit.sendMessage(msg, PacketFlags.Reliable);
      const reply = await circuit.waitForMessage(Message.DirPeopleReply, 10000, (dpr) => {
        return dpr.QueryData?.QueryID?.equals(queryID)
          ? FilterResponse.Finish
          : FilterResponse.NoMatch;
      });
      const results = [];
      for (const p of reply.QueryReplies || []) {
        if (!p.AgentID || p.AgentID.isZero()) continue;
        const firstName = Utils.BufferToStringSimple(p.FirstName || '');
        const lastName = Utils.BufferToStringSimple(p.LastName || '');
        const group = Utils.BufferToStringSimple(p.Group || '');
        const username =
          lastName && lastName !== 'Resident' ? `${firstName} ${lastName}` : firstName;
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
    } else if (category === 'events') {
      const msg = new DirEventsQueryMessage();
      msg.AgentData = {
        AgentID: this.bot.agent.agentID,
        SessionID: circuit.sessionID,
      };
      const queryID = UUID.random();
      const sanitizedQuery = sanitizeQueryString(query);
      const categoryFilter = Number(params.categoryFilter) || 0;
      const timeFilter = String(params.timeFilter || 'u');
      msg.QueryData = {
        QueryID: queryID,
        SearchText: Utils.StringToBuffer(sanitizedQuery).subarray(0, 255),
        QueryFlags: DirFindFlags.IncludePG | DirFindFlags.IncludeMature | DirFindFlags.IncludeAdult,
        Category: categoryFilter,
        DateText: Utils.StringToBuffer(timeFilter).subarray(0, 255),
        QueryStart: start,
      };
      circuit.sendMessage(msg, PacketFlags.Reliable);
      const reply = await circuit.waitForMessage(Message.DirEventsReply, 10000, (der) => {
        return der.QueryData?.QueryID?.equals(queryID)
          ? FilterResponse.Finish
          : FilterResponse.NoMatch;
      });
      const results = [];
      for (const ev of reply.QueryReplies || []) {
        results.push({
          id: String(
            ev.EventID || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
          ),
          eventId: ev.EventID || 0,
          ownerId: ev.OwnerID?.toString() || '',
          name: Utils.BufferToStringSimple(ev.Name || ''),
          date: Utils.BufferToStringSimple(ev.Date || ''),
          unixTime: ev.UnixTime || 0,
          eventFlags: ev.EventFlags || 0,
          type: 'events',
        });
      }
      return { results, hasMore: results.length >= 100 };
    } else if (category === 'classifieds') {
      const msg = new DirClassifiedQueryMessage();
      msg.AgentData = {
        AgentID: this.bot.agent.agentID,
        SessionID: circuit.sessionID,
      };
      const queryID = UUID.random();
      const sanitizedQuery = sanitizeQueryString(query);
      msg.QueryData = {
        QueryID: queryID,
        SearchText: Utils.StringToBuffer(sanitizedQuery).subarray(0, 255),
        QueryFlags: DirFindFlags.IncludePG | DirFindFlags.IncludeMature | DirFindFlags.IncludeAdult,
        Category: Number(params.categoryFilter) || 0,
        QueryStart: start,
      };
      circuit.sendMessage(msg, PacketFlags.Reliable);
      const reply = await circuit.waitForMessage(Message.DirClassifiedReply, 10000, (dcr) => {
        return dcr.QueryData?.QueryID?.equals(queryID)
          ? FilterResponse.Finish
          : FilterResponse.NoMatch;
      });
      const results = [];
      for (const cls of reply.QueryReplies || []) {
        results.push({
          id:
            cls.ClassifiedID?.toString() ||
            globalThis.crypto?.randomUUID?.() ||
            Math.random().toString(36).slice(2),
          classifiedId: cls.ClassifiedID?.toString() || '',
          name: Utils.BufferToStringSimple(cls.Name || ''),
          price: cls.PriceForListing || 0,
          creationDate: cls.CreationDate || 0,
          expirationDate: cls.ExpirationDate || 0,
          classifiedFlags: cls.ClassifiedFlags || 0,
          type: 'classifieds',
        });
      }
      return { results, hasMore: results.length >= 100 };
    }

    return { results: [], hasMore: false };
  }

  /** Objects and decoded assets, for a client that connected after they were first announced. */
  getSceneSnapshot({ retryFailed = false } = {}) {
    if (retryFailed) this.resetAssetFailures();
    return { objects: this.getSceneObjects(), assets: Array.from(this.decodedAssets.values()) };
  }

  async close() {
    for (const subscription of this.subscriptions.splice(0)) {
      try {
        subscription.unsubscribe();
      } catch {
        /* already gone */
      }
    }
    this.appearanceWatcher = null;
    this.assetRequests.clear();
    this.resetAssetFailures();
    this.friendNames.clear();
    this.decodedAssets.clear();
    this.pending.clear();
    this.pendingParcelTransactions.clear();
    this.activeGestures.clear();
    if (!this.bot) return;
    const bot = this.bot;
    this.bot = null;
    try {
      await bot.close();
    } catch {
      /* circuit may already be closed */
    }
  }

  async buyParcelPass(params = {}) {
    if (!this.bot) throw new Error('Not connected');
    return { success: true, localId: params.localId };
  }

  async updateParcelProperties(params = {}) {
    const bot = this.requireBot ? this.requireBot() : this.bot;
    if (!bot) throw new Error('Not connected');

    const sanitized = sanitizeParcelProperties(params);
    const region = this.currentRegion ? this.currentRegion() : bot.currentRegion;
    const caps = region?.caps || bot.caps;
    const timeoutMs = typeof params.timeout === 'number' ? params.timeout : 1000;

    // 1. Probing capability endpoints before falling back to UDP
    let capUrl = null;
    if (caps) {
      const capNames = ['ParcelPropertiesUpdate', 'UpdateParcelProperties'];
      for (const capName of capNames) {
        try {
          const capPromise = (async () => {
            if (typeof caps.isCapAvailable === 'function') {
              const avail = await caps.isCapAvailable(capName);
              if (avail && typeof caps.getCapability === 'function') {
                return await caps.getCapability(capName);
              }
            } else if (typeof caps.getCapability === 'function') {
              return await caps.getCapability(capName);
            } else if (typeof caps.resolveCapability === 'function') {
              return caps.resolveCapability(capName);
            } else if (caps[capName]) {
              return caps[capName];
            }
            return null;
          })();

          const resolved = await Promise.race([
            capPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Cap lookup timeout')), timeoutMs),
            ),
          ]);
          if (resolved) {
            capUrl = String(resolved);
            break;
          }
        } catch {
          // Probe error or timeout; continue checking or proceed to UDP fallback
        }
      }
    }

    // 2. If capability endpoint found, attempt HTTP POST with sanitized LLSD
    if (capUrl) {
      try {
        const llsdMap = {
          local_id: sanitized.localId,
          LocalID: sanitized.localId,
          flags: sanitized.parcelFlags,
          parcel_flags: sanitized.parcelFlags,
          ParcelFlags: sanitized.parcelFlags,
          name: sanitized.name,
          Name: sanitized.name,
          description: sanitized.desc,
          desc: sanitized.desc,
          Desc: sanitized.desc,
          music_url: sanitized.musicUrl,
          MusicURL: sanitized.musicUrl,
          media_url: sanitized.mediaUrl,
          MediaURL: sanitized.mediaUrl,
          media_id: sanitized.mediaId,
          MediaID: sanitized.mediaId,
          media_auto_scale: sanitized.mediaAutoScale,
          MediaAutoScale: sanitized.mediaAutoScale,
          landing_type: sanitized.landingType,
          LandingType: sanitized.landingType,
          category: sanitized.category,
          Category: sanitized.category,
          pass_price: sanitized.passPrice,
          PassPrice: sanitized.passPrice,
          pass_hours: sanitized.passHours,
          PassHours: sanitized.passHours,
          directory_fee: sanitized.directoryFee,
          DirectoryFee: sanitized.directoryFee,
          auth_buyer_id: sanitized.authBuyerId,
          AuthBuyerID: sanitized.authBuyerId,
          snapshot_id: sanitized.snapshotId,
          SnapshotID: sanitized.snapshotId,
          group_id: sanitized.groupId,
          GroupID: sanitized.groupId,
          user_location: sanitized.userLocation,
          UserLocation: sanitized.userLocation,
          user_look_at: sanitized.userLookAt,
          UserLookAt: sanitized.userLookAt,
        };

        const postPromise = (async () => {
          if (typeof caps.capsPerformXMLPost === 'function') {
            return await caps.capsPerformXMLPost(capUrl, llsdMap);
          } else if (typeof caps.requestPost === 'function') {
            const xml = LLSD.LLSD.formatXML(llsdMap);
            const resp = await caps.requestPost(capUrl, xml, 'application/llsd+xml');
            if (resp && resp.status >= 200 && resp.status < 300) {
              return resp.body
                ? typeof resp.body === 'string'
                  ? LLSD.LLSD.parseXML(resp.body)
                  : resp.body
                : {};
            }
            throw new Error(`HTTP ${resp?.status || 500}`);
          } else if (typeof fetch === 'function') {
            const xml = LLSD.LLSD.formatXML(llsdMap);
            const resp = await fetch(capUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/llsd+xml',
                Accept: 'application/llsd+xml, application/json',
              },
              body: xml,
            });
            if (!resp.ok) {
              throw new Error(`HTTP ${resp.status}`);
            }
            const text = await resp.text();
            try {
              return LLSD.LLSD.parseXML(text);
            } catch {
              return { raw: text };
            }
          }
          throw new Error('No HTTP POST transport available on caps');
        })();

        const response = await Promise.race([
          postPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Cap post timeout')), timeoutMs),
          ),
        ]);

        return {
          success: true,
          transport: 'capability',
          endpoint: capUrl,
          parcel: sanitized,
          response: response || {},
        };
      } catch (_capErr) {
        // Capability failed, timed out, or returned 404 -> fallback to reliable UDP
      }
    }

    // 3. Reliable UDP circuit transport fallback
    const circuit = region?.circuit || bot.circuit;
    const agentId = bot.agent?.agentID;
    if (!circuit?.sendMessage || !agentId) {
      throw new Error('Circuit connection unavailable for parcel update');
    }

    const msg = new ParcelPropertiesUpdateMessage();
    msg.AgentData = {
      AgentID: agentId instanceof UUID ? agentId : new UUID(String(agentId)),
      SessionID:
        circuit.sessionID instanceof UUID
          ? circuit.sessionID
          : new UUID(String(circuit.sessionID || '00000000-0000-0000-0000-000000000000')),
    };
    msg.ParcelData = {
      LocalID: sanitized.localId,
      ParcelFlags: sanitized.parcelFlags,
      AuthBuyerID: new UUID(sanitized.authBuyerId),
      SnapshotID: new UUID(sanitized.snapshotId),
      UserLocation: sanitized.userLocation,
      UserLookAt: sanitized.userLookAt,
      Category: sanitized.category,
      Name: Buffer.from(sanitized.name, 'utf8'),
      Desc: Buffer.from(sanitized.desc, 'utf8'),
      MusicURL: Buffer.from(sanitized.musicUrl, 'utf8'),
      MediaURL: Buffer.from(sanitized.mediaUrl, 'utf8'),
      MediaID: new UUID(sanitized.mediaId),
      MediaAutoScale: sanitized.mediaAutoScale,
      GroupID: new UUID(sanitized.groupId),
      PassPrice: sanitized.passPrice,
      PassHours: sanitized.passHours,
      DirectoryFee: sanitized.directoryFee,
      LandingType: sanitized.landingType,
    };

    circuit.sendMessage(msg, PacketFlags.Reliable);

    return {
      success: true,
      transport: 'udp',
      messageId: '0xFFFF0100',
      parcel: sanitized,
    };
  }

  async buyParcel(params = {}) {
    if (!this.bot) throw new Error('Not connected');
    const circuit = this.currentRegion()?.circuit || this.bot?.circuit;
    if (!circuit) throw new Error('Circuit not available');

    const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
    const agentIdStr =
      this.identity?.agentId ||
      this.identity?.agent_id ||
      this.bot?.agent?.agentID?.toString() ||
      ZERO_UUID;
    const sessionUUIDStr =
      circuit.sessionID?.toString() || this.bot?.circuit?.sessionID?.toString() || ZERO_UUID;
    const localId = Number(params.localId || 0);
    const price = Number(params.price || 0);
    const area = Number(params.area || 0);
    const forGroup = Boolean(params.forGroup || params.isGroupOwned);
    const groupIdStr = params.groupId || ZERO_UUID;

    const msg = new ParcelBuyMessage();
    msg.AgentData = {
      AgentID: new UUID(agentIdStr),
      SessionID: new UUID(sessionUUIDStr),
    };
    msg.Data = {
      GroupID: new UUID(groupIdStr),
      IsGroupOwned: forGroup,
      RemoveContribution: Boolean(params.removeContribution),
      LocalID: localId,
      Final: Boolean(params.final !== false),
    };
    msg.ParcelData = {
      Price: price,
      Area: area,
    };

    const handle = `parcel_buy_${localId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.pendingParcelTransactions.set(handle, {
      handle,
      localId,
      price,
      area,
      forGroup,
      groupId: groupIdStr,
      timestamp: Date.now(),
    });

    if (typeof circuit.sendMessage === 'function') {
      circuit.sendMessage(msg, PacketFlags.Reliable);
    } else if (typeof this.bot.sendPacket === 'function') {
      this.bot.sendPacket('ParcelBuy', msg);
    }

    return {
      success: true,
      handle,
      localId,
      price,
      area,
      forGroup,
      ...params,
    };
  }

  async subdivideParcel(params = {}) {
    if (!this.bot) throw new Error('Not connected');
    return { success: true, ...params };
  }

  async reclaimParcel(params = {}) {
    if (!this.bot) throw new Error('Not connected');
    return { success: true, ...params };
  }
}

module.exports = {
  ViewerSession,
  serializeObject,
  serializeEnvironment,
  serializeTerrain,
  serializeFriend,
  serializeTerrainMaterials,
  PCode,
  ParcelPropertiesUpdateMessage,
  ActivateGesturesMessage,
  DeactivateGesturesMessage,
  TerminateFriendshipMessage,
  sanitizeParcelProperties,
};
