import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { serializeEnvironment, serializeObject, serializeTerrain } = require('../../../electron/viewer-session.cjs');

describe('desktop simulator object bridge', () => {
  it('serializes region WindLight and terrain without leaking class instances', () => {
    const sky = { type: 'sky', blueHorizon: { toArray: () => [0.2, 0.4, 0.8] }, sunlightColor: [1, 0.9, 0.7] };
    const environment = serializeEnvironment({
      regionID: { toString: () => 'region-id' }, dayLength: 14400,
      dayCycle: { frames: new Map([['sky', sky]]) },
    });
    const terrain = Array.from({ length: 256 }, (_, x) => Array.from({ length: 256 }, (_, y) => x + y));

    expect(environment).toMatchObject({ regionId: 'region-id', dayLength: 14400, currentSky: { blueHorizon: [0.2, 0.4, 0.8] } });
    expect(serializeTerrain({ terrain })).toMatchObject({ size: 256, heights: expect.arrayContaining([0, 1, 255, 510]) });
    expect(() => structuredClone(environment)).not.toThrow();
  });

  it('converts node-metaverse objects into structured-clone-safe scene data', () => {
    const result = serializeObject({
      localID: 42,
      object: {
        FullID: { toString: () => '00000000-0000-0000-0000-000000000042' },
        ParentID: 7,
        PCode: 9,
        Position: { x: 1, y: 2, z: 3 },
        Scale: { x: 4, y: 5, z: 6 },
        Rotation: { x: 0, y: 0, z: 0, w: 1 },
        name: 'Decoded prim',
      },
    });

    expect(result).toEqual({
      id: '00000000-0000-0000-0000-000000000042',
      localId: 42,
      parentId: 7,
      pcode: 9,
      avatar: false,
      position: [1, 2, 3],
      scale: [4, 5, 6],
      rotation: [0, 0, 0, 1],
      name: 'Decoded prim',
      shape: 'cube',
      assetKind: null,
      assetId: null,
      textureId: null,
      faceTextures: [{
        textureId: null,
        color: [1, 1, 1, 1],
        repeat: [1, 1],
        offset: [0, 0],
        rotation: 0,
        fullBright: false,
        materialId: null,
        materialOverride: null,
      }],
      reflectionProbe: null,
      color: [1, 1, 1, 1],
      shapeParams: {
        pathCurve: undefined, profileCurve: undefined,
        pathBegin: undefined, pathEnd: undefined,
        pathScaleX: undefined, pathScaleY: undefined,
        profileBegin: undefined, profileEnd: undefined,
        profileHollow: undefined,
      },
    });
    expect(() => structuredClone(result)).not.toThrow();
  });

  it('preserves UDP prim appearance and selects standard SL geometry', () => {
    const result = serializeObject({
      localID: 9,
      object: {
        FullID: { toString: () => 'sphere-id' }, PCode: 9,
        PathCurve: 0x20, ProfileCurve: 0x05,
        TextureEntry: { defaultTexture: { rgba: {
          getRed: () => 0.1, getGreen: () => 0.2,
          getBlue: () => 0.3, getAlpha: () => 0.4,
        } } },
      },
    });

    expect(result.shape).toBe('sphere');
    expect(result.color).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(result.shapeParams).toMatchObject({ pathCurve: 0x20, profileCurve: 0x05 });
  });

  it('keeps uploaded mesh identity and gives it a visible renderer proxy', () => {
    const result = serializeObject({
      localID: 10,
      object: {
        FullID: { toString: () => 'object-id' }, PCode: 9,
        extraParams: { meshData: { meshData: { toString: () => 'mesh-asset-id' }, type: 5 } },
      },
    });

    expect(result).toMatchObject({
      shape: 'asset-proxy', assetKind: 'mesh', assetId: 'mesh-asset-id',
    });
    expect(() => structuredClone(result)).not.toThrow();
  });

  it('preserves per-material texture entries received with UDP object updates', () => {
    const texture = (id: string, red: number) => ({
      textureID: { toString: () => id }, rgba: { getRed: () => red, getGreen: () => .2, getBlue: () => .3, getAlpha: () => 1 },
      repeatU: 2, repeatV: 3, offsetU: .1, offsetV: .2, rotation: .5, fullBright: true,
    });
    const faces = [texture('face-zero', .4), texture('face-one', .8)];
    const result = serializeObject({
      localID: 11,
      object: {
        FullID: { toString: () => 'multi-material-mesh' }, PCode: 9,
        TextureEntry: { faces, defaultTexture: faces[0], getEffectiveEntryForFace: (index: number) => faces[index] },
      },
    });

    expect(result.faceTextures).toEqual([
      expect.objectContaining({ textureId: 'face-zero', color: [.4, .2, .3, 1], repeat: [2, 3] }),
      expect.objectContaining({ textureId: 'face-one', color: [.8, .2, .3, 1], offset: [.1, .2], rotation: .5, fullBright: true }),
    ]);
  });

  it('identifies modern PBR materials and mirror reflection probes from UDP extra params', () => {
    const result = serializeObject({
      localID: 12,
      object: {
        FullID: { toString: () => 'mirror-id' }, PCode: 9,
        extraParams: {
          renderMaterialData: { params: [{ textureIndex: 0, textureUUID: { toString: () => 'material-id' } }] },
          reflectionProbeData: { ambiance: .75, clipDistance: .1, flags: 0x07 },
        },
        TextureEntry: { faces: [{}], getEffectiveEntryForFace: () => ({}) },
      },
    });

    expect(result.faceTextures[0].materialId).toBe('material-id');
    expect(result.reflectionProbe).toMatchObject({ ambiance: .75, clipDistance: .1, box: true, dynamic: true, mirror: true });
  });
});
