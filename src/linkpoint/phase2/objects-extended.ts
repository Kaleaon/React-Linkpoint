/**
 * Linkpoint PWA - Object Manager Extensions (Features 17-20)
 *
 * Phase 2: Core Protocol Extensions - Priority 1
 * Roadmap: PWA-demo/ANDROID_PORT_ROADMAP.md (Lines 42-47)
 * Android Source: app/src/main/java/com/lumiyaviewer/lumiya/slproto/objects/
 *
 * Extends object management with prim parameters, permissions, and relationships.
 */

import { slBridge } from '../sl-bridge';

export interface TransformDelta {
  position?: number[];
  rotation?: number[];
  scale?: number[];
  type?: 'ObjectPosition' | 'ObjectRotation' | 'ObjectScale' | string;
  [key: string]: any;
}

export class ObjectManagerExtended {
  private objects: Map<string, any> = new Map();
  private selectedObjects: Set<string> = new Set();
  private parentChildMap: Map<string, Set<string>> = new Map();
  private bridge: any;
  private throttleIntervalMs = 100;
  private pendingStreams = new Map<
    string,
    {
      timer: ReturnType<typeof setTimeout> | null;
      lastSentTime: number;
      pendingDelta: TransformDelta | null;
    }
  >();

  constructor(bridge: any = slBridge) {
    this.bridge = bridge;
  }

  setBridge(bridge: any) {
    this.bridge = bridge;
  }

  /**
   * Set throttle interval in milliseconds (default: 100ms / 10Hz).
   */
  setThrottleInterval(ms: number) {
    this.throttleIntervalMs = Math.max(0, ms);
  }

  /**
   * Stream throttled object delta updates to the bridge during active drag,
   * followed by an unthrottled final commit when isFinal is true.
   */
  streamTransform(objectId: string, delta: TransformDelta, isFinal: boolean = false) {
    return this.streamObjectDelta(objectId, delta, isFinal);
  }

  streamObjectDelta(objectId: string, delta: TransformDelta, isFinal: boolean = false) {
    if (!objectId) return;

    // Update locally stored object transform
    const obj = this.objects.get(objectId) || {};
    if (delta.position) obj.position = [...delta.position];
    if (delta.rotation) obj.rotation = [...delta.rotation];
    if (delta.scale) {
      obj.scale = [...delta.scale];
      if (obj.primParams) obj.primParams.scale = [...delta.scale];
    }
    this.objects.set(objectId, obj);

    const packetType =
      delta.type ||
      (delta.position
        ? 'ObjectPosition'
        : delta.rotation
          ? 'ObjectRotation'
          : delta.scale
            ? 'ObjectScale'
            : 'ObjectPosition');

    if (isFinal) {
      // Release gesture: flush any active timer and dispatch immediate unthrottled update
      const existing = this.pendingStreams.get(objectId);
      if (existing?.timer) {
        clearTimeout(existing.timer);
      }
      this.pendingStreams.delete(objectId);

      const finalPayload = {
        id: objectId,
        objectId,
        type: packetType,
        position: delta.position,
        rotation: delta.rotation,
        scale: delta.scale,
        final: true,
        isFinal: true,
      };

      try {
        void this.bridge?.streamObjectDelta?.(finalPayload);
        void this.bridge?.commitObjectTransform?.(finalPayload);
      } catch (err) {
        console.warn('[Objects] Final commit stream error:', err);
      }
      return;
    }

    // Active drag: apply 100ms throttle timer (10Hz max frequency)
    let streamState = this.pendingStreams.get(objectId);
    if (!streamState) {
      streamState = { timer: null, lastSentTime: 0, pendingDelta: null };
      this.pendingStreams.set(objectId, streamState);
    }

    const now = Date.now();
    const elapsed = now - streamState.lastSentTime;

    const dispatch = (d: TransformDelta) => {
      const type =
        d.type ||
        (d.position
          ? 'ObjectPosition'
          : d.rotation
            ? 'ObjectRotation'
            : d.scale
              ? 'ObjectScale'
              : 'ObjectPosition');
      const payload = {
        id: objectId,
        objectId,
        type,
        position: d.position,
        rotation: d.rotation,
        scale: d.scale,
        isFinal: false,
      };
      try {
        void this.bridge?.streamObjectDelta?.(payload);
      } catch (err) {
        console.warn('[Objects] Throttled delta stream error:', err);
      }
      if (streamState) {
        streamState.lastSentTime = Date.now();
        streamState.pendingDelta = null;
        streamState.timer = null;
      }
    };

    if (elapsed >= this.throttleIntervalMs && !streamState.timer) {
      dispatch(delta);
    } else {
      streamState.pendingDelta = delta;
      if (!streamState.timer) {
        const remaining = Math.max(0, this.throttleIntervalMs - elapsed);
        streamState.timer = setTimeout(() => {
          if (streamState?.pendingDelta) {
            dispatch(streamState.pendingDelta);
          } else if (streamState) {
            streamState.timer = null;
          }
        }, remaining);
      }
    }
  }

  commitTransform(objectId: string, transform?: TransformDelta) {
    const current = this.objects.get(objectId);
    const finalTransform = transform || {
      position: current?.position,
      rotation: current?.rotation,
      scale: current?.scale,
    };
    this.streamObjectDelta(objectId, finalTransform, true);
  }

