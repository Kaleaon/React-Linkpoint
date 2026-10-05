import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeJPEG2000, expandJpxTiles, MAX_TEXTURE_DIMENSION } from '../texture-decoder';

describe('Second Life JPEG2000 texture decoding', () => {
  it.each([
    { components: 1, input: [64], output: [64, 64, 64, 255], alpha: false },
    { components: 2, input: [64, 127], output: [64, 64, 64, 127], alpha: true },
    { components: 3, input: [10, 20, 30], output: [10, 20, 30, 255], alpha: false },
    { components: 4, input: [10, 20, 30, 254], output: [10, 20, 30, 254], alpha: true },
  ])('expands $components component images using viewer channel semantics', ({ components, input, output, alpha }) => {
    const decoded = expandJpxTiles({
      width: 1,
      height: 1,
      componentsCount: components,
      tiles: [{ left: 0, top: 0, width: 1, height: 1, items: Uint8Array.from(input) }],
    });
    expect(Array.from(decoded.rgba)).toEqual(output);
    expect(decoded.hasAlpha).toBe(alpha);
  });

  it('places multiple tiles at their declared offsets', () => {
    const decoded = expandJpxTiles({
      width: 2,
      height: 1,
      componentsCount: 3,
      tiles: [
        { left: 1, top: 0, width: 1, height: 1, items: Uint8Array.from([4, 5, 6]) },
        { left: 0, top: 0, width: 1, height: 1, items: Uint8Array.from([1, 2, 3]) },
      ],
    });
    expect(Array.from(decoded.rgba)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it('rejects oversized, out-of-bounds, and truncated decoder output', () => {
    expect(() => expandJpxTiles({ width: MAX_TEXTURE_DIMENSION + 1, height: 1, componentsCount: 3, tiles: [] })).toThrow(/exceeds/);
    expect(() => expandJpxTiles({ width: 1, height: 1, componentsCount: 3, tiles: [{ left: 1, top: 0, width: 1, height: 1, items: new Uint8Array(3) }] })).toThrow(/outside/);
    expect(() => expandJpxTiles({ width: 1, height: 1, componentsCount: 4, tiles: [{ left: 0, top: 0, width: 1, height: 1, items: new Uint8Array(3) }] })).toThrow(/truncated/);
  });

  it('decodes an OpenJPEG reference codestream used by the native viewer tests', () => {
    const fixture = resolve(process.cwd(), 'android-kotlin/core/src/test/resources/j2k/tiny.j2k');
    const bytes = readFileSync(fixture);
    const decoded = decodeJPEG2000(bytes);
    expect(decoded.width).toBeGreaterThan(0);
    expect(decoded.height).toBeGreaterThan(0);
    expect(decoded.rgba).toHaveLength(decoded.width * decoded.height * 4);
  });
});
