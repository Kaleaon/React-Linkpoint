import { describe, expect, it } from 'vitest';
import { cross, normalize, sub } from '../sl-math';

describe('sl-math vector functions', () => {
  it('sub subtracts vectors correctly', () => {
    expect(sub([5, 6, 7], [1, 2, 3])).toEqual([4, 4, 4]);
  });

  it('cross computes cross product correctly', () => {
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
  });

  it('normalize scales unit/normal vectors correctly', () => {
    const norm = normalize([3, 0, 0]);
    expect(norm[0]).toBeCloseTo(1);
    expect(norm[1]).toBeCloseTo(0);
    expect(norm[2]).toBeCloseTo(0);
  });

  it('normalize uses fallback when vector magnitude is within threshold', () => {
    const zeroVec = [0, 0, 0];
    expect(normalize(zeroVec, [0, 0, 1])).toEqual([0, 0, 1]);
    expect(normalize([0.00000001, 0, 0], [1, 0, 0])).toEqual([1, 0, 0]);
  });

  it('normalize returns copy of vector when magnitude is within threshold and fallback is omitted', () => {
    const zeroVec = [0, 0, 0];
    const result = normalize(zeroVec);
    expect(result).toEqual([0, 0, 0]);
    expect(result).not.toBe(zeroVec); // copy
  });
});
