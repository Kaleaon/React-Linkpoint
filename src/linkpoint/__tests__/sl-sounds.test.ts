import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { serializeSoundPacket } = require('../../../core/sl-sounds.cjs');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const uuid = (value: string) => ({ toString: () => value });

describe('Second Life sound packets', () => {
  it('serializes a spatial trigger without losing its source and gain', () => {
    expect(serializeSoundPacket({ message: { id: Message.SoundTrigger, SoundData: {
      SoundID: uuid('sound'), ObjectID: uuid('object'), OwnerID: uuid('owner'), ParentID: uuid('parent'),
      Position: { x: 10, y: 20, z: 30 }, Gain: .4,
    } } })).toEqual({ action: 'trigger', soundId: 'sound', objectId: 'object', ownerId: 'owner', parentId: 'parent', position: [10, 20, 30], gain: .4, flags: 0 });
  });

  it('turns the zero UUID attached-sound message into a stop', () => {
    const result = serializeSoundPacket({ message: { id: Message.AttachedSound, DataBlock: {
      SoundID: uuid('00000000-0000-0000-0000-000000000000'), ObjectID: uuid('object'), OwnerID: uuid('owner'), Gain: 0, Flags: 32,
    } } });
    expect(result.action).toBe('stop');
    expect(result.objectId).toBe('object');
  });
});
