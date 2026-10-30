import { describe, expect, it, vi } from 'vitest';
import { WorldViewer } from '../world';
import { Utils } from '../utils';

class ProtocolStub extends Utils.EventEmitter {
  connected = false;
  authReply: Record<string, any> | null = null;
}

describe('WorldViewer subject cache & hierarchy invalidation', () => {
  it('caches animation subject resolutions and hits cache on subsequent queries', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol) as any;

    protocol.emit('scene:object-add', {
      id: 'avatar-1',
      localId: 10,
      avatar: true,
      position: [0, 0, 0],
    });

    protocol.emit('scene:object-add', {
      id: 'attachment-1',
      localId: 11,
      parentId: 10,
      position: [1, 0, 0],
    });

    protocol.emit('scene:object-add', {
      id: 'child-1',
      localId: 12,
      parentId: 11,
      position: [2, 0, 0],
    });

    expect(world.subjectCache.size).toBe(0);

    const attachmentObj = world.sceneObjects.get('attachment-1');
    const childObj = world.sceneObjects.get('child-1');

    const subject1 = world.animationSubject(attachmentObj);
    expect(subject1).toBe('avatar-1');
    expect(world.subjectCache.get('attachment-1')).toBe('avatar-1');

    const subject2 = world.animationSubject(childObj);
    expect(subject2).toBe('avatar-1');
    expect(world.subjectCache.get('child-1')).toBe('avatar-1');

    // Spy on localObjectIds.get to ensure cache hit bypasses parent loops
    const spy = vi.spyOn(world.localObjectIds, 'get');
    expect(world.animationSubject(childObj)).toBe('avatar-1');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('yields identical resolution between cached and uncached paths for deep hierarchies', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol) as any;

    protocol.emit('scene:object-add', {
      id: 'avatar-root',
      localId: 1,
      avatar: true,
    });

    let currentParentLocalId = 1;
    const levelIds: string[] = [];
    for (let depth = 2; depth <= 10; depth++) {
      const objId = `node-depth-${depth}`;
      levelIds.push(objId);
      protocol.emit('scene:object-add', {
        id: objId,
        localId: depth,
        parentId: currentParentLocalId,
      });
      currentParentLocalId = depth;
    }

    const deepestObj = world.sceneObjects.get('node-depth-10');

    // First resolution (uncached traversal)
    const uncachedResult = world.animationSubject(deepestObj);
    expect(uncachedResult).toBe('avatar-root');

    // Second resolution (cached)
    const cachedResult = world.animationSubject(deepestObj);
    expect(cachedResult).toBe('avatar-root');
    expect(world.subjectCache.get('node-depth-10')).toBe('avatar-root');
  });

  it('invalidates cache entries when an object parentId changes', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol) as any;

    protocol.emit('scene:object-add', { id: 'avatar-A', localId: 1, avatar: true });
    protocol.emit('scene:object-add', { id: 'avatar-B', localId: 2, avatar: true });
    protocol.emit('scene:object-add', { id: 'item-1', localId: 3, parentId: 1 });
    protocol.emit('scene:object-add', { id: 'subitem-1', localId: 4, parentId: 3 });

    expect(world.animationSubject(world.sceneObjects.get('item-1'))).toBe('avatar-A');
    expect(world.animationSubject(world.sceneObjects.get('subitem-1'))).toBe('avatar-A');
    expect(world.subjectCache.get('item-1')).toBe('avatar-A');
    expect(world.subjectCache.get('subitem-1')).toBe('avatar-A');

    // Reparent item-1 from avatar-A (1) to avatar-B (2)
    protocol.emit('scene:object-update', { id: 'item-1', localId: 3, parentId: 2 });

    expect(world.subjectCache.has('item-1')).toBe(false);
    expect(world.subjectCache.has('subitem-1')).toBe(false);

    expect(world.animationSubject(world.sceneObjects.get('item-1'))).toBe('avatar-B');
    expect(world.animationSubject(world.sceneObjects.get('subitem-1'))).toBe('avatar-B');
    expect(world.subjectCache.get('item-1')).toBe('avatar-B');
    expect(world.subjectCache.get('subitem-1')).toBe('avatar-B');
  });

  it('invalidates cache entries when an object avatar flag changes', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol) as any;

    protocol.emit('scene:object-add', { id: 'root-1', localId: 1, avatar: false });
    protocol.emit('scene:object-add', { id: 'child-1', localId: 2, parentId: 1 });

    const rootObj = world.sceneObjects.get('root-1');
    const childObj = world.sceneObjects.get('child-1');

    expect(world.animationSubject(world.sceneObjects.get('child-1'))).toBe('child-1');
    expect(world.subjectCache.get('child-1')).toBe('child-1');

    // Change root-1 avatar flag to true
    protocol.emit('scene:object-update', { id: 'root-1', localId: 1, avatar: true });

    expect(world.subjectCache.has('child-1')).toBe(false);

    expect(world.animationSubject(world.sceneObjects.get('child-1'))).toBe('root-1');
    expect(world.subjectCache.get('child-1')).toBe('root-1');
  });

  it('removes cache entries when objects leave the scene', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol) as any;

    protocol.emit('scene:object-add', { id: 'avatar-1', localId: 1, avatar: true });
    protocol.emit('scene:object-add', { id: 'attach-1', localId: 2, parentId: 1 });
    protocol.emit('scene:object-add', { id: 'subattach-1', localId: 3, parentId: 2 });

    const attachObj = world.sceneObjects.get('attach-1');
    const subattachObj = world.sceneObjects.get('subattach-1');

    world.animationSubject(attachObj);
    world.animationSubject(subattachObj);

    expect(world.subjectCache.get('attach-1')).toBe('avatar-1');
    expect(world.subjectCache.get('subattach-1')).toBe('avatar-1');

    // Remove attach-1 from scene
    protocol.emit('scene:object-remove', { id: 'attach-1', localId: 2 });

    expect(world.subjectCache.has('attach-1')).toBe(false);
    expect(world.subjectCache.get('subattach-1')).toBe('subattach-1');
  });

  it('purges all subject cache entries on region clear / disconnect', () => {
    const protocol = new ProtocolStub();
    const world = new WorldViewer(protocol) as any;

    protocol.emit('scene:object-add', { id: 'avatar-1', localId: 1, avatar: true });
    protocol.emit('scene:object-add', { id: 'attach-1', localId: 2, parentId: 1 });

    world.animationSubject(world.sceneObjects.get('attach-1'));
    expect(world.subjectCache.size).toBeGreaterThan(0);

    protocol.emit('disconnected');

    expect(world.subjectCache.size).toBe(0);
  });
});
