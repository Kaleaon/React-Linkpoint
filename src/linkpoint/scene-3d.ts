/**
 * Linkpoint PWA - 3D Scene Manager
 */

import { Utils } from './utils';
import { Graphics3D } from './graphics-3d';
import { Camera3D } from './camera-3d';
import { Primitives3D } from './primitives-3d';

export class Scene3D extends Utils.EventEmitter {
  public graphics: Graphics3D;
  public camera: Camera3D;
  
  // Scene objects
  public objects: Map<string, any> = new Map();
  public lights: any[] = [];
  
  // Grid
  public showGrid: boolean = true;
  public gridSize: number = 256;
  public gridDivisions: number = 16;
  public environment: any = null;
  private terrainLoaded = false;

  constructor(graphics: Graphics3D, camera: Camera3D) {
    super();
    this.graphics = graphics;
    this.camera = camera;
  }

  /**
   * Initialize scene
   */
  async init() {
    // Create default primitives
    this.createDefaultPrimitives();
    
    // Create grid
    if (this.showGrid) {
      this.createGrid();
    }
    
    // Add default light
    this.addLight({
      type: 'directional',
      position: [100, 100, 200],
      color: [1, 1, 1],
      intensity: 1.0
    });
    
    this.emit('initialized');
  }

  /**
   * Create default primitive meshes
   */
  createDefaultPrimitives() {
    // Cube
    const cube = Primitives3D.createCube(1);
    this.graphics.createMesh('cube', cube.vertices, cube.indices, cube.normals, cube.texCoords);
    
    // Sphere
    const sphere = Primitives3D.createSphere(1, 32, 16);
    this.graphics.createMesh('sphere', sphere.vertices, sphere.indices, sphere.normals, sphere.texCoords);
    
    // Plane
    const plane = Primitives3D.createPlane(10, 10, 10, 10);
    this.graphics.createMesh('plane', plane.vertices, plane.indices, plane.normals, plane.texCoords);
    
    // Cylinder
    const cylinder = Primitives3D.createCylinder(1, 1, 2, 32);
    this.graphics.createMesh('cylinder', cylinder.vertices, cylinder.indices, cylinder.normals, cylinder.texCoords);

    const prism = Primitives3D.createPrism();
    this.graphics.createMesh('prism', prism.vertices, prism.indices, prism.normals, prism.texCoords);

    const torus = Primitives3D.createTorus();
    this.graphics.createMesh('torus', torus.vertices, torus.indices, torus.normals, torus.texCoords);

    // Until LLMesh/JP2 decoding is available in WebGL, uploaded mesh and sculpt
    // assets get an unmistakable non-cube proxy rather than silently vanishing.
    const assetProxy = Primitives3D.createTorus(0.28, 0.22, 16, 8);
    this.graphics.createMesh('asset-proxy', assetProxy.vertices, assetProxy.indices, assetProxy.normals, assetProxy.texCoords);
  }

  /**
   * Create grid
   */
  createGrid() {
    const grid = Primitives3D.createGrid(this.gridSize, this.gridDivisions);
    this.graphics.createMesh('grid', grid.vertices, grid.indices, grid.normals, grid.texCoords);
  }

  addAssetMesh(assetId: string, geometry: { vertices: number[]; indices: number[]; normals?: number[]; texCoords?: number[]; parts?: any[] }) {
    const parts = geometry.parts?.length ? geometry.parts : [geometry];
    return parts.map((part, index) => {
      const name = `asset:${assetId}:${index}`;
      this.graphics.createMesh(name, part.vertices, part.indices, part.normals, part.texCoords);
      return { mesh: name, materialIndex: Number(part.materialIndex ?? index) };
    });
  }

  addAssetTexture(assetId: string, width: number, height: number, rgba: Uint8Array) {
    return this.graphics.createTexture(`texture:${assetId}`, width, height, rgba);
  }

