import { describe, expect, it } from 'vitest';
import {
  BitReader,
  DEFAULT_REGION_WIDTH,
  RegionWind,
  WIND_SCALE_HACK,
  buildDecopyMatrix,
  decodeGroupHeader,
  decodePatch,
  decodePatchHeader,
} from '../wind';

/** Mirror of LLBitPack::bitPack: most significant bit first, multi-byte values written low byte first. */
class BitWriter {
  private bits: number[] = [];
  write(value: number, count: number) {
    let remaining = count,
      v = value;
    while (remaining > 0) {
      const chunk = Math.min(8, remaining);
      remaining -= chunk;
      const byte = v % 256;
      v = Math.floor(v / 256);
      for (let i = chunk - 1; i >= 0; i--) this.bits.push((byte >> i) & 1);
    }
  }
  bytes() {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((b, i) => {
      if (b) out[i >> 3] |= 0x80 >> (i & 7);
    });
    return out;
  }
}

const SIZE = 16;
const floatBits = (value: number) => {
  const d = new DataView(new ArrayBuffer(4));
  d.setFloat32(0, value, true);
  return d.getUint32(0, true);
};

/** Mirror of code_patch for a sparse coefficient list: [zigzagIndex, value]. */
function writePatch(
  w: BitWriter,
  quantWbits: number,
  dc: number,
  range: number,
  coefficients: Record<number, number>,
  ids = 0,
) {
  const wordBits = (quantWbits & 0xf) + 2;
  w.write(quantWbits, 8);
  w.write(floatBits(dc), 32);
  w.write(range, 16);
  w.write(ids, 10);
  const last = Math.max(-1, ...Object.keys(coefficients).map(Number));
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (i > last) {
      w.write(0b10, 2);
      return;
    }
    const v = coefficients[i] ?? 0;
    if (!v) w.write(0, 1);
    else {
      w.write(0b11, 2);
      w.write(v < 0 ? 1 : 0, 1);
      w.write(Math.abs(v), wordBits);
    }
  }
}

function layer(
  x: Parameters<typeof writePatch>[4],
  y: Parameters<typeof writePatch>[4],
  opts: { quant?: number; dcX?: number; dcY?: number; range?: number } = {},
) {
  const w = new BitWriter();
  w.write(SIZE, 16);
  w.write(SIZE, 8);
  w.write(0x37, 8);
  const quant = opts.quant ?? (3 << 4) | 8;
  writePatch(w, quant, opts.dcX ?? 0, opts.range ?? 16, x, 0);
  writePatch(w, quant, opts.dcY ?? 0, opts.range ?? 16, y, 0);
  return w.bytes();
}

/** Direct inverse of the viewer's DCT, written out from its definition rather than by the loop structure used in wind.ts. */
function referenceField(
  coefficients: Record<number, number>,
  header: { quant: number; dc: number; range: number },
) {
  const decopy = buildDecopyMatrix(SIZE);
  const block: number[][] = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0)); // [row j][col i]
  for (let j = 0; j < SIZE; j++)
    for (let i = 0; i < SIZE; i++)
      block[j][i] = (coefficients[decopy[j * SIZE + i]] ?? 0) * (1 + 2 * (i + j));
  const c = (u: number) => (u === 0 ? Math.SQRT1_2 : 1);
  const prequant = (header.quant >> 4) + 2;
  const mult = header.range / (1 << prequant);
  const add = mult * (1 << (prequant - 1)) + header.dc;
  const field: number[][] = [];
  for (let line = 0; line < SIZE; line++) {
    field.push([]);
    for (let n = 0; n < SIZE; n++) {
      let total = 0;
      for (let u = 0; u < SIZE; u++)
        for (let m = 0; m < SIZE; m++) {
          total +=
            c(u) *
            c(m) *
            block[m][u] *
            Math.cos(((2 * n + 1) * u * Math.PI) / 32) *
            Math.cos(((2 * line + 1) * m * Math.PI) / 32);
        }
      field[line].push(total * (2 / SIZE) * mult + add);
    }
  }
  return field;
}

describe('bit reading and patch headers', () => {
  it('reads the group and patch headers the way LLBitPack lays them out', () => {
    const w = new BitWriter();
    w.write(300, 16);
    w.write(16, 8);
    w.write(0x37, 8);
    w.write(0x38, 8);
    w.write(floatBits(1.5), 32);
    w.write(40000, 16);
    w.write(0x2a5, 10);
    const bits = new BitReader(w.bytes());
    expect(decodeGroupHeader(bits)).toEqual({ stride: 300, patchSize: 16, layerType: 0x37 });
    expect(decodePatchHeader(bits)).toEqual({
      dcOffset: 1.5,
      range: 40000,
      quantWbits: 0x38,
      patchIds: 0x2a5,
    });
  });

  it('treats the end-of-patches marker as no patch', () => {
    const w = new BitWriter();
    w.write(97, 8);
    expect(decodePatchHeader(new BitReader(w.bytes()))).toBeNull();
  });

  it('decodes zero runs, signed values wider than a byte and the end-of-block code', () => {
    const w = new BitWriter();
    // wordBits 12: 0, +1000, -3, 0, then EOB
    w.write(0, 1);
    w.write(0b11, 2);
    w.write(0, 1);
    w.write(1000, 12);
    w.write(0b11, 2);
    w.write(1, 1);
    w.write(3, 12);
    w.write(0, 1);
    w.write(0b10, 2);
    const out = decodePatch(new BitReader(w.bytes()), SIZE, 12);
    expect(Array.from(out.slice(0, 5))).toEqual([0, 1000, -3, 0, 0]);
    expect(out.every((v, i) => i < 4 || v === 0)).toBe(true);
  });

  it('runs the zig-zag scan from the corner and walks diagonals', () => {
    const m = buildDecopyMatrix(4);
    // Scan order: (0,0) (1,0) (0,1) (0,2) (1,1) (2,0) ... indexed [row*4+col] = position in scan.
    expect([m[0], m[1], m[4], m[8], m[5], m[2]]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(m).size).toBe(16);
  });
});

