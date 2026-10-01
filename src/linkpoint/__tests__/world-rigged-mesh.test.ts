import { describe, expect, it } from 'vitest';
import { WorldViewer } from '../world';
import { Utils } from '../utils';

class ProtocolStub extends Utils.EventEmitter {
  connected = true;
  authReply: Record<string, any> | null = null;
}

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function sceneStub() {
  const objects = new Map<string, any>();
  return {
    objects,
    graphics: { maxJoints: 110 },
    addObject: (id: string, config: any) => { objects.set(id, { ...config }); },
    updateObject: (id: string, updates: any) => { Object.assign(objects.get(id) || {}, updates); },
    removeObject: (id: string) => { objects.delete(id); },
    addAssetMesh: (assetId: string, geometry: any) => (geometry.parts || [geometry]).map((_: any, i: number) => ({ mesh: `asset:${assetId}:${i}`, materialIndex: i })),
  };
}

function setup() {
  const protocol = new ProtocolStub();
  const world = new WorldViewer(protocol);
  const scene = sceneStub();
  (world as any).scene3d = scene;
  protocol.emit('scene:object-add', { id: 'avatar', localId: 1, avatar: true, position: [10, 20, 30], rotation: [0, 0, 0, 1], scale: [0.5, 0.5, 0.5] });
  return { protocol, scene };
}

describe('rigged mesh in the world', () => {
  it('skins a rigged mesh with rest-pose joint matrices and follows its avatar, ignoring prim scale', () => {
    const { protocol, scene } = setup();
    protocol.emit('scene:object-add', {
      id: 'rig', localId: 2, parentId: 1, avatar: false, assetId: 'mesh-1', shape: 'asset-proxy',
      position: [0.3, 0, 0.1], rotation: [0, 0, 0, 1], scale: [3, 3, 3],
    });
    protocol.emit('scene:asset-ready', {
      assetId: 'mesh-1',
      geometry: {
        parts: [{ materialIndex: 0, vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], joints: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], jointWeights: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] }],
        skin: { jointNames: ['mPelvis'], bindShapeMatrix: identity, inverseBindMatrices: [identity] },
      },
    });
    const rig = scene.objects.get('rig');
    expect(rig.skin).toBeInstanceOf(Float32Array);
    expect(rig.skin).toHaveLength(110 * 12);
    // identity inverse bind: joint 0 (mPelvis) is lifted to the pelvis rest height (z = 1.067)
    expect(rig.skin[3]).toBeCloseTo(0, 5);
    expect(rig.skin[11]).toBeCloseTo(1.067, 2);
    // the mesh uses the avatar's transform, not the attachment offset
    expect(rig.position).toEqual([10, 20, 30]);
    expect(rig.meshes).toEqual([{ mesh: 'asset:mesh-1:0', materialIndex: 0 }]);
  });

  it('leaves unrigged meshes alone', () => {
    const { protocol, scene } = setup();
    protocol.emit('scene:object-add', { id: 'prim', localId: 3, avatar: false, assetId: 'mesh-2', position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
    protocol.emit('scene:asset-ready', { assetId: 'mesh-2', geometry: { parts: [{ materialIndex: 0, vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }] } });
    expect(scene.objects.get('prim').skin).toBeNull();
    expect(scene.objects.get('prim').position).toEqual([1, 2, 3]);
  });

  it('rebuilds joint matrices when an asset is re-decoded', () => {
    const { protocol, scene } = setup();
    protocol.emit('scene:object-add', { id: 'rig', localId: 2, parentId: 1, assetId: 'mesh-3', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
    const geometry = (z: number) => ({ parts: [{ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }], skin: { jointNames: ['mHead'], bindShapeMatrix: [...identity.slice(0, 14), z, 1], inverseBindMatrices: [identity] } });
    protocol.emit('scene:asset-ready', { assetId: 'mesh-3', geometry: geometry(0) });
    const before = scene.objects.get('rig').skin[11];
    protocol.emit('scene:asset-ready', { assetId: 'mesh-3', geometry: geometry(1) });
    expect(scene.objects.get('rig').skin[11]).toBeCloseTo(before + 1, 3);
  });
});
