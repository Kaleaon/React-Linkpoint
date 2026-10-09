import { describe, expect, it, vi } from 'vitest';
import { WorldViewer } from '../world';

const make = () => {
  const protocol: any = { connected: true, agentId: 'me', on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const world: any = new WorldViewer(protocol);
  return world;
};

describe('own avatar state', () => {
  it('knows when the avatar is sitting on an object', () => {
    const world = make();
    world.sceneObjects.set('me', { id: 'me', avatar: true, parentId: 0 });
    expect(world.isSitting()).toBe(false);
    world.sceneObjects.set('me', { id: 'me', avatar: true, parentId: 42 });
    expect(world.isSitting()).toBe(true);
    expect(world.keyMode()).toBe('sitting');
  });

  it('counts only decoded attachment meshes and reports what is not decoded yet', () => {
    const world = make();
    world.localObjectIds.set(1, 'me');
    world.sceneObjects.set('me', { id: 'me', avatar: true, parentId: 0 });
    world.sceneObjects.set('hat', { id: 'hat', parentId: 1, assetId: 'hat-mesh' });
    world.sceneObjects.set('watch', { id: 'watch', parentId: 1, assetId: 'watch-mesh' });
    world.sceneObjects.set('stranger-hat', { id: 'stranger-hat', parentId: 9, assetId: 'hat-mesh' });
    world.decodedAssets.set('hat-mesh', { parts: [{ vertices: new Array(12).fill(0), indices: [0, 1, 2, 0, 2, 3] }] });
    expect(world.getAttachmentMeshStats()).toEqual({ attachments: 2, meshes: 1, vertices: 4, triangles: 2 });
  });
});
