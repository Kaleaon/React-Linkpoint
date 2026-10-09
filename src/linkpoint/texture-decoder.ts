import { JpxImage, type Tile } from 'jpeg2000';

export interface DecodedTexture {
  width: number;
  height: number;
  rgba: Uint8Array;
  hasAlpha: boolean;
}

export interface JpxRaster {
  width: number;
  height: number;
  componentsCount: number;
  tiles: Tile[];
}

/** Matches the practical upper bound accepted by the official viewer image pipeline. */
export const MAX_TEXTURE_DIMENSION = 8_192;
const MAX_TEXTURE_PIXELS = MAX_TEXTURE_DIMENSION * MAX_TEXTURE_DIMENSION;

type JpxInput = Uint8Array & {
  readInt8(offset: number): number;
  readUInt16BE(offset: number): number;
  readUInt32BE(offset: number): number;
};

/* jpeg2000 exposes Uint8Array typings but its parser calls the equivalent
 * Node Buffer readers. Supply those readers without pulling a Buffer shim into
 * the browser bundle. Decorating subarrays matters because JP2 boxes are
 * handed back to the parser as views. */
function decoderInput(bytes: Uint8Array): JpxInput {
  const input = bytes as JpxInput;
  const nativeSubarray = input.subarray.bind(input);
  input.readInt8 = (offset) =>
    new DataView(input.buffer, input.byteOffset, input.byteLength).getInt8(offset);
  input.readUInt16BE = (offset) =>
    new DataView(input.buffer, input.byteOffset, input.byteLength).getUint16(offset, false);
  input.readUInt32BE = (offset) =>
    new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(offset, false);
  input.subarray = ((start?: number, end?: number) =>
    decoderInput(nativeSubarray(start, end))) as typeof input.subarray;
  return input;
}

/**
 * Expand JPEG2000 components into the RGBA8 layout used by the viewer.
 * Lumiya and the official viewer interpret two-component textures as
 * luminance-alpha, rather than red-green, and preserve the fourth component
 * as alpha. Tiles are copied into their canvas positions without assuming a
 * single full-image tile.
 */
export function expandJpxTiles(image: JpxRaster): DecodedTexture {
  const { width, height, componentsCount, tiles } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError('JPEG2000 returned invalid texture dimensions');
  }
  if (
    width > MAX_TEXTURE_DIMENSION ||
    height > MAX_TEXTURE_DIMENSION ||
    width * height > MAX_TEXTURE_PIXELS
  ) {
    throw new RangeError(`JPEG2000 texture ${width}x${height} exceeds viewer limits`);
  }
  if (!Number.isInteger(componentsCount) || componentsCount < 1 || componentsCount > 4) {
    throw new RangeError(`Unsupported JPEG2000 component count: ${componentsCount}`);
  }

  const rgba = new Uint8Array(width * height * 4);
  let hasAlpha = false;
  for (const tile of tiles) {
    if (
      !Number.isInteger(tile.left) ||
      !Number.isInteger(tile.top) ||
      !Number.isInteger(tile.width) ||
      !Number.isInteger(tile.height) ||
      tile.left < 0 ||
      tile.top < 0 ||
      tile.width < 0 ||
      tile.height < 0 ||
      tile.left + tile.width > width ||
      tile.top + tile.height > height
    ) {
      throw new RangeError('JPEG2000 tile lies outside the texture canvas');
    }
    const required = tile.width * tile.height * componentsCount;
    if (tile.items.length < required)
      throw new RangeError('JPEG2000 tile has truncated component data');

    for (let y = 0; y < tile.height; y++) {
      for (let x = 0; x < tile.width; x++) {
        const source = (y * tile.width + x) * componentsCount;
        const target = ((tile.top + y) * width + tile.left + x) * 4;
        const luminance = tile.items[source];
        rgba[target] = luminance;
        rgba[target + 1] = componentsCount >= 3 ? tile.items[source + 1] : luminance;
        rgba[target + 2] = componentsCount >= 3 ? tile.items[source + 2] : luminance;
        const alpha =
          componentsCount === 2
            ? tile.items[source + 1]
            : componentsCount === 4
              ? tile.items[source + 3]
              : 255;
        rgba[target + 3] = alpha;
        hasAlpha ||= alpha !== 255;
      }
    }
  }
  return { width, height, rgba, hasAlpha };
}

/** Decode an SL JPEG2000 codestream or JP2 container into top-down RGBA8 pixels. */
export function decodeJPEG2000(bytes: ArrayBuffer | Uint8Array): DecodedTexture {
  const encoded = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (encoded.byteLength === 0) throw new RangeError('Cannot decode an empty JPEG2000 texture');
  const image = new JpxImage();
  // Work on a copy because the compatibility readers are attached to the
  // decoder input; callers may retain and reuse their asset bytes.
  image.parse(decoderInput(encoded.slice()));
  return expandJpxTiles(image);
}