  /** Replace the flat helper grid with the simulator's height field. */
  setTerrain(heights: number[], size = 256) {
    if (!Array.isArray(heights) || size < 2 || heights.length < size * size) return false;
    const cells = Math.min(128, size - 1);
    const vertices: number[] = [], normals: number[] = [], texCoords: number[] = [], indices: number[] = [];
    const sample = (x: number, y: number) => Number(heights[Math.min(size - 1, y) * size + Math.min(size - 1, x)]) || 0;
    for (let y = 0; y <= cells; y++) {
      const sy = Math.round(y * (size - 1) / cells);
      for (let x = 0; x <= cells; x++) {
        const sx = Math.round(x * (size - 1) / cells);
        vertices.push(sx, sy, sample(sx, sy));
        const dx = sample(Math.min(size - 1, sx + 1), sy) - sample(Math.max(0, sx - 1), sy);
        const dy = sample(sx, Math.min(size - 1, sy + 1)) - sample(sx, Math.max(0, sy - 1));
        const length = Math.hypot(dx, dy, 2) || 1;
        normals.push(-dx / length, -dy / length, 2 / length);
        texCoords.push(sx / (size - 1), sy / (size - 1));
      }
    }
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      const a = y * (cells + 1) + x, b = a + 1, c = a + cells + 1, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
    this.graphics.createMesh('terrain', vertices, indices, normals, texCoords);
    this.terrainLoaded = true;
    return true;
  }

  setEnvironment(environment: any) {
    this.environment = environment || null;
    const sky = environment?.sky || environment?.currentSky || {};
    const color = sky.blueHorizon || sky.sunlightColor || [0.53, 0.81, 0.92];
    const normalized = color.slice(0, 3).map((value: number) => Math.max(0, Math.min(1, Number(value) || 0)));
    this.graphics.gl?.clearColor(normalized[0], normalized[1], normalized[2], 1);
    if (this.lights[0] && sky.sunlightColor) this.lights[0].color = sky.sunlightColor.slice(0, 3);
  }

  /**
   * Add object to scene
   */
  addObject(id: string, config: any) {
    const object = {
      id,
      mesh: config.mesh || 'cube',
      meshes: config.meshes || null,
      position: config.position || [0, 0, 0],
      rotation: config.rotation || [0, 0, 0],
      scale: config.scale || [1, 1, 1],
      color: config.color || [1, 1, 1, 1],
      material: config.material || 'basic',
      reflectionProbe: config.reflectionProbe || null,
      visible: config.visible !== false
    };
    
    this.objects.set(id, object);
    this.emit('object_added', object);
    return object;
  }

  /**
   * Remove object from scene
   */
  removeObject(id: string) {
    const object = this.objects.get(id);
    if (object) {
      this.objects.delete(id);
      this.emit('object_removed', object);
    }
  }

  /**
   * Update object
   */
  updateObject(id: string, updates: any) {
    const object = this.objects.get(id);
    if (object) {
      Object.assign(object, updates);
      this.emit('object_updated', object);
    }
  }

  /**
   * Add light
   */
  addLight(config: any) {
    const light = {
      id: config.id || Utils.generateUUID(),
      type: config.type || 'point',
      position: config.position || [0, 0, 0],
      color: config.color || [1, 1, 1],
      intensity: config.intensity || 1.0
    };
    
    this.lights.push(light);
    this.emit('light_added', light);
    return light;
  }

  /**
   * Render scene
   */
  render() {
    this.renderMirrors();
    // Clear
    this.graphics.clear();
    
    // Get matrices
    const viewMatrix = this.camera.getViewMatrix();
    const projectionMatrix = this.camera.getProjectionMatrix();
    
    // Render grid first
    if (this.showGrid || this.terrainLoaded) {
      this.renderGrid(viewMatrix, projectionMatrix);
    }
    
    // Render all objects
    this.objects.forEach(object => {
      if (object.visible) {
        this.renderObject(object, viewMatrix, projectionMatrix);
      }
    });
  }

