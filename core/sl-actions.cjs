'use strict';
// Viewer actions shared by the web server (src/server/sl-session.ts) and the
// desktop app (core/viewer-session.cjs), so the two backends cannot drift.
//
// Every function takes the connected bot and validated, plain-data arguments,
// and returns plain data. Inputs are checked here, because they arrive from the
// renderer process / browser and are used to drive a live account. Nothing here
// invents a result: a call either reports what the grid answered or throws.
//
// Protocol facts below come from Lumiya's recovered code, checked against its
// smali: SLObjectInfo.attachmentIDFromState and SLAttachmentPoint.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Attachment point names, indexed by id. 31-38 are the HUD points.
const ATTACHMENT_NAMES = {
  1: 'Chest',
  2: 'Skull',
  3: 'Left Shoulder',
  4: 'Right Shoulder',
  5: 'Left Hand',
  6: 'Right Hand',
  7: 'Left Foot',
  8: 'Right Foot',
  9: 'Spine',
  10: 'Pelvis',
  11: 'Mouth',
  12: 'Chin',
  13: 'Left Ear',
  14: 'Right Ear',
  15: 'Left Eyeball',
  16: 'Right Eyeball',
  17: 'Nose',
  18: 'R Upper Arm',
  19: 'R Forearm',
  20: 'L Upper Arm',
  21: 'L Forearm',
  22: 'Right Hip',
  23: 'R Upper Leg',
  24: 'R Lower Leg',
  25: 'Left Hip',
  26: 'L Upper Leg',
  27: 'L Lower Leg',
  28: 'Stomach',
  29: 'Left Pec',
  30: 'Right Pec',
  31: 'Center 2',
  32: 'Top Right',
  33: 'Top',
  34: 'Top Left',
  35: 'Center',
  36: 'Bottom Left',
  37: 'Bottom',
  38: 'Bottom Right',
  39: 'Neck',
  40: 'Avatar Center',
  41: 'Left Ring Finger',
  42: 'Right Ring Finger',
  43: 'Tail Base',
  44: 'Tail Tip',
  45: 'Left Wing',
  46: 'Right Wing',
  47: 'Jaw',
  48: 'Alt Left Ear',
  49: 'Alt Right Ear',
  50: 'Alt Left Eye',
  51: 'Alt Right Eye',
  52: 'Tongue',
  53: 'Groin',
  54: 'Left Hind Foot',
  55: 'Right Hind Foot',
};
const isHudPoint = (id) => id >= 31 && id <= 38;

/**
 * Attachment point from the ObjectUpdate "State" byte: the two nibbles are
 * swapped. (Lumiya: ((s & 0xF0) >> 4) | ((s & 0x0F) << 4).)
 */
function attachmentIdFromState(state) {
  const s = Number(state) & 0xff;
  return ((s & 0xf0) >> 4) | ((s & 0x0f) << 4);
}

/**
 * Attachment details for a node-metaverse GameObject. node-metaverse keeps the
 * raw wire byte in `attachmentPoint` and the already-swapped value in `State`
 * for attachments, so both are accepted and must name a known point. Objects
 * that are not attachments report point 0.
 */
function attachmentInfo(object) {
  if (!object || !object.IsAttachment)
    return { attachmentPoint: 0, attachmentName: null, isHud: false };
  const candidates = [
    Number(object.State),
    attachmentIdFromState(object.attachmentPoint),
    Number(object.attachmentPoint),
    attachmentIdFromState(object.State),
  ];
  const id = candidates.find((value) => Number.isInteger(value) && ATTACHMENT_NAMES[value]) || 0;
  return {
    attachmentPoint: id,
    attachmentName: ATTACHMENT_NAMES[id] || null,
    isHud: isHudPoint(id),
  };
}

