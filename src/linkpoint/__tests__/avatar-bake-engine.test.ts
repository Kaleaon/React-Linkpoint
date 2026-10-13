import { describe, expect, it } from 'vitest';
import { AvatarBakeEngine, type BakeSlot } from '../avatar-bake-engine';

describe('AvatarBakeEngine', () => {
  it('generates valid RGBA texture buffers for all 6 system wearable slots', async () => {
    const engine = new AvatarBakeEngine(128, 128);
    const slots: BakeSlot[] = ['head', 'upper', 'lower', 'eyes', 'hair', 'skirt'];

    const baked = await engine.bakeAll();

    for (const slot of slots) {
      const res = baked[slot];
      expect(res).toBeDefined();
      expect(res.slot).toBe(slot);
      expect(res.width).toBe(128);
      expect(res.height).toBe(128);
      expect(res.rgba).toBeInstanceOf(Uint8Array);
      expect(res.rgba.length).toBe(128 * 128 * 4);
    }
  });

  it('composites custom layer colors correctly into texture buffer', async () => {
    const engine = new AvatarBakeEngine(64, 64);
    const result = await engine.bakeSlot('head', [
      { color: [1, 0, 0, 1] }, // Solid Red
    ]);

    expect(result.rgba.length).toBe(64 * 64 * 4);
    // Inspect first pixel RGBA
    expect(result.rgba[0]).toBeGreaterThan(200); // Red
    expect(result.rgba[3]).toBe(255); // Alpha
  });

  it('supports custom image buffers overlay blending', async () => {
    const engine = new AvatarBakeEngine(32, 32);
    const customBuffer = new Uint8Array(32 * 32 * 4);
    // Fill with green layer
    for (let i = 0; i < customBuffer.length; i += 4) {
      customBuffer[i] = 0;
      customBuffer[i + 1] = 255;
      customBuffer[i + 2] = 0;
      customBuffer[i + 3] = 255;
    }

    const result = await engine.bakeSlot('upper', [{ imageBuffer: customBuffer }]);
    expect(result.rgba[1]).toBe(255); // Green channel
  });
});
