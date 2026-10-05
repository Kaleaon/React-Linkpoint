import { describe, expect, it, vi } from 'vitest';
import { WorldViewer } from '../world';
import { AvatarSkeleton } from '../avatar-skeleton';

function makeMockProtocol() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

describe('Bento Attachment Points & Face Texture Hydration', () => {
  it('anchors extended Bento attachment points accurately to skeleton joint nodes', () => {
    const mockProtocol = makeMockProtocol();
    const world = new WorldViewer(mockProtocol as any);
    const avatar = {
      id: 'avatar-1',
      localId: 10,
      avatar: true,
      position: [100, 100, 20],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1.9],
    };
    (world as any).upsertSceneObject(avatar);

    // Attach items to extended Bento attachment points
    const bentoPoints = [
      { point: 41, name: 'Left Ring Finger', joint: 'mHandRing1Left' },
      { point: 43, name: 'Tail Base', joint: 'mTail1' },
      { point: 45, name: 'Left Wing', joint: 'mWing1Left' },
      { point: 47, name: 'Jaw', joint: 'mFaceJaw' },
    ];

    const skeleton = new AvatarSkeleton();
    const worldMatrices = skeleton.worldMatrices();

    for (const item of bentoPoints) {
      const attachment = {
        id: `attach-${item.point}`,
        localId: 100 + item.point,
        parentId: 10, // attached to avatar
        attachmentPoint: item.point,
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      };
      (world as any).upsertSceneObject(attachment);

      const sceneObj = (world as any).sceneObjects.get(`attach-${item.point}`);
      expect(sceneObj).toBeDefined();

      const transform = (world as any).attachmentTransform(sceneObj, avatar);
      expect(transform).not.toBeNull();

      const jointIndex = skeleton.indexOf(item.joint);
      expect(jointIndex).toBeGreaterThanOrEqual(0);

      const expectedJointPos = [worldMatrices[jointIndex][12], worldMatrices[jointIndex][13], worldMatrices[jointIndex][14]];
      const heightOffset = avatar.scale[2] / 2;
      expect(transform.position[0]).toBeCloseTo(avatar.position[0] + expectedJointPos[0], 2);
      expect(transform.position[1]).toBeCloseTo(avatar.position[1] + expectedJointPos[1], 2);
      expect(transform.position[2]).toBeCloseTo(avatar.position[2] - heightOffset + expectedJointPos[2], 2);
    }
  });

  it('hydrates face textures correctly without turning textures white or missing', () => {
    const mockProtocol = makeMockProtocol();
    const world = new WorldViewer(mockProtocol as any);
    const mockScene3d = {
      objects: new Map(),
      addAssetTexture: vi.fn((id, w, h, rgba) => `texture:${id}`),
      addObject: vi.fn(),
      updateObject: vi.fn(),
    };
    (world as any).scene3d = mockScene3d;

    const objectWithFace = {
      id: 'prim-1',
      localId: 20,
      position: [0, 0, 0],
      faceTextures: [
        {
          textureId: 'face-tex-12345678',
          color: [1, 1, 1, 1],
        },
      ],
    };
    (world as any).upsertSceneObject(objectWithFace);

    // Apply downloaded texture asset
    const rgbaBase64 = btoa('RGBAdata4bytes!!');
    (world as any).applyTexture({ assetId: 'face-tex-12345678', width: 2, height: 2, rgba: rgbaBase64 });

    expect(mockScene3d.addAssetTexture).toHaveBeenCalledWith('face-tex-12345678', 2, 2, expect.any(Uint8Array));
    const sceneObj = (world as any).sceneObjects.get('prim-1');
    expect(sceneObj.decodedFaceTextures[0].texture).toBe('texture:face-tex-12345678');
  });
});