describe('RegionWind.decompress', () => {
  it('turns a DC-only patch into a constant field worked out by hand', () => {
    // DC coefficient c: IDCT gives c/16; value = (c/16 + 2^(p-1)/... ) -> mult*(c/16) + mult*2^(p-1) + dc.
    const quant = (3 << 4) | 8; // prequant 5, 10-bit words
    const wind = new RegionWind();
    expect(
      wind.decompress(layer({ 0: 64 }, { 0: -32 }, { quant, dcX: 1, dcY: -2, range: 32 })),
    ).toBe(true);
    const mult = 32 / 32;
    const expectX = mult * (64 / 16) + mult * 16 + 1;
    const expectY = mult * (-32 / 16) + mult * 16 - 2;
    wind.velX.forEach((v) => expect(v).toBeCloseTo(expectX, 4));
    wind.velY.forEach((v) => expect(v).toBeCloseTo(expectY, 4));
    expect(wind.loaded).toBe(true);
  });

  it('matches a direct evaluation of the inverse DCT for mixed coefficients', () => {
    const coefficients = { 0: 40, 1: -25, 2: 18, 4: 9, 7: -12, 20: 6, 61: -3 };
    const quant = (4 << 4) | 9;
    const wind = new RegionWind();
    expect(wind.decompress(layer(coefficients, { 0: 5 }, { quant, dcX: -3.25, range: 100 }))).toBe(
      true,
    );
    const reference = referenceField(coefficients, { quant, dc: -3.25, range: 100 });
    for (let j = 0; j < SIZE; j++)
      for (let i = 0; i < SIZE; i++)
        expect(wind.velX[j * SIZE + i]).toBeCloseTo(reference[j][i], 3);
  });

  it('rejects data that is not a pair of 16x16 patches and keeps the previous grid', () => {
    const wind = new RegionWind();
    expect(wind.decompress(new Uint8Array([1, 2, 3]))).toBe(false);
    const w = new BitWriter();
    w.write(32, 16);
    w.write(32, 8);
    w.write(0x37, 8);
    expect(wind.decompress(w.bytes())).toBe(false);
    expect(wind.loaded).toBe(false);
    expect(wind.velX[0]).toBe(0.5);
  });
});

describe('RegionWind lookups', () => {
  const field = () => {
    const wind = new RegionWind();
    for (let j = 0; j < SIZE; j++)
      for (let i = 0; i < SIZE; i++) {
        wind.velX[j * SIZE + i] = i;
        wind.velY[j * SIZE + i] = j * 10;
      }
    return wind;
  };

  it('starts every cell at the official 0.5 m/s physical wind', () => {
    expect(new RegionWind().velocity([10, 10, 0])).toEqual([0.5, 0.5, 0]);
  });

  it('interpolates bilinearly between grid cells (16 m apart in a 256 m region)', () => {
    const wind = field();
    // x = 24 m is halfway between cells 1 and 2; y = 8 m is halfway between rows 0 and 1.
    const [x, y, z] = wind.velocity([24, 8, 30]);
    expect(x).toBeCloseTo(1.5, 5);
    expect(y).toBeCloseTo(5, 5);
    expect(z).toBe(0);
  });

  it('uses the nearest cell on the last row and column, clamps negatives and wraps past the edge', () => {
    const wind = field();
    expect(wind.velocity([255, 3, 0])[0]).toBeCloseTo(15, 5);
    expect(wind.velocity([-40, 3, 0])[0]).toBeCloseTo(0, 5);
    expect(wind.velocity([DEFAULT_REGION_WIDTH + 16, 0, 0])[0]).toBeCloseTo(1, 5);
  });

  it('averages the grid and scales it', () => {
    const [x, y] = field().average();
    expect(x).toBeCloseTo(7.5, 5);
    expect(y).toBeCloseTo(75, 5);
  });

  it("sums the grid at dim, dim/2 ... 1 for the noisy lookup, with the viewer's norm", () => {
    const wind = new RegionWind();
    // A uniform grid of 0.5: each octave returns 0.5 m/s / d, sum for dim 4 is 0.5*(0.25+0.5+1) = 0.875, norm 1.75 -> 0.5.
    expect(wind.velocityNoisy([10, 10, 0], 4)[0]).toBeCloseTo(0.5, 5);
  });
});
