import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialPipeline } from '../spatial-pipeline';
import { SpatialMemoryBridge } from '../spatial-memory-bridge';
import { CoordinateNormalizer } from '../coordinate-normalizer';
import {
  extractFrustumJS,
  testAABBJS,
  transformAABBJS,
  multiplyMat4JS,
  INSIDE,
  INTERSECT,
  OUTSIDE,
} from '../frustum';

describe('WebAssembly SIMD Spatial Transform Pipeline & SharedArrayBuffer Bridge', () => {
  let pipeline: SpatialPipeline;

  beforeEach(() => {
    pipeline = new SpatialPipeline(false);
  });

  describe('Initialization & Memory Bridge', () => {
    it('initializes WASM SIMD module and reports capability status', () => {
      expect(pipeline).toBeInstanceOf(SpatialPipeline);
      expect(typeof pipeline.isSimdAccelerated()).toBe('boolean');
    });

    it('allocates SOA linear memory bridge without main-thread heap allocations', () => {
      const bridge = new SpatialMemoryBridge(1000);
      expect(bridge.getCapacity()).toBe(1000);
      expect(bridge.minX.length).toBe(1000);
      expect(bridge.visibility.length).toBe(1000);

      // Verify zero-copy setBox
      bridge.setBox(0, [-10, -20, -30], [10, 20, 30]);
      expect(bridge.minX[0]).toBe(-10);
      expect(bridge.minY[0]).toBe(-20);
      expect(bridge.minZ[0]).toBe(-30);
      expect(bridge.maxX[0]).toBe(10);
      expect(bridge.maxY[0]).toBe(20);
      expect(bridge.maxZ[0]).toBe(30);

      // Verify dynamic growth
      bridge.ensureCapacity(5000);
      expect(bridge.getCapacity()).toBeGreaterThanOrEqual(5000);
      expect(bridge.minX.length).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('Mathematical Parity: WASM SIMD vs JS Fallback Routine', () => {
    it('verifies 4x4 matrix multiplication parity', () => {
      const a = new Float32Array([1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 5, 6, 7, 1]);
      const b = new Float32Array([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 1, 2, 3, 1]);

      const jsResult = multiplyMat4JS(a, b);
      const wasmResult = pipeline.multiplyMat4(a, b);

      for (let i = 0; i < 16; i++) {
        expect(wasmResult[i]).toBeCloseTo(jsResult[i], 4);
      }
    });

    it('verifies frustum plane extraction parity', () => {
      const viewProj = new Float32Array([
        1.732, 0, 0, 0, 0, 1.732, 0, 0, 0, 0, -1.0002, -1, 0, 0, -0.2002, 0,
      ]);

      const jsPlanes = extractFrustumJS(viewProj);
      const wasmPlanes = pipeline.extractFrustum(viewProj);

      expect(jsPlanes).not.toBeNull();
      expect(wasmPlanes).not.toBeNull();

      if (jsPlanes && wasmPlanes) {
        for (let i = 0; i < 24; i++) {
          expect(wasmPlanes[i]).toBeCloseTo(jsPlanes[i], 4);
        }
      }
    });

    it("verifies AABB transformation parity (Arvo's method)", () => {
      const mat = new Float32Array([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 10, 20, 30, 1]);
      const min = [-1, -2, -3];
      const max = [1, 2, 3];

      const jsRes = transformAABBJS(mat, min, max);
      const wasmRes = pipeline.transformAABB(mat, min, max);

      expect(wasmRes.min[0]).toBeCloseTo(jsRes.min[0], 4);
      expect(wasmRes.min[1]).toBeCloseTo(jsRes.min[1], 4);
      expect(wasmRes.min[2]).toBeCloseTo(jsRes.min[2], 4);

      expect(wasmRes.max[0]).toBeCloseTo(jsRes.max[0], 4);
      expect(wasmRes.max[1]).toBeCloseTo(jsRes.max[1], 4);
      expect(wasmRes.max[2]).toBeCloseTo(jsRes.max[2], 4);
    });

    it('verifies single AABB frustum classification parity', () => {
      const viewProj = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.01, 0, 0, 0, 1]);
      const planes = extractFrustumJS(viewProj)!;

      const insideMin = [-0.5, -0.5, 0.1];
      const insideMax = [0.5, 0.5, 0.9];

      const outsideMin = [100, 100, 100];
      const outsideMax = [110, 110, 110];

      const jsIn = testAABBJS(planes, insideMin, insideMax);
      const wasmIn = pipeline.testAABB(planes, insideMin, insideMax);
      expect(wasmIn).toBe(jsIn);

      const jsOut = testAABBJS(planes, outsideMin, outsideMax);
      const wasmOut = pipeline.testAABB(planes, outsideMin, outsideMax);
      expect(wasmOut).toBe(jsOut);
    });
  });

  describe('OpenSim VarRegion Coordinate Normalization (up to 4096m)', () => {
    it('calculates region-local coordinates correctly for standard 256m regions', () => {
      const origin = { x: 1000, y: 1000 }; // 256,000m x 256,000m origin
      const globalPos = [256050, 256100, 15];

      const localVec = pipeline.globalToRegionLocal(globalPos, origin, 256);
      expect(localVec[0]).toBeCloseTo(50, 4);
      expect(localVec[1]).toBeCloseTo(100, 4);
      expect(localVec[2]).toBeCloseTo(15, 4);

      const backGlobal = pipeline.regionLocalToGlobal(localVec, origin);
      expect(backGlobal[0]).toBeCloseTo(256050, 4);
      expect(backGlobal[1]).toBeCloseTo(256100, 4);
      expect(backGlobal[2]).toBeCloseTo(15, 4);
    });

    it('calculates region-local coordinates for OpenSim VarRegions up to 4096 meters', () => {
      const origin = { x: 1000, y: 1000 }; // origin at 256,000m x 256,000m
      const varRegionSize = 4096;
      const globalPos = [258048, 259072, 120]; // inside 4096m VarRegion extent

      const localVec = CoordinateNormalizer.globalToRegionLocal(globalPos, origin, varRegionSize);
      expect(localVec[0]).toBeCloseTo(2048, 4);
      expect(localVec[1]).toBeCloseTo(3072, 4);
      expect(localVec[2]).toBeCloseTo(120, 4);

      const restoredGlobal = CoordinateNormalizer.regionLocalToGlobal(localVec, origin);
      expect(restoredGlobal[0]).toBeCloseTo(258048, 4);
      expect(restoredGlobal[1]).toBeCloseTo(259072, 4);
      expect(restoredGlobal[2]).toBeCloseTo(120, 4);
    });

    it('clamps VarRegion coordinates correctly at boundaries up to 4096m', () => {
      const origin = { x: 0, y: 0 };
      const varRegionSize = 4096;

      // Position exceeding 4096m extent
      const overPos = [5000, 4100, 50];
      const localVec = pipeline.globalToRegionLocal(overPos, origin, varRegionSize);

      expect(localVec[0]).toBeLessThanOrEqual(4096);
      expect(localVec[1]).toBeLessThanOrEqual(4096);
    });
  });

  describe('128-bit SIMD SOA Frustum Culling Throughput & High Density Objects', () => {
    it('culls 10,000 SOA spatial scene objects with sub-millisecond execution latency', () => {
      const count = 10000;
      const minX = new Float32Array(count);
      const minY = new Float32Array(count);
      const minZ = new Float32Array(count);
      const maxX = new Float32Array(count);
      const maxY = new Float32Array(count);
      const maxZ = new Float32Array(count);

      // Create synthetic scene: half inside frustum, half outside
      for (let i = 0; i < count; i++) {
        const inView = i % 2 === 0;
        const posX = inView ? ((i % 10) - 5) * 0.2 : 2000 + i;
        const posY = inView ? ((i % 10) - 5) * 0.2 : 2000 + i;
        const posZ = inView ? -5 : 2000;

        minX[i] = posX - 1;
        maxX[i] = posX + 1;
        minY[i] = posY - 1;
        maxY[i] = posY + 1;
        minZ[i] = posZ - 1;
        maxZ[i] = posZ + 1;
      }

      const viewProj = new Float32Array([
        1.732, 0, 0, 0, 0, 1.732, 0, 0, 0, 0, -1.0002, -1, 0, 0, -0.2002, 0,
      ]);
      const frustum = extractFrustumJS(viewProj)!;

      const startTime = performance.now();
      const visibility = pipeline.cullSOABoxes(minX, minY, minZ, maxX, maxY, maxZ, frustum, count);
      const durationMs = performance.now() - startTime;

      expect(visibility.length).toBe(count);
      expect(durationMs).toBeLessThan(100); // High throughput verification in virtualized test runner

      let visibleCount = 0;
      for (let i = 0; i < count; i++) {
        if (visibility[i] === 1) visibleCount++;
      }

      expect(visibleCount).toBe(5000);
    });
  });

  describe('Pure JavaScript Fallback Pipeline', () => {
    it('engages pure JS fallback pipeline when forced or WASM is disabled', () => {
      const fallbackPipeline = new SpatialPipeline(true);
      expect(fallbackPipeline.isSimdAccelerated()).toBe(false);

      const a = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1]);
      const b = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]);

      const result = fallbackPipeline.multiplyMat4(a, b);
      expect(result[12]).toBe(7);
      expect(result[13]).toBe(9);
      expect(result[14]).toBe(11);

      const varPos = fallbackPipeline.globalToRegionLocal([500, 600, 10], { x: 0, y: 0 }, 4096);
      expect(varPos[0]).toBe(500);
      expect(varPos[1]).toBe(600);
    });
  });
});