  private renderMirrors() {
    const mirrors = [...this.objects.values()].filter(object => object.visible && object.reflectionProbe?.mirror);
    for (const mirror of mirrors.slice(0, 2)) {
      const targetName = this.graphics.createRenderTarget(`mirror:${mirror.id}`, 256, 256);
      if (!this.graphics.beginRenderTarget(targetName)) continue;
      const [rx, ry, rz] = mirror.rotation;
      const sx = Math.sin(rx), cx = Math.cos(rx), sy = Math.sin(ry), cy = Math.cos(ry), sz = Math.sin(rz), cz = Math.cos(rz);
      const normal = [cz * sy * cx + sz * sx, sz * sy * cx - cz * sx, cy * cx];
      const reflect = (point: number[]) => {
        const offset = point.map((value, index) => value - mirror.position[index]);
        const distance = offset[0] * normal[0] + offset[1] * normal[1] + offset[2] * normal[2];
        return point.map((value, index) => value - 2 * distance * normal[index]);
      };
      const eye = reflect(this.camera.position);
      const focus = reflect(this.camera.mode === 'orbit' ? this.camera.orbitTarget : this.camera.target);
      const view = this.camera.mat4LookAt(eye, focus, [0, 0, 1]);
      if (this.showGrid) this.renderGrid(view, this.camera.getProjectionMatrix());
      for (const object of this.objects.values()) {
        if (object.visible && object !== mirror && !object.reflectionProbe?.mirror) this.renderObject(object, view, this.camera.getProjectionMatrix());
      }
      this.graphics.endRenderTarget();
      mirror.mirrorTexture = targetName;
    }
  }

  /**
   * Render grid
   */
  renderGrid(viewMatrix: Float32Array, projectionMatrix: Float32Array) {
    const modelMatrix = this.mat4Identity();
    const normalMatrix = this.mat3FromMat4(modelMatrix);
    
    const light = this.lights[0] || { position: [100, 100, 200], color: [1, 1, 1] };
    
    this.graphics.drawMesh(this.terrainLoaded ? 'terrain' : 'grid', 'basic', {
      uModelMatrix: modelMatrix,
      uViewMatrix: viewMatrix,
      uProjectionMatrix: projectionMatrix,
      uNormalMatrix: normalMatrix,
      uLightPos: new Float32Array(light.position),
      uLightColor: new Float32Array(light.color),
      uAmbientColor: new Float32Array([0.3, 0.3, 0.3]),
      uColor: new Float32Array([0.5, 0.5, 0.5, 0.3]),
      uUseTexture: false
    });
  }

  /**
   * Render object
   */
  renderObject(object: any, viewMatrix: Float32Array, projectionMatrix: Float32Array) {
    const modelMatrix = this.calculateModelMatrix(
      object.position,
      object.rotation,
      object.scale
    );
    
    const normalMatrix = this.mat3FromMat4(modelMatrix);
    const light = this.lights[0] || { position: [100, 100, 200], color: [1, 1, 1] };
    
    const draws = object.meshes?.length ? object.meshes : [{ mesh: object.mesh, materialIndex: 0 }];
    for (const draw of draws) {
      const face = object.faces?.[draw.materialIndex];
      const pbr = face?.pbr || {};
      const alphaMode = pbr.alphaMode === 'MASK' || pbr.alphaMode === 1 ? 1 : pbr.alphaMode === 'BLEND' || pbr.alphaMode === 2 ? 2 : 0;
      this.graphics.drawMesh(draw.mesh, object.material, {
        uModelMatrix: modelMatrix,
        uViewMatrix: viewMatrix,
        uProjectionMatrix: projectionMatrix,
        uNormalMatrix: normalMatrix,
        uLightPos: new Float32Array(light.position),
        uLightColor: new Float32Array(light.color),
        uAmbientColor: new Float32Array([0.2, 0.2, 0.2]),
        uColor: new Float32Array(face?.color || object.color),
        uUseTexture: Boolean(object.mirrorTexture || face?.texture || object.texture),
        uTextureName: object.mirrorTexture || face?.texture || object.texture,
        uTexTransform: new Float32Array([...(face?.repeat || [1, 1]), ...(face?.offset || [0, 0])]),
        uTexRotation: face?.rotation || 0,
        uFullBright: Boolean(face?.fullBright),
        uCameraPos: new Float32Array(this.camera.position),
        uMetallic: pbr.metallic ?? 0,
        uRoughness: pbr.roughness ?? 1,
        uEmissive: new Float32Array(pbr.emissive || [0, 0, 0]),
        uMetallicRoughnessTextureName: pbr.metallicRoughnessTexture,
        uNormalTextureName: pbr.normalTexture,
        uEmissiveTextureName: pbr.emissiveTexture,
        uUseMetallicRoughnessTexture: Boolean(pbr.metallicRoughnessTexture),
        uUseNormalTexture: Boolean(pbr.normalTexture),
        uUseEmissiveTexture: Boolean(pbr.emissiveTexture),
        uAlphaMode: alphaMode,
        uAlphaCutoff: pbr.alphaCutoff ?? 0.5,
        uDoubleSided: Boolean(pbr.doubleSided),
      });
    }
  }

