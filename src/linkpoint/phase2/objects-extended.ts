/**
 * Linkpoint PWA - Object Manager Extensions (Features 17-20)
 *
 * Phase 2: Core Protocol Extensions - Priority 1
 * Roadmap: PWA-demo/ANDROID_PORT_ROADMAP.md (Lines 42-47)
 * Android Source: app/src/main/java/com/lumiyaviewer/lumiya/slproto/objects/
 *
 * Extends object management with prim parameters, permissions, and relationships.
 */

import { Utils } from '../utils';
import { slBridge } from '../sl-bridge';

export class ObjectManagerExtended extends Utils.EventEmitter {
  private objects: Map<string, any> = new Map();
  private selectedObjects: Set<string> = new Set();
  private parentChildMap: Map<string, Set<string>> = new Map();

  constructor(private bridge?: any) {
    super();
  }

  private getBridge() {
    return this.bridge || slBridge;
  }

  /**
   * Dispatches ObjectAdd over RPC and notifies listeners on confirmation.
   */
  async addObject(params: any) {
    const result = await this.getBridge().addObject(params);
    this.emit('object_added', { result, params });
    this.emit('objectAdded', { result, params });
    return result;
  }

  /**
   * Links multiple objects with the last selected object as the root parent.
   * Updates internal parentChildMap and emits event notifications upon confirmation.
   */
  async linkObjects(params: any) {
    const result = await this.getBridge().linkObjects(params);
    if (result && result.rootLocalId !== undefined && Array.isArray(result.childLocalIds)) {
      const rootId = String(result.rootLocalId);
      for (const childId of result.childLocalIds) {
        this.linkChild(rootId, String(childId));
      }
    } else if (params && (params.objectLocalIds || params.localIds)) {
      const ids = (params.objectLocalIds || params.localIds).map(String);
      if (ids.length >= 2) {
        const rootId = ids[ids.length - 1];
        for (let i = 0; i < ids.length - 1; i++) {
          this.linkChild(rootId, ids[i]);
        }
      }
    }
    this.emit('objects_linked', result);
    this.emit('link', result);
    return result;
  }

  /**
   * Delinks objects, updating internal parent-child relationships and emitting events.
   */
  async delinkObjects(params: any) {
    const result = await this.getBridge().delinkObjects(params);
    const ids = result?.objectLocalIds || params?.objectLocalIds || params?.localIds || [];
    for (const id of ids) {
      this.unlinkChild(String(id));
    }
    this.emit('objects_delinked', result);
    this.emit('delink', result);
    return result;
  }

  /**
   * Updates primitive parameters across the network, updates local cache and emits events.
   */
  async updatePrimParams(params: any) {
    const result = await this.getBridge().updatePrimParams(params);
    const targets =
      result?.objectLocalIds ||
      (params.localId !== undefined ? [params.localId] : []) ||
      params.objectLocalIds ||
      params.localIds ||
      [];
    for (const targetId of targets) {
      const idStr = String(targetId);
      const existing = this.objects.get(idStr)?.primParams || {};
      this.setPrimParams(idStr, { ...existing, ...params });
    }
    this.emit('prim_params_updated', { result, params });
    return result;
  }

  /**
   * Derezzes / deletes objects from the simulator and local maps.
   */
  async deleteObject(params: any) {
    const result = await this.getBridge().deleteObject(params);
    const ids =
      result?.objectLocalIds ||
      (params.localId !== undefined ? [params.localId] : []) ||
      params.objectLocalIds ||
      params.localIds ||
      [];
    for (const id of ids) {
      const idStr = String(id);
      this.unlinkChild(idStr);
      this.objects.delete(idStr);
      this.selectedObjects.delete(idStr);
    }
    this.emit('object_deleted', { result, params });
    return result;
  }

  async derezObject(params: any) {
    return this.deleteObject(params);
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

  hasPermission(objectId: string, permType: string): boolean {
    const perms = this.objects.get(objectId)?.permissions;
    return perms ? Boolean(perms[permType]) : false;
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
