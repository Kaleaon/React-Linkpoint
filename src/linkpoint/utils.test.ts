import { describe, it, expect } from 'vitest';
import { Utils } from './utils';

describe('Utils', () => {
  describe('formatFileSize', () => {
    it('should correctly format 0 bytes', () => {
      expect(Utils.formatFileSize(0)).toBe('0 Bytes');
    });

    it('should correctly format negative bytes', () => {
      expect(Utils.formatFileSize(-1024)).toBe('-1 KB');
      expect(Utils.formatFileSize(-1500)).toBe('-1.46 KB');
    });

    it('should correctly format byte values under 1 KB', () => {
      expect(Utils.formatFileSize(1)).toBe('1 Bytes');
      expect(Utils.formatFileSize(512)).toBe('512 Bytes');
      expect(Utils.formatFileSize(1023)).toBe('1023 Bytes');
    });

    it('should correctly format exactly 1 KB', () => {
      expect(Utils.formatFileSize(1024)).toBe('1 KB');
    });

    it('should correctly format decimal values for KB', () => {
      expect(Utils.formatFileSize(1536)).toBe('1.5 KB'); // 1.5 * 1024
      expect(Utils.formatFileSize(2000)).toBe('1.95 KB'); // 2000 / 1024 ≈ 1.953125
    });

    it('should correctly format MB values', () => {
      expect(Utils.formatFileSize(1048576)).toBe('1 MB'); // 1024 * 1024
      expect(Utils.formatFileSize(2621440)).toBe('2.5 MB'); // 2.5 * 1024 * 1024
    });

    it('should correctly format GB values', () => {
      expect(Utils.formatFileSize(1073741824)).toBe('1 GB'); // 1024^3
      expect(Utils.formatFileSize(1073741824 * 5.25)).toBe('5.25 GB');
    });

    it('should correctly format values exceeding GB (TB, PB, etc.)', () => {
      const tb = Math.pow(1024, 4);
      expect(Utils.formatFileSize(tb)).toBe('1 TB');

      const pb = Math.pow(1024, 5);
      expect(Utils.formatFileSize(pb * 3.14)).toBe('3.14 PB');

      const yb = Math.pow(1024, 8);
      expect(Utils.formatFileSize(yb * 99)).toBe('99 YB');
    });

    it('should cap out at YB without throwing undefined index errors for extremely large values', () => {
      // 1024^9 is larger than YB (index 8). The clamp sizeIndex = Math.min(i, sizes.length - 1)
      // ensures it uses 'YB'.
      const huge = Math.pow(1024, 10);
      // Math.pow(1024, 10) / Math.pow(1024, 8) = 1024^2 = 1048576
      expect(Utils.formatFileSize(huge)).toBe('1048576 YB');
    });
  });
});
