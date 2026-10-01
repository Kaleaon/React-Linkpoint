/**
 * Linkpoint PWA - World Viewer Module
 */

import { Utils } from './utils';
import { Graphics3D } from './graphics-3d';
import { Camera3D } from './camera-3d';
import { Scene3D } from './scene-3d';
import { slBridge } from './sl-bridge';
import { CameraControls } from './camera-controls';

export class WorldViewer extends Utils.EventEmitter {
  /**
   * Live simulator scene stream is active when protocol or bridge is connected.
   */
  public get liveSceneSupported() {
    return this.protocol.connected;
  }
  public protocol: any;
  public canvas: HTMLCanvasElement | null = null;
  public graphics3d: Graphics3D | null = null;
  public camera3d: Camera3D | null = null;
  public scene3d: Scene3D | null = null;
  private animationId: number | null = null;
  private cameraControls: CameraControls | null = null;
  private resizeAttached = false;
  private readonly handleResize = () => this.resizeCanvas();
  public use3D: boolean = true;
  
  public region: any = null;
  public objects: any[] = [];
  public nearbyUsers: any[] = [];
  public avatarPosition: [number, number, number] | null = null;
  public environment: any = null;
  public terrain: { size: number; heights: number[] } | null = null;
  public selectedObject: any = null;
  private sceneObjects = new Map<string, any>();
  private localObjectIds = new Map<number, string>();
  private decodedAssets = new Map<string, any>();
  private decodedTextures = new Map<string, any>();
  private decodedMaterials = new Map<string, any>();

  public getDataStatus() {
    if (!this.protocol.connected) return 'Disconnected';
    return this.objects.length > 0
      ? `Live simulator scene: ${this.objects.length} objects loaded`
      : 'Live simulator scene: streaming from grid…';
  }

