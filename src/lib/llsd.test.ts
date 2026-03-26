import { describe, it, expect } from 'vitest';
import { toJSON } from './llsd.js';

describe('LLSD JSON Serialization (toJSON)', () => {
  it('serializes null', () => {
    expect(toJSON(null)).toBe('null');
  });

  it('serializes boolean values', () => {
    expect(toJSON(true)).toBe('true');
    expect(toJSON(false)).toBe('false');
  });

  it('serializes number values', () => {
    expect(toJSON(42)).toBe('42');
    expect(toJSON(3.14159)).toBe('3.14159');
  });

  it('serializes string values', () => {
    expect(toJSON('hello world')).toBe('"hello world"');
    expect(toJSON('')).toBe('""');
  });

  it('serializes Date objects to ISO strings', () => {
    const d = new Date('2023-01-01T12:00:00.000Z');
    expect(toJSON(d)).toBe('"2023-01-01T12:00:00.000Z"');
  });

  it('serializes Uint8Array to base64 strings', () => {
    // btoa(String.fromCharCode(...[72, 101, 108, 108, 111])) -> "SGVsbG8="
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(toJSON(data)).toBe('"SGVsbG8="');
  });

  it('serializes arrays', () => {
    const arr = [1, "two", true, null];
    // using spacing from `toJSON` which is 2 spaces
    expect(toJSON(arr)).toBe('[\n  1,\n  "two",\n  true,\n  null\n]');
  });

  it('serializes objects', () => {
    const obj = { a: 1, b: "two" };
    expect(toJSON(obj)).toBe('{\n  "a": 1,\n  "b": "two"\n}');
  });

  it('serializes complex nested structures with Date and Uint8Array', () => {
    const d = new Date('2023-01-01T12:00:00.000Z');
    const data = new Uint8Array([1, 2, 3]);
    const obj = {
      timestamp: d,
      payload: data,
      items: [
        { id: 1, valid: true },
        { id: 2, data: new Uint8Array([255, 0]) }
      ]
    };

    // The result should have the correct strings and formatting
    const jsonString = toJSON(obj);
    const parsed = JSON.parse(jsonString);

    expect(parsed.timestamp).toBe('2023-01-01T12:00:00.000Z');
    expect(parsed.payload).toBe(btoa(String.fromCharCode(1, 2, 3)));
    expect(parsed.items[0]).toEqual({ id: 1, valid: true });
    expect(parsed.items[1].data).toBe(btoa(String.fromCharCode(255, 0)));
  });
});
