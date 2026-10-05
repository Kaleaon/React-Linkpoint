/**
 * Spatial Pipeline Engine - WebAssembly SIMD Acceleration & JS Fallback
 * 
 * Provides high-performance 128-bit SIMD matrix multiplication, frustum extraction,
 * zero-copy SOA bounding box culling, and OpenSim VarRegion coordinate normalization (up to 4096m),
 * with automatic fallback to pure JavaScript when WASM SIMD or SharedArrayBuffer is unavailable.
 */

import { SPATIAL_WASM_BYTES } from '../wasm/spatial-wasm-binary';
import { SpatialMemoryBridge } from './spatial-memory-bridge';
import { extractFrustum, testAABB, transformAABB, multiplyMat4, OUTSIDE, INSIDE, INTERSECT } from './frustum';

export interface Vector3 {
  0: number;
  1: number;
  2: number;
}

export interface RegionOrigin {
  x?: number | null;
  y?: number | null;
}

export class SpatialPipeline {
  private static instance: SpatialPipeline | null = null;

  private memoryBridge: SpatialMemoryBridge;
  private wasmInstance: WebAssembly.Instance | null = null;
  private isWasmSimdActive = false;
  private forceFallbackMode = false;

  public static getInstance(): SpatialPipeline {
    if (!SpatialPipeline.instance) {
      SpatialPipeline.instance = new SpatialPipeline();
    }
    return SpatialPipeline.instance;
  }

  constructor(forceFallback = false, customBridge?: SpatialMemoryBridge) {
    this.forceFallbackMode = forceFallback;
    this.memoryBridge = customBridge || new SpatialMemoryBridge(16384);

    if (!forceFallback) {
      this.initWasmModule();
    }
  }

  /**
   * Test WASM SIMD and initialize WebAssembly instance with shared linear memory.
   */
  private initWasmModule(): void {
    try {
      if (typeof WebAssembly === 'undefined' || typeof WebAssembly.instantiate === 'undefined') {
        this.isWasmSimdActive = false;
        return;
      }

      const importObject = {
        env: {
          memory: this.memoryBridge.getWasmMemory(),
        },
      };

      const module = new WebAssembly.Module(SPATIAL_WASM_BYTES);
      this.wasmInstance = new WebAssembly.Instance(module, importObject);
      this.isWasmSimdActive = true;
    } catch (err) {
      // WASM SIMD or SharedArrayBuffer instantiation unsupported or failed; engage JS fallback
      this.wasmInstance = null;
      this.isWasmSimdActive = false;
    }
  }

  public isSimdAccelerated(): boolean {
    return this.isWasmSimdActive && !this.forceFallbackMode;
  }

  public isUsingSharedMemory(): boolean {
    return this.memoryBridge.isShared();
  }

  public getMemoryBridge(): SpatialMemoryBridge {
    return this.memoryBridge;
  }

  public setForceFallback(force: boolean): void {
    this.forceFallbackMode = force;
  }

  /**
   * Column-major 4x4 matrix multiplication (out = a * b)
   */
  public multiplyMat4(a: ArrayLike<number>, b: ArrayLike<number>, out?: Float32Array): Float32Array {
    const result = out || new Float32Array(16);

    if (this.isSimdAccelerated() && this.wasmInstance && a.length >= 16 && b.length >= 16) {
      const exports = this.wasmInstance.exports as any;
      const bridge = this.memoryBridge;
      
      for (let i = 0; i < 16; i++) bridge.matrixTemp[i] = a[i];
      const bOffset = bridge.layout.matrixTempOffset + 16 * 4;
      const bView = new Float32Array(bridge.getWasmMemory().buffer, bOffset, 16);
      for (let i = 0; i < 16; i++) bView[i] = b[i];
      
      const outOffset = bOffset + 16 * 4;
      const memSize = bridge.getMemoryByteLength();

      const resCode = exports.spatial_multiply_mat4(
        bridge.layout.matrixTempOffset,
        bOffset,
        outOffset,
        memSize
      );

      if (resCode === 0) {
        const outView = new Float32Array(bridge.getWasmMemory().buffer, outOffset, 16);
        result.set(outView);
        return result;
      }
    }

    // JS Fallback
    return multiplyMat4(a, b);
  }

  /**
   * Extract 6 frustum planes from a column-major view-projection matrix.
   * Returns Float32Array(24) containing [nx, ny, nz, d] for 6 planes, or null if degenerate.
   */
  public extractFrustum(viewProjection: ArrayLike<number>): Float32Array | null {
    if (!viewProjection || viewProjection.length < 16) return null;

    if (this.isSimdAccelerated() && this.wasmInstance) {
      const exports = this.wasmInstance.exports as any;
      const bridge = this.memoryBridge;
      for (let i = 0; i < 16; i++) bridge.matrixTemp[i] = viewProjection[i];
      const memSize = bridge.getMemoryByteLength();

      const status = exports.spatial_extract_frustum(
        bridge.layout.matrixTempOffset,
        bridge.layout.frustumPlanesOffset,
        memSize
      );

      if (status === 1) {
        return new Float32Array(bridge.frustumPlanes);
      } else if (status === 0) {
        return null; // Degenerate matrix
      }
    }

    // JS Fallback
    const jsFrustum = extractFrustum(viewProjection);
    if (!jsFrustum) return null;
    return new Float32Array(jsFrustum);
  }

