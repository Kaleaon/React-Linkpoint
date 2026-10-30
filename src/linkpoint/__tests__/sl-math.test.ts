import { describe, expect, it } from 'vitest';
import { cross, lerp, lerpVec, normalize, sub } from '../sl-math';

describe('sl-math lerp', () => {
  it('returns start value when t = 0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(-5, 5, 0)).toBe(-5);
  });

  it('returns end value when t = 1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(-5, 5, 1)).toBe(5);
  });

  it('interpolates intermediate values correctly', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(0, 100, 0.25)).toBe(25);
    expect(lerp(0, 100, 0.75)).toBe(75);
    expect(lerp(10, 20, 0.3)).toBeCloseTo(13, 6);
  });

  it('extrapolates values when t < 0 or t > 1', () => {
    expect(lerp(10, 20, -0.5)).toBe(5);
    expect(lerp(10, 20, 1.5)).toBe(25);
  });

  it('handles inverted ranges where a > b', () => {
    expect(lerp(20, 10, 0)).toBe(20);
    expect(lerp(20, 10, 1)).toBe(10);
    expect(lerp(20, 10, 0.5)).toBe(15);
    expect(lerp(20, 10, 0.25)).toBe(17.5);
  });

  it('handles identical start and end values', () => {
    expect(lerp(42, 42, 0)).toBe(42);
    expect(lerp(42, 42, 0.5)).toBe(42);
    expect(lerp(42, 42, 1)).toBe(42);
    expect(lerp(42, 42, 2.5)).toBe(42);
  });

  it('matches scalar linear interpolation in lerpVec', () => {
    const vecA: [number, number, number] = [0, 10, -20];
    const vecB: [number, number, number] = [100, 20, 0];
    const t = 0.4;
    const interpolatedVec = lerpVec(vecA, vecB, t);
    expect(interpolatedVec[0]).toBe(lerp(vecA[0], vecB[0], t));
    expect(interpolatedVec[1]).toBe(lerp(vecA[1], vecB[1], t));
    expect(interpolatedVec[2]).toBe(lerp(vecA[2], vecB[2], t));
  });
});

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
