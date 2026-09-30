import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const { decodeJPEG2000, decodeSculpt } = require('../../../electron/sl-asset-decoder.cjs');

describe('simulator image asset decoding', () => {
  it('normalizes decoded image assets to browser-ready RGBA', async () => {
    const source = await sharp({
      create: { width: 2, height: 1, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).png().toBuffer();
    const result = await decodeJPEG2000(source);

    expect(result).toMatchObject({ width: 2, height: 1 });
    expect(Buffer.from(result.rgba, 'base64')).toEqual(Buffer.from([10, 20, 30, 255, 10, 20, 30, 255]));
  });

  it('turns decoded sculpt-map pixels into indexed geometry', async () => {
    const source = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 128, g: 64, b: 255 } },
    }).png().toBuffer();
    const geometry = await decodeSculpt(source, 3);

    expect(geometry.vertices).toHaveLength(8 * 8 * 3);
    expect(geometry.normals).toHaveLength(geometry.vertices.length);
    expect(geometry.texCoords).toHaveLength(8 * 8 * 2);
    expect(geometry.indices.length).toBeGreaterThan(0);
  });
});
