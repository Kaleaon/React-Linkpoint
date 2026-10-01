import {
  Bot,
  BotOptionFlags,
  LoginParameters,
  PCode,
  AssetType,
  UUID,
} from '@caspertech/node-metaverse';
import type { Response } from 'express';
import { createRequire } from 'node:module';
import { v4 as uuidv4 } from 'uuid';

const require = createRequire(import.meta.url);
const { decodeLLMesh, decodeGLTFMaterial, decodeSculpt, decodeJPEG2000 } = require('../../electron/sl-asset-decoder.cjs') as {
  decodeLLMesh: (buffer: Buffer) => Promise<any>;
  decodeGLTFMaterial: (buffer: Buffer) => any;
  decodeSculpt: (buffer: Buffer, type?: number) => Promise<any>;
  decodeJPEG2000: (buffer: Buffer) => Promise<any>;
};

// Filter out harmless SL packet padding and diagnostic warnings from node-metaverse
const _origConsoleError = console.error;
console.error = function (...args: any[]) {
  if (
    typeof args[0] === 'string' &&
    (args[0].startsWith('WARNING: Finished reading ') ||
     args[0].includes("not at the end of the packet") ||
     args[0].startsWith('WARNING: Bytes written does not match') ||
     args[0].startsWith('WARNING: BUFFER UNDERFLOW'))
  ) {
    return;
  }
  _origConsoleError.apply(console, args);
};

export interface SLSessionData {
  sessionId: string;
  bot: Bot;
  agentId: string;
  firstName: string;
  lastName: string;
  simName: string;
  inventoryRootId: string;
  subscriptions: Array<{ unsubscribe: () => void }>;
  eventClients: Response[];
  lastActive: number;
  assetRequests: Map<string, Promise<void>>;
  decodedAssets: Map<string, any>;
  friendPresence: Map<string, boolean>;
}

const sessions = new Map<string, SLSessionData>();

function finite(value: any, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function vector(value: any, fallback = [0, 0, 0]): [number, number, number] {
  return value ? [finite(value.x), finite(value.y), finite(value.z)] : (fallback as [number, number, number]);
}

function serializableValue(value: any): any {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value as any, serializableValue);
  if (value instanceof Map) return Object.fromEntries([...value].map(([key, item]) => [String(key), serializableValue(item)]));
  if (typeof value?.toArray === 'function') return value.toArray().map(serializableValue);
  const result: Record<string, any> = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (typeof item !== 'function' && !key.startsWith('_')) result[key] = serializableValue(item);
  }
  return result;
}

function serializeEnvironment(environment: any) {
  if (!environment) return null;
  const cycle = environment.dayCycle;
  const frames = cycle?.frames instanceof Map ? [...cycle.frames.values()] : [];
  const sky = frames.find((frame: any) => frame?.type === 'sky') || frames.find((frame: any) => frame?.sunlightColor || frame?.blueHorizon);
  const water = frames.find((frame: any) => frame?.type === 'water') || frames.find((frame: any) => frame?.waterFogColor);
  return {
    regionId: environment.regionID?.toString?.() || null,
    parcelId: (environment.parcelID?.toString?.() || environment.parcelID) ?? null,
    dayLength: finite(environment.dayLength), dayOffset: finite(environment.dayOffset),
    trackAltitudes: serializableValue(environment.trackAltitudes) || null,
    currentSky: serializableValue(sky), water: serializableValue(water), dayCycle: serializableValue(cycle),
  };
}

function serializeTerrain(region: any) {
  const size = 256;
  if (!region?.terrain || region.terrain.length < size) return null;
  const heights = new Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) heights[y * size + x] = finite(region.terrain[x]?.[y]);
  return { size, heights };
}

