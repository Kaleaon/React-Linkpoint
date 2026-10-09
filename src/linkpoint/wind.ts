/**
 * Region wind, ported from the official viewer. The simulator sends the wind as a `LayerData` message
 * of layer type '7': a 16x16 grid of velocities for the X and Y components, each stored as one DCT
 * patch. Sources (github.com/secondlife/viewer @ 7dd6de6120ce):
 *  - `indra/llcommon/llbitpack.h`          bit order of `LLBitPack::bitUnpack`
 *  - `indra/llmessage/patch_code.cpp`      `decode_patch_group_header`, `decode_patch_header`, `decode_patch`
 *  - `indra/llmessage/patch_idct.cpp`      dequantize table, zig-zag copy matrix, inverse DCT, `decompress_patch`
 *  - `indra/newview/llvlmanager.cpp`       the layer codes ('7' is wind) and the call order
 *  - `indra/newview/llwind.cpp`            `LLWind::decompress`, `getVelocity`, `getVelocityNoisy`, `getAverage`
 *
 * Differences: the viewer starts every region with a grid of 0.5 before data arrives; here `loaded`
 * says whether a layer has been decoded and callers should treat an unloaded region as having no
 * wind. Only 16x16 patches are decoded (the wind layer is always 16x16).
 */

/** Default wind scale factor (1.0 = physical velocity in m/s). Legacy viewer WIND_SCALE_HACK was 2. */
export const WIND_SCALE_HACK = 1.0;
/** `LLWind::mSize`. */
export const WIND_GRID_SIZE = 16;
/** `WIND_LAYER_CODE` in `llvlmanager.cpp`: the character '7'. */
export const WIND_LAYER_TYPE = 0x37;
/** `END_OF_PATCHES` in `patch_dct.h`: a patch header whose first byte is this carries no patch. */
export const END_OF_PATCHES = 97;
/** Default region width, `LLWorld::getRegionWidthInMeters`. */
export const DEFAULT_REGION_WIDTH = 256;

const OO_SQRT2 = 0.7071067811865475244008443621049;

/** `LLBitPack::bitUnpack`: bits are read most significant first, and multi-byte values are filled low byte first. */
export class BitReader {
  private index = 0;
  private bit = 0; // bits already consumed from the current byte
  constructor(private readonly bytes: Uint8Array) {}

  /** Read `count` bits into little-endian bytes the way `bitUnpack` fills its output buffer; returns them as a number. */
  read(count: number): number {
    let value = 0;
    let shift = 0;
    let remaining = count;
    while (remaining > 0) {
      const chunk = Math.min(8, remaining);
      remaining -= chunk;
      let byte = 0;
      for (let i = 0; i < chunk; i++) {
        if (this.index >= this.bytes.length) throw new RangeError('wind layer data ended early');
        byte = ((byte << 1) | ((this.bytes[this.index] >> (7 - this.bit)) & 1)) & 0xff;
        if (++this.bit === 8) { this.bit = 0; this.index++; }
      }
      value += byte * 2 ** shift;
      shift += 8;
    }
    return value;
  }
}

export interface GroupHeader { stride: number; patchSize: number; layerType: number }
export interface PatchHeader { dcOffset: number; range: number; quantWbits: number; patchIds: number }

/** `decode_patch_group_header`. */
export function decodeGroupHeader(bits: BitReader): GroupHeader {
  return { stride: bits.read(16), patchSize: bits.read(8), layerType: bits.read(8) };
}

const f32 = new DataView(new ArrayBuffer(4));
/** `decode_patch_header`; null for the end-of-patches marker. */
export function decodePatchHeader(bits: BitReader): PatchHeader | null {
  const quantWbits = bits.read(8);
  if (quantWbits === END_OF_PATCHES) return null;
  f32.setUint32(0, bits.read(32), true);
  const dcOffset = f32.getFloat32(0, true);
  const range = bits.read(16);
  const patchIds = bits.read(10);
  return { dcOffset, range, quantWbits, patchIds };
}

/** `decode_patch`: `size*size` quantised coefficients in zig-zag order. */
export function decodePatch(bits: BitReader, patchSize: number, wordBits: number): Int32Array {
  const out = new Int32Array(patchSize * patchSize);
  for (let i = 0; i < out.length; i++) {
    if (!bits.read(1)) continue; // a lone 0 is a zero coefficient
    if (!bits.read(1)) return out; // 10: end of block, the rest are zero
    const negative = bits.read(1) === 1;
    const magnitude = bits.read(wordBits);
    out[i] = negative ? -magnitude : magnitude;
  }
  return out;
}

/** `build_decopy_matrix`: where each position of the block sits in the zig-zag scan. */
export function buildDecopyMatrix(size: number): Int32Array {
  const matrix = new Int32Array(size * size);
  let i = 0, j = 0, count = 0, diag = false, right = true;
  while (i < size && j < size) {
    matrix[j * size + i] = count++;
    if (!diag) {
      if (right) { if (i < size - 1) i++; else j++; right = false; diag = true; }
      else { if (j < size - 1) j++; else i++; right = true; diag = true; }
    } else if (right) {
      i++; j--;
      if (i === size - 1 || j === 0) diag = false;
    } else {
      i--; j++;
      if (i === 0 || j === size - 1) diag = false;
    }
  }
  return matrix;
}