const finite = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number`);
  return number;
};

function requireUuid(value, label = 'id') {
  const text = String(value || '');
  if (!UUID_PATTERN.test(text) || text === ZERO_UUID)
    throw new Error(`${label} must be a valid UUID`);
  return text;
}

function loadLibrary(lib) {
  return lib || require('@caspertech/node-metaverse');
}

function commands(bot) {
  const c = bot && bot.clientCommands;
  if (!c) throw new Error('Not connected to Second Life');
  return c;
}

/** Parse a secondlife:// or maps.secondlife.com URL, or "Region/x/y/z". */
function parseDestination(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Enter a destination');
  let path = raw;
  const url = raw.match(
    /^(?:secondlife:\/\/(?:\/app\/teleport\/)?|https?:\/\/maps\.secondlife\.com\/secondlife\/)(.+)$/i,
  );
  if (url) path = url[1];
  const parts = path
    .split('/')
    .map((part) => decodeURIComponent(part.trim()))
    .filter((part, i) => part || i > 0);
  const region = parts[0];
  if (!region) throw new Error('Destination has no region name');
  const [x, y, z] = [parts[1], parts[2], parts[3]].map((part) =>
    part === undefined || part === '' ? undefined : Number(part),
  );
  // A destination without coordinates means the region's default spot. The grid
  // treats an omitted SLURL position as the region centre, so that is what is requested.
  const coordinates = { x: x ?? 128, y: y ?? 128, z: z ?? 30 };
  for (const [axis, value] of Object.entries(coordinates)) {
    if (!Number.isFinite(value)) throw new Error(`Coordinate ${axis} is not a number`);
  }
  if (coordinates.x < 0 || coordinates.x > 256 || coordinates.y < 0 || coordinates.y > 256)
    throw new Error('Coordinates must be within the region (0-256)');
  if (coordinates.z < -100 || coordinates.z > 4096) throw new Error('Altitude is out of range');
  return { region, ...coordinates };
}

async function teleport(bot, params, lib) {
  const { Vector3 } = loadLibrary(lib);
  const target = params.region
    ? {
        region: String(params.region),
        x: finite(params.x, 'x'),
        y: finite(params.y, 'y'),
        z: finite(params.z, 'z'),
      }
    : parseDestination(params.destination);
  const result = await commands(bot).teleport.teleportTo(
    target.region,
    new Vector3([target.x, target.y, target.z]),
    new Vector3([0, 1, 0]),
  );
  return { requested: target, message: result && result.message ? String(result.message) : '' };
}

/**
 * Touch an object. `face`, `uv` and `st` are optional; when the viewer could not
 * work out which face was hit they are left out and the library's defaults apply,
 * which scripts then see as face 0 / zero coordinates.
 */
async function touchObject(bot, params, lib) {
  const { UUID, Vector3 } = loadLibrary(lib);
  const hasId = params.id !== undefined && params.id !== null && params.id !== '';
  const hasLocal = Number.isInteger(params.localId) && params.localId > 0;
  if (!hasId && !hasLocal) throw new Error('A target object is required');
  const target = hasLocal ? params.localId : new UUID(requireUuid(params.id, 'object id'));
  const face = params.face === undefined ? undefined : Math.floor(finite(params.face, 'face'));
  if (face !== undefined && (face < 0 || face > 255)) throw new Error('face is out of range');
  const vec = (value, label) =>
    value === undefined
      ? undefined
      : new Vector3(
          (Array.isArray(value) ? value : [value.x, value.y, value.z])
            .slice(0, 3)
            .map((n) => finite(n, label)),
        );
  await commands(bot).region.touchObject(
    target,
    undefined,
    vec(params.uv, 'uv'),
    vec(params.st, 'st'),
    face,
    vec(params.position, 'position'),
  );
  return { touched: hasLocal ? params.localId : String(params.id) };
}

async function sit(bot, params, lib) {
  const { UUID, Vector3 } = loadLibrary(lib);
  if (!params || !params.id) {
    commands(bot).movement.sitOnGround();
    return { sitting: 'ground' };
  }
  await commands(bot).movement.sitOnObject(
    new UUID(requireUuid(params.id, 'object id')),
    new Vector3([0, 0, 0]),
  );
  return { sitting: String(params.id) };
}

function stand(bot) {
  commands(bot).movement.stand();
  return { standing: true };
}

// ---- building protocol actions ---------------------------------------------

const SHAPE_DEFAULTS = {
  box: { pathCurve: 16, profileCurve: 1 },
  cube: { pathCurve: 16, profileCurve: 1 },
  cylinder: { pathCurve: 16, profileCurve: 0 },
  cone: { pathCurve: 16, profileCurve: 0 },
  prism: { pathCurve: 16, profileCurve: 2 },
  sphere: { pathCurve: 32, profileCurve: 5 },
  torus: { pathCurve: 32, profileCurve: 0 },
  tube: { pathCurve: 32, profileCurve: 1 },
  ring: { pathCurve: 32, profileCurve: 2 },
};

function getSessionCircuit(bot) {
  let region = null;
  try {
    region =
      bot?.currentRegion ||
      (typeof bot?.getCurrentRegion === 'function' ? bot.getCurrentRegion() : null);
  } catch {
    region = null;
  }
  const circuit =
    region?.circuit ||
    bot?.circuit ||
    bot?.clientCommands?.region?.circuit ||
    bot?.clientCommands?.circuit;
  const agentID = bot?.agent?.agentID || bot?.agentID || bot?.clientCommands?.agent?.agentID;
  const sessionID = circuit?.sessionID || bot?.sessionID || (agentID ? agentID : undefined);
  return { region, circuit, agentID, sessionID };
}

function resolveMessages(lib) {
  const loaded = loadLibrary(lib);
  const getCls = (name, relativePath, fallback) => {
    if (loaded && loaded[name]) return loaded[name];
    try {
      return require(relativePath)[name];
    } catch {
      return fallback;
    }
  };

  const ObjectAddMessage = getCls(
    'ObjectAddMessage',
    '@caspertech/node-metaverse/dist/lib/classes/messages/ObjectAdd',
    class ObjectAddMessage {},
  );
  const ObjectLinkMessage = getCls(
    'ObjectLinkMessage',
    '@caspertech/node-metaverse/dist/lib/classes/messages/ObjectLink',
    class ObjectLinkMessage {},
  );
  const ObjectDelinkMessage = getCls(
    'ObjectDelinkMessage',
    '@caspertech/node-metaverse/dist/lib/classes/messages/ObjectDelink',
    class ObjectDelinkMessage {},
  );
  const ObjectShapeMessage = getCls(
    'ObjectShapeMessage',
    '@caspertech/node-metaverse/dist/lib/classes/messages/ObjectShape',
    class ObjectShapeMessage {},
  );
  const DeRezObjectMessage = getCls(
    'DeRezObjectMessage',
    '@caspertech/node-metaverse/dist/lib/classes/messages/DeRezObject',
    class DeRezObjectMessage {},
  );
  const Quaternion = getCls(
    'Quaternion',
    '@caspertech/node-metaverse/dist/lib/classes/Quaternion',
    class Quaternion {
      constructor(x, y, z, w) {
        this.x = x ?? 0;
        this.y = y ?? 0;
        this.z = z ?? 0;
        this.w = w ?? 1;
      }
      static getIdentity() {
        return new Quaternion(0, 0, 0, 1);
      }
    },
  );
  const Vector3 = getCls(
    'Vector3',
    '@caspertech/node-metaverse/dist/lib/classes/Vector3',
    class Vector3 {
      constructor(v) {
        const arr = Array.isArray(v) ? v : [v?.x ?? 0, v?.y ?? 0, v?.z ?? 0];
        this.x = arr[0];
        this.y = arr[1];
        this.z = arr[2];
      }
      static getZero() {
        return new Vector3([0, 0, 0]);
      }
    },
  );
  const UUID = getCls(
    'UUID',
    '@caspertech/node-metaverse/dist/lib/classes/UUID',
    class UUID {
      constructor(s) {
        this.s = String(s || '00000000-0000-0000-0000-000000000000');
      }
      toString() {
        return this.s;
      }
      static zero() {
        return new UUID('00000000-0000-0000-0000-000000000000');
      }
      static random() {
        return new UUID('00000000-0000-0000-0000-000000000000');
      }
    },
  );
  const PacketFlags = loaded?.PacketFlags || { Reliable: 1, Resent: 2, Zerocoded: 4 };
  const PCode = loaded?.PCode || { Prim: 9, Avatar: 47 };
  const PrimFlags = loaded?.PrimFlags || { CreateSelected: 2 };
  const DeRezDestination = loaded?.DeRezDestination || { AgentInventoryTake: 4 };

  return {
    ObjectAddMessage,
    ObjectLinkMessage,
    ObjectDelinkMessage,
    ObjectShapeMessage,
    DeRezObjectMessage,
    Quaternion,
    Vector3,
    UUID,
    PacketFlags,
    PCode,
    PrimFlags,
    DeRezDestination,
  };
}

/**
 * Rezzes a new primitive in world. Verifies parcel build permissions and prim limits.
 */
async function addObject(bot, params = {}, lib) {
  const { ObjectAddMessage, Quaternion, Vector3, UUID, PacketFlags, PCode, PrimFlags } =
    resolveMessages(lib);

  const { region, circuit, agentID, sessionID } = getSessionCircuit(bot);
  if (!circuit?.sendMessage) {
    throw new Error('Not connected to Second Life or region circuit unavailable');
  }

  const shapeName = String(params.shape || 'box').toLowerCase();
  const defaults = SHAPE_DEFAULTS[shapeName] || SHAPE_DEFAULTS.box;
  const pathCurve =
    params.pathCurve !== undefined ? finite(params.pathCurve, 'pathCurve') : defaults.pathCurve;
  const profileCurve =
    params.profileCurve !== undefined
      ? finite(params.profileCurve, 'profileCurve')
      : defaults.profileCurve;

  let pos = [128, 128, 25];
  if (params.position) {
    pos = (
      Array.isArray(params.position)
        ? params.position
        : [params.position.x, params.position.y, params.position.z]
    )
      .slice(0, 3)
      .map((n, i) => finite(n, `position coordinate ${i}`));
  } else if (params.x !== undefined || params.y !== undefined || params.z !== undefined) {
    pos = [finite(params.x ?? 128, 'x'), finite(params.y ?? 128, 'y'), finite(params.z ?? 25, 'z')];
  }

  let parcel = params.parcel || null;
  if (!parcel && region) {
    try {
      if (typeof region.getParcelProperties === 'function') {
        parcel = region.getParcelProperties(pos[0], pos[1]);
      } else if (typeof commands(bot)?.region?.getParcelAt === 'function') {
        parcel = await commands(bot).region.getParcelAt(pos[0], pos[1]);
      }
    } catch {
      parcel = null;
    }
  }

  if (parcel) {
    if (typeof parcel.canIRez === 'function' && !parcel.canIRez()) {
      throw new Error('Rezzing is not permitted on this parcel');
    }
    const maxPrims = Number(parcel.MaxPrims);
    const totalPrims = Number(parcel.TotalPrims);
    if (
      Number.isFinite(maxPrims) &&
      maxPrims > 0 &&
      Number.isFinite(totalPrims) &&
      totalPrims >= maxPrims
    ) {
      throw new Error('Parcel prim limit reached');
    }
  }

  let scale = [0.5, 0.5, 0.5];
  if (params.scale) {
    scale = (
      Array.isArray(params.scale) ? params.scale : [params.scale.x, params.scale.y, params.scale.z]
    )
      .slice(0, 3)
      .map((n, i) => finite(n, `scale coordinate ${i}`));
  }

  let rot = [0, 0, 0, 1];
  if (params.rotation) {
    rot = Array.isArray(params.rotation)
      ? params.rotation.slice(0, 4).map((n, i) => finite(n, `rotation ${i}`))
      : [
          finite(params.rotation.x ?? 0, 'rot.x'),
          finite(params.rotation.y ?? 0, 'rot.y'),
          finite(params.rotation.z ?? 0, 'rot.z'),
          finite(params.rotation.w ?? 1, 'rot.w'),
        ];
  }

  const agentUuid = agentID instanceof UUID ? agentID : new UUID(agentID || ZERO_UUID);
  const sessionUuid = sessionID instanceof UUID ? sessionID : new UUID(sessionID || ZERO_UUID);
  const groupUuid = params.groupId
    ? new UUID(requireUuid(params.groupId, 'groupId'))
    : bot?.agent?.activeGroupID || UUID.zero();

  const msg = new ObjectAddMessage();
  msg.AgentData = {
    AgentID: agentUuid,
    SessionID: sessionUuid,
    GroupID: groupUuid,
  };

  const posVec = new Vector3(pos);
  const scaleVec = new Vector3(scale);
  const rotQuat = new Quaternion(rot[0], rot[1], rot[2], rot[3]);

  msg.ObjectData = {
    PCode: params.pCode !== undefined ? finite(params.pCode, 'pCode') : (PCode?.Prim ?? 9),
    Material: params.material !== undefined ? finite(params.material, 'material') : 3,
    AddFlags:
      params.addFlags !== undefined
        ? finite(params.addFlags, 'addFlags')
        : (PrimFlags?.CreateSelected ?? 2),
    PathCurve: pathCurve,
    ProfileCurve: profileCurve,
    PathBegin: params.pathBegin !== undefined ? finite(params.pathBegin, 'pathBegin') : 0,
    PathEnd: params.pathEnd !== undefined ? finite(params.pathEnd, 'pathEnd') : 0,
    PathScaleX: params.pathScaleX !== undefined ? finite(params.pathScaleX, 'pathScaleX') : 100,
    PathScaleY: params.pathScaleY !== undefined ? finite(params.pathScaleY, 'pathScaleY') : 100,
    PathShearX: params.pathShearX !== undefined ? finite(params.pathShearX, 'pathShearX') : 0,
    PathShearY: params.pathShearY !== undefined ? finite(params.pathShearY, 'pathShearY') : 0,
    PathTwist: params.pathTwist !== undefined ? finite(params.pathTwist, 'pathTwist') : 0,
    PathTwistBegin:
      params.pathTwistBegin !== undefined ? finite(params.pathTwistBegin, 'pathTwistBegin') : 0,
    PathRadiusOffset:
      params.pathRadiusOffset !== undefined
        ? finite(params.pathRadiusOffset, 'pathRadiusOffset')
        : 0,
    PathTaperX: params.pathTaperX !== undefined ? finite(params.pathTaperX, 'pathTaperX') : 0,
    PathTaperY: params.pathTaperY !== undefined ? finite(params.pathTaperY, 'pathTaperY') : 0,
    PathRevolutions:
      params.pathRevolutions !== undefined ? finite(params.pathRevolutions, 'pathRevolutions') : 0,
    PathSkew: params.pathSkew !== undefined ? finite(params.pathSkew, 'pathSkew') : 0,
    ProfileBegin:
      params.profileBegin !== undefined ? finite(params.profileBegin, 'profileBegin') : 0,
    ProfileEnd: params.profileEnd !== undefined ? finite(params.profileEnd, 'profileEnd') : 0,
    ProfileHollow:
      params.profileHollow !== undefined ? finite(params.profileHollow, 'profileHollow') : 0,
    BypassRaycast:
      params.bypassRaycast !== undefined ? finite(params.bypassRaycast, 'bypassRaycast') : 1,
    RayStart: posVec,
    RayEnd: posVec,
    RayTargetID: params.rayTargetId
      ? new UUID(requireUuid(params.rayTargetId, 'rayTargetId'))
      : UUID.zero(),
    RayEndIsIntersection:
      params.rayEndIsIntersection !== undefined
        ? finite(params.rayEndIsIntersection, 'rayEndIsIntersection')
        : 0,
    Scale: scaleVec,
    Rotation: rotQuat,
    State: params.state !== undefined ? finite(params.state, 'state') : 0,
  };

  circuit.sendMessage(msg, PacketFlags?.Reliable ?? 1);
  return {
    created: true,
    shape: shapeName,
    pathCurve,
    profileCurve,
    position: pos,
    scale,
    rotation: rot,
  };
}

/**
 * Links two or more objects into a linkset. The last selected object becomes the root parent.
 */
async function linkObjects(bot, params = {}, lib) {
  const { ObjectLinkMessage, UUID, PacketFlags } = resolveMessages(lib);
  const { circuit, agentID, sessionID } = getSessionCircuit(bot);
  if (!circuit?.sendMessage) {
    throw new Error('Not connected to Second Life or region circuit unavailable');
  }

  const rawIds = params.objectLocalIds || params.localIds;
  if (!Array.isArray(rawIds) || rawIds.length < 2) {
    throw new Error('Linking requires at least two selected objects');
  }

  const ids = rawIds.map((id, index) => {
    const num = Math.floor(finite(id, `objectLocalIds[${index}]`));
    if (num <= 0) throw new Error('Valid positive object local ID required for linking');
    return num;
  });

  const agentUuid = agentID instanceof UUID ? agentID : new UUID(agentID || ZERO_UUID);
  const sessionUuid = sessionID instanceof UUID ? sessionID : new UUID(sessionID || ZERO_UUID);

  const msg = new ObjectLinkMessage();
  msg.AgentData = {
    AgentID: agentUuid,
    SessionID: sessionUuid,
  };
  msg.ObjectData = ids.map((localId) => ({ ObjectLocalID: localId }));

  circuit.sendMessage(msg, PacketFlags?.Reliable ?? 1);

  const rootLocalId = ids[ids.length - 1];
  const childLocalIds = ids.slice(0, -1);
  return {
    linked: true,
    rootLocalId,
    childLocalIds,
    objectLocalIds: ids,
  };
}

/**
 * Delinks one or more objects from their linksets.
 */
async function delinkObjects(bot, params = {}, lib) {
  const { ObjectDelinkMessage, UUID, PacketFlags } = resolveMessages(lib);
  const { circuit, agentID, sessionID } = getSessionCircuit(bot);
  if (!circuit?.sendMessage) {
    throw new Error('Not connected to Second Life or region circuit unavailable');
  }

  const rawIds = params.objectLocalIds || params.localIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new Error('Delinking requires at least one object local ID');
  }

  const ids = rawIds.map((id, index) => {
    const num = Math.floor(finite(id, `objectLocalIds[${index}]`));
    if (num <= 0) throw new Error('Valid positive object local ID required for delinking');
    return num;
  });

  const agentUuid = agentID instanceof UUID ? agentID : new UUID(agentID || ZERO_UUID);
  const sessionUuid = sessionID instanceof UUID ? sessionID : new UUID(sessionID || ZERO_UUID);

  const msg = new ObjectDelinkMessage();
  msg.AgentData = {
    AgentID: agentUuid,
    SessionID: sessionUuid,
  };
  msg.ObjectData = ids.map((localId) => ({ ObjectLocalID: localId }));

  circuit.sendMessage(msg, PacketFlags?.Reliable ?? 1);

  return {
    delinked: true,
    objectLocalIds: ids,
  };
}

/**
 * Updates primitive shape geometry parameters across the network.
 */
async function updatePrimParams(bot, params = {}, lib) {
  const { ObjectShapeMessage, UUID, PacketFlags } = resolveMessages(lib);
  const { circuit, agentID, sessionID } = getSessionCircuit(bot);
  if (!circuit?.sendMessage) {
    throw new Error('Not connected to Second Life or region circuit unavailable');
  }

  let targets = [];
  if (params.localId !== undefined) {
    targets = [Math.floor(finite(params.localId, 'localId'))];
  } else if (params.objectLocalId !== undefined) {
    targets = [Math.floor(finite(params.objectLocalId, 'objectLocalId'))];
  } else if (Array.isArray(params.objectLocalIds) && params.objectLocalIds.length > 0) {
    targets = params.objectLocalIds.map((id, idx) =>
      Math.floor(finite(id, `objectLocalIds[${idx}]`)),
    );
  } else if (Array.isArray(params.localIds) && params.localIds.length > 0) {
    targets = params.localIds.map((id, idx) => Math.floor(finite(id, `localIds[${idx}]`)));
  }

  if (targets.length === 0) {
    throw new Error('Target object local ID is required');
  }

  const shapeName = params.shape ? String(params.shape).toLowerCase() : undefined;
  const defaults = shapeName && SHAPE_DEFAULTS[shapeName] ? SHAPE_DEFAULTS[shapeName] : {};

  const pathCurve =
    params.pathCurve !== undefined
      ? finite(params.pathCurve, 'pathCurve')
      : (defaults.pathCurve ?? 16);
  const profileCurve =
    params.profileCurve !== undefined
      ? finite(params.profileCurve, 'profileCurve')
      : (defaults.profileCurve ?? 1);

  const agentUuid = agentID instanceof UUID ? agentID : new UUID(agentID || ZERO_UUID);
  const sessionUuid = sessionID instanceof UUID ? sessionID : new UUID(sessionID || ZERO_UUID);

  const msg = new ObjectShapeMessage();
  msg.AgentData = {
    AgentID: agentUuid,
    SessionID: sessionUuid,
  };

  msg.ObjectData = targets.map((id) => ({
    ObjectLocalID: id,
    PathCurve: pathCurve,
    ProfileCurve: profileCurve,
    PathBegin: params.pathBegin !== undefined ? finite(params.pathBegin, 'pathBegin') : 0,
    PathEnd: params.pathEnd !== undefined ? finite(params.pathEnd, 'pathEnd') : 0,
    PathScaleX: params.pathScaleX !== undefined ? finite(params.pathScaleX, 'pathScaleX') : 100,
    PathScaleY: params.pathScaleY !== undefined ? finite(params.pathScaleY, 'pathScaleY') : 100,
    PathShearX: params.pathShearX !== undefined ? finite(params.pathShearX, 'pathShearX') : 0,
    PathShearY: params.pathShearY !== undefined ? finite(params.pathShearY, 'pathShearY') : 0,
    PathTwist: params.pathTwist !== undefined ? finite(params.pathTwist, 'pathTwist') : 0,
    PathTwistBegin:
      params.pathTwistBegin !== undefined ? finite(params.pathTwistBegin, 'pathTwistBegin') : 0,
    PathRadiusOffset:
      params.pathRadiusOffset !== undefined
        ? finite(params.pathRadiusOffset, 'pathRadiusOffset')
        : 0,
    PathTaperX: params.pathTaperX !== undefined ? finite(params.pathTaperX, 'pathTaperX') : 0,
    PathTaperY: params.pathTaperY !== undefined ? finite(params.pathTaperY, 'pathTaperY') : 0,
    PathRevolutions:
      params.pathRevolutions !== undefined ? finite(params.pathRevolutions, 'pathRevolutions') : 0,
    PathSkew: params.pathSkew !== undefined ? finite(params.pathSkew, 'pathSkew') : 0,
    ProfileBegin:
      params.profileBegin !== undefined ? finite(params.profileBegin, 'profileBegin') : 0,
    ProfileEnd: params.profileEnd !== undefined ? finite(params.profileEnd, 'profileEnd') : 0,
    ProfileHollow:
      params.profileHollow !== undefined ? finite(params.profileHollow, 'profileHollow') : 0,
  }));

  circuit.sendMessage(msg, PacketFlags?.Reliable ?? 1);

  return {
    updated: true,
    objectLocalIds: targets,
    shapeParams: {
      pathCurve,
      profileCurve,
      ...params,
    },
  };
}

/**
 * Deletes / derezzes one or more objects in world.
 */
async function deleteObject(bot, params = {}, lib) {
  const { DeRezObjectMessage, UUID, PacketFlags } = resolveMessages(lib);
  const { circuit, agentID, sessionID } = getSessionCircuit(bot);
  if (!circuit?.sendMessage) {
    throw new Error('Not connected to Second Life or region circuit unavailable');
  }

  let targets = [];
  if (params.localId !== undefined) {
    targets = [Math.floor(finite(params.localId, 'localId'))];
  } else if (params.objectLocalId !== undefined) {
    targets = [Math.floor(finite(params.objectLocalId, 'objectLocalId'))];
  } else if (Array.isArray(params.objectLocalIds) && params.objectLocalIds.length > 0) {
    targets = params.objectLocalIds.map((id, idx) =>
      Math.floor(finite(id, `objectLocalIds[${idx}]`)),
    );
  } else if (Array.isArray(params.localIds) && params.localIds.length > 0) {
    targets = params.localIds.map((id, idx) => Math.floor(finite(id, `localIds[${idx}]`)));
  }

  if (targets.length === 0) {
    throw new Error('Target object local ID is required for deletion');
  }

  const agentUuid = agentID instanceof UUID ? agentID : new UUID(agentID || ZERO_UUID);
  const sessionUuid = sessionID instanceof UUID ? sessionID : new UUID(sessionID || ZERO_UUID);
  const groupUuid = params.groupId
    ? new UUID(requireUuid(params.groupId, 'groupId'))
    : bot?.agent?.activeGroupID || UUID.zero();

  const msg = new DeRezObjectMessage();
  msg.AgentData = {
    AgentID: agentUuid,
    SessionID: sessionUuid,
  };
  msg.AgentBlock = {
    GroupID: groupUuid,
    Destination: params.destination !== undefined ? finite(params.destination, 'destination') : 4,
    DestinationID: params.destinationId
      ? new UUID(requireUuid(params.destinationId, 'destinationId'))
      : UUID.zero(),
    TransactionID: UUID.random ? UUID.random() : UUID.zero(),
    PacketCount: 1,
    PacketNumber: 0,
  };
  msg.ObjectData = targets.map((id) => ({ ObjectLocalID: id }));

  circuit.sendMessage(msg, PacketFlags?.Reliable ?? 1);

  return {
    deleted: true,
    objectLocalIds: targets,
  };
}

/** The account's currency balance as reported by the grid. */
async function getBalance(bot) {
  const balance = await commands(bot).grid.getBalance();
  const currencySymbol =
    bot?.gridInfo?.currencySymbol ||
    bot?.gridInfo?.currency_symbol ||
    params_currency_symbol(bot) ||
    'L$';
  const isZeroCurrency = Boolean(
    bot?.gridInfo?.isZeroCurrency || bot?.gridInfo?.is_zero_currency || bot?.isZeroCurrency,
  );
  if (!Number.isFinite(Number(balance))) throw new Error('The grid returned no balance');
  return { balance: Number(balance), currencySymbol, isZeroCurrency };
}

function params_currency_symbol(bot) {
  return bot?.options?.currencySymbol || bot?.options?.currency_symbol;
}

// ---- login -----------------------------------------------------------------

/**
 * Split a login name the way Lumiya did (SLAuth.SendLoginRequest, recovered from
 * the original smali): the first of ' ', '.' or '_' ends the first name, the rest
 * is the last name, and a missing last name means "Resident".
 */
function parseLoginName(text) {
  const name = String(text || '').trim();
  if (!name) throw new Error('Enter your avatar name');
  let split = name.length;
  for (const separator of ' ._') {
    const at = name.indexOf(separator);
    if (at !== -1 && at < split) split = at;
  }
  const firstName = name.slice(0, split).trim();
  const lastName = (split < name.length ? name.slice(split + 1) : '').trim() || 'Resident';
  if (!firstName) throw new Error('Enter your avatar name');
  if (/[\u0000-\u001f<>&"']/.test(firstName + lastName))
    throw new Error('The avatar name contains characters that are not allowed');
  return { firstName, lastName };
}

/**
 * Start location, as Lumiya sent it: "first" means the home location, "uri:..."
 * (a region and coordinates) is passed through, and anything else is "last".
 * "home" and "last" are accepted directly. A uri must name a region and may only
 * carry three numeric coordinates, so a caller cannot smuggle other login fields.
 */
function normalizeStart(start) {
  const value = String(start || 'last').trim();
  if (value === 'first' || value === 'home') return 'home';
  if (!/^uri:/i.test(value)) return 'last';
  const parts = value.slice(4).split('&');
  const region = parts[0];
  const coordinates = parts.slice(1);
  if (
    !region ||
    !/^[\w .'-]{1,64}$/.test(region) ||
    (coordinates.length !== 0 && coordinates.length !== 3) ||
    coordinates.some((c) => !/^-?\d{1,4}$/.test(c))
  ) {
    throw new Error('The start location is not a valid region and position');
  }
  // Without coordinates the grid's default spot in that region is requested.
  return `uri:${[region, ...(coordinates.length === 3 ? coordinates : ['128', '128', '30'])].join('&')}`;
}

/** node-metaverse LoginParameters for a request from the browser or renderer. */
function buildLoginParams(request, lib) {
  const { LoginParameters } = loadLibrary(lib);
  const { firstName, lastName } = parseLoginName(request.username);
  const password = String(request.password || '');
  if (!password) throw new Error('Enter your password');
  let url;
  try {
    url = new URL(String(request.loginUrl || ''));
  } catch {
    throw new Error('The login address is not valid');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error('The login address must be http(s)');
  const params = new LoginParameters();
  params.firstName = firstName;
  params.lastName = lastName;
  params.password = password;
  params.start = normalizeStart(request.start);
  params.url = url.toString();
  // Multi-factor authentication: the code the resident typed after a challenge,
  // and the hash a previous successful MFA login returned for this device.
  if (request.mfaToken) params.token = String(request.mfaToken).replace(/\s+/g, '').slice(0, 32);
  if (request.mfaHash) params.mfa_hash = String(request.mfaHash).slice(0, 256);
  return params;
}

const LOGIN_REASONS = {
  mfa_challenge: {
    code: 'mfa_required',
    message:
      'This account uses multi-factor authentication. Enter the code from your authenticator app.',
  },
  key: { code: 'bad_credentials', message: 'The name or password is incorrect.' },
  presence: {
    code: 'already_logged_in',
    message:
      'This account is already logged in. Wait a minute and try again, or log out of the other session.',
  },
  tos: {
    code: 'terms',
    message: 'The grid requires you to accept its Terms of Service before logging in.',
  },
  update: { code: 'update_required', message: 'The grid requires a newer viewer version.' },
  critical: {
    code: 'critical_message',
    message: 'The grid has a critical message that must be read before logging in.',
  },
  disabled: { code: 'account_disabled', message: 'This account has been disabled.' },
  mfa_failure: {
    code: 'mfa_failed',
    message: 'The multi-factor code was not accepted. Try the next code.',
  },
};

/** Error that carries the structured result of describeLoginError across process boundaries. */
const LOGIN_FAILURE_PREFIX = 'LOGIN_FAILURE:';
function loginFailure(error) {
  const details = describeLoginError(error);
  // Electron only preserves an error's message across IPC, so the details travel in it.
  const failure = new Error(LOGIN_FAILURE_PREFIX + JSON.stringify(details));
  failure.details = details;
  return failure;
}

/**
 * Turn a node-metaverse LoginError (or anything thrown while logging in) into
 * plain data the interface can act on. The grid's own message is kept: it is
 * what the grid said, and more specific than our summary.
 */
function describeLoginError(error) {
  const reason = error && typeof error.reason === 'string' ? error.reason : '';
  const known = LOGIN_REASONS[reason];
  const gridMessage = error && typeof error.message === 'string' ? error.message : '';
  return {
    reason,
    code: known ? known.code : 'login_failed',
    mfaRequired: reason === 'mfa_challenge' || reason === 'mfa_failure',
    message: known ? known.message : gridMessage || 'Login failed',
    gridMessage,
  };
}

async function payObject(bot, params = {}, lib) {
  const isZeroCurrency = Boolean(
    params.isZeroCurrency || bot?.gridInfo?.isZeroCurrency || bot?.isZeroCurrency,
  );
  if (isZeroCurrency) throw new Error('Payments are disabled on zero-currency grids');
  const { UUID } = loadLibrary(lib);
  const targetId = params.targetId || params.id || params.objectId;
  if (!targetId) throw new Error('A target object is required');
  const amount = Math.floor(finite(params.amount, 'amount'));
  if (amount <= 0) throw new Error('Payment amount must be greater than 0');
  const description = String(params.description || params.targetName || 'Object payment');

  const grid = commands(bot).grid;
  if (typeof grid.payObject === 'function') {
    const targetUUID = new UUID(requireUuid(targetId, 'target object id'));
    const object = bot.currentRegion?.objects?.getObjectByUUID?.(targetUUID);
    if (object) {
      await grid.payObject(object, amount);
    } else {
      await grid.pay(targetUUID, amount, description, 5001);
    }
  } else {
    throw new Error('Payment not supported by this connection');
  }
  return { paid: true, targetId: String(targetId), amount, description };
}

async function payAvatar(bot, params = {}, lib) {
  const isZeroCurrency = Boolean(
    params.isZeroCurrency || bot?.gridInfo?.isZeroCurrency || bot?.isZeroCurrency,
  );
  if (isZeroCurrency) throw new Error('Payments are disabled on zero-currency grids');
  const { UUID } = loadLibrary(lib);
  const targetId = requireUuid(params.targetId || params.id || params.avatarId, 'target avatar id');
  const amount = Math.floor(finite(params.amount, 'amount'));
  if (amount <= 0) throw new Error('Payment amount must be greater than 0');
  const description = String(params.description || params.targetName || 'Resident gift/tip');

  const grid = commands(bot).grid;
  if (typeof grid.payAvatar === 'function') {
    await grid.payAvatar(new UUID(targetId), amount, description);
  } else {
    throw new Error('Payment not supported by this connection');
  }
  return { paid: true, targetId, amount, description };
}

async function getTransactionHistory(bot, params = {}) {
  let balance;
  try {
    balance = await getBalance(bot);
  } catch {
    const currencySymbol =
      bot?.gridInfo?.currencySymbol ||
      bot?.gridInfo?.currency_symbol ||
      params?.currencySymbol ||
      params?.currency_symbol ||
      'L$';
    const isZeroCurrency = Boolean(
      bot?.gridInfo?.isZeroCurrency || bot?.gridInfo?.is_zero_currency || bot?.isZeroCurrency,
    );
    balance = { balance: 0, currencySymbol, isZeroCurrency };
  }
  const caps = bot?.currentRegion?.caps || bot?.caps;

  const possibleCaps = [
    'UserTransactionHistory',
    'TransactionHistory',
    'UserTransactionStatement',
    'GetTransactionHistory',
  ];

  let capName = null;
  if (caps) {
    for (const c of possibleCaps) {
      if (typeof caps.isCapAvailable === 'function') {
        try {
          if (await caps.isCapAvailable(c)) {
            capName = c;
            break;
          }
        } catch {
          // ignore
        }
      } else if (typeof caps.getCapability === 'function') {
        try {
          const u = await caps.getCapability(c);
          if (u) {
            capName = c;
            break;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  let rawTxs = [];
  let hasMore = false;

  if (capName && caps) {
    const queryParams = {};
    if (params.since !== undefined) queryParams.since = String(params.since);
    if (params.limit !== undefined) queryParams.limit = String(params.limit);
    if (params.offset !== undefined) queryParams.offset = String(params.offset);

    try {
      let res;
      if (typeof caps.capsGetXML === 'function') {
        res = await caps.capsGetXML([capName, queryParams]);
      } else if (typeof caps.getCapability === 'function') {
        const url = await caps.getCapability(capName);
        if (caps.requestGet) {
          const queryStr = new URLSearchParams(queryParams).toString();
          const separator = url.includes('?') ? '&' : '?';
          const fullUrl = queryStr ? `${url}${separator}${queryStr}` : url;
          const resp = await caps.requestGet(fullUrl);
          res = resp?.body;
        } else if (typeof fetch === 'function') {
          const queryStr = new URLSearchParams(queryParams).toString();
          const separator = url.includes('?') ? '&' : '?';
          const fullUrl = queryStr ? `${url}${separator}${queryStr}` : url;
          const resp = await fetch(fullUrl, {
            headers: { Accept: 'application/json, text/xml, application/llsd+xml' },
          });
          if (resp.ok) {
            const contentType = resp.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              res = await resp.json();
            } else {
              const text = await resp.text();
              try {
                res = JSON.parse(text);
              } catch {
                res = { raw: text };
              }
            }
          }
        }
      }

      if (res) {
        if (Array.isArray(res)) {
          rawTxs = res;
        } else if (typeof res === 'object') {
          rawTxs = Array.isArray(res.transactions)
            ? res.transactions
            : Array.isArray(res.records)
              ? res.records
              : Array.isArray(res.history)
                ? res.history
                : [];
          if (typeof res.hasMore === 'boolean') hasMore = res.hasMore;
          if (typeof res.balance === 'number') balance.balance = res.balance;
        }
      }
    } catch (err) {
      console.warn(
        '[sl-actions] Capability getTransactionHistory fetch failed:',
        err.message || err,
      );
    }
  }

  const normalizedTransactions = rawTxs.map((entry, idx) => {
    const transactionId =
      entry.transactionId ||
      entry.transaction_id ||
      entry.id ||
      entry.transactionID ||
      `tx-${Date.now()}-${idx}`;
    const timestamp =
      typeof entry.timestamp === 'number'
        ? entry.timestamp
        : typeof entry.time === 'number'
          ? entry.time
          : Date.parse(entry.timestamp || entry.time || entry.date) || Date.now();
    const type = entry.type || entry.transactionType || 'payment';
    const amount = typeof entry.amount === 'number' ? entry.amount : Number(entry.amount) || 0;
    const bal = entry.balance !== undefined ? Number(entry.balance) : undefined;
    const user =
      entry.user || entry.target_name || entry.targetName || entry.userName || entry.target || '';
    const fromId = entry.fromId || entry.from_id || entry.sourceId || '';
    const toId = entry.toId || entry.to_id || entry.targetId || '';
    const description = entry.description || entry.desc || '';

    return {
      ...entry,
      transactionId,
      id: entry.id || transactionId,
      timestamp,
      type,
      amount,
      balance: bal,
      user,
      fromId,
      toId,
      description,
    };
  });

  return {
    balance: balance.balance,
    currencySymbol: balance.currencySymbol,
    isZeroCurrency: balance.isZeroCurrency,
    transactions: normalizedTransactions,
    hasMore,
  };
}

module.exports = {
  parseLoginName,
  normalizeStart,
  buildLoginParams,
  describeLoginError,
  loginFailure,
  LOGIN_FAILURE_PREFIX,
  LOGIN_REASONS,
  ATTACHMENT_NAMES,
  isHudPoint,
  attachmentIdFromState,
  attachmentInfo,
  parseDestination,
  teleport,
  touchObject,
  sit,
  stand,
  getBalance,
  requireUuid,
  payObject,
  payAvatar,
  getTransactionHistory,
  addObject,
  linkObjects,
  delinkObjects,
  updatePrimParams,
  deleteObject,
  derezObject: deleteObject,
  SHAPE_DEFAULTS,
};
