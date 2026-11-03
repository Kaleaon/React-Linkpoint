/**
 * Linkpoint - Modular Object Editing Pipeline
 *
 * Dedicated edit session manager, undo/redo history stack (max 50 steps),
 * and transactional batch buffer for object transformations, prim parameters,
 * and linkset modifications.
 */

import { Utils } from '../utils';
import { ObjectManagerExtended } from './objects-extended';
import { slBridge } from '../sl-bridge';

export interface ObjectTransform {
  position?: number[];
  rotation?: number[];
  scale?: number[];
}

export interface PrimParams {
  shape?: string;
  material?: string;
  texture?: string | null;
  color?: number[];
  scale?: number[];
  [key: string]: any;
}

export interface ObjectSnapshot {
  id: string;
  localId?: number;
  position: number[];
  rotation: number[];
  scale: number[];
  primParams?: PrimParams;
  parentId?: string | null;
  [key: string]: any;
}

export interface TransactionStep {
  type: 'transform' | 'primParams' | 'link' | 'delink' | 'batch';
  objectId: string;
  before: Partial<ObjectSnapshot>;
  after: Partial<ObjectSnapshot>;
  timestamp: number;
}

export interface QueuedLinkOperation {
  type: 'link' | 'delink';
  childId: string;
  parentId?: string;
  childLocalId?: number;
  parentLocalId?: number;
}

export interface CommitResult {
  committed: boolean;
  chunks: number;
  objectsUpdated: number;
  linksUpdated: number;
  error?: string;
}

export const MAX_UNDO_STEPS = 50;

export class ObjectEditPipeline extends Utils.EventEmitter {
  public world: any = null;
  public objectsManager: ObjectManagerExtended | null = null;
  public bridge: any = null;
  public protocol: any = null;

  // Edit session state
  public activeObjectId: string | null = null;
  private originalSnapshots: Map<string, ObjectSnapshot> = new Map();
  private currentSnapshots: Map<string, ObjectSnapshot> = new Map();
  private queuedLinks: QueuedLinkOperation[] = [];

  // Undo/Redo stacks
  private undoStack: TransactionStep[] = [];
  private redoStack: TransactionStep[] = [];

  constructor(options?: {
    world?: any;
    objectsManager?: ObjectManagerExtended;
    bridge?: any;
    protocol?: any;
  }) {
    super();
    if (options) {
      this.world = options.world || null;
      this.objectsManager = options.objectsManager || null;
      this.bridge = options.bridge || null;
      this.protocol = options.protocol || null;
    }
  }

  /**
   * Helper to resolve localId for an object from snapshot, world, or manager.
   */
  private resolveLocalId(objectId: string, candidate?: number): number {
    if (candidate && Number.isInteger(candidate) && candidate > 0) {
      return candidate;
    }
    const worldObj = this.world?.sceneObjects?.get?.(objectId) || this.world?.getObject?.(objectId);
    if (worldObj?.localId && Number.isInteger(worldObj.localId)) {
      return worldObj.localId;
    }
    if (this.world?.localObjectIds) {
      for (const [localId, id] of this.world.localObjectIds.entries()) {
        if (id === objectId) return Number(localId);
      }
    }
    if (typeof (this.objectsManager as any)?.resolveLocalId === 'function') {
      const resolved = (this.objectsManager as any).resolveLocalId(objectId);
      if (resolved && Number.isInteger(resolved) && resolved > 0) return resolved;
    }
    const mgrObj =
      typeof this.objectsManager?.getPrimParams === 'function'
        ? this.objectsManager.getPrimParams(objectId)
        : null;
    if (mgrObj?.localId) return Number(mgrObj.localId);
    return 0;
  }

  /**
   * Deep clone a snapshot to prevent accidental reference mutation.
   */
  private cloneSnapshot(snap: ObjectSnapshot): ObjectSnapshot {
    return {
      id: snap.id,
      localId: snap.localId,
      position: [...(snap.position || [0, 0, 0])],
      rotation: [...(snap.rotation || [0, 0, 0, 1])],
      scale: [...(snap.scale || [1, 1, 1])],
      primParams: snap.primParams ? JSON.parse(JSON.stringify(snap.primParams)) : undefined,
      parentId: snap.parentId ?? null,
    };
  }

