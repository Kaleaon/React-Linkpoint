import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WorldViewer } from '../world';
import { Utils } from '../utils';
import { AvatarAnimator } from '../avatar-animator';
import { parseBodyPart, type BodyPartMeta } from '../avatar-body';
import type { KeyframeAnimation } from '../avatar-animation';

const dir = `${__dirname}/../../../public/avatar/`;
const meta = JSON.parse(readFileSync(`${dir}meshes.json`, 'utf8')) as Record<string, BodyPartMeta>;
const loadParts = () => new Map(Object.keys(meta).map((part) => {
  const b = readFileSync(`${dir}${part}.bin`);
  return [part, parseBodyPart(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, meta[part])] as const;
}));

class ProtocolStub extends Utils.EventEmitter { connected = true; authReply: Record<string, any> | null = null; }

function setup(withBody: boolean) {
  const protocol = new ProtocolStub();
  const world = new WorldViewer(protocol);
  const objects = new Map<string, any>();
  const scene: any = {
    objects, graphics: { maxJoints: 110 },
    addObject: (id: string, c: any) => { objects.set(id, { ...c }); },
    updateObject: (id: string, u: any) => { Object.assign(objects.get(id) || {}, u); },
    removeObject: (id: string) => { objects.delete(id); },
    addAssetMesh: () => [], addSkinnedMesh: () => '',
  };
  (world as any).scene3d = scene;
  if (withBody) { (world as any).bodyParts = loadParts(); (world as any).bodyMeshesReadyFor = scene; }
  return { protocol, world, scene };
}

const avatar = { id: 'av', localId: 1, avatar: true, position: [10, 20, 31], rotation: [0, 0, 0, 1], scale: [0.45, 0.6, 1.9] };
const bodyIds = (scene: any) => [...scene.objects.keys()].filter((id: string) => id.startsWith('av:body:')).sort();

describe('avatar body in the world', () => {
  it('draws an avatar as skinned body parts standing on the ground and hides the placeholder', () => {
    const { protocol, scene } = setup(true);
    protocol.emit('scene:object-add', avatar);
    expect(bodyIds(scene)).toEqual(['av:body:eyeLeft', 'av:body:eyeRight', 'av:body:hair', 'av:body:head', 'av:body:eyelashes', 'av:body:lowerBody', 'av:body:upperBody'].sort());
    const head = scene.objects.get('av:body:head');
    expect(head.skin).toBeInstanceOf(Float32Array);
    expect(head.position).toEqual([10, 20, 31 - 0.95]); // feet = centre minus half the body height
    expect(head.scale).toEqual([1, 1, 1]);
    expect(head.meshes).toEqual([{ mesh: 'avatar-body:head', materialIndex: 0 }]);
    expect(scene.objects.get('av').visible).toBe(false);
    expect(scene.objects.has('av:legs')).toBe(false);
  });

  it('falls back to placeholder shapes while the body meshes are unavailable', () => {
    const { protocol, scene } = setup(false);
    protocol.emit('scene:object-add', avatar);
    expect(bodyIds(scene)).toEqual([]);
    expect(scene.objects.has('av:legs')).toBe(true);
  });

  it('re-poses the body from running animations and removes every part with the avatar', async () => {
    const { protocol, world, scene } = setup(true);
    let t = 0;
    const turn: KeyframeAnimation = { priority: 4, length: 2, expression: '', inPoint: 0, outPoint: 2, loop: true, easeIn: 0, easeOut: 0.5, handPose: 0,
      joints: [{ name: 'mTorso', priority: 4, rotations: [{ time: 0, value: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }], positions: [] }] };
    (world as any).animator = new AvatarAnimator(async () => turn, () => t);
    protocol.emit('scene:object-add', avatar);
    protocol.emit('scene:animations', { kind: 'avatar', id: 'av', animations: [{ id: 'turn', seq: 1 }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    // upperBody's second joint is mTorso (the first, mPelvis, does not move with a torso turn)
    const before = Array.from(scene.objects.get('av:body:upperBody').skin.slice(12, 24));
    t = 1;
    (world as any).updateAnimatedAvatars();
    const after = Array.from(scene.objects.get('av:body:upperBody').skin.slice(12, 24));
    expect(after).not.toEqual(before);

    protocol.emit('scene:object-remove', { id: 'av', localId: 1 });
    expect(bodyIds(scene)).toEqual([]);
  });
});