function primAppearance(object: any) {
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
  const component = (method: string, property: string, fallback: number) => {
    const value = typeof rgba?.[method] === 'function' ? rgba[method]() : rgba?.[property];
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  };
  const faceCount = Math.max(1, object.TextureEntry?.faces?.length || 0);
  const faceTextures = Array.from({ length: faceCount }, (_, faceIndex) => {
    const face = object.TextureEntry?.getEffectiveEntryForFace?.(faceIndex) || object.TextureEntry?.faces?.[faceIndex] || object.TextureEntry?.defaultTexture;
    const faceRgba = face?.rgba;
    const channel = (method: string, property: string, fallback: number) => {
      const value = typeof faceRgba?.[method] === 'function' ? faceRgba[method]() : faceRgba?.[property];
      return Number.isFinite(Number(value)) ? Number(value) : fallback;
    };
    const id = face?.textureID?.toString?.();
    const materialParam = renderMaterials?.params?.find((param: any) => Number(param.textureIndex) === faceIndex);
    const materialId = materialParam?.textureUUID?.toString?.() || null;
    const override = object.TextureEntry?.gltfMaterialOverrides?.get?.(faceIndex) || null;
    return {
      textureId: id && id !== '00000000-0000-0000-0000-000000000000' ? id : null,
      color: [channel('getRed', 'red', 1), channel('getGreen', 'green', 1), channel('getBlue', 'blue', 1), channel('getAlpha', 'alpha', 1)],
      repeat: [finite(face?.repeatU, 1), finite(face?.repeatV, 1)],
      offset: [finite(face?.offsetU), finite(face?.offsetV)],
      rotation: finite(face?.rotation),
      fullBright: Boolean(face?.fullBright),
      materialId,
      materialOverride: override ? JSON.parse(JSON.stringify(override)) : null,
    };
  });
  return {
    // SL's standard sphere is a half-circle profile swept around a circle;
    // straight circular profiles are cylinders. Unsupported parametric shapes
    // retain all their shape parameters while using a cube fallback for now.
    shape: asset ? 'asset-proxy' : path === 0x20 && profile === 0x05 ? 'sphere' : path === 0x20 ? 'torus' : path === 0x10 && (profile === 0x02 || profile === 0x03 || profile === 0x04) ? 'prism' : path === 0x10 && profile === 0x00 ? 'cylinder' : 'cube',
    assetKind: meshData ? 'mesh' : sculptData ? 'sculpt' : null,
    assetId: asset?.toString?.() || null,
    textureId,
    faceTextures,
    reflectionProbe: reflection ? {
      ambiance: finite(reflection.ambiance), clipDistance: finite(reflection.clipDistance), flags: finite(reflection.flags),
      box: Boolean(reflection.flags & 0x01), dynamic: Boolean(reflection.flags & 0x02), mirror: Boolean(reflection.flags & 0x04),
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

function serializeObject(event: any) {
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

export async function createSLSession(params: {
  loginUrl: string;
  username: string;
  password: string;
  start?: string;
}) {
  const names = params.username.replace(/[._]/g, ' ').trim().split(/\s+/);
  const firstName = names[0];
  const lastName = names.length > 1 ? names[1] : 'Resident';

  const loginParams = new LoginParameters();
  loginParams.firstName = firstName;
  loginParams.lastName = lastName;
  loginParams.password = params.password;
  loginParams.start = params.start || 'last';
  loginParams.url = params.loginUrl || 'https://login.agni.lindenlab.com/cgi-bin/login.cgi';

  const bot = new Bot(loginParams, BotOptionFlags.None);
  const sessionId = uuidv4();
  const sessionData: SLSessionData = {
    sessionId,
    bot,
    agentId: '',
    firstName,
    lastName,
    simName: '',
    inventoryRootId: '',
    subscriptions: [],
    eventClients: [],
    lastActive: Date.now(),
    assetRequests: new Map(),
    decodedAssets: new Map(),
    friendPresence: new Map(),
  };

  const broadcastEvent = (type: string, data: any) => {
    sessionData.lastActive = Date.now();
    const payload = JSON.stringify({ type, data });
    for (const client of sessionData.eventClients) {
      client.write(`data: ${payload}\n\n`);
    }
  };

  const events = bot.clientEvents;

  sessionData.subscriptions.push(
    events.onParcelPropertiesEvent.subscribe((parcel: any) => {
      broadcastEvent('parcel-properties', {
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
      });
    })
  );

  sessionData.subscriptions.push(
    events.onAvatarEnteredRegion.subscribe((avatar: any) => {
      const id = avatar.getKey?.()?.toString?.() || avatar.id?.toString?.() || avatar.uuid?.toString?.();
      const name = avatar.getName?.() || [avatar.firstName, avatar.lastName].filter(Boolean).join(' ') || '';
      const position = vector(avatar.coarsePosition || avatar.position);
      broadcastEvent('coarse-avatar', {
        id,
        name,
        position,
      });
      broadcastEvent('avatar_presence', {
        id,
        agentId: id,
        name,
        coordinates: position,
        position,
        presence: 'entered',
        online: true,
      });

      if (avatar.onMoved && typeof avatar.onMoved.subscribe === 'function') {
        sessionData.subscriptions.push(
          avatar.onMoved.subscribe((movedAv: any) => {
            const movedPos = vector(movedAv.position || movedAv.coarsePosition);
            broadcastEvent('avatar_presence', {
              id,
              agentId: id,
              name,
              coordinates: movedPos,
              position: movedPos,
              presence: 'online',
              online: true,
            });
          })
        );
      }
      if (avatar.onLeftRegion && typeof avatar.onLeftRegion.subscribe === 'function') {
        sessionData.subscriptions.push(
          avatar.onLeftRegion.subscribe(() => {
            broadcastEvent('avatar_presence', {
              id,
              agentId: id,
              name,
              presence: 'left',
              online: false,
              left: true,
            });
          })
        );
      }
    })
  );

  const loadObjectAsset = (object: any) => {
    const appearance = primAppearance(object);
    if (!appearance.assetId || sessionData.assetRequests.has(appearance.assetId)) return;
    const request = (async () => {
      const type = appearance.assetKind === 'mesh' ? AssetType.Mesh : AssetType.Texture;
      const buffer = await bot.clientCommands.asset.downloadAsset(type, appearance.assetId!);
      const geometry = appearance.assetKind === 'mesh'
        ? await decodeLLMesh(buffer)
        : await decodeSculpt(buffer, (object.SculptData || object.extraParams?.sculptData)?.type);
      const payload = { assetId: appearance.assetId, assetKind: appearance.assetKind, geometry };
      sessionData.decodedAssets.set(appearance.assetId!, payload);
      broadcastEvent('asset-ready', payload);
    })().catch((error: Error) => {
      broadcastEvent('asset-error', { assetId: appearance.assetId, message: error.message });
    });
    sessionData.assetRequests.set(appearance.assetId, request);
  };

  const loadObjectTexture = (object: any) => {
    const appearance = primAppearance(object);
    const assetIds = new Set([appearance.textureId, ...appearance.faceTextures.map((face: any) => face.textureId)].filter(Boolean));
    for (const assetId of assetIds) {
      if (sessionData.assetRequests.has(`texture:${assetId}`)) continue;
      const request = (async () => {
        const buffer = await bot.clientCommands.asset.downloadAsset(AssetType.Texture, assetId!);
        const texture = await decodeJPEG2000(buffer);
        const payload = { assetId, ...texture };
        sessionData.decodedAssets.set(`texture:${assetId}`, { type: 'texture-ready', data: payload });
        broadcastEvent('texture-ready', payload);
      })().catch((error: Error) => broadcastEvent('asset-error', { assetId, message: error.message }));
      sessionData.assetRequests.set(`texture:${assetId}`, request);
    }
  };

  const loadObjectMaterials = (object: any) => {
    const appearance = primAppearance(object);
    const materialIds = new Set(appearance.faceTextures.map((face: any) => face.materialId).filter(Boolean));
    for (const assetId of materialIds) {
      const key = `material:${assetId}`;
      if (sessionData.assetRequests.has(key)) continue;
      const request = (async () => {
        const buffer = await bot.clientCommands.asset.downloadAsset(AssetType.Material, assetId as string);
        const material = decodeGLTFMaterial(buffer);
        const payload = { assetId, material };
        sessionData.decodedAssets.set(key, { type: 'material-ready', data: payload });
        broadcastEvent('material-ready', payload);
        for (const texture of Object.values(material.textures || {}) as any[]) {
          const textureId = texture?.textureId;
          const textureKey = `texture:${textureId}`;
          if (!textureId || sessionData.assetRequests.has(textureKey)) continue;
          const textureRequest = (async () => {
            const image = await bot.clientCommands.asset.downloadAsset(AssetType.Texture, textureId);
            const decoded = await decodeJPEG2000(image);
            const texturePayload = { assetId: textureId, ...decoded };
            sessionData.decodedAssets.set(textureKey, { type: 'texture-ready', data: texturePayload });
            broadcastEvent('texture-ready', texturePayload);
          })().catch((error: Error) => broadcastEvent('asset-error', { assetId: textureId, message: error.message }));
          sessionData.assetRequests.set(textureKey, textureRequest);
        }
      })().catch((error: Error) => broadcastEvent('asset-error', { assetId, message: error.message }));
      sessionData.assetRequests.set(key, request);
    }
  };

  // Real Second Life nearby chat
  sessionData.subscriptions.push(
    events.onNearbyChat.subscribe((event: any) => {
      broadcastEvent('chat', {
        id: uuidv4(),
        fromId: event.from?.toString(),
        fromName: event.fromName || 'Unknown',
        message: event.message,
        chatType: event.chatType ?? 1,
        channel: event.channel ?? 0,
        position: vector(event.position),
        timestamp: Date.now(),
      });
    })
  );

  // Real Second Life Instant Messages
  sessionData.subscriptions.push(
    events.onInstantMessage.subscribe((event: any) => {
      broadcastEvent('im', {
        id: uuidv4(),
        fromId: event.from?.toString(),
        fromName: event.fromName || 'Resident',
        message: event.message,
        dialog: event.dialog,
        timestamp: Date.now(),
      });
    })
  );

  // Real Second Life objects in current region
  sessionData.subscriptions.push(
    events.onNewObjectEvent.subscribe((event: any) => {
      broadcastEvent('object-add', serializeObject(event));
      loadObjectAsset(event.object);
      loadObjectTexture(event.object);
      loadObjectMaterials(event.object);
    })
  );
  sessionData.subscriptions.push(
    events.onObjectUpdatedEvent.subscribe((event: any) => {
      broadcastEvent('object-update', serializeObject(event));
      loadObjectAsset(event.object);
      loadObjectTexture(event.object);
      loadObjectMaterials(event.object);
    })
  );
  sessionData.subscriptions.push(
    events.onObjectUpdatedTerseEvent.subscribe((event: any) => {
      broadcastEvent('object-update', serializeObject(event));
    })
  );
  sessionData.subscriptions.push(
    events.onObjectKilledEvent.subscribe((event: any) => {
      broadcastEvent('object-remove', {
        id: event.objectID?.toString() || String(event.localID),
        localId: event.localID,
      });
    })
  );

  // Disconnection from simulator
  sessionData.subscriptions.push(
    events.onDisconnected.subscribe((event: any) => {
      broadcastEvent('disconnected', { message: event.message || 'Disconnected from Second Life' });
    })
  );

  // Real Second Life Friends events
  sessionData.subscriptions.push(
    events.onFriendOnline.subscribe((event: any) => {
      const friendId = event.friend?.getKey?.()?.toString() || event.friend?.id?.toString() || event.friend?.uuid?.toString();
      const friendName = (event.friend as any)?.name || event.friend?.getName?.() || 'Resident';
      if (friendId) sessionData.friendPresence.set(friendId.toLowerCase(), Boolean(event.online));
      broadcastEvent('friend-status', {
        id: friendId,
        name: friendName,
        online: Boolean(event.online),
      });
    })
  );

  sessionData.subscriptions.push(
    events.onFriendRequest.subscribe((event: any) => {
      broadcastEvent('friend-request', {
        requestId: event.requestID?.toString(),
        fromId: event.from?.toString(),
        fromName: event.fromName || 'Resident',
        message: event.message,
      });
    })
  );

  sessionData.subscriptions.push(
    events.onFriendResponse.subscribe((event: any) => {
      broadcastEvent('friend-response', {
        fromId: event.from?.toString(),
        fromName: event.fromName || 'Resident',
        accepted: Boolean(event.accepted),
      });
    })
  );

  sessionData.subscriptions.push(
    events.onFriendRemoved.subscribe((event: any) => {
      const friendId = event.friend?.getKey?.()?.toString() || event.friend?.id?.toString();
      broadcastEvent('friend-remove', {
        id: friendId,
      });
    })
  );

  // Perform genuine login to Second Life XML-RPC service
  const reply = await bot.login();
  try {
    await bot.connectToSim();
  } catch (simErr) {
    console.warn('[SL Session] connectToSim warning:', simErr);
  }

  const region = bot.currentRegion;
  let agentId = '';
  try {
    if (typeof bot.agentID === 'function') {
      const idVal = bot.agentID();
      agentId = idVal ? idVal.toString() : '';
    }
  } catch {}
  if (!agentId || agentId.includes('function') || agentId.includes('agentID()')) {
    try {
      const idVal = bot.agent?.agentID;
      agentId = idVal ? idVal.toString() : '';
    } catch {}
  }
  if (!agentId || agentId.includes('function') || agentId.includes('agentID()')) {
    agentId = uuidv4();
  }
  sessionData.agentId = agentId;
  sessionData.simName = region?.regionName || '';

  // Get root inventory folder if available
  try {
    const rootFolder = bot.clientCommands?.inventory?.getInventoryRoot();
    if (rootFolder?.folderID) {
      sessionData.inventoryRootId = rootFolder.folderID.toString();
    }
  } catch {
    // Inventory root can be fetched on demand
  }

  sessions.set(sessionId, sessionData);
  const worldData = {
    region: { name: region?.regionName || null, x: region?.xCoordinate, y: region?.yCoordinate },
    environment: serializeEnvironment(region?.environment),
  };
  region?.waitForTerrain?.().then(() => broadcastEvent('terrain', serializeTerrain(region))).catch(() => {});

  return {
    sessionId,
    login: true,
    agent_id: agentId,
    first_name: firstName,
    last_name: lastName,
    sim_name: sessionData.simName || null,
    circuit_code: region?.circuit?.circuitCode || 1001,
    region_x: Number.isFinite(region?.xCoordinate) ? region.xCoordinate : null,
    region_y: Number.isFinite(region?.yCoordinate) ? region.yCoordinate : null,
    inventory_root: sessionData.inventoryRootId,
    message: reply?.loginMessage || 'Connected to Second Life',
    world_data: worldData,
  };
}

export function getSLSession(sessionId: string): SLSessionData | undefined {
  return sessions.get(sessionId);
}

export async function sendSLChat(sessionId: string, message: string, channel = 0, type = 1) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) throw new Error('Not connected to Second Life');

  const comms = session.bot.clientCommands?.comms;
  if (!comms) throw new Error('Second Life communications interface unavailable');

  if (type === 0) {
    await comms.whisper(message, channel);
  } else if (type === 2) {
    await comms.shout(message, channel);
  } else {
    await comms.say(message, channel);
  }
}

export async function sendSLInstantMessage(sessionId: string, to: string, message: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) throw new Error('Not connected to Second Life');

  const comms = session.bot.clientCommands?.comms;
  if (!comms) throw new Error('Second Life communications interface unavailable');

  await comms.sendInstantMessage(to, message);
}

export async function sendSLGroupMessage(sessionId: string, groupId: string, message: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) throw new Error('Not connected to Second Life');

  const comms = session.bot.clientCommands?.comms;
  if (!comms) throw new Error('Second Life communications interface unavailable');

  if (typeof comms.sendGroupMessage === 'function') {
    await comms.sendGroupMessage(groupId, message);
  } else {
    throw new Error('Group messaging not supported by this connection');
  }
}