  /**
   * Create a snapshot from an arbitrary object or world scene object.
   */
  public createSnapshot(obj: any): ObjectSnapshot {
    const id = String(obj.id || obj.objectId || obj.uuid || '');
    const localId = this.resolveLocalId(id, obj.localId);
    const position = Array.isArray(obj.position)
      ? [...obj.position]
      : obj.x != null
        ? [Number(obj.x), Number(obj.y), Number(obj.z)]
        : [0, 0, 0];
    const rotation = Array.isArray(obj.rotation) ? [...obj.rotation] : [0, 0, 0, 1];
    const scale = Array.isArray(obj.scale) ? [...obj.scale] : [1, 1, 1];
    const primParams = obj.primParams
      ? JSON.parse(JSON.stringify(obj.primParams))
      : typeof this.objectsManager?.getPrimParams === 'function'
        ? this.objectsManager.getPrimParams(id)
        : undefined;
    const parentId = obj.parentId ?? null;

    return {
      id,
      localId,
      position,
      rotation,
      scale,
      primParams,
      parentId,
    };
  }

  /**
   * Check if an edit session is currently active.
   */
  public hasActiveSession(): boolean {
    return this.activeObjectId !== null;
  }

  /**
   * Get all queued link and delink operations in current session.
   */
  public getQueuedLinks(): QueuedLinkOperation[] {
    return [...this.queuedLinks];
  }

  /**
   * Begin or start an edit session for an object (accepts object instance or ID).
   */
  public startSession(target: any, initialData?: any): ObjectSnapshot {
    if (typeof target === 'string') {
      const obj = initialData ||
        this.world?.sceneObjects?.get?.(target) ||
        (this.world?.objects instanceof Map
          ? this.world.objects.get(target)
          : this.world?.objects?.find?.((o: any) => o.id === target)) ||
        this.world?.getObject?.(target) || { id: target };
      return this.beginSession(obj);
    }
    return this.beginSession(target);
  }

  /**
   * Begin an edit session for an object.
   */
  public beginSession(object: any): ObjectSnapshot {
    if (!object || (!object.id && !object.objectId)) {
      throw new Error('Valid target object required to begin edit session');
    }
    const id = String(object.id || object.objectId);

    // If starting a session for the same object, keep existing session
    if (this.activeObjectId === id && this.originalSnapshots.has(id)) {
      return this.currentSnapshots.get(id)!;
    }

    // If changing to a new object while clean, reset session
    if (!this.isDirty) {
      this.clearSessionState();
    }

    this.activeObjectId = id;
    const snapshot = this.createSnapshot(object);
    if (!this.originalSnapshots.has(id)) {
      this.originalSnapshots.set(id, this.cloneSnapshot(snapshot));
    }
    if (!this.currentSnapshots.has(id)) {
      this.currentSnapshots.set(id, this.cloneSnapshot(snapshot));
    }

    this.emit('session_started', {
      objectId: id,
      snapshot: this.cloneSnapshot(snapshot),
    });

    return snapshot;
  }

  /**
   * Check if there are uncommitted changes in the buffer.
   */
  public get isDirty(): boolean {
    if (this.queuedLinks.length > 0) return true;
    for (const [id, current] of this.currentSnapshots.entries()) {
      const orig = this.originalSnapshots.get(id);
      if (!orig) return true;
      if (!this.arraysEqual(current.position, orig.position)) return true;
      if (!this.arraysEqual(current.rotation, orig.rotation)) return true;
      if (!this.arraysEqual(current.scale, orig.scale)) return true;
      if (current.parentId !== orig.parentId) return true;
      if (JSON.stringify(current.primParams) !== JSON.stringify(orig.primParams)) return true;
    }
    return false;
  }

  public hasPendingChanges(): boolean {
    return this.isDirty;
  }

