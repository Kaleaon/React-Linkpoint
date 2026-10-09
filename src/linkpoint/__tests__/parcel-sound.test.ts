import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { PARCEL_SOUND_LOCAL, PF_SOUND_LOCAL, ParcelSoundMap } from '../parcel-sound';

const require = createRequire(import.meta.url);
const { serializeParcelPacket } = require('../../../core/sl-parcel-sound.cjs');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const EDGE = 64;

/** An overlay with the cells of [x0,x1) x [y0,y1) (in cells) marked sound-local, split in the 4 chunks the simulator sends. */
function overlayChunks(local: Array<[number, number, number, number]>) {
  const bytes = new Uint8Array(EDGE * EDGE);
  for (const [x0, y0, x1, y1] of local)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) bytes[y * EDGE + x] |= PARCEL_SOUND_LOCAL | 0x01;
  return [0, 1, 2, 3].map((i) => ({
    action: 'overlay' as const,
    sequenceId: i,
    data: b64(bytes.slice(i * 1024, (i + 1) * 1024)),
  }));
}

/** A parcel bitmap with the given cells set (bit x + y*64, least significant first). */
function bitmap(cells: Array<[number, number, number, number]>) {
  const bytes = new Uint8Array((EDGE * EDGE) / 8);
  for (const [x0, y0, x1, y1] of cells)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = y * EDGE + x;
        bytes[i >> 3] |= 1 << (i & 7);
      }
  return b64(bytes);
}

describe('ParcelSoundMap (canHearSound)', () => {
  it("restricts nothing until the avatar's parcel is known", () => {
    const map = new ParcelSoundMap();
    overlayChunks([[0, 0, 64, 64]]).forEach((c) => map.accept(c));
    expect(map.canHear([10, 10, 20])).toBe(true);
  });

  it('with the avatar in an ordinary parcel, sounds are heard everywhere except inside a sound-local parcel', () => {
    const map = new ParcelSoundMap();
    overlayChunks([[32, 32, 48, 48]]).forEach((c) => map.accept(c)); // a sound-local parcel at 128..192 m
    map.accept({
      action: 'parcel',
      sequenceId: 1,
      requestResult: 0,
      localId: 7,
      flags: 0,
      bitmap: bitmap([[0, 0, 16, 16]]),
    });
    expect(map.canHear([8, 8, 20])).toBe(true); // own parcel
    expect(map.canHear([100, 100, 20])).toBe(true); // elsewhere
    expect(map.canHear([140, 140, 20])).toBe(false); // inside the sound-local parcel
    expect(map.canHear(null)).toBe(true); // another region
  });

  it('with the avatar in a sound-local parcel, only sounds from that parcel are heard', () => {
    const map = new ParcelSoundMap();
    map.accept({
      action: 'parcel',
      sequenceId: 1,
      requestResult: 0,
      localId: 7,
      flags: PF_SOUND_LOCAL,
      bitmap: bitmap([[0, 0, 16, 16]]),
    });
    expect(map.canHear([8, 8, 20])).toBe(true);
    expect(map.canHear([100, 100, 20])).toBe(false);
    expect(map.canHear(null)).toBe(false);
  });

  it('cells are 4 m and the bitmap is row-major, low bit first', () => {
    const map = new ParcelSoundMap();
    map.accept({
      action: 'parcel',
      sequenceId: 1,
      requestResult: 0,
      localId: 1,
      flags: PF_SOUND_LOCAL,
      bitmap: bitmap([[3, 5, 4, 6]]),
    });
    expect(map.inAgentParcel([12.5, 20.5, 0])).toBe(true); // x cell 3, y cell 5
    expect(map.inAgentParcel([16.1, 20.5, 0])).toBe(false);
    expect(map.inAgentParcel([12.5, 24.5, 0])).toBe(false);
    expect(map.inAgentParcel([-1, 20, 0])).toBe(false);
  });

  it('takes a newer agent sequence as a new parcel, ignores older ones, and updates flags from another message about the same parcel', () => {
    const map = new ParcelSoundMap();
    map.accept({
      action: 'parcel',
      sequenceId: 5,
      requestResult: 0,
      localId: 7,
      flags: 0,
      bitmap: bitmap([[0, 0, 16, 16]]),
    });
    map.accept({
      action: 'parcel',
      sequenceId: 3,
      requestResult: 0,
      localId: 9,
      flags: PF_SOUND_LOCAL,
      bitmap: bitmap([[32, 32, 48, 48]]),
    }); // out of order: another parcel's flags, ignored
    expect(map.inAgentParcel([8, 8, 0])).toBe(true);
    expect(map.canHear([100, 100, 0])).toBe(true);
    map.accept({
      action: 'parcel',
      sequenceId: -10000,
      requestResult: 0,
      localId: 7,
      flags: PF_SOUND_LOCAL,
      bitmap: '',
    }); // selected parcel = ours: flags updated
    expect(map.canHear([100, 100, 0])).toBe(false);
    map.accept({
      action: 'parcel',
      sequenceId: 6,
      requestResult: 0,
      localId: 9,
      flags: 0,
      bitmap: bitmap([[32, 32, 48, 48]]),
    });
    expect(map.inAgentParcel([8, 8, 0])).toBe(false);
    expect(map.inAgentParcel([140, 140, 0])).toBe(true);
  });

  it('ignores a "no data" reply, a wrong-size overlay chunk, and resets on a region change', () => {
    const map = new ParcelSoundMap();
    map.accept({
      action: 'parcel',
      sequenceId: 1,
      requestResult: -1,
      localId: 1,
      flags: PF_SOUND_LOCAL,
      bitmap: '',
    });
    expect(map.hasAgentParcel).toBe(false);
    map.accept({
      action: 'overlay',
      sequenceId: 0,
      data: b64(new Uint8Array(10).fill(PARCEL_SOUND_LOCAL)),
    });
    expect(map.isSoundLocal([1, 1, 0])).toBe(false);
    overlayChunks([[0, 0, 64, 64]]).forEach((c) => map.accept(c));
    expect(map.isSoundLocal([1, 1, 0])).toBe(true);
    map.accept({ action: 'reset' });
    expect(map.isSoundLocal([1, 1, 0])).toBe(false);
  });
});

describe('forwarded parcel messages', () => {
  it('serializes ParcelOverlay and the agent-relevant fields of ParcelProperties', () => {
    expect(
      serializeParcelPacket({
        message: {
          id: Message.ParcelOverlay,
          ParcelData: { SequenceID: 2, Data: Buffer.from([1, 2, 3]) },
        },
      }),
    ).toEqual({
      action: 'overlay',
      sequenceId: 2,
      data: Buffer.from([1, 2, 3]).toString('base64'),
    });
    expect(
      serializeParcelPacket({
        message: {
          id: Message.ParcelProperties,
          ParcelData: {
            SequenceID: 4,
            RequestResult: 0,
            LocalID: 9,
            ParcelFlags: 0x8000,
            Bitmap: Buffer.from([255]),
          },
        },
      }),
    ).toEqual({
      action: 'parcel',
      sequenceId: 4,
      requestResult: 0,
      localId: 9,
      flags: 0x8000,
      bitmap: '/w==',
    });
    expect(serializeParcelPacket({ message: { id: Message.SoundTrigger } })).toBeNull();
  });
});