export function getSLDiagnostics(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) {
    return {
      connected: false,
      state: 'DISCONNECTED',
      latencyMs: null,
      packetLossPct: 0,
      capabilities: 0,
      circuitCode: 0,
      simAddress: '',
      simPort: 0,
    };
  }

  const bot = session.bot;
  const currentRegion: any = bot.currentRegion;
  const circuit: any = currentRegion?.circuit;

  return {
    connected: true,
    state: 'CONNECTED',
    latencyMs: typeof circuit?.ping === 'number' ? circuit.ping : null,
    packetLossPct: typeof circuit?.packetLoss === 'number' ? circuit.packetLoss : 0,
    capabilities: Object.keys(currentRegion?.caps || currentRegion?.capabilities || {}).length,
    circuitCode: circuit?.circuitCode || 1001,
    simAddress: currentRegion?.ip || circuit?.ip || '',
    simPort: currentRegion?.port || circuit?.port || 0,
    regionName: currentRegion?.regionName || currentRegion?.name || '',
    fps: currentRegion?.fps || 45,
    timeDilation: currentRegion?.timeDilation || 1.0,
  };
}

export async function sendSLFriendRequest(sessionId: string, to: string, message: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) throw new Error('Not connected to Second Life');

  const friends = session.bot.clientCommands?.friends;
  if (!friends) throw new Error('Second Life friends interface unavailable');

  await friends.sendFriendRequest(to, message);
}

