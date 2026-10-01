import { describe, expect, it } from 'vitest';
import { Camera3D } from '../camera-3d';

describe('Camera3D viewer controls', () => {
  it('moves the orbit focus instead of having movement overwritten by the orbit calculation', () => {
    const camera = new Camera3D();
    camera.setOrbitTarget(10, 20, 30);
    camera.setRotation(0, 0);
    camera.move(2, 3, 1);

    expect(camera.orbitTarget).toEqual([7, 22, 31]);
    expect(camera.position).not.toEqual(camera.orbitTarget);
  });

  it('provides rear, front, mouselook, and free camera setups', () => {
    const camera = new Camera3D();
    camera.setOrbitTarget(4, 5, 6);

    camera.setPreset('first-person');
    expect(camera.mode).toBe('first-person');
    expect(camera.position).toEqual([4, 5, 7.65]);

    camera.setPreset('front');
    expect(camera.mode).toBe('orbit');
    expect(camera.orbitDistance).toBe(7.5);
  });

  it('pans the orbit target without changing its distance', () => {
    const camera = new Camera3D();
    camera.setOrbitTarget(10, 10, 10);
    camera.setRotation(0, 0);
    camera.pan(2, -3);

    expect(camera.orbitTarget).toEqual([12, 10, 7]);
    expect(camera.orbitDistance).toBe(10);
  });

  it('computes the view-projection matrix as projection * view (column-major)', () => {
    const camera = new Camera3D();
    camera.setOrbitTarget(10, 10, 10);
    camera.updateMatrices();
    const apply = (m: Float32Array, v: number[]) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
    const point = [12, 10, 10, 1];

    const expected = apply(camera.getProjectionMatrix(), apply(camera.getViewMatrix(), point));
    const actual = apply(camera.getViewProjectionMatrix(), point);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 3));
    // The orbit target projects to the centre of the screen.
    const centre = apply(camera.getViewProjectionMatrix(), [10, 10, 10, 1]);
    expect(centre[0] / centre[3]).toBeCloseTo(0, 4);
    expect(centre[1] / centre[3]).toBeCloseTo(0, 4);
  });
});
