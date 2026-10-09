/**
 * Zero-Copy SharedArrayBuffer & SOA (Structure of Arrays) Memory Bridge
 *
 * Manages pre-allocated linear memory views over SharedArrayBuffer (or ArrayBuffer fallback)
 * for WASM SIMD spatial operations, guaranteeing zero main-thread GC allocations during
 * active rendering loops.
 */

export interface SpatialMemoryLayout {
  minXOffset: number;
  minYOffset: number;
  minZOffset: number;
  maxXOffset: number;
  maxYOffset: number;
  maxZOffset: number;
  visibilityOffset: number;
  frustumPlanesOffset: number;
  matrixTempOffset: number;
  vectorTempOffset: number;
  vectorOutOffset: number;
  totalByteSize: number;
}

export class SpatialMemoryBridge {
  private memory: WebAssembly.Memory;
  private isSharedBuffer: boolean;
  private maxCount: number;

  // Pre-allocated typed arrays over WASM linear memory
  public minX!: Float32Array;
  public minY!: Float32Array;
  public minZ!: Float32Array;
  public maxX!: Float32Array;
  public maxY!: Float32Array;
  public maxZ!: Float32Array;
  public visibility!: Uint8Array;
  public frustumPlanes!: Float32Array;
  public matrixTemp!: Float32Array;
  public vectorTemp!: Float32Array;
  public vectorOut!: Float32Array;

  public layout!: SpatialMemoryLayout;

  constructor(initialCount = 16384, memory?: WebAssembly.Memory) {
    this.maxCount = initialCount;
    this.isSharedBuffer = typeof SharedArrayBuffer !== 'undefined';

    if (memory) {
      this.memory = memory;
      this.isSharedBuffer = memory.buffer instanceof SharedArrayBuffer;
    } else {
      // Allocate WASM memory pages (64KB per page)
      const bytesNeeded = this.calculateRequiredBytes(initialCount);
      const initialPages = Math.max(16, Math.ceil(bytesNeeded / 65536));

      try {
        if (this.isSharedBuffer) {
          this.memory = new WebAssembly.Memory({
            initial: initialPages,
            maximum: 256,
            shared: true,
          });
        } else {
          this.memory = new WebAssembly.Memory({
            initial: initialPages,
          });
        }
      } catch {
        // Fallback to non-shared memory if SAB instantiation fails
        this.isSharedBuffer = false;
        this.memory = new WebAssembly.Memory({ initial: initialPages });
      }
    }

    this.rebindViews();
  }

  public getWasmMemory(): WebAssembly.Memory {
    return this.memory;
  }

  public isShared(): boolean {
    return this.isSharedBuffer;
  }

  public getCapacity(): number {
    return this.maxCount;
  }

  public getMemoryByteLength(): number {
    return this.memory.buffer.byteLength;
  }

  private calculateRequiredBytes(count: number): number {
    // Layout:
    // minX, minY, minZ, maxX, maxY, maxZ: 6 * count * 4 bytes
    // visibility: count * 1 byte
    // frustumPlanes: 24 * 4 bytes
    // matrixTemp: 16 * 4 bytes
    // vectorTemp: 3 * 4 bytes
    // vectorOut: 3 * 4 bytes
    // Plus alignment padding
    const floatArraySize = count * 4;
    const uint8ArraySize = count;
    return floatArraySize * 6 + uint8ArraySize + 256;
  }

  public rebindViews(): void {
    const buffer = this.memory.buffer;
    const count = this.maxCount;

    let offset = 1024; // Align starting offset past base stack header

    const minXOff = offset;
    offset += count * 4;
    const minYOff = offset;
    offset += count * 4;
    const minZOff = offset;
    offset += count * 4;
    const maxXOff = offset;
    offset += count * 4;
    const maxYOff = offset;
    offset += count * 4;
    const maxZOff = offset;
    offset += count * 4;

    const visOff = offset;
    offset += count;
    // Align to 4-byte boundary
    offset = (offset + 3) & ~3;

    const frustumOff = offset;
    offset += 24 * 4;
    const matrixOff = offset;
    offset += 16 * 4;
    const vecTempOff = offset;
    offset += 3 * 4;
    const vecOutOff = offset;
    offset += 3 * 4;

    this.layout = {
      minXOffset: minXOff,
      minYOffset: minYOff,
      minZOffset: minZOff,
      maxXOffset: maxXOff,
      maxYOffset: maxYOff,
      maxZOffset: maxZOff,
      visibilityOffset: visOff,
      frustumPlanesOffset: frustumOff,
      matrixTempOffset: matrixOff,
      vectorTempOffset: vecTempOff,
      vectorOutOffset: vecOutOff,
      totalByteSize: offset,
    };

    this.minX = new Float32Array(buffer, minXOff, count);
    this.minY = new Float32Array(buffer, minYOff, count);
    this.minZ = new Float32Array(buffer, minZOff, count);
    this.maxX = new Float32Array(buffer, maxXOff, count);
    this.maxY = new Float32Array(buffer, maxYOff, count);
    this.maxZ = new Float32Array(buffer, maxZOff, count);
    this.visibility = new Uint8Array(buffer, visOff, count);
    this.frustumPlanes = new Float32Array(buffer, frustumOff, 24);
    this.matrixTemp = new Float32Array(buffer, matrixOff, 16);
    this.vectorTemp = new Float32Array(buffer, vecTempOff, 3);
    this.vectorOut = new Float32Array(buffer, vecOutOff, 3);
  }

  /**
   * Set AABB bounds for a scene object at index in zero-copy memory.
   */
  public setBox(index: number, min: ArrayLike<number>, max: ArrayLike<number>): void {
    if (index < 0 || index >= this.maxCount) return;
    this.minX[index] = min[0];
    this.minY[index] = min[1];
    this.minZ[index] = min[2];
    this.maxX[index] = max[0];
    this.maxY[index] = max[1];
    this.maxZ[index] = max[2];
  }

  /**
   * Set frustum plane equations (24 floats: 6 planes * [nx, ny, nz, d]).
   */
  public setFrustumPlanes(planes: ArrayLike<number>): void {
    for (let i = 0; i < 24 && i < planes.length; i++) {
      this.frustumPlanes[i] = planes[i];
    }
  }

  /**
   * Ensure memory buffer has capacity for at least requiredCount objects.
   */
  public ensureCapacity(requiredCount: number): void {
    if (requiredCount <= this.maxCount) return;

    this.maxCount = Math.max(requiredCount, this.maxCount * 2);
    const requiredBytes = this.calculateRequiredBytes(this.maxCount);
    const currentBytes = this.memory.buffer.byteLength;

    if (requiredBytes > currentBytes) {
      const additionalPages = Math.ceil((requiredBytes - currentBytes) / 65536);
      this.memory.grow(additionalPages);
    }

    this.rebindViews();
  }
}