export async function fetchSLFriends(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) throw new Error('Not connected to Second Life');

  const bot = session.bot;
  const buddyList = bot.agent?.buddyList || [];
  const friendCommands = bot.clientCommands?.friends;
  const results: Array<{ id: string; name: string; onlineStatus: string; rightsGiven: boolean; rightsHas: boolean; rightsGivenMask: number; rightsHasMask: number }> = [];

  const unresolvedIds: any[] = [];
  for (const b of buddyList) {
    const friendId = b.buddyID?.toString();
    const existing = friendCommands?.getFriend(b.buddyID);
    if (existing) {
      results.push({
        id: friendId,
        name: existing.getName?.() || (existing as any).name || 'Friend',
        onlineStatus: (session.friendPresence.get(friendId.toLowerCase()) ?? Boolean(existing.online)) ? 'online' : 'offline',
        rightsGiven: Boolean(b.buddyRightsGiven),
        rightsHas: Boolean(b.buddyRightsHas),
        rightsGivenMask: Number(b.buddyRightsGiven) || 0,
        rightsHasMask: Number(b.buddyRightsHas) || 0,
      });
    } else {
      unresolvedIds.push(b.buddyID);
    }
  }

  if (unresolvedIds.length > 0 && bot.clientCommands?.grid) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < unresolvedIds.length; i += BATCH_SIZE) {
      const batch = unresolvedIds.slice(i, i + BATCH_SIZE);
      try {
        const resolved = await bot.clientCommands.grid.avatarKey2Name(batch);
        const list = Array.isArray(resolved) ? resolved : [resolved];
        for (const res of list) {
          if (!res) continue;
          const friendId = res.getKey?.()?.toString();
          const buddyInfo = buddyList.find((b: any) => b.buddyID?.toString() === friendId);
          results.push({
            id: friendId,
            name: res.getName?.() || `${res.getFirstName?.()} ${res.getLastName?.()}`.trim() || 'Resident',
            onlineStatus: session.friendPresence.get(friendId.toLowerCase()) ? 'online' : 'offline',
            rightsGiven: Boolean(buddyInfo?.buddyRightsGiven),
            rightsHas: Boolean(buddyInfo?.buddyRightsHas),
            rightsGivenMask: Number(buddyInfo?.buddyRightsGiven) || 0,
            rightsHasMask: Number(buddyInfo?.buddyRightsHas) || 0,
          });
        }
      } catch (nameErr) {
        console.warn('[SL Session] avatarKey2Name batch resolution warning:', nameErr);
        for (const b of batch) {
          const friendId = b.toString();
          if (!results.some(r => r.id === friendId)) {
            const buddyInfo = buddyList.find((b: any) => b.buddyID?.toString() === friendId);
            results.push({
              id: friendId,
              name: `Resident (${friendId.slice(0, 8)})`,
              onlineStatus: session.friendPresence.get(friendId.toLowerCase()) ? 'online' : 'offline',
              rightsGiven: Boolean(buddyInfo?.buddyRightsGiven),
              rightsHas: Boolean(buddyInfo?.buddyRightsHas),
              rightsGivenMask: Number(buddyInfo?.buddyRightsGiven) || 0,
              rightsHasMask: Number(buddyInfo?.buddyRightsHas) || 0,
            });
          }
        }
      }
    }
  }

  return results;
}

