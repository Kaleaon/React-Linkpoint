import { describe, expect, test } from 'vitest';
import { cross, normalize, sub } from '../sl-math';

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
