import { describe, expect, it, vi } from 'vitest';
import { WorldViewer } from '../world';
import { Utils } from '../utils';

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
});