export async function fetchSLGroups(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) throw new Error('Not connected to Second Life');

  const bot = session.bot;
  const agentId = session.agentId;
  if (!bot.clientCommands?.agent) return [];

  try {
    const rawGroups = await bot.clientCommands.agent.getAvatarGroups(agentId);
    const list = Array.isArray(rawGroups) ? rawGroups : [rawGroups];
    return list.filter(Boolean).map((g: any) => ({
      id: g.GroupID?.toString?.() || String(g.GroupID),
      name: g.GroupName || 'Group',
      title: g.GroupTitle || '',
      insignia: g.GroupInsigniaID?.toString?.() || '',
      acceptNotices: Boolean(g.AcceptNotices),
      powers: g.GroupPowers?.toString?.() || '',
    }));
  } catch (err: any) {
    console.warn('[SL Session] getAvatarGroups warning:', err);
    return [];
  }
}

export async function fetchSLInventory(sessionId: string, targetFolderId?: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) throw new Error('Not connected to Second Life');

  const bot = session.bot;
  const invCmds = bot.clientCommands?.inventory;
  if (!invCmds) throw new Error('Second Life inventory interface unavailable');

  const rootFolder = invCmds.getInventoryRoot();
  if (!rootFolder) {
    return { folders: [], items: [] };
  }

  let folder = rootFolder;
  if (targetFolderId && targetFolderId !== rootFolder.folderID.toString()) {
    try {
      const targetUuid = new UUID(targetFolderId);
      const skeletonFolder = bot.agent?.inventory?.main?.skeleton?.get(targetFolderId);
      if (skeletonFolder) {
        folder = skeletonFolder;
      } else {
        const found = rootFolder.findFolder(targetUuid);
        if (found) folder = found;
      }
    } catch {
      // Use root
    }
  }

  try {
    await folder.populate();
  } catch (err) {
    console.warn('[SL Inventory] folder.populate warning:', err);
  }

  const skeleton = bot.agent?.inventory?.main?.skeleton;
  let foldersList: any[] = [];
  if (skeleton && (!targetFolderId || targetFolderId === rootFolder.folderID.toString())) {
    foldersList = Array.from(skeleton.values()).map((f: any) => ({
      id: f.folderID?.toString(),
      name: f.name || 'Unnamed Folder',
      parent: f.parentID?.toString(),
      typeDefault: f.typeDefault,
      folder: true,
    }));
  } else {
    foldersList = (folder.getChildFolders() || []).map((f: any) => ({
      id: f.folderID?.toString(),
      name: f.name || 'Unnamed Folder',
      parent: f.parentID?.toString(),
      typeDefault: f.typeDefault,
      folder: true,
    }));
  }

  const items = (folder.items || []).map((item: any) => ({
    id: item.itemID?.toString(),
    name: item.name || 'Unnamed Item',
    parent: item.parentID?.toString(),
    assetType: item.assetType,
    inventoryType: item.inventoryType,
    description: item.description || '',
    folder: false,
  }));

  return {
    folderId: folder.folderID?.toString(),
    folderName: folder.name,
    folders: foldersList,
    items,
  };
}

