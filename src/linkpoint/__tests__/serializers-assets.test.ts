import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { primAppearance } = createRequire(import.meta.url)('../../../core/serializers.cjs');
const ZERO = '00000000-0000-0000-0000-000000000000';
const ID = '11111111-2222-3333-4444-555555555555';
const uuid = (value: string) => ({ toString: () => value });

describe('which asset a prim draws from', () => {
  it('treats a sculpt parameter of type 5 as a mesh (how the simulator sends meshes)', () => {
    const a = primAppearance({ extraParams: { sculptData: { texture: uuid(ID), type: 5 } } });
    expect(a).toMatchObject({ assetKind: 'mesh', assetId: ID, sculptType: null });
  });

  it('keeps types 1-4 as sculpts and passes the flags through to the decoder', () => {
    expect(primAppearance({ extraParams: { sculptData: { texture: uuid(ID), type: 1 | 0x40 | 0x80 } } }))
      .toMatchObject({ assetKind: 'sculpt', assetId: ID, sculptType: 1 | 0x40 | 0x80 });
    expect(primAppearance({ extraParams: { sculptData: { texture: uuid(ID), type: 4 } } }).assetKind).toBe('sculpt');
  });

  it('accepts the dedicated mesh parameter', () => {
    expect(primAppearance({ extraParams: { meshData: { meshData: uuid(ID), type: 5 } } })).toMatchObject({ assetKind: 'mesh', assetId: ID });
  });

  it('draws an ordinary prim when the sculpt is type none or has no asset', () => {
    expect(primAppearance({ extraParams: { sculptData: { texture: uuid(ID), type: 0 } } })).toMatchObject({ assetKind: null, assetId: null });
    expect(primAppearance({ extraParams: { sculptData: { texture: uuid(ZERO), type: 1 } } })).toMatchObject({ assetKind: null, assetId: null });
    expect(primAppearance({ extraParams: { meshData: { meshData: uuid(ZERO), type: 5 } } })).toMatchObject({ assetKind: null });
  });

  it('flags animated meshes only for meshes', () => {
    const mesh = { sculptData: { texture: uuid(ID), type: 5 }, extendedMeshData: { flags: 1 } };
    expect(primAppearance({ extraParams: mesh }).animatedMesh).toBe(true);
    expect(primAppearance({ extraParams: { ...mesh, sculptData: { texture: uuid(ID), type: 2 } } }).animatedMesh).toBe(false);
  });

  it('serializes gltfMaterialOverrides from plain JS objects as well as Maps', () => {
    const objectWithObjectOverrides = {
      TextureEntry: {
        defaultTexture: { textureID: uuid(ZERO) },
        gltfMaterialOverrides: {
          '0': { metallicFactor: 0.8, roughnessFactor: 0.2, textures: [{ textureId: ID }] }
        }
      }
    };
    const appearance = primAppearance(objectWithObjectOverrides);
    expect(appearance.faceTextures.length).toBeGreaterThanOrEqual(1);
    expect(appearance.faceTextures[0].materialOverride).toEqual({
      metallicFactor: 0.8,
      roughnessFactor: 0.2,
      textures: [{ textureId: ID }]
    });
  });
});


describe('inherited prim face appearance', () => {
  it('applies repeat, offset, rotation and fullbright to every generated face', () => {
    const inherited = { textureID: uuid(ID), repeatU: 2, repeatV: 3, offsetU: .1, offsetV: .2, rotation: .4, fullBright: true };
    const appearance = primAppearance({ TextureEntry: { faces: [], defaultTexture: inherited } });
    expect(appearance.faceTextures).toHaveLength(9);
    for (const face of appearance.faceTextures) expect(face).toMatchObject({ textureId: ID, repeat: [2, 3], offset: [.1, .2], rotation: .4, fullBright: true });
  });
});
