import { describe, expect, it, vi } from 'vitest';
import { WorldViewer } from '../world';
import { Utils } from '../utils';
import { Camera3D } from '../camera-3d';

class ProtocolStub extends Utils.EventEmitter {
  connected = false;
  authReply: Record<string, any> | null = null;
}

describe('WorldViewer data status', () => {
  it('reports the live simulator stream after the protocol connects', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);

    expect(world.liveSceneSupported).toBe(false);
    expect(world.getDataStatus()).toBe('Disconnected');

    protocol.connected = true;
    expect(world.liveSceneSupported).toBe(true);
    expect(world.getDataStatus()).toBe('Live simulator scene: streaming from grid…');

    protocol.authReply = { native_scene: true };
    expect(world.liveSceneSupported).toBe(true);
    expect(world.getDataStatus()).toBe('Live simulator scene: streaming from grid…');
  });

  it('tracks decoded simulator object lifecycle before the canvas is mounted', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);
    const object = {
      id: 'prim-id', localId: 4, avatar: false,
      position: [1, 2, 3], scale: [1, 1, 1], rotation: [0, 0, 0, 1],
    };

    protocol.emit('scene:object-add', object);
    expect(world.objects).toEqual([object]);

    protocol.emit('scene:object-update', { ...object, position: [4, 5, 6] });
    expect(world.objects[0].position).toEqual([4, 5, 6]);

    protocol.emit('scene:object-remove', { localId: 4 });
    expect(world.objects).toEqual([]);
  });

  it('merges terse UDP updates without losing full prim data', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);
    protocol.emit('scene:object-add', {
      id: 'prim', localId: 3, shape: 'cylinder', color: [1, 0, 0, 1],
      position: [1, 2, 3], scale: [2, 2, 4], rotation: [0, 0, 0, 1],
    });
    protocol.emit('scene:object-update', { id: 'prim', localId: 3, position: [4, 5, 6] });

    expect(world.objects[0]).toMatchObject({
      shape: 'cylinder', color: [1, 0, 0, 1], scale: [2, 2, 4], position: [4, 5, 6],
    });
  });

  it('retains simulator terrain and WindLight data received before WebGL mounts', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);
    const heights = [1, 2, 3, 4];
    const environment = { currentSky: { blueHorizon: [0.2, 0.3, 0.5] }, dayLength: 14400 };

    protocol.emit('scene:world-data', {
      region: { name: 'Live Region', x: 1000, y: 1001 },
      environment,
      terrain: { size: 2, heights },
    });

    expect(world.region).toMatchObject({ name: 'Live Region', x: 1000, y: 1001 });
    expect(world.environment).toEqual(environment);
    expect(world.terrain).toEqual({ size: 2, heights });
  });

  it('resolves linked child prim positions and reapplies them when the root moves', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);
    const addObject = vi.fn();
    const updateObject = vi.fn();
    (world as any).scene3d = { objects: new Map(), addObject, updateObject };

    protocol.emit('scene:object-add', {
      id: 'root', localId: 10, position: [10, 20, 30], scale: [1, 1, 1], rotation: [0, 0, 0, 1],
    });
    (world as any).scene3d.objects.set('root', {});
    protocol.emit('scene:object-add', {
      id: 'child', localId: 11, parentId: 10, position: [2, 3, 4], scale: [1, 1, 1], rotation: [0, 0, 0, 1],
    });
    (world as any).scene3d.objects.set('child', {});
    expect(addObject).toHaveBeenLastCalledWith('child', expect.objectContaining({ position: [12, 23, 34] }));

    protocol.emit('scene:object-update', { id: 'root', localId: 10, position: [20, 30, 40] });
    expect(updateObject).toHaveBeenCalledWith('child', expect.objectContaining({ position: [22, 33, 44] }));
  });

  it('starts only one animation loop and cancels it cleanly', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);
    const request = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42);
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);

    world.startRendering();
    world.startRendering();
    expect(request).toHaveBeenCalledOnce();

    world.stopRendering();
    expect(cancel).toHaveBeenCalledWith(42);
    world.stopRendering();
    expect(cancel).toHaveBeenCalledOnce();
    request.mockRestore();
    cancel.mockRestore();
  });

  it('receives avatar_presence updates and accurately maps coordinates, distances, and bearings', () => {
    const protocol = new ProtocolStub() as any;
    protocol.connected = true;
    protocol.agentId = 'self-agent-id';
    const world = new WorldViewer(protocol);
    const nearbyListener = vi.fn();
    world.on('nearby_changed', nearbyListener);

    // 1. Self position update via avatar_presence
    protocol.emit('avatar_presence', {
      id: 'self-agent-id',
      coordinates: [100, 100, 20],
      presence: 'online',
    });
    expect(world.avatarPosition).toEqual([100, 100, 20]);

    // 2. Nearby resident enters with array coordinates
    protocol.emit('avatar_presence', {
      id: 'resident-alpha',
      name: 'Alpha Resident',
      coordinates: [100, 110, 20], // 10m North
      presence: 'entered',
    });

    expect(world.nearbyUsers).toHaveLength(1);
    expect(world.nearbyUsers[0]).toMatchObject({
      id: 'resident-alpha',
      name: 'Alpha Resident',
      position: [100, 110, 20],
      distance: 10,
      bearing: 0, // Due North
    });
    expect(nearbyListener).toHaveBeenCalledTimes(1);

    // 3. Nearby resident moves East with object coordinates { x, y, z }
    protocol.emit('avatar_presence', {
      id: 'resident-beta',
      name: 'Beta Resident',
      coordinates: { x: 110, y: 100, z: 20 }, // 10m East
      presence: 'online',
    });

    expect(world.nearbyUsers).toHaveLength(2);
    const beta = world.nearbyUsers.find(u => u.id === 'resident-beta');
    expect(beta).toMatchObject({
      id: 'resident-beta',
      name: 'Beta Resident',
      position: [110, 100, 20],
      distance: 10,
      bearing: 90, // Due East
    });

    // 4. Resident departures (left: true)
    protocol.emit('avatar_presence', {
      id: 'resident-alpha',
      left: true,
      presence: 'left',
    });
    expect(world.nearbyUsers).toHaveLength(1);
    expect(world.nearbyUsers[0].id).toBe('resident-beta');
  });

  it('handles batch avatar_presence updates and string coordinates', () => {
    const protocol = new ProtocolStub() as any;
    protocol.connected = true;
    protocol.agentId = 'my-avatar';
    const world = new WorldViewer(protocol);

    // Batch update in AgentData format
    protocol.emit('avatar_presence', {
      AgentData: [
        { AgentID: 'my-avatar', Position: [0, 0, 0] },
        { AgentID: 'gamma-avatar', Name: 'Gamma Resident', Position: '<30, 40, 0>' },
      ],
    });

    expect(world.avatarPosition).toEqual([0, 0, 0]);
    expect(world.nearbyUsers).toHaveLength(1);
    expect(world.nearbyUsers[0]).toMatchObject({
      id: 'gamma-avatar',
      name: 'Gamma Resident',
      position: [30, 40, 0],
      distance: 50, // 3-4-5 triangle: hypot(30, 40) = 50
    });
  });

  it('resets camera view to the avatar position with resetCamera()', () => {
    const protocol = new ProtocolStub() as any;
    protocol.connected = true;
    protocol.agentId = 'my-avatar';
    const world = new WorldViewer(protocol);
    (world as any).camera3d = new Camera3D();

    world.avatarPosition = [140, 150, 30];
    world.resetCamera();

    expect(world.camera3d.orbitTarget).toEqual([140, 150, 30]);
    expect(world.camera3d.preset).toBe('rear');
    expect(world.camera3d.mode).toBe('orbit');
    expect(world.camera3d.orbitDistance).toBe(7.5);
  });

  it('hydrates sculpts and meshes with decodedMeshes even when assets arrive before objects', () => {
    const protocol = new ProtocolStub() as any;
    protocol.connected = true;
    const world = new WorldViewer(protocol);

    // 1. Sculpt asset arrives before prim object (geometry has no .parts)
    protocol.emit('scene:asset-ready', {
      assetId: 'sculpt-1',
      geometry: { vertices: [0, 0, 0, 1, 1, 1], indices: [0, 1, 0] },
    });

    // 2. Prim object arrives after asset is cached
    protocol.emit('scene:object-add', {
      id: 'sculpt-prim',
      localId: 50,
      assetId: 'sculpt-1',
      assetKind: 'sculpt',
      position: [10, 10, 10],
    });

    const obj = world.objects.find((o) => o.id === 'sculpt-prim');
    expect(obj).toBeDefined();
    expect(obj.decodedMeshes).toEqual([{ mesh: 'asset:sculpt-1:0', materialIndex: 0 }]);
  });

  it('resolves textures from decodedTextures cache when prim arrives', () => {
    const protocol = new ProtocolStub() as any;
    protocol.connected = true;
    const world = new WorldViewer(protocol);

    // Pre-cache texture
    protocol.emit('scene:texture-ready', {
      assetId: 'tex-99',
      width: 2,
      height: 2,
      rgba: btoa('\u00ff\u00ff\u00ff\u00ff'),
    });

    protocol.emit('scene:object-add', {
      id: 'textured-prim',
      localId: 60,
      textureId: 'tex-99',
      position: [1, 2, 3],
    });

    const obj = world.objects.find((o) => o.id === 'textured-prim');
    expect(obj).toBeDefined();
    expect(obj.decodedTexture).toBe('texture:tex-99');
  });

  it('reapplies a face when its GLTF override texture arrives', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);
    const updateObject = vi.fn();
    (world as any).scene3d = {
      objects: new Map([['pbr-prim', {}]]),
      addAssetTexture: vi.fn((id: string) => `texture:${id}`),
      updateObject,
    };
    protocol.emit('scene:object-add', {
      id: 'pbr-prim', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
      faceTextures: [{ materialOverride: { textures: [{ textureId: 'OVERRIDE-TEX' }] } }],
    });
    updateObject.mockClear();

    protocol.emit('scene:texture-ready', {
      assetId: 'override-tex', width: 1, height: 1, rgba: btoa('\u00ff\u00ff\u00ff\u00ff'),
    });

    expect(updateObject).toHaveBeenCalled();
    expect(updateObject.mock.calls.at(-1)?.[1].faces[0].texture).toBe('texture:OVERRIDE-TEX');
  });

  it('resolves PBR face material overrides even when no base material asset exists', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol);
    (world as any).scene3d = {
      objects: new Map(),
      addAssetTexture: vi.fn((id: string) => `texture:${id}`),
      updateObject: vi.fn(),
      addObject: vi.fn(),
    };
    protocol.emit('scene:texture-ready', {
      assetId: 'pbr-base', width: 1, height: 1, rgba: btoa('\u00ff\u00ff\u00ff\u00ff'),
    });
    protocol.emit('scene:object-add', {
      id: 'standalone-pbr-prim', position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1],
      faceTextures: [{
        materialOverride: {
          metallicFactor: 0.9,
          roughnessFactor: 0.1,
          textures: [{ textureId: 'pbr-base' }]
        }
      }],
    });

    const obj = world.objects.find((o) => o.id === 'standalone-pbr-prim');
    expect(obj).toBeDefined();
    expect(obj.decodedFaceTextures[0].pbr).toEqual({
      metallic: 0.9,
      roughness: 0.1,
      emissive: undefined,
      alphaMode: undefined,
      alphaCutoff: undefined,
      doubleSided: undefined,
      baseColorTexture: 'texture:pbr-base',
      normalTexture: undefined,
      metallicRoughnessTexture: undefined,
      emissiveTexture: undefined,
    });
    expect(obj.decodedFaceTextures[0].texture).toBe('texture:pbr-base');
  });
});
