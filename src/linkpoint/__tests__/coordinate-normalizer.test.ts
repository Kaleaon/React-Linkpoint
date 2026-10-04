import { describe, it, expect } from 'vitest';
import { CoordinateNormalizer } from '../coordinate-normalizer';

describe('CoordinateNormalizer', () => {
  it('normalizes region tile coordinates correctly', () => {
    expect(CoordinateNormalizer.normalizeRegionTileCoordinate(256000)).toBe(1000);
    expect(CoordinateNormalizer.normalizeRegionTileCoordinate(1000)).toBe(1000);
    expect(CoordinateNormalizer.normalizeRegionTileCoordinate('256000')).toBe(1000);
    expect(CoordinateNormalizer.normalizeRegionTileCoordinate(null)).toBe(0);
  });

  it('calculates region origin in meters accurately', () => {
    expect(CoordinateNormalizer.getRegionOriginMeters({ x: 1000, y: 1000 })).toEqual([256000, 256000]);
    expect(CoordinateNormalizer.getRegionOriginMeters({ x: 256000, y: 256000 })).toEqual([256000, 256000]);
    expect(CoordinateNormalizer.getRegionOriginMeters(null)).toEqual([0, 0]);
  });

  it('parses vector formats (tuples, objects, strings)', () => {
    expect(CoordinateNormalizer.parseVector([128, 128, 25])).toEqual([128, 128, 25]);
    expect(CoordinateNormalizer.parseVector({ x: 128, y: 128, z: 25 })).toEqual([128, 128, 25]);
    expect(CoordinateNormalizer.parseVector('<128, 128, 25>')).toEqual([128, 128, 25]);
    expect(CoordinateNormalizer.parseVector('128, 128, 25')).toEqual([128, 128, 25]);
  });

  it('translates global grid coordinates to region-local origins (0 to 256m)', () => {
    const regionOrigin = { x: 1000, y: 1000 }; // 256000m, 256000m origin

    // Global position inside region [256000 + 128, 256000 + 64, 30]
    const globalPos = [256128, 256064, 30];
    const localVec = CoordinateNormalizer.globalToRegionLocal(globalPos, regionOrigin);
    expect(localVec).toEqual([128, 64, 30]);

    // Position already local [128, 64, 30]
    const localPos = [128, 64, 30];
    const localVec2 = CoordinateNormalizer.globalToRegionLocal(localPos, regionOrigin);
    expect(localVec2).toEqual([128, 64, 30]);
  });

  it('clamps coordinates to region boundaries (0 to 256 meters)', () => {
    const outOfBoundsHigh = [300, 400, 50] as [number, number, number];
    const clampedHigh = CoordinateNormalizer.clampToRegionBounds(outOfBoundsHigh);
    expect(clampedHigh).toEqual([256, 256, 50]);

    const outOfBoundsLow = [-10, -5, 10] as [number, number, number];
    const clampedLow = CoordinateNormalizer.clampToRegionBounds(outOfBoundsLow);
    expect(clampedLow).toEqual([0, 0, 10]);
  });

  it('converts region-local coordinates back to global grid coordinates in meters', () => {
    const regionOrigin = { x: 1000, y: 1000 }; // 256000m, 256000m
    const localPos: [number, number, number] = [128, 64, 20];

    const globalPos = CoordinateNormalizer.regionLocalToGlobal(localPos, regionOrigin);
    expect(globalPos).toEqual([256128, 256064, 20]);
  });
});