  constructor(protocolManager: any) {
    super();
    this.protocol = protocolManager;
    this.protocol.on('connected', (reply: any) => {
      this.applyWorldData(reply.world_data);
      const normalizeGridCoordinate = (value: any) => {
        const coordinate = Number(value);
        if (!Number.isFinite(coordinate)) return null;
        // Login replies generally use global metre coordinates while region
        // handshakes and map services use region-grid coordinates.
        return coordinate >= 25600 ? Math.floor(coordinate / 256) : coordinate;
      };
      this.region = {
        ...this.region,
        name: reply.sim_name || reply.region_name || null,
        x: normalizeGridCoordinate(reply.region_x),
        y: normalizeGridCoordinate(reply.region_y),
      };
      this.emit('region_changed', this.region);
      void this.loadScene();
    });
    this.protocol.on('disconnected', () => {
      this.region = null;
      this.avatarPosition = null;
      this.nearbyUsers = [];
      this.environment = null;
      this.terrain = null;
      this.selectedObject = null;
      this.sceneObjects.clear();
      this.localObjectIds.clear();
      this.objects = [];
      this.emit('region_changed', null);
      this.emit('nearby_changed', []);
      this.emit('objects_changed', []);
      this.emit('selection_changed', null);
    });
    this.protocol.on('RegionHandshake', (data: any) => {
      this.region = {
        id: data.regionID || data.region_id,
        name: data.regionName || data.region_name || data.name || 'Unknown region',
        x: data.regionX ?? data.region_x ?? 0,
        y: data.regionY ?? data.region_y ?? 0,
      };
      this.emit('region_changed', { ...this.region });
      this.updateLocationDisplay();
    });
    this.protocol.on('ObjectUpdate', (data: any) => {
      const updates = Array.isArray(data) ? data : data?.objects || [data];
      for (const update of updates.filter(Boolean)) {
        const id = update.id || update.objectId || update.full_id;
        if (id) this.upsertSceneObject({ ...update, id });
      }
    });
    this.protocol.on('CoarseLocationUpdate', (data: any) => this.updateCoarseLocations(data));
    this.protocol.on('CoarseAvatarUpdate', (data: any) => {
      if (!data?.id || data.id === this.protocol.agentId) return;
      const position = Array.isArray(data.position) ? data.position.map(Number) : null;
      const distance = position && this.avatarPosition
        ? Math.hypot(position[0] - this.avatarPosition[0], position[1] - this.avatarPosition[1], position[2] - this.avatarPosition[2])
        : null;
      const next = { ...data, position, distance };
      const index = this.nearbyUsers.findIndex((user) => user.id === data.id);
      if (index >= 0) this.nearbyUsers = this.nearbyUsers.map((user, itemIndex) => itemIndex === index ? next : user);
      else this.nearbyUsers = [...this.nearbyUsers, next];
      this.emit('nearby_changed', this.nearbyUsers.map((user) => ({ ...user })));
    });
    this.protocol.on('ParcelProperties', (data: any) => {
      const parcels = data?.ParcelData || data?.parcelData || [];
      const parcel = Array.isArray(parcels) ? parcels[0] : parcels;
      if (!parcel) return;
      this.region = { ...this.region, parcel: { ...parcel } };
      this.emit('parcel_changed', { ...parcel });
      this.emit('region_changed', { ...this.region });
    });
    this.protocol.on('scene:object-add', (object: any) => {
      this.upsertSceneObject(object);
      if (object.avatar) {
        const myName = this.protocol.authReply?.first_name;
        if ((object.id === this.protocol.agentId || (myName && object.name?.includes(myName))) && this.camera3d && Array.isArray(object.position)) {
          this.avatarPosition = object.position;
          this.camera3d.setOrbitTarget(object.position[0], object.position[1], object.position[2]);
          this.camera3d.setPosition(object.position[0], object.position[1] - 8, object.position[2] + 4);
        }
      }
    });
    this.protocol.on('scene:object-update', (object: any) => this.upsertSceneObject(object));
    this.protocol.on('scene:object-remove', (object: any) => this.removeSceneObject(object));
    this.protocol.on('scene:asset-ready', (asset: any) => this.applyAsset(asset));
    this.protocol.on('scene:texture-ready', (asset: any) => this.applyTexture(asset));
    this.protocol.on('scene:material-ready', (asset: any) => this.applyMaterial(asset));
    this.protocol.on('scene:world-data', (data: any) => this.applyWorldData(data));
    this.protocol.on('scene:environment', (data: any) => this.applyWorldData({ environment: data }));
    this.protocol.on('scene:terrain', (data: any) => this.applyWorldData({ terrain: data }));
    this.protocol.on('avatar_presence', (data: any) => this.handleAvatarPresence(data));
    this.protocol.on('AgentMovementComplete', (data: any) => this.handleAgentMovement(data));
    slBridge.on('avatar_presence', (data: any) => {
      // Only process bridge event directly if protocol is not connected
      if (!this.protocol?.connected) {
        this.handleAvatarPresence(data);
      }
    });
  }

  private applyWorldData(data: any) {
    if (!data) return;
    if (data.region) {
      this.region = { ...(this.region || {}), ...data.region };
      this.emit('region_changed', { ...this.region });
    }
    if (data.environment) {
      this.environment = data.environment;
      this.scene3d?.setEnvironment(data.environment);
      this.emit('environment_changed', data.environment);
    }
    if (data.terrain?.heights && Number(data.terrain.size) > 1) {
      this.terrain = { size: Number(data.terrain.size), heights: Array.from(data.terrain.heights, Number) };
      this.scene3d?.setTerrain(this.terrain.heights, this.terrain.size);
      this.emit('terrain_changed', this.terrain);
    }
  }

  private applyAsset(asset: any) {
    if (!asset?.assetId || !asset.geometry) return;
    this.decodedAssets.set(asset.assetId, asset.geometry);
    const meshes = this.scene3d?.addAssetMesh(asset.assetId, asset.geometry);
    for (const object of this.sceneObjects.values()) {
      if (object.assetId !== asset.assetId) continue;
      object.decodedMeshes = meshes || asset.geometry.parts?.map((part: any, index: number) => ({ mesh: `asset:${asset.assetId}:${index}`, materialIndex: part.materialIndex ?? index }));
      this.applySceneObject(object);
    }
  }

