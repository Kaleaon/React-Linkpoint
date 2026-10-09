import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { serializeSoundPacket } = require('../../../core/sl-sounds.cjs');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');
const uuid = (value: string) => ({ toString: () => value });

describe('Second Life sound packets', () => {
  it('serializes a spatial trigger without losing its source and gain', () => {
    expect(
      serializeSoundPacket({
        message: {
          id: Message.SoundTrigger,
          SoundData: {
            SoundID: uuid('sound'),
            ObjectID: uuid('object'),
            OwnerID: uuid('owner'),
            ParentID: uuid('parent'),
            Position: { x: 10, y: 20, z: 30 },
            Gain: 0.4,
          },
        },
      }),
    ).toEqual({
      action: 'trigger',
      soundId: 'sound',
      objectId: 'object',
      ownerId: 'owner',
      parentId: 'parent',
      position: [10, 20, 30],
      gain: 0.4,
      flags: 0,
    });
  });

  it('keeps the region handle so the position can be made global', () => {
    const handle = (256000n << 32n) | 256256n;
    const result = serializeSoundPacket({
      message: {
        id: Message.SoundTrigger,
        SoundData: {
          SoundID: uuid('sound'),
          ObjectID: uuid('object'),
          OwnerID: uuid('owner'),
          ParentID: uuid('parent'),
          Handle: { toString: () => handle.toString() },
          Position: { x: 1, y: 2, z: 3 },
          Gain: 1,
        },
      },
    });
    expect(result.handle).toBe(handle.toString());
  });

  it('forwards the zero UUID attached-sound message with its flags, so the client decides (loop clears, STOP stops)', () => {
    const result = serializeSoundPacket({
      message: {
        id: Message.AttachedSound,
        DataBlock: {
          SoundID: uuid('00000000-0000-0000-0000-000000000000'),
          ObjectID: uuid('object'),
          OwnerID: uuid('owner'),
          Gain: 0,
          Flags: 32,
        },
      },
    });
    expect(result).toMatchObject({
      action: 'attached',
      soundId: '00000000-0000-0000-0000-000000000000',
      objectId: 'object',
      flags: 32,
    });
  });
});