  /**
   * Transform local AABB box by matrix using Arvo's method.
   */
  public transformAABB(matrix: ArrayLike<number>, min: ArrayLike<number>, max: ArrayLike<number>): { min: [number, number, number]; max: [number, number, number] } {
    if (this.isSimdAccelerated() && this.wasmInstance) {
      const exports = this.wasmInstance.exports as any;
      const bridge = this.memoryBridge;
      for (let i = 0; i < 16; i++) bridge.matrixTemp[i] = matrix[i];
      bridge.vectorTemp.set([min[0], min[1], min[2]], 0);
      bridge.vectorOut.set([max[0], max[1], max[2]], 0);

      const minOutOff = bridge.layout.vectorOutOffset + 3 * 4;
      const maxOutOff = minOutOff + 3 * 4;
      const memSize = bridge.getMemoryByteLength();

      const resCode = exports.spatial_transform_aabb(
        bridge.layout.matrixTempOffset,
        bridge.layout.vectorTempOffset,
        bridge.layout.vectorOutOffset,
        minOutOff,
        maxOutOff,
        memSize
      );

      if (resCode === 0) {
        const memBuffer = bridge.getWasmMemory().buffer;
        const minArr = new Float32Array(memBuffer, minOutOff, 3);
        const maxArr = new Float32Array(memBuffer, maxOutOff, 3);
        return {
          min: [minArr[0], minArr[1], minArr[2]],
          max: [maxArr[0], maxArr[1], maxArr[2]],
        };
      }
    }

    // JS Fallback
    const res = transformAABB(matrix, min, max);
    return {
      min: [res.min[0], res.min[1], res.min[2]],
      max: [res.max[0], res.max[1], res.max[2]],
    };
  }

  /**
   * Test a single box against frustum planes.
   * Returns INSIDE (1), INTERSECT (0), or OUTSIDE (-1).
   */
  public testAABB(frustumPlanes: ArrayLike<number>, min: ArrayLike<number>, max: ArrayLike<number>): typeof INSIDE | typeof INTERSECT | typeof OUTSIDE {
    if (this.isSimdAccelerated() && this.wasmInstance && frustumPlanes.length >= 24) {
      const exports = this.wasmInstance.exports as any;
      const bridge = this.memoryBridge;
      bridge.setFrustumPlanes(frustumPlanes);
      bridge.vectorTemp.set([min[0], min[1], min[2]], 0);
      bridge.vectorOut.set([max[0], max[1], max[2]], 0);
      const memSize = bridge.getMemoryByteLength();

      const result = exports.spatial_test_aabb(
        bridge.layout.frustumPlanesOffset,
        bridge.layout.vectorTempOffset,
        bridge.layout.vectorOutOffset,
        memSize
      );

      if (result === 1) return INSIDE;
      if (result === 0) return INTERSECT;
      if (result === -1) return OUTSIDE;
    }

    // JS Fallback
    return testAABB(frustumPlanes as any, min, max);
  }

  /**
   * Perform 128-bit SIMD frustum culling on SOA bounding box arrays.
   * Returns Uint8Array visibility results (1 = visible, 0 = culled).
   */
  public cullSOABoxes(
    minX: Float32Array, minY: Float32Array, minZ: Float32Array,
    maxX: Float32Array, maxY: Float32Array, maxZ: Float32Array,
    frustumPlanes: ArrayLike<number>, count: number,
    outVisibility?: Uint8Array
  ): Uint8Array {
    const visibility = outVisibility || new Uint8Array(count);
    if (count <= 0) return visibility;

    if (this.isSimdAccelerated() && this.wasmInstance && frustumPlanes.length >= 24) {
      const exports = this.wasmInstance.exports as any;
      const bridge = this.memoryBridge;
      bridge.ensureCapacity(count);

      // Copy input SOA bounds into pre-allocated WASM linear memory
      bridge.minX.set(minX.subarray(0, count));
      bridge.minY.set(minY.subarray(0, count));
      bridge.minZ.set(minZ.subarray(0, count));
      bridge.maxX.set(maxX.subarray(0, count));
      bridge.maxY.set(maxY.subarray(0, count));
      bridge.maxZ.set(maxZ.subarray(0, count));
      bridge.setFrustumPlanes(frustumPlanes);

      const memSize = bridge.getMemoryByteLength();

      const status = exports.spatial_cull_soa_boxes(
        bridge.layout.minXOffset,
        bridge.layout.minYOffset,
        bridge.layout.minZOffset,
        bridge.layout.maxXOffset,
        bridge.layout.maxYOffset,
        bridge.layout.maxZOffset,
        bridge.layout.visibilityOffset,
        count,
        bridge.layout.frustumPlanesOffset,
        memSize
      );

      if (status === 0) {
        visibility.set(bridge.visibility.subarray(0, count));
        return visibility;
      }
    }

    // JS Fallback
    for (let i = 0; i < count; i++) {
      const min = [minX[i], minY[i], minZ[i]];
      const max = [maxX[i], maxY[i], maxZ[i]];
      const result = testAABB(frustumPlanes as any, min, max);
      visibility[i] = (result !== OUTSIDE) ? 1 : 0;
    }

    return visibility;
  }

