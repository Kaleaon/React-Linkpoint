import { describe, expect, it } from 'vitest';
import { pickObjects, screenRay } from '../picking-3d';
import { Camera3D } from '../camera-3d';

describe('Lumiya-style 3D collision picking', () => {
  it('selects the nearest transformed collision volume', () => {
    const hit = pickObjects([0, 0, 0], [0, 1, 0], [
      { id: 'far', position: [0, 8, 0], scale: [2, 2, 2] },
      { id: 'near', position: [0, 4, 0], scale: [1, 1, 1] },
    ]);
    expect(hit?.id).toBe('near');
    expect(hit?.distance).toBeCloseTo(3.5);
  });

  it('ignores invisible objects and misses rays outside a box', () => {
    expect(pickObjects([0, 0, 0], [0, 1, 0], [
      { id: 'hidden', position: [0, 3, 0], visible: false },
      { id: 'aside', position: [3, 3, 0] },
    ])).toBeNull();
  });

  it('casts the center-screen ray along the camera view direction', () => {
    const camera = new Camera3D();
    camera.setMode('first-person');
    camera.setPosition(0, 0, 0);
    camera.setRotation(0, 0, 0);
    const ray = screenRay(camera, 400, 300, 800, 600);
    expect(ray.direction[0]).toBeCloseTo(0);
    expect(ray.direction[1]).toBeCloseTo(1);
    expect(ray.direction[2]).toBeCloseTo(0);
  });
});