  streamPosition(objectId: string, position: number[], isFinal: boolean = false) {
    this.streamObjectDelta(objectId, { position, type: 'ObjectPosition' }, isFinal);
  }

  streamRotation(objectId: string, rotation: number[], isFinal: boolean = false) {
    this.streamObjectDelta(objectId, { rotation, type: 'ObjectRotation' }, isFinal);
  }

  streamScale(objectId: string, scale: number[], isFinal: boolean = false) {
    this.streamObjectDelta(objectId, { scale, type: 'ObjectScale' }, isFinal);
  }

  /**
   * Feature 17: Prim parameters (shape, material, texture)
   * Set prim parameters for an object
   */
  setPrimParams(objectId: string, primParams: any) {
    if (!objectId || typeof objectId !== 'string') {
      throw new Error('Valid object ID required');
    }
    if (!primParams || typeof primParams !== 'object') {
      throw new Error('Valid prim parameters required');
    }

    const obj = this.objects.get(objectId) || {};
    obj.primParams = {
      shape: primParams.shape || 'box',
      material: primParams.material || 'wood',
      texture: primParams.texture || null,
      color: primParams.color || [1, 1, 1, 1],
      scale: primParams.scale || [1, 1, 1],
      ...primParams,
    };

    this.objects.set(objectId, obj);
    console.log(`[Objects] Set prim params for: ${objectId}`);
  }

  getPrimParams(objectId: string) {
    return this.objects.get(objectId)?.primParams || null;
  }

  /**
   * Feature 18: Object permissions
   * Set object permissions
   */
  setPermissions(objectId: string, permissions: any) {
    if (!objectId || typeof objectId !== 'string') {
      throw new Error('Valid object ID required');
    }
    if (!permissions || typeof permissions !== 'object') {
      throw new Error('Valid permissions object required');
    }

    const obj = this.objects.get(objectId) || {};
    obj.permissions = {
      baseMask: permissions.baseMask || 0,
      ownerMask: permissions.ownerMask || 0,
      groupMask: permissions.groupMask || 0,
      everyoneMask: permissions.everyoneMask || 0,
      nextOwnerMask: permissions.nextOwnerMask || 0,
      ...permissions,
    };

    this.objects.set(objectId, obj);
    console.log(`[Objects] Set permissions for: ${objectId}`);
  }

  getPermissions(objectId: string) {
    return this.objects.get(objectId)?.permissions || null;
  }

  hasPermission(objectId: string, permType: string): boolean {
    const obj = this.objects.get(objectId);
    if (!obj) return true;
    if (obj.isAvatar || obj.avatar) return false;
    const perms = obj.permissions;
    if (!perms) return true;
    if (perms.isAvatar || perms.avatar) return false;
    if (permType === 'modify') {
      if (perms.canModify === false || perms.modify === false) return false;
      if (typeof perms.ownerMask === 'number') return (perms.ownerMask & 0x4000) !== 0;
      if (typeof perms.canModify === 'boolean') return perms.canModify;
      if (typeof perms.modify === 'boolean') return perms.modify;
    }
    return Boolean(perms[permType]);
  }

  /**
   * Feature 19: Object selection
   * Select or deselect an object
   */
  selectObject(objectId: string, selected: boolean = true) {
    if (!objectId || typeof objectId !== 'string') {
      throw new Error('Valid object ID required');
    }

    if (selected) {
      this.selectedObjects.add(objectId);
      console.log(`[Objects] Selected: ${objectId}`);
    } else {
      this.selectedObjects.delete(objectId);
      console.log(`[Objects] Deselected: ${objectId}`);
    }
  }

  getSelectedObjects() {
    return new Set(this.selectedObjects);
  }

  /** Snapshot of objects populated by simulator updates. */
  getObjects() {
    return Array.from(this.objects.entries()).map(([id, object]) => ({ id, ...object }));
  }

  clearSelection() {
    this.selectedObjects.clear();
    console.log(`[Objects] Cleared selections`);
  }

  /**
   * Feature 20: Parent-child relationships
   * Link object as child to parent
   */
  linkChild(parentId: string, childId: string) {
    if (!parentId || !childId) {
      throw new Error('Valid parent and child IDs required');
    }

    if (!this.parentChildMap.has(parentId)) {
      this.parentChildMap.set(parentId, new Set());
    }

    this.parentChildMap.get(parentId)!.add(childId);

    // Store parent reference in child object
    const childObj = this.objects.get(childId) || {};
    childObj.parentId = parentId;
    this.objects.set(childId, childObj);

    console.log(`[Objects] Linked ${childId} to parent ${parentId}`);
  }

  unlinkChild(childId: string) {
    const obj = this.objects.get(childId);
    if (obj?.parentId) {
      const parent = this.parentChildMap.get(obj.parentId);
      if (parent) {
        parent.delete(childId);
      }
      delete obj.parentId;
      console.log(`[Objects] Unlinked ${childId}`);
    }
  }

  getChildren(parentId: string) {
    return this.parentChildMap.get(parentId) || new Set();
  }

  getParent(childId: string) {
    return this.objects.get(childId)?.parentId || null;
  }
}
