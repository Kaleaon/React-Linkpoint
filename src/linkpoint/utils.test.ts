import { describe, it, expect } from 'vitest';
import { Utils } from './utils.js';

describe('Utils.clamp', () => {
  it('should return the value when it is within the bounds', () => {
    expect(Utils.clamp(5, 0, 10)).toBe(5);
    expect(Utils.clamp(0, -5, 5)).toBe(0);
    expect(Utils.clamp(-3, -10, 0)).toBe(-3);
  });

  it('should return the minimum value when the value is below the bounds', () => {
    expect(Utils.clamp(-5, 0, 10)).toBe(0);
    expect(Utils.clamp(-10, -5, 5)).toBe(-5);
  });

  it('should return the maximum value when the value is above the bounds', () => {
    expect(Utils.clamp(15, 0, 10)).toBe(10);
    expect(Utils.clamp(10, -5, 5)).toBe(5);
  });

  it('should handle edge cases where value equals min or max', () => {
    expect(Utils.clamp(0, 0, 10)).toBe(0);
    expect(Utils.clamp(10, 0, 10)).toBe(10);
  });

  it('should work correctly with floating point numbers', () => {
    expect(Utils.clamp(3.5, 1.1, 5.5)).toBe(3.5);
    expect(Utils.clamp(0.5, 1.1, 5.5)).toBe(1.1);
    expect(Utils.clamp(6.5, 1.1, 5.5)).toBe(5.5);
  });
});
