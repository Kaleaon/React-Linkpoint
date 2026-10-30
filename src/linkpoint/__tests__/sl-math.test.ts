import { describe, expect, test } from 'vitest';
import { cross, lerp, lerpVec, normalize, sub } from '../sl-math';

describe('sl-math lerp', () => {
  test('returns start value when t = 0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(-5, 5, 0)).toBe(-5);
  });

  test('returns end value when t = 1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(-5, 5, 1)).toBe(5);
  });

  test('interpolates intermediate values correctly', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 0.25)).toBe(25);
    expect(lerp(0, 100, 0.75)).toBe(75);
    expect(lerp(10, 20, 0.3)).toBeCloseTo(13, 6);
  });

  test('extrapolates values when t < 0 or t > 1', () => {
    expect(lerp(10, 20, -0.5)).toBe(5);
    expect(lerp(10, 20, 1.5)).toBe(25);
  });

  test('handles inverted ranges where a > b', () => {
    expect(lerp(20, 10, 0)).toBe(20);
    expect(lerp(20, 10, 1)).toBe(10);
    expect(lerp(20, 10, 0.5)).toBe(15);
    expect(lerp(20, 10, 0.25)).toBe(17.5);
  });

  test('handles identical start and end values', () => {
    expect(lerp(42, 42, 0)).toBe(42);
    expect(lerp(42, 42, 0.5)).toBe(42);
    expect(lerp(42, 42, 1)).toBe(42);
    expect(lerp(42, 42, 2.5)).toBe(42);
  });

  test('matches scalar linear interpolation in lerpVec', () => {
    const vecA: [number, number, number] = [0, 10, -20];
    const vecB: [number, number, number] = [100, 20, 0];
    const t = 0.4;
    const interpolatedVec = lerpVec(vecA, vecB, t);
    expect(interpolatedVec[0]).toBe(lerp(vecA[0], vecB[0], t));
    expect(interpolatedVec[1]).toBe(lerp(vecA[1], vecB[1], t));
    expect(interpolatedVec[2]).toBe(lerp(vecA[2], vecB[2], t));
  });
});

describe('sl-math 3D vector math functions', () => {
  describe('normalize', () => {
    test('normalizes a non-zero 3D vector to unit length', () => {
      const result = normalize([3, 0, 4]);
      expect(result[0]).toBeCloseTo(0.6);
      expect(result[1]).toBeCloseTo(0);
      expect(result[2]).toBeCloseTo(0.8);
      const mag = Math.hypot(result[0], result[1], result[2]);
      expect(mag).toBeCloseTo(1.0);
    });

    test('returns a copy of the input vector when magnitude is near zero and no fallback is specified', () => {
      const zero = [0, 0, 0];
      const result = normalize(zero);
      expect(result).toEqual([0, 0, 0]);
      expect(result).not.toBe(zero); // should return a new array instance

      const tiny = [1e-10, 0, 0];
      const resultTiny = normalize(tiny);
      expect(resultTiny).toEqual([1e-10, 0, 0]);
    });

    test('returns a copy of the fallback vector when magnitude is near zero and fallback is supplied', () => {
      const zero = [0, 0, 0];
      const fallback = [0, 0, 1];
      const result = normalize(zero, fallback);
      expect(result).toEqual([0, 0, 1]);
      expect(result).not.toBe(fallback); // should return a new array instance

      const tiny = [1e-9, 0, 0];
      const resultTiny = normalize(tiny, [1, 0, 0]);
      expect(resultTiny).toEqual([1, 0, 0]);
    });

    test('ignores fallback when vector magnitude exceeds FP_MAG_THRESHOLD', () => {
      const v = [0, 5, 0];
      const fallback = [0, 0, 1];
      const result = normalize(v, fallback);
      expect(result[0]).toBeCloseTo(0);
      expect(result[1]).toBeCloseTo(1);
      expect(result[2]).toBeCloseTo(0);
    });
  });

  describe('sub and cross', () => {
    test('sub subtracts vector components', () => {
      expect(sub([5, 7, 9], [1, 2, 3])).toEqual([4, 5, 6]);
    });

    test('cross computes vector cross product', () => {
      expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
      expect(cross([0, 1, 0], [1, 0, 0])).toEqual([0, 0, -1]);
    });
  });
});
