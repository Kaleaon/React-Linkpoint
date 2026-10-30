import { describe, expect, it } from 'vitest';
import { Utils, pickProperty } from '../utils';

describe('pickProperty', () => {
  it('resolves key candidates in order', () => {
    const obj = { camelCase: 'first', snake_case: 'second' };
    expect(pickProperty(obj, 'camelCase', 'snake_case')).toBe('first');
    expect(pickProperty(obj, 'snake_case', 'camelCase')).toBe('second');
    expect(pickProperty(obj, 'nonexistent', 'snake_case')).toBe('second');
  });

  it('handles null, undefined, or primitive sources gracefully without throwing', () => {
    expect(pickProperty(null, 'key')).toBeUndefined();
    expect(pickProperty(undefined, 'key')).toBeUndefined();
    expect(pickProperty(123, 'key')).toBeUndefined();
    expect(pickProperty('string', 'length')).toBeUndefined();
    expect(pickProperty(true, 'key')).toBeUndefined();
  });

  it('skips keys with null or undefined values to evaluate next candidates', () => {
    const obj = { a: null, b: undefined, c: 'valid' };
    expect(pickProperty(obj, 'a', 'b', 'c')).toBe('valid');
    expect(pickProperty(obj, 'a', 'b')).toBeUndefined();
  });

  it('returns valid falsy values such as 0, false, and empty string', () => {
    expect(pickProperty({ a: 0 }, 'a')).toBe(0);
    expect(pickProperty({ a: false }, 'a')).toBe(false);
    expect(pickProperty({ a: '' }, 'a')).toBe('');
  });

  it('is available as Utils.pickProperty', () => {
    const obj = { blue_horizon: [0.1, 0.2, 0.3] };
    expect(Utils.pickProperty(obj, 'blueHorizon', 'blue_horizon')).toEqual([0.1, 0.2, 0.3]);
  });
});