export function fetchSLSceneObjects(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session || !session.bot) return [];

  const region = session.bot.currentRegion;
  if (!region || !region.objects) return [];

  try {
    const rawObjects = region.objects.getAllObjects({ includeAvatars: true }) || [];
    return rawObjects.map((obj: any) => {
      const rotation = obj.Rotation || { x: 0, y: 0, z: 0, w: 1 };
      return {
        id: obj.FullID?.toString() || String(obj.ID || obj.localID),
        localId: obj.ID || obj.localID,
        parentId: obj.ParentID || 0,
        pcode: obj.PCode,
        avatar: obj.PCode === PCode.Avatar,
        position: vector(obj.Position),
        scale: vector(obj.Scale, [0.5, 0.5, 0.5]),
        rotation: [finite(rotation.x), finite(rotation.y), finite(rotation.z), finite(rotation.w, 1)],
        name: obj.name || '',
        ...primAppearance(obj),
      };
    });
  } catch (err) {
    console.warn('[SL Session] getAllObjects warning:', err);
    return [];
  }
}

export function fetchSLSceneAssets(sessionId: string) {
  return Array.from(sessions.get(sessionId)?.decodedAssets.values() || []);
}

export function closeSLSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return;

  for (const sub of session.subscriptions) {
    try {
      sub.unsubscribe();
    } catch {
      // Ignore
    }
  }

  for (const client of session.eventClients) {
    try {
      client.end();
    } catch {
      // Ignore
    }
  }

  try {
    session.bot.close();
  } catch {
    // Ignore
  }

  sessions.delete(sessionId);
}