  private applyTexture(asset: any) {
    if (!asset?.assetId || !asset.rgba) return;
    this.decodedTextures.set(asset.assetId, asset);
    if (!this.scene3d) return;
    const binary = atob(asset.rgba);
    const rgba = Uint8Array.from(binary, character => character.charCodeAt(0));
    const texture = this.scene3d.addAssetTexture(asset.assetId, asset.width, asset.height, rgba);
    for (const object of this.sceneObjects.values()) {
      const usedByFace = object.faceTextures?.some((face: any) => face.textureId === asset.assetId || this.materialTextureIds(face.materialId).includes(asset.assetId));
      if (object.textureId !== asset.assetId && !usedByFace) continue;
      if (object.textureId === asset.assetId) object.decodedTexture = texture;
      object.decodedFaceTextures = (object.faceTextures || []).map((face: any) => this.resolveFace(face));
      this.applySceneObject(object);
    }
  }

  private materialTextureIds(materialId: string | null) {
    const material = materialId && this.decodedMaterials.get(materialId);
    return material ? Object.values(material.textures || {}).map((texture: any) => texture?.textureId).filter(Boolean) : [];
  }

  private applyMaterial(asset: any) {
    if (!asset?.assetId || !asset.material) return;
    this.decodedMaterials.set(asset.assetId, asset.material);
    for (const object of this.sceneObjects.values()) {
      if (!object.faceTextures?.some((face: any) => face.materialId === asset.assetId)) continue;
      this.applySceneObject(object);
    }
  }

  private resolveFace(face: any) {
    const base = face.materialId && this.decodedMaterials.get(face.materialId);
    if (!base) return { ...face, texture: this.decodedTextures.has(face.textureId) ? `texture:${face.textureId}` : undefined };
    const override = face.materialOverride || {};
    const overrideTextures = override.textures || [];
    const baseTransform = override.textureTransforms?.[0] || base.textures?.baseColor || {};
    const texture = (role: string, index: number) => {
      const textureId = overrideTextures[index] || base.textures?.[role]?.textureId;
      return textureId && this.decodedTextures.has(textureId) ? `texture:${textureId}` : undefined;
    };
    return {
      ...face,
      color: override.baseColor || base.baseColor || face.color,
      repeat: baseTransform.scale || face.repeat,
      offset: baseTransform.offset || face.offset,
      rotation: baseTransform.rotation ?? face.rotation,
      pbr: {
        metallic: override.metallicFactor ?? base.metallic,
        roughness: override.roughnessFactor ?? base.roughness,
        emissive: override.emissiveFactor || base.emissive,
        alphaMode: override.alphaMode ?? base.alphaMode,
        alphaCutoff: override.alphaCutoff ?? base.alphaCutoff,
        doubleSided: override.doubleSided ?? base.doubleSided,
        baseColorTexture: texture('baseColor', 0), normalTexture: texture('normal', 1),
        metallicRoughnessTexture: texture('metallicRoughness', 2), emissiveTexture: texture('emissive', 3),
      },
      texture: texture('baseColor', 0),
    };
  }

  public async loadScene() {
    if (slBridge.connected) {
      try {
        const objects = await slBridge.fetchScene();
        if (Array.isArray(objects) && objects.length > 0) {
          for (const obj of objects) {
            this.upsertSceneObject(obj);
          }
        }
      } catch (err) {
        console.warn('[WorldViewer] loadScene warning:', err);
      }
    }
  }

  private resizeObserver: any = null;