  /**
   * Calculate model matrix from transform
   */
  private calculateModelMatrix(position: number[], rotation: number[], scale: number[]) {
    const matrix = this.mat4Identity();
    
    // Translate
    this.mat4Translate(matrix, position);
    
    // Rotate
    if (rotation[0] !== 0) this.mat4RotateX(matrix, rotation[0]);
    if (rotation[1] !== 0) this.mat4RotateY(matrix, rotation[1]);
    if (rotation[2] !== 0) this.mat4RotateZ(matrix, rotation[2]);
    
    // Scale
    this.mat4Scale(matrix, scale);
    
    return matrix;
  }

  /**
   * Matrix operations
   */
  private mat4Identity(): Float32Array {
    return new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ]);
  }

  private mat4Translate(m: Float32Array, v: number[]) {
    m[12] += v[0];
    m[13] += v[1];
    m[14] += v[2];
  }

  private mat4RotateX(m: Float32Array, angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m1 = m[1], m2 = m[2];
    const m5 = m[5], m6 = m[6];
    const m9 = m[9], m10 = m[10];
    const m13 = m[13], m14 = m[14];
    
    m[1] = m1 * c + m2 * s;
    m[2] = m2 * c - m1 * s;
    m[5] = m5 * c + m6 * s;
    m[6] = m6 * c - m5 * s;
    m[9] = m9 * c + m10 * s;
    m[10] = m10 * c - m9 * s;
    m[13] = m13 * c + m14 * s;
    m[14] = m14 * c - m13 * s;
  }

  private mat4RotateY(m: Float32Array, angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m0 = m[0], m2 = m[2];
    const m4 = m[4], m6 = m[6];
    const m8 = m[8], m10 = m[10];
    const m12 = m[12], m14 = m[14];
    
    m[0] = m0 * c - m2 * s;
    m[2] = m0 * s + m2 * c;
    m[4] = m4 * c - m6 * s;
    m[6] = m4 * s + m6 * c;
    m[8] = m8 * c - m10 * s;
    m[10] = m8 * s + m10 * c;
    m[12] = m12 * c - m14 * s;
    m[14] = m12 * s + m14 * c;
  }

  private mat4RotateZ(m: Float32Array, angle: number) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const m0 = m[0], m1 = m[1];
    const m4 = m[4], m5 = m[5];
    const m8 = m[8], m9 = m[9];
    const m12 = m[12], m13 = m[13];
    
    m[0] = m0 * c + m1 * s;
    m[1] = m1 * c - m0 * s;
    m[4] = m4 * c + m5 * s;
    m[5] = m5 * c - m4 * s;
    m[8] = m8 * c + m9 * s;
    m[9] = m9 * c - m8 * s;
    m[12] = m12 * c + m13 * s;
    m[13] = m13 * c - m12 * s;
  }

  private mat4Scale(m: Float32Array, v: number[]) {
    m[0] *= v[0];
    m[1] *= v[0];
    m[2] *= v[0];
    m[3] *= v[0];
    m[4] *= v[1];
    m[5] *= v[1];
    m[6] *= v[1];
    m[7] *= v[1];
    m[8] *= v[2];
    m[9] *= v[2];
    m[10] *= v[2];
    m[11] *= v[2];
  }

  private mat3FromMat4(m4: Float32Array): Float32Array {
    return new Float32Array([
      m4[0], m4[1], m4[2],
      m4[4], m4[5], m4[6],
      m4[8], m4[9], m4[10]
    ]);
  }
}
