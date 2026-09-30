import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { serializeObject } = require('../../../electron/viewer-session.cjs');

describe('desktop simulator object bridge', () => {
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
});
