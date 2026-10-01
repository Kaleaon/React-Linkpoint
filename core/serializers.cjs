// Serialisation of simulator data for the viewer (objects, environment, terrain, friends).
//
// One implementation shared by every host: the Electron main process and the web server both send
// exactly these shapes, and the client reads them without caring which one it is talking to.
const { PCode } = require('@caspertech/node-metaverse');
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
    // Animated mesh (Animesh): the ExtendedMesh extra parameter's ANIMATED_MESH_ENABLED flag.
    animatedMesh: Boolean(meshData && ((object.extraParams?.extendedMeshData?.flags ?? 0) & 1)),
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
      pathShearX: object.PathShearX, pathShearY: object.PathShearY,
      pathTwist: object.PathTwist, pathTwistBegin: object.PathTwistBegin,
      pathRadiusOffset: object.PathRadiusOffset,
      pathTaperX: object.PathTaperX, pathTaperY: object.PathTaperY,
      pathRevolutions: object.PathRevolutions, pathSkew: object.PathSkew,
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

module.exports = { finite, vector, serializableValue, serializeEnvironment, serializeTerrain, primAppearance, serializeObject, serializeFriend };
