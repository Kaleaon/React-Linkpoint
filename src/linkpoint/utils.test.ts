import { describe, it, expect } from 'vitest';
import { Utils } from './utils';

describe('Utils', () => {
  describe('generateUUID', () => {
    it('should generate a string of length 36', () => {
      const uuid = Utils.generateUUID();
      expect(uuid.length).toBe(36);
    });

    it('should match the standard UUID v4 format', () => {
      const uuid = Utils.generateUUID();
      // UUID v4 regex pattern
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs', () => {
      const ITERATIONS = 1000;
      const uuids = new Set<string>();

      for (let i = 0; i < ITERATIONS; i++) {
        uuids.add(Utils.generateUUID());
      }

      // The number of unique UUIDs should equal the number of iterations
      expect(uuids.size).toBe(ITERATIONS);
    });
  });
});
