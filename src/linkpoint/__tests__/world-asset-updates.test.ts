import { describe, expect, it, vi } from 'vitest';
import { WorldViewer } from '../world';
import { Utils } from '../utils';

class Protocol extends Utils.EventEmitter { connected = true; authReply = null; }
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const geometry = { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };
const prim = { id: 'prim', localId: 1, position: [1, 2, 3], scale: [2, 3, 4], rotation: [0, 0, 0, 1], shape: 'asset-proxy' };
const image = (assetId: string) => ({ assetId, width: 1, height: 1, rgba: btoa('\xff\xff\xff\xff') });
function setup() {
  const protocol = new Protocol();
  const world = new WorldViewer(protocol);
  const objects = new Map<string, any>();
  const scene = {
    objects, graphics: { maxJoints: 110 },
    addObject: (id: string, config: any) => objects.set(id, { ...config }),
    updateObject: (id: string, config: any) => Object.assign(objects.get(id), config),
    removeObject: (id: string) => objects.delete(id),
    addAssetMesh: vi.fn((id: string) => [{ mesh: `asset:${id}:0`, materialIndex: 0 }]),
    addAssetTexture: vi.fn((id: string) => `texture:${id}`),
    addVolumeMeshes: vi.fn(() => [{ mesh: 'volume:new', materialIndex: 0 }]),
  };
  (world as any).scene3d = scene;
  (world as any).loadBody = async () => {};
  return { protocol, world, scene };
}

describe('simulator asset replacement and material hydration', () => {
  it('replaces cached mesh and texture references, preserving them on terse motion updates', () => {
    const { protocol, scene } = setup();
    for (const id of ['old', 'new']) {
      protocol.emit('scene:asset-ready', { assetId: id, geometry });
      protocol.emit('scene:texture-ready', image(id));
    }
    protocol.emit('scene:object-add', { ...prim, assetId: 'old', assetKind: 'mesh', textureId: 'old' });
    protocol.emit('scene:object-update', { id: 'prim', assetId: 'new', textureId: 'new' });
    expect(scene.objects.get('prim')).toMatchObject({ meshes: [{ mesh: 'asset:new:0' }], texture: 'texture:new' });
    protocol.emit('scene:object-update', { id: 'prim', position: [4, 5, 6] });
    expect(scene.objects.get('prim')).toMatchObject({ meshes: [{ mesh: 'asset:new:0' }], texture: 'texture:new', position: [4, 5, 6] });
  });

  it('drops old geometry while a replacement downloads and ignores late arrivals for the old asset', () => {
    const { protocol, scene } = setup();
    protocol.emit('scene:asset-ready', { assetId: 'old', geometry });
    protocol.emit('scene:object-add', { ...prim, assetId: 'old', assetKind: 'mesh' });
    protocol.emit('scene:object-update', { id: 'prim', assetId: 'new' });
    expect(scene.objects.get('prim').meshes).toBeNull();
    protocol.emit('scene:asset-ready', { assetId: 'old', geometry });
    expect(scene.objects.get('prim').meshes).toBeNull();
    protocol.emit('scene:asset-ready', { assetId: 'new', geometry });
    expect(scene.objects.get('prim').meshes[0].mesh).toBe('asset:new:0');
  });

  it('returns a former mesh to generated prim geometry when the asset is removed', () => {
    const { protocol, scene } = setup();
    protocol.emit('scene:asset-ready', { assetId: 'old', geometry });
    protocol.emit('scene:object-add', { ...prim, assetId: 'old', assetKind: 'mesh' });
    protocol.emit('scene:object-update', { id: 'prim', assetId: null, assetKind: null, shape: 'cube', shapeParams: { pathCurve: 0x10, profileCurve: 0x01 } });
    expect(scene.objects.get('prim').meshes[0].mesh).toBe('volume:new');
  });

  it('uses the same GPU names for mixed-case mesh, texture and material references', () => {
    const { protocol, scene } = setup();
    protocol.emit('scene:asset-ready', { assetId: 'MESH', geometry });
    protocol.emit('scene:texture-ready', image('TEXTURE'));
    protocol.emit('scene:material-ready', { assetId: 'MATERIAL', material: { textures: { baseColor: { textureId: 'TeXtUrE' } } } });
    protocol.emit('scene:object-add', { ...prim, assetId: 'MeSh', textureId: 'TeXtUrE', faceTextures: [{ materialId: 'MaTeRiAl' }] });
    expect(scene.addAssetMesh).toHaveBeenCalledWith('mesh', geometry);
    expect(scene.addAssetTexture).toHaveBeenCalledWith('texture', 1, 1, expect.any(Uint8Array));
    expect(scene.objects.get('prim')).toMatchObject({ texture: 'texture:texture', meshes: [{ mesh: 'asset:mesh:0' }], faces: [{ texture: 'texture:texture' }] });
  });

  it('keeps inherited transform components for partial overrides and sparse texture slots', () => {
    const { protocol, scene } = setup();
    protocol.emit('scene:texture-ready', image('normal'));
    protocol.emit('scene:material-ready', { assetId: 'material', material: { textures: { baseColor: { scale: [2, 3], offset: [.1, .2], rotation: .7 } } } });
    protocol.emit('scene:object-add', { ...prim, faceTextures: [{ materialId: 'material', materialOverride: { textureTransforms: [{ offset: [.4, .5] }], textures: { 1: 'normal' } } }] });
    expect(scene.objects.get('prim').faces[0]).toMatchObject({ repeat: [2, 3], offset: [.4, .5], rotation: .7, pbr: { normalTexture: 'texture:normal', baseColorTexture: undefined } });
  });

  it('honors standalone emissive, double-sided and alpha-cutoff overrides', () => {
    const { protocol, scene } = setup();
    protocol.emit('scene:object-add', { ...prim, faceTextures: [{ materialOverride: { emissiveFactor: [1, .2, .3], doubleSided: true, alphaCutoff: .3 } }] });
    expect(scene.objects.get('prim').faces[0].pbr).toMatchObject({ emissive: [1, .2, .3], doubleSided: true, alphaCutoff: .3 });
  });

  it('rebuilds the shared avatar skeleton when a rigged attachment becomes unrigged', () => {
    const { protocol, world } = setup();
    protocol.emit('scene:object-add', { id: 'avatar', localId: 10, avatar: true, position: [1, 2, 3], scale: [1, 1, 2], rotation: [0, 0, 0, 1] });
    protocol.emit('scene:asset-ready', { assetId: 'rig', geometry: { ...geometry, skin: { jointNames: ['mPelvis'], bindShapeMatrix: identity, inverseBindMatrices: [identity] } } });
    protocol.emit('scene:object-add', { ...prim, parentId: 10, assetId: 'rig', assetKind: 'mesh' });
    const rebuild = vi.spyOn(world as any, 'reapplyAvatarSubject');
    protocol.emit('scene:object-update', { id: 'prim', assetId: 'static' });
    expect(rebuild).toHaveBeenCalledWith('avatar');
  });
});