  /**
   * Normalizes spatial coordinate from global grid coordinates to region-local vector (0 to regionSize)
   * supporting dynamic OpenSim VarRegions up to 4096m.
   */
  public globalToRegionLocal(
    position: ArrayLike<number> | { x?: number; y?: number; z?: number },
    regionOrigin?: RegionOrigin | null,
    regionSize = 256
  ): [number, number, number] {
    let x = 0, y = 0, z = 0;
    if (Array.isArray(position) || (position && 'length' in position)) {
      const arr = position as ArrayLike<number>;
      x = Number(arr[0] ?? 0);
      y = Number(arr[1] ?? 0);
      z = Number(arr[2] ?? 0);
    } else if (position && typeof position === 'object') {
      const obj = position as any;
      x = Number(obj.x ?? obj.X ?? 0);
      y = Number(obj.y ?? obj.Y ?? 0);
      z = Number(obj.z ?? obj.Z ?? 0);
    }

    const originX = this.getOriginMeters(regionOrigin?.x);
    const originY = this.getOriginMeters(regionOrigin?.y);

    if (this.isSimdAccelerated() && this.wasmInstance) {
      const exports = this.wasmInstance.exports as any;
      const bridge = this.memoryBridge;
      const memSize = bridge.getMemoryByteLength();

      const resCode = exports.spatial_global_to_region_local(
        x, y, z,
        originX, originY,
        regionSize,
        bridge.layout.vectorOutOffset,
        memSize
      );

      if (resCode === 0) {
        return [bridge.vectorOut[0], bridge.vectorOut[1], bridge.vectorOut[2]];
      }
    }

    // JS Fallback: OpenSim VarRegion normalization up to 4096m
    if (regionSize <= 0) regionSize = 256;

    let localX = x;
    let localY = y;

    if (localX >= originX && originX > 0) {
      localX = localX - originX;
    } else if (localX > regionSize && originX === 0) {
      localX = localX % regionSize;
    }

    if (localY >= originY && originY > 0) {
      localY = localY - originY;
    } else if (localY > regionSize && originY === 0) {
      localY = localY % regionSize;
    }

    const clampedX = Math.max(0, Math.min(regionSize, localX));
    const clampedY = Math.max(0, Math.min(regionSize, localY));
    const clampedZ = Number.isFinite(z) ? z : 0;

    return [clampedX, clampedY, clampedZ];
  }

  /**
   * Converts region-local vector (0 to regionSize) to global grid coordinates in meters.
   */
  public regionLocalToGlobal(
    localPos: ArrayLike<number> | { x?: number; y?: number; z?: number },
    regionOrigin?: RegionOrigin | null
  ): [number, number, number] {
    let lx = 0, ly = 0, lz = 0;
    if (Array.isArray(localPos) || (localPos && 'length' in localPos)) {
      const arr = localPos as ArrayLike<number>;
      lx = Number(arr[0] ?? 0);
      ly = Number(arr[1] ?? 0);
      lz = Number(arr[2] ?? 0);
    } else if (localPos && typeof localPos === 'object') {
      const obj = localPos as any;
      lx = Number(obj.x ?? obj.X ?? 0);
      ly = Number(obj.y ?? obj.Y ?? 0);
      lz = Number(obj.z ?? obj.Z ?? 0);
    }

    const originX = this.getOriginMeters(regionOrigin?.x);
    const originY = this.getOriginMeters(regionOrigin?.y);

    if (this.isSimdAccelerated() && this.wasmInstance) {
      const exports = this.wasmInstance.exports as any;
      const bridge = this.memoryBridge;
      const memSize = bridge.getMemoryByteLength();

      const resCode = exports.spatial_region_local_to_global(
        lx, ly, lz,
        originX, originY,
        bridge.layout.vectorOutOffset,
        memSize
      );

      if (resCode === 0) {
        return [bridge.vectorOut[0], bridge.vectorOut[1], bridge.vectorOut[2]];
      }
    }

    // JS Fallback
    return [originX + lx, originY + ly, lz];
  }

  private getOriginMeters(val?: number | null): number {
    if (!val) return 0;
    const raw = Number(val);
    if (!Number.isFinite(raw)) return 0;
    return raw >= 25600 ? Math.floor(raw / 256) * 256 : raw * 256;
  }
}