  async init(targetCanvas?: HTMLCanvasElement | null) {
    this.use3D = true;
    const canvas = targetCanvas || (typeof document !== 'undefined' ? (document.getElementById('world-canvas') as HTMLCanvasElement) : null);
    if (!canvas) return;
    if (this.graphics3d && this.canvas === canvas) {
      this.resizeCanvas();
      await this.loadScene();
      this.startRendering();
      return;
    }
    this.destroyRenderer();
    this.canvas = canvas;

    try {
      this.graphics3d = new Graphics3D(this.canvas);
      await this.graphics3d.init();

      this.camera3d = new Camera3D();
      this.camera3d.setPosition(128, 138, 35);
      this.camera3d.setRotation(-0.3, -Math.PI / 2, 0);
      this.camera3d.setMode('orbit');
      this.camera3d.setOrbitTarget(128, 128, 25);
      this.camera3d.setPreset('rear');
      this.cameraControls = new CameraControls(this.canvas, this.camera3d, () => {
        this.updateLocationDisplay();
        this.emit('camera_changed', this.getCameraState());
      }, (x, y) => this.pickObject(x, y));

      this.scene3d = new Scene3D(this.graphics3d, this.camera3d);
      await this.scene3d.init();
      if (this.environment) this.scene3d.setEnvironment(this.environment);
      if (this.terrain) this.scene3d.setTerrain(this.terrain.heights, this.terrain.size);
      for (const [assetId, geometry] of this.decodedAssets) this.scene3d.addAssetMesh(assetId, geometry);
      for (const texture of this.decodedTextures.values()) this.applyTexture(texture);
      await this.loadScene();
      for (const object of this.sceneObjects.values()) this.applySceneObject(object);

      this.startRendering();
      this.updateLocationDisplay();

      window.addEventListener('resize', this.handleResize);
      this.resizeAttached = true;
      if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
        this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this.resizeObserver.observe(this.canvas.parentElement);
      }
      this.resizeCanvas();
    } catch (error) {
      console.error('3D initialization failed:', error);
      this.use3D = false;
      this.destroyRenderer();
      throw error;
    }
  }

  private resizeCanvas() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (parent) {
      const cssWidth = Math.max(1, parent.clientWidth);
      const cssHeight = Math.max(1, parent.clientHeight);
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const renderWidth = Math.round(cssWidth * pixelRatio);
      const renderHeight = Math.round(cssHeight * pixelRatio);
      if (this.graphics3d) this.graphics3d.resize(renderWidth, renderHeight);
      if (this.camera3d) this.camera3d.setAspect(cssWidth / cssHeight);
    }
  }

  public startRendering() {
    if (this.animationId !== null) return;
    const render = (time: number) => {
      if (this.use3D && this.scene3d && this.camera3d) {
        this.camera3d.updateMatrices();
        this.scene3d.render();
      }
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  public stopRendering() {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }

  public destroyRenderer(forCanvas?: HTMLCanvasElement | null) {
    if (forCanvas && this.canvas && this.canvas !== forCanvas) {
      return;
    }
    this.stopRendering();
    if (this.resizeAttached) window.removeEventListener('resize', this.handleResize);
    this.resizeAttached = false;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.cameraControls?.destroy();
    this.cameraControls = null;
    this.graphics3d?.destroy();
    this.graphics3d = null;
    this.camera3d = null;
    this.scene3d = null;
    this.canvas = null;
  }

  public updateLocationDisplay() {
    const regionName = document.getElementById('region-name');
    const coordinates = document.getElementById('coordinates');
    if (regionName) regionName.textContent = this.region?.name || '';
    if (coordinates && this.camera3d) {
      const [x, y, z] = this.camera3d.position;
      coordinates.textContent = `${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}`;
    }
  }

  public moveCamera(dx: number, dy: number, dz: number) {
    if (this.camera3d) {
      this.camera3d.move(dy, dx, dz);
      this.updateLocationDisplay();
      this.emit('camera_changed', this.getCameraState());
    }
  }

  /** Rotate the view by the given pitch/yaw deltas in degrees (positive yaw turns right). */
  public rotateCamera(pitchDegrees: number, yawDegrees: number) {
    if (!this.camera3d) return;
    const toRadians = Math.PI / 180;
    if (pitchDegrees) this.camera3d.rotate(this.camera3d.mode === 'orbit' ? -pitchDegrees * toRadians : pitchDegrees * toRadians, 0);
    if (yawDegrees) this.camera3d.turn(yawDegrees * toRadians);
    this.updateLocationDisplay();
    this.emit('camera_changed', this.getCameraState());
  }

  /** Switch between the third-person orbit camera and first-person view. */
  public toggleCameraMode() {
    if (!this.camera3d) return;
    this.setCameraPreset(this.camera3d.mode === 'orbit' ? 'first-person' : 'rear');
  }

  public setCameraPreset(preset: 'rear' | 'front' | 'first-person' | 'free') {
    this.camera3d?.setPreset(preset);
    this.updateLocationDisplay();
    this.emit('camera_changed', this.getCameraState());
  }

  public getCameraState() {
    if (!this.camera3d) return null;
    const { heading, pitch } = this.camera3d.viewAngles();
    return { position: [...this.camera3d.position], preset: this.camera3d.preset, mode: this.camera3d.mode, heading, pitch };
  }

  public pickObject(x: number, y: number) {
    if (!this.canvas || !this.scene3d) return null;
    const bounds = this.canvas.getBoundingClientRect();
    const hit = this.scene3d.pick(x, y, bounds.width, bounds.height);
    const objectId = hit?.id.replace(/:(body|head|legs)$/, '') || null;
    this.selectedObject = objectId ? this.sceneObjects.get(objectId) || null : null;
    const selection = this.selectedObject ? { ...this.selectedObject, hitPoint: hit?.point, distance: hit?.distance } : null;
    this.emit('selection_changed', selection);
    return selection;
  }

  public focusSelectedObject() {
    if (!this.selectedObject || !this.camera3d) return false;
    const { position } = this.worldTransform(this.selectedObject);
    this.camera3d.setOrbitTarget(position[0], position[1], position[2]);
    this.camera3d.setMode('orbit');
    this.camera3d.orbitDistance = Math.max(2.5, Math.hypot(...(this.selectedObject.scale || [1, 1, 1])) * 2.5);
    this.camera3d.updateMatrices();
    this.emit('camera_changed', this.getCameraState());
    return true;
  }

  private quaternionToEuler([x, y, z, w]: number[]) {
    const sinX = 2 * (w * x + y * z);
    const cosX = 1 - 2 * (x * x + y * y);
    const sinY = Math.max(-1, Math.min(1, 2 * (w * y - z * x)));
    const sinZ = 2 * (w * z + x * y);
    const cosZ = 1 - 2 * (y * y + z * z);
    return [Math.atan2(sinX, cosX), Math.asin(sinY), Math.atan2(sinZ, cosZ)];
  }

  private upsertSceneObject(object: any, emitChanged = true) {
    if (!object?.id) return;
    // Terse simulator updates only carry motion fields.  Keep the shape,
    // material and link metadata learned from the full ObjectUpdate packet.
    const previous = this.sceneObjects.get(object.id);
    const merged = previous ? { ...previous, ...object } : object;
    this.sceneObjects.set(object.id, merged);
    if (object.localId) this.localObjectIds.set(object.localId, object.id);
    this.objects = Array.from(this.sceneObjects.values());
    this.applySceneObject(merged);
    // A root prim moving changes every child prim's world transform even when
    // the simulator quite correctly sends no update for those children.
    if (merged.localId) this.reapplyChildren(merged.localId);
    if (emitChanged) {
      this.emit('objects_changed', this.objects);
    }
  }

  private reapplyChildren(parentLocalId: number, visited = new Set<number>()) {
    if (visited.has(parentLocalId)) return;
    visited.add(parentLocalId);
    for (const child of this.sceneObjects.values()) {
      if (Number(child.parentId) !== Number(parentLocalId)) continue;
      this.applySceneObject(child);
      if (child.localId) this.reapplyChildren(child.localId, visited);
    }
  }

  private multiplyQuaternion(a: number[], b: number[]) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  }

  private rotateVector(vector: number[], quaternion: number[]) {
    const [x, y, z] = vector;
    const [qx, qy, qz, qw] = quaternion;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy,
      iy * qw + iw * -qy + iz * -qx - ix * -qz,
      iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ];
  }

  private worldTransform(object: any, visited = new Set<string>()): { position: number[]; rotation: number[] } {
    const position = Array.isArray(object.position) ? object.position : [0, 0, 0];
    const rotation = Array.isArray(object.rotation) && object.rotation.length === 4 ? object.rotation : [0, 0, 0, 1];
    if (!object.parentId || visited.has(object.id)) return { position, rotation };
    const parentId = this.localObjectIds.get(Number(object.parentId));
    const parent = parentId && this.sceneObjects.get(parentId);
    if (!parent) return { position, rotation };
    visited.add(object.id);
    const parentTransform = this.worldTransform(parent, visited);
    const offset = this.rotateVector(position, parentTransform.rotation);
    return {
      position: parentTransform.position.map((value, index) => value + offset[index]),
      rotation: this.multiplyQuaternion(parentTransform.rotation, rotation),
    };
  }

  private applySceneObject(object: any) {
    if (!this.scene3d) return;
    const { position, rotation } = this.worldTransform(object);
    const scale = Array.isArray(object.scale) ? object.scale : [1, 1, 1];
    object.decodedFaceTextures = (object.faceTextures || []).map((face: any) => this.resolveFace(face));
    const config = {
      mesh: object.avatar ? 'sphere' : ['cube', 'cylinder', 'sphere', 'prism', 'torus', 'asset-proxy'].includes(object.shape) ? object.shape : 'cube',
      meshes: object.decodedMeshes,
      position,
      rotation: this.quaternionToEuler(rotation),
      scale,
      color: object.avatar ? [0.3, 0.65, 1, 1] : object.color || [0.8, 0.8, 0.8, 1],
      texture: object.decodedTexture,
      faces: object.decodedFaceTextures,
      reflectionProbe: object.reflectionProbe,
    };
    if (this.scene3d.objects.has(object.id)) this.scene3d.updateObject(object.id, config);
    else this.scene3d.addObject(object.id, config);
    if (object.avatar) this.applyAvatarParts(object.id, config);
  }

  private applyAvatarParts(id: string, config: any) {
    if (!this.scene3d) return;
    const [x, y, z] = config.position;
    const parts = [
      [`${id}:body`, { ...config, mesh: 'cylinder', position: [x, y, z + .95], scale: [.42, .3, .85] }],
      [`${id}:head`, { ...config, mesh: 'sphere', position: [x, y, z + 2.05], scale: [.38, .38, .42], color: [.82, .62, .48, 1] }],
      [`${id}:legs`, { ...config, mesh: 'cylinder', position: [x, y, z + .15], scale: [.32, .25, .75], color: [.16, .24, .38, 1] }],
    ] as const;
    for (const [partId, part] of parts) this.scene3d.objects.has(partId) ? this.scene3d.updateObject(partId, part) : this.scene3d.addObject(partId, part);
    this.scene3d.updateObject(id, { visible: false });
  }

  private removeSceneObject(object: any, emitChanged = true) {
    const id = object.id && this.sceneObjects.has(object.id)
      ? object.id
      : this.localObjectIds.get(object.localId);
    if (!id) return;
    this.sceneObjects.delete(id);
    this.localObjectIds.delete(object.localId);
    this.scene3d?.removeObject(id);
    for (const suffix of [':body', ':head', ':legs']) this.scene3d?.removeObject(`${id}${suffix}`);
    this.objects = Array.from(this.sceneObjects.values());
    if (this.selectedObject?.id === id) {
      this.selectedObject = null;
      this.emit('selection_changed', null);
    }
    if (emitChanged) {
      this.emit('objects_changed', this.objects);
    }
  }

  private updateCoarseLocations(data: any) {
    const locations = data?.Location_Fields || data?.locations || [];
    const agents = data?.AgentData_Fields || data?.agents || [];
    const you = Number(data?.Index_Field?.You ?? data?.youIndex ?? -1);
    const next: any[] = [];
    for (let index = 0; index < locations.length; index++) {
      const location = locations[index];
      const position: [number, number, number] = [
        Number(location.X ?? location.x ?? 0),
        Number(location.Y ?? location.y ?? 0),
        Number(location.Z ?? location.z ?? 0) * 4,
      ];
      if (index === you) {
        this.avatarPosition = position;
        continue;
      }
      const agent = agents[index] || {};
      const id = agent.AgentID || agent.agentId || agent.id;
      if (!id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(String(id))) continue;
      const distance = this.avatarPosition
        ? Math.hypot(position[0] - this.avatarPosition[0], position[1] - this.avatarPosition[1], position[2] - this.avatarPosition[2])
        : null;
      next.push({ id: String(id), position, distance });
    }
    this.nearbyUsers = next;
    this.emit('nearby_changed', next.map(user => ({ ...user })));
  }

  public parseCoordinates(item: any): [number, number, number] | null {
    if (!item) return null;
    const raw =
      item.coordinates ??
      item.Coordinates ??
      item.position ??
      item.Position ??
      item.pos ??
      item.Pos ??
      item.coarsePosition ??
      item.location ??
      item.Location;
    if (!raw) return null;
    if (Array.isArray(raw)) {
      const x = Number(raw[0]);
      const y = Number(raw[1]);
      const z = Number(raw[2] ?? 0);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return [x, y, Number.isFinite(z) ? z : 0];
      }
      return null;
    }
    if (typeof raw === 'object') {
      const x = Number(raw.x ?? raw.X);
      const y = Number(raw.y ?? raw.Y);
      const z = Number(raw.z ?? raw.Z ?? 0);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return [x, y, Number.isFinite(z) ? z : 0];
      }
      return null;
    }
    if (typeof raw === 'string') {
      const parts = raw.replace(/[<>[\]()]/g, '').split(',').map((s) => Number(s.trim()));
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        return [parts[0], parts[1], Number.isFinite(parts[2]) ? parts[2] : 0];
      }
    }
    return null;
  }

  public handleAvatarPresence(data: any) {
    if (!data) return;
    const body = data.body ?? data.data ?? data;
    const items = Array.isArray(body)
      ? body
      : Array.isArray(body.AgentData)
      ? body.AgentData
      : Array.isArray(body.agents)
      ? body.agents
      : Array.isArray(body.avatars)
      ? body.avatars
      : [body];

    let changed = false;
    let objectsChanged = false;

    for (const item of items) {
      if (!item) continue;
      const rawId = item.id || item.agentId || item.AgentID || item.agent_id || item.avatar_id || item.avatarId || item.uuid || '';
      const id = String(typeof rawId === 'object' && rawId?.toString ? rawId.toString() : rawId).trim();
      if (!id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id)) continue;

      const isLeft = Boolean(
        item.left === true ||
        item.Left === true ||
        item.presence === 'left' ||
        item.presence === 'departed' ||
        item.presence === 'offline' ||
        item.online === false ||
        item.Online === false
      );

      if (isLeft) {
        if (id === this.protocol.agentId) {
          this.avatarPosition = null;
        } else {
          const prevCount = this.nearbyUsers.length;
          this.nearbyUsers = this.nearbyUsers.filter((u) => u.id !== id);
          if (this.nearbyUsers.length !== prevCount) {
            changed = true;
          }
          this.removeSceneObject({ id }, false);
          objectsChanged = true;
        }
        continue;
      }

      const position = this.parseCoordinates(item);
      const firstName = item.firstName || item.FirstName || '';
      const lastName = item.lastName || item.LastName || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      const name = item.name || item.Name || fullName || item.username;

      if (id === this.protocol.agentId) {
        if (position) {
          this.avatarPosition = position;
          if (this.camera3d) {
            this.camera3d.setOrbitTarget(position[0], position[1], position[2]);
          }
          if (this.sceneObjects.has(id)) {
            this.upsertSceneObject({
              id,
              position,
              avatar: true,
              name: name || this.protocol.authReply?.first_name || 'Me',
              shape: 'sphere',
            }, false);
            objectsChanged = true;
          }
          // Recalculate distance and bearing for all nearby users
          this.nearbyUsers = this.nearbyUsers.map((u) => {
            if (u.position) {
              const distance = Math.hypot(
                u.position[0] - position[0],
                u.position[1] - position[1],
                u.position[2] - position[2]
              );
              const dx = u.position[0] - position[0];
              const dy = u.position[1] - position[1];
              let bearing = Math.atan2(dx, dy) * (180 / Math.PI);
              if (bearing < 0) bearing += 360;
              const roundedBearing = Math.round(bearing);
              if (u.distance !== distance || u.bearing !== roundedBearing) {
                changed = true;
                return { ...u, distance, bearing: roundedBearing };
              }
            }
            return u;
          });
        }
        continue;
      }

      // Another avatar in region
      let distance: number | null = null;
      let bearing: number | null = null;
      if (position && this.avatarPosition) {
        distance = Math.hypot(
          position[0] - this.avatarPosition[0],
          position[1] - this.avatarPosition[1],
          position[2] - this.avatarPosition[2]
        );
        const dx = position[0] - this.avatarPosition[0];
        const dy = position[1] - this.avatarPosition[1];
        let brg = Math.atan2(dx, dy) * (180 / Math.PI);
        if (brg < 0) brg += 360;
        bearing = Math.round(brg);
      }

      const existingIndex = this.nearbyUsers.findIndex((u) => u.id === id);
      const existing = existingIndex >= 0 ? this.nearbyUsers[existingIndex] : null;

      const nextUser = {
        ...(existing || {}),
        ...item,
        id,
        name: name || existing?.name || `Resident ${id.slice(0, 8)}`,
        position: position ?? existing?.position ?? null,
        distance: distance ?? existing?.distance ?? null,
        bearing: bearing ?? existing?.bearing ?? null,
        online: true,
        presence: item.presence || 'online',
      };

      if (existingIndex >= 0) {
        if (
          existing.position?.[0] !== nextUser.position?.[0] ||
          existing.position?.[1] !== nextUser.position?.[1] ||
          existing.position?.[2] !== nextUser.position?.[2] ||
          existing.distance !== nextUser.distance ||
          existing.bearing !== nextUser.bearing ||
          existing.name !== nextUser.name
        ) {
          this.nearbyUsers = this.nearbyUsers.map((u, idx) => (idx === existingIndex ? nextUser : u));
          changed = true;
        }
      } else {
        this.nearbyUsers = [...this.nearbyUsers, nextUser];
        changed = true;
      }

      // If position is known, upsert into 3D scene so avatars appear in the 3D world view!
      if (position) {
        this.upsertSceneObject({
          id,
          position,
          avatar: true,
          name: nextUser.name,
          shape: 'sphere',
        }, false);
        objectsChanged = true;
      }
    }

    if (objectsChanged) {
      this.emit('objects_changed', this.objects);
    }

    if (changed) {
      this.emit('nearby_changed', this.nearbyUsers.map((user) => ({ ...user })));
    }
  }

  public handleAgentMovement(data: any) {
    if (!data) return;
    const raw = data?.Data?.Position ?? data?.Position ?? data?.position ?? data;
    const pos = this.parseCoordinates(raw);
    if (pos) {
      this.avatarPosition = pos;
      if (this.camera3d) {
        this.camera3d.setOrbitTarget(pos[0], pos[1], pos[2]);
      }
      if (this.protocol.agentId && this.sceneObjects.has(this.protocol.agentId)) {
        this.upsertSceneObject({
          id: this.protocol.agentId,
          position: pos,
          avatar: true,
          name: this.protocol.authReply?.first_name || 'Me',
          shape: 'sphere',
        });
      }
      this.updateLocationDisplay();
    }
  }
}