/** `decompress_patch` for a 16x16 patch: dequantise, inverse DCT, scale to the header's range. */
export function decompressPatch(coefficients: Int32Array, header: PatchHeader, size: number): Float32Array {
  const decopy = buildDecopyMatrix(size);
  const cosines = new Float64Array(size * size); // [u*size+n] = cos((2n+1) u pi / 2size)
  for (let u = 0; u < size; u++) for (let n = 0; n < size; n++) cosines[u * size + n] = Math.cos(((2 * n + 1) * u * Math.PI) / (2 * size));

  const block = new Float64Array(size * size);
  for (let k = 0; k < block.length; k++) {
    const dequantise = 1 + 2 * ((k % size) + Math.floor(k / size)); // build_patch_dequantize_table
    block[k] = coefficients[decopy[k]] * dequantise;
  }
  // Columns, then lines (idct_column / idct_line, the general-size path).
  const temp = new Float64Array(size * size);
  for (let column = 0; column < size; column++) {
    for (let n = 0; n < size; n++) {
      let total = OO_SQRT2 * block[column];
      for (let u = 1; u < size; u++) total += block[u * size + column] * cosines[u * size + n];
      temp[size * n + column] = total;
    }
  }
  const out = new Float32Array(size * size);
  const prequant = (header.quantWbits >> 4) + 2;
  const mult = (1 / (1 << prequant)) * header.range;
  const addval = mult * (1 << (prequant - 1)) + header.dcOffset;
  const oosob = 2 / size;
  for (let line = 0; line < size; line++) {
    for (let n = 0; n < size; n++) {
      let total = OO_SQRT2 * temp[line * size];
      for (let u = 1; u < size; u++) total += temp[line * size + u] * cosines[u * size + n];
      out[line * size + n] = total * oosob * mult + addval;
    }
  }
  return out;
}

export type Vec3 = [number, number, number];

export class RegionWind {
  readonly size = WIND_GRID_SIZE;
  readonly velX = new Float32Array(WIND_GRID_SIZE * WIND_GRID_SIZE).fill(0.5);
  readonly velY = new Float32Array(WIND_GRID_SIZE * WIND_GRID_SIZE).fill(0.5);
  /** True once a wind layer has been decoded. */
  loaded = false;

  constructor(public regionWidth = DEFAULT_REGION_WIDTH, public windScaleHack = WIND_SCALE_HACK) {}

  /**
   * `LLVLManager::unpackData` + `LLWind::decompress`: decode the data of a layer-'7' message.
   * Returns false (leaving the grid as it was) when the data is not a 16x16 wind patch pair.
   */
  decompress(data: Uint8Array): boolean {
    try {
      const bits = new BitReader(data);
      const group = decodeGroupHeader(bits);
      if (group.patchSize !== WIND_GRID_SIZE) return false;
      const x = this.decodeComponent(bits, group.patchSize);
      const y = x && this.decodeComponent(bits, group.patchSize);
      if (!x || !y) return false;
      this.velX.set(x);
      this.velY.set(y);
      this.loaded = true;
      return true;
    } catch {
      return false;
    }
  }

  private decodeComponent(bits: BitReader, size: number): Float32Array | null {
    const header = decodePatchHeader(bits);
    if (!header) return null;
    const coefficients = decodePatch(bits, size, (header.quantWbits & 0xf) + 2);
    return decompressPatch(coefficients, header, size);
  }

  /** `LLWind::getAverage`. */
  average(): Vec3 {
    let x = 0, y = 0;
    for (let i = 0; i < this.velX.length; i++) { x += this.velX[i]; y += this.velY[i]; }
    const scale = (1 / this.velX.length) * this.windScaleHack;
    return [x * scale, y * scale, 0];
  }

  /** `LLWind::getVelocity`: bilinear lookup at a position relative to the region's south-west corner. */
  velocity(position: ArrayLike<number>): Vec3 {
    const width = this.regionWidth;
    const clamp = (v: number) => (v < 0 ? 0 : v >= width ? v % width : v);
    const px = clamp(position[0]), py = clamp(position[1]);
    const gx = (px * this.size) / width, gy = (py * this.size) / width;
    const i = Math.floor(gx), j = Math.floor(gy);
    const k = i + j * this.size;
    const dx = gx - i, dy = gy - j;
    let x: number, y: number;
    if (i < this.size - 1 && j < this.size - 1) {
      const s = this.size;
      const lerp = (a: Float32Array) => a[k] * (1 - dx) * (1 - dy) + a[k + 1] * dx * (1 - dy) + a[k + s] * dy * (1 - dx) + a[k + s + 1] * dx * dy;
      x = lerp(this.velX); y = lerp(this.velY);
    } else {
      x = this.velX[k]; y = this.velY[k];
    }
    return [x * this.windScaleHack, y * this.windScaleHack, 0];
  }

  /** `LLWind::getVelocityNoisy`: fractal sum of the grid at `dim`, `dim/2`, ... down to 1. */
  velocityNoisy(position: ArrayLike<number>, dim: number): Vec3 {
    const norm = dim === 8 ? 1.875 : dim === 4 ? 1.75 : dim === 2 ? 1.5 : 1;
    const sum: Vec3 = [0, 0, 0];
    for (let d = dim; d >= 1; d /= 2) {
      const v = this.velocity([position[0] * d, position[1] * d, position[2] * d]);
      sum[0] += v[0] / d; sum[1] += v[1] / d; sum[2] += v[2] / d;
    }
    const scale = 1 / norm;
    return [sum[0] * scale, sum[1] * scale, sum[2] * scale];
  }
}