  private arraysEqual(a?: number[], b?: number[]): boolean {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 0.0001) return false;
    }
    return true;
  }

  /**
   * Get current buffered snapshot for the active or given object.
   */
  public getSnapshot(objectId?: string): ObjectSnapshot | null {
    const id = objectId || this.activeObjectId;
    if (!id) return null;
    const snap = this.currentSnapshots.get(id);
    return snap ? this.cloneSnapshot(snap) : null;
  }

  /**
   * Get original snapshot before edits began.
   */
  public getOriginalSnapshot(objectId?: string): ObjectSnapshot | null {
    const id = objectId || this.activeObjectId;
    if (!id) return null;
    const snap = this.originalSnapshots.get(id);
    return snap ? this.cloneSnapshot(snap) : null;
  }

  /**
   * Modify object transform or attributes locally.
   * Records atomic step on undo stack (capped at 50) and updates WorldViewer.
   */
  public modifyObject(
    objectId: string,
    changes: {
      position?: number[];
      rotation?: number[];
      scale?: number[];
      primParams?: PrimParams;
    },
  ): ObjectSnapshot {
    if (!this.originalSnapshots.has(objectId)) {
      const worldObj =
        this.world?.sceneObjects?.get?.(objectId) || this.world?.getObject?.(objectId);
      this.beginSession(worldObj || { id: objectId });
    }

    const current = this.currentSnapshots.get(objectId)!;
    const beforeState: Partial<ObjectSnapshot> = {};
    const afterState: Partial<ObjectSnapshot> = {};

    let hasChange = false;

    if (changes.position && !this.arraysEqual(current.position, changes.position)) {
      beforeState.position = [...current.position];
      current.position = [...changes.position];
      afterState.position = [...current.position];
      hasChange = true;
    }

    if (changes.rotation && !this.arraysEqual(current.rotation, changes.rotation)) {
      beforeState.rotation = [...current.rotation];
      current.rotation = [...changes.rotation];
      afterState.rotation = [...current.rotation];
      hasChange = true;
    }

    if (changes.scale && !this.arraysEqual(current.scale, changes.scale)) {
      beforeState.scale = [...current.scale];
      current.scale = [...changes.scale];
      afterState.scale = [...current.scale];
      hasChange = true;
    }

    if (changes.primParams) {
      beforeState.primParams = current.primParams
        ? JSON.parse(JSON.stringify(current.primParams))
        : undefined;
      current.primParams = {
        ...(current.primParams || {}),
        ...changes.primParams,
      };
      afterState.primParams = JSON.parse(JSON.stringify(current.primParams));
      hasChange = true;
    }

    if (!hasChange) {
      return this.cloneSnapshot(current);
    }

    // Push atomic step to undo stack
    this.pushUndoStep({
      type: changes.primParams ? 'primParams' : 'transform',
      objectId,
      before: beforeState,
      after: afterState,
      timestamp: Date.now(),
    });

    // Clear redo stack on new action
    this.redoStack = [];

    // Apply to local world scene so 3D viewer reflects the update
    this.applyToWorld(objectId, current);

    this.emit('dirty', { isDirty: this.isDirty, activeObjectId: objectId });
    this.emit('change', {
      objectId,
      snapshot: this.cloneSnapshot(current),
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      isDirty: this.isDirty,
    });

    return this.cloneSnapshot(current);
  }

  /**
   * Queue a link operation into the transaction buffer.
   */
  public queueLink(firstId: string, secondId?: string) {
    if (!firstId) {
      throw new Error('Valid object ID required for linking');
    }
    let childId: string;
    let parentId: string;

    if (!secondId) {
      childId = firstId;
      parentId = this.activeObjectId || '';
    } else if (secondId === this.activeObjectId) {
      childId = firstId;
      parentId = secondId;
    } else if (firstId === this.activeObjectId) {
      parentId = firstId;
      childId = secondId;
    } else {
      // Default convention: queueLink(childId, parentId)
      childId = firstId;
      parentId = secondId;
    }

    const parentLocalId = this.resolveLocalId(parentId);
    const childLocalId = this.resolveLocalId(childId);

    const childObj =
      this.currentSnapshots.get(childId) ||
      this.createSnapshot(
        this.world?.sceneObjects?.get?.(childId) ||
          (this.world?.objects instanceof Map
            ? this.world.objects.get(childId)
            : this.world?.objects?.find?.((o: any) => o.id === childId)) || { id: childId },
      );
    const beforeParentId = childObj.parentId ?? null;

    childObj.parentId = parentId;
    this.currentSnapshots.set(childId, childObj);
    if (!this.originalSnapshots.has(childId)) {
      this.originalSnapshots.set(childId, { ...childObj, parentId: beforeParentId });
    }

    const op: QueuedLinkOperation = {
      type: 'link',
      parentId,
      childId,
      parentLocalId,
      childLocalId,
    };
    this.queuedLinks.push(op);

    this.pushUndoStep({
      type: 'link',
      objectId: childId,
      before: { parentId: beforeParentId },
      after: { parentId },
      timestamp: Date.now(),
    });
    this.redoStack = [];

    this.emit('change', {
      objectId: childId,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      isDirty: this.isDirty,
    });
  }

  /**
   * Queue a delink operation into the transaction buffer.
   */
  public queueDelink(childId: string) {
    if (!childId) throw new Error('Valid childId required for delinking');
    const childLocalId = this.resolveLocalId(childId);

    const childObj =
      this.currentSnapshots.get(childId) ||
      this.createSnapshot(this.world?.sceneObjects?.get?.(childId) || { id: childId });
    const beforeParentId = childObj.parentId ?? null;

    childObj.parentId = null;
    this.currentSnapshots.set(childId, childObj);
    if (!this.originalSnapshots.has(childId)) {
      this.originalSnapshots.set(childId, { ...childObj, parentId: beforeParentId });
    }

    const op: QueuedLinkOperation = {
      type: 'delink',
      childId,
      childLocalId,
    };
    this.queuedLinks.push(op);

    this.pushUndoStep({
      type: 'delink',
      objectId: childId,
      before: { parentId: beforeParentId },
      after: { parentId: null },
      timestamp: Date.now(),
    });
    this.redoStack = [];

    this.emit('change', {
      objectId: childId,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      isDirty: this.isDirty,
    });
  }

  /**
   * Push step to undo stack with 50-step cap guardrail.
   */
  private pushUndoStep(step: TransactionStep) {
    this.undoStack.push(step);
    if (this.undoStack.length > MAX_UNDO_STEPS) {
      this.undoStack.shift();
    }
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Revert the most recent change.
   */
  public undo(): ObjectSnapshot | null {
    if (!this.canUndo()) return null;
    const step = this.undoStack.pop()!;
    this.redoStack.push(step);

    const targetId = step.objectId;
    const current = this.currentSnapshots.get(targetId);
    if (!current) return null;

    if (step.before.position) current.position = [...step.before.position];
    if (step.before.rotation) current.rotation = [...step.before.rotation];
    if (step.before.scale) current.scale = [...step.before.scale];
    if ('primParams' in step.before) {
      current.primParams = step.before.primParams
        ? JSON.parse(JSON.stringify(step.before.primParams))
        : undefined;
    }
    if ('parentId' in step.before) {
      current.parentId = step.before.parentId ?? null;
      if (step.type === 'link' || step.type === 'delink') {
        this.queuedLinks.pop();
      }
    }

    this.applyToWorld(targetId, current);

    this.emit('undo', {
      objectId: targetId,
      step,
      snapshot: this.cloneSnapshot(current),
    });
    this.emit('change', {
      objectId: targetId,
      snapshot: this.cloneSnapshot(current),
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      isDirty: this.isDirty,
    });

    return this.cloneSnapshot(current);
  }

  /**
   * Re-apply the most recently undone change.
   */
  public redo(): ObjectSnapshot | null {
    if (!this.canRedo()) return null;
    const step = this.redoStack.pop()!;
    this.undoStack.push(step);

    const targetId = step.objectId;
    const current = this.currentSnapshots.get(targetId);
    if (!current) return null;

    if (step.after.position) current.position = [...step.after.position];
    if (step.after.rotation) current.rotation = [...step.after.rotation];
    if (step.after.scale) current.scale = [...step.after.scale];
    if ('primParams' in step.after) {
      current.primParams = step.after.primParams
        ? JSON.parse(JSON.stringify(step.after.primParams))
        : undefined;
    }
    if ('parentId' in step.after) {
      current.parentId = step.after.parentId ?? null;
      if (step.type === 'link') {
        this.queuedLinks.push({
          type: 'link',
          childId: targetId,
          parentId: current.parentId || undefined,
          childLocalId: this.resolveLocalId(targetId),
          parentLocalId: current.parentId ? this.resolveLocalId(current.parentId) : undefined,
        });
      } else if (step.type === 'delink') {
        this.queuedLinks.push({
          type: 'delink',
          childId: targetId,
          childLocalId: this.resolveLocalId(targetId),
        });
      }
    }

    this.applyToWorld(targetId, current);

    this.emit('redo', {
      objectId: targetId,
      step,
      snapshot: this.cloneSnapshot(current),
    });
    this.emit('change', {
      objectId: targetId,
      snapshot: this.cloneSnapshot(current),
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      isDirty: this.isDirty,
    });

    return this.cloneSnapshot(current);
  }

  /**
   * Discard all pending changes and restore original object transform
   * in WorldViewer without dispatching any network RPCs.
   */
  public discard() {
    for (const [id, orig] of this.originalSnapshots.entries()) {
      this.currentSnapshots.set(id, this.cloneSnapshot(orig));
      if (this.world && typeof this.world.restoreObjectTransform === 'function') {
        this.world.restoreObjectTransform(id, orig);
      }
      this.applyToWorld(id, orig);
    }

    this.queuedLinks = [];
    this.undoStack = [];
    this.redoStack = [];

    this.emit('discarded', { objectId: this.activeObjectId });
    this.emit('change', {
      objectId: this.activeObjectId,
      snapshot: this.activeObjectId ? this.getSnapshot(this.activeObjectId) : null,
      canUndo: false,
      canRedo: false,
      isDirty: false,
    });
  }

  /**
   * Commit all buffered object transforms and link modifications atomically.
   */
  public async commit(): Promise<CommitResult> {
    if (!this.isDirty) {
      return { committed: true, chunks: 0, objectsUpdated: 0, linksUpdated: 0 };
    }

    const modifiedObjects: Array<{
      localId: number;
      id: string;
      objectId?: string;
      position?: number[];
      rotation?: number[];
      scale?: number[];
      primParams?: PrimParams;
    }> = [];

    for (const [id, current] of this.currentSnapshots.entries()) {
      const orig = this.originalSnapshots.get(id);
      const isModified =
        !orig ||
        !this.arraysEqual(current.position, orig.position) ||
        !this.arraysEqual(current.rotation, orig.rotation) ||
        !this.arraysEqual(current.scale, orig.scale) ||
        JSON.stringify(current.primParams) !== JSON.stringify(orig.primParams);

      if (isModified) {
        modifiedObjects.push({
          localId: current.localId || this.resolveLocalId(id),
          id,
          objectId: id,
          position: [...current.position],
          rotation: [...current.rotation],
          scale: [...current.scale],
          primParams: current.primParams
            ? JSON.parse(JSON.stringify(current.primParams))
            : undefined,
        });
      }
    }

    const links = this.queuedLinks
      .filter((q) => q.type === 'link')
      .map((q) => ({
        parentLocalId: q.parentLocalId || (q.parentId ? this.resolveLocalId(q.parentId) : 0),
        childLocalId: q.childLocalId || this.resolveLocalId(q.childId),
      }));

    const delinks = this.queuedLinks
      .filter((q) => q.type === 'delink')
      .map((q) => ({
        localId: q.childLocalId || this.resolveLocalId(q.childId),
      }));

    const payload = {
      objects: modifiedObjects,
      updates: modifiedObjects,
      links,
      delinks,
    };

    const result: CommitResult = {
      committed: false,
      chunks: 0,
      objectsUpdated: 0,
      linksUpdated: 0,
    };

    // 1. Serialization via ObjectManagerExtended
    if (this.objectsManager) {
      const batchResult = this.objectsManager.commitBatchUpdate(payload);
      result.chunks = batchResult.chunks;
      result.objectsUpdated = batchResult.objectsUpdated;
      result.linksUpdated = batchResult.linksUpdated;
    }

    // 2. Dispatch via slBridge or protocol
    const bridge = this.bridge || slBridge;
    const protocol = this.protocol || this.world?.protocol;

    if (bridge && typeof bridge.commitObjectTransaction === 'function') {
      try {
        const rpcResult = await bridge.commitObjectTransaction(payload);
        result.committed = rpcResult?.committed ?? rpcResult?.success ?? true;
        if (rpcResult?.chunks) result.chunks = rpcResult.chunks;
        if (rpcResult?.objectsUpdated) result.objectsUpdated = rpcResult.objectsUpdated;
      } catch (err: any) {
        result.error = err?.message || String(err);
        this.emit('commit_failed', { error: result.error });
        return result;
      }
    } else if (protocol && typeof protocol.commitObjectTransaction === 'function') {
      try {
        const rpcResult = await protocol.commitObjectTransaction(payload);
        result.committed = rpcResult?.committed ?? rpcResult?.success ?? true;
      } catch (err: any) {
        result.error = err?.message || String(err);
        this.emit('commit_failed', { error: result.error });
        return result;
      }
    } else {
      // Offline / standalone commit fallback
      result.committed = true;
      result.objectsUpdated = modifiedObjects.length;
      result.linksUpdated = links.length + delinks.length;
    }

    // Update original snapshots to reflect committed state
    for (const [id, current] of this.currentSnapshots.entries()) {
      this.originalSnapshots.set(id, this.cloneSnapshot(current));
    }
    this.queuedLinks = [];
    this.undoStack = [];
    this.redoStack = [];

    this.emit('committed', {
      result,
      objectId: this.activeObjectId,
    });
    this.emit('change', {
      objectId: this.activeObjectId,
      snapshot: this.activeObjectId ? this.getSnapshot(this.activeObjectId) : null,
      canUndo: false,
      canRedo: false,
      isDirty: false,
    });

    return result;
  }

  /**
   * Automatically cancel uncommitted edit sessions on disconnect or region change.
   */
  public cancelSession(reason: string = 'region_change') {
    this.discard();
    this.clearSessionState();

    this.emit('session_cancelled', {
      reason,
      wasDirty: false,
      message:
        reason === 'disconnect'
          ? 'Edit session cancelled due to grid disconnect.'
          : 'Edit session cancelled due to region transition.',
    });
  }

  /**
   * Reset all internal session buffers and stacks.
   */
  public clearSessionState() {
    this.activeObjectId = null;
    this.originalSnapshots.clear();
    this.currentSnapshots.clear();
    this.queuedLinks = [];
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Synchronize local object state with WorldViewer and 3D scene.
   */
  private applyToWorld(objectId: string, snapshot: ObjectSnapshot) {
    if (!this.world) return;

    const sceneObj =
      this.world.sceneObjects?.get?.(objectId) ||
      (this.world.objects instanceof Map
        ? this.world.objects.get(objectId)
        : this.world.objects?.find?.((o: any) => o.id === objectId));

    if (sceneObj) {
      sceneObj.position = [...snapshot.position];
      sceneObj.rotation = [...snapshot.rotation];
      sceneObj.scale = [...snapshot.scale];
      if (snapshot.primParams) {
        sceneObj.primParams = { ...(sceneObj.primParams || {}), ...snapshot.primParams };
        if (snapshot.primParams.color) sceneObj.color = [...snapshot.primParams.color];
        if (snapshot.primParams.shape) sceneObj.shape = snapshot.primParams.shape;
      }
      if ('parentId' in snapshot) {
        sceneObj.parentId = snapshot.parentId;
      }

      // If selected in world, update selection reference
      if (this.world.selectedObject && this.world.selectedObject.id === objectId) {
        this.world.selectedObject = {
          ...this.world.selectedObject,
          position: [...snapshot.position],
          rotation: [...snapshot.rotation],
          scale: [...snapshot.scale],
          parentId: snapshot.parentId,
        };
        this.world.emit?.('selection_changed', this.world.selectedObject);
      }

      // Re-apply to scene3d if WorldViewer provides applySceneObject
      if (typeof this.world.applySceneObject === 'function') {
        this.world.applySceneObject(sceneObj);
      } else if (this.world.scene3d && typeof this.world.scene3d.updateObject === 'function') {
        this.world.scene3d.updateObject(objectId, {
          position: snapshot.position,
          rotation: snapshot.rotation,
          scale: snapshot.scale,
        });
      }
    }

    if (this.world.scene && typeof this.world.scene.applyGizmoTransform === 'function') {
      this.world.scene.applyGizmoTransform(objectId, {
        position: snapshot.position,
        rotation: snapshot.rotation,
        scale: snapshot.scale,
      });
    }
  }
}
