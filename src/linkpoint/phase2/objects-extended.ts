/**
 * Linkpoint PWA - Object Manager Extensions (Features 17-20)
 *
 * Phase 2: Core Protocol Extensions - Priority 1
 * Roadmap: PWA-demo/ANDROID_PORT_ROADMAP.md (Lines 42-47)
 * Android Source: app/src/main/java/com/lumiyaviewer/lumiya/slproto/objects/
 *
 * Extends object management with prim parameters, permissions, relationships,
 * and batched protocol serialization.
 */

import { MultipleObjectUpdateMessage } from '@caspertech/node-metaverse/dist/lib/classes/messages/MultipleObjectUpdate';
import { ObjectLinkMessage } from '@caspertech/node-metaverse/dist/lib/classes/messages/ObjectLink';
import { ObjectDelinkMessage } from '@caspertech/node-metaverse/dist/lib/classes/messages/ObjectDelink';
import { UpdateType } from '@caspertech/node-metaverse/dist/lib/enums/UpdateType';
import { Vector3 } from '@caspertech/node-metaverse/dist/lib/classes/Vector3';
import { Quaternion } from '@caspertech/node-metaverse/dist/lib/classes/Quaternion';
import { UUID } from '@caspertech/node-metaverse/dist/lib/classes/UUID';
import { Utils } from '../utils';
import { slBridge } from '../sl-bridge';

export const MAX_UDP_PACKET_SIZE = 1200;

export interface BatchObjectUpdate {
  localId?: number;
  id?: string;
  position?: number[] | { x: number; y: number; z: number };
  rotation?: number[] | { x: number; y: number; z: number; w?: number; s?: number };
  scale?: number[] | { x: number; y: number; z: number };
  primParams?: any;
}

export interface BatchLinkUpdate {
  parentLocalId: number;
  childLocalId: number;
  parentId?: string;
  childId?: string;
}

export interface BatchDelinkUpdate {
  localId: number;
  childId?: string;
}

export interface BatchUpdatePayload {
  objects?: BatchObjectUpdate[];
  links?: BatchLinkUpdate[];
  delinks?: BatchDelinkUpdate[];
  wholeLinkset?: boolean;
  agentId?: string;
  sessionId?: string;
}

export interface BatchUpdateResult {
  multipleObjectUpdateMessages: MultipleObjectUpdateMessage[];
  objectLinkMessages: ObjectLinkMessage[];
  objectDelinkMessages: ObjectDelinkMessage[];
  chunks: number;
  objectsUpdated: number;
  linksUpdated: number;
}

function toQuaternion(
  rot?: number[] | { x: number; y: number; z: number; w?: number; s?: number },
): Quaternion {
  if (!rot) return new Quaternion(0, 0, 0, 1);
  if (Array.isArray(rot)) {
    if (rot.length >= 4) {
      return new Quaternion(rot[0], rot[1], rot[2], rot[3]);
    }
    const [x, y, z] = rot;
    const c1 = Math.cos((x || 0) / 2),
      s1 = Math.sin((x || 0) / 2);
    const c2 = Math.cos((y || 0) / 2),
      s2 = Math.sin((y || 0) / 2);
    const c3 = Math.cos((z || 0) / 2),
      s3 = Math.sin((z || 0) / 2);
    return new Quaternion(
      s1 * c2 * c3 - c1 * s2 * s3,
      c1 * s2 * c3 + s1 * c2 * s3,
      c1 * c2 * s3 - s1 * s2 * c3,
      c1 * c2 * c3 + s1 * s2 * s3,
    );
  }
  const w = rot.w ?? rot.s ?? 1;
  return new Quaternion(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0, w);
}

function toVector3(pos?: number[] | { x: number; y: number; z: number }): Vector3 {
  if (!pos) return new Vector3([0, 0, 0]);
  if (Array.isArray(pos)) {
    return new Vector3([pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0]);
  }
  return new Vector3([pos.x ?? 0, pos.y ?? 0, pos.z ?? 0]);
}

export interface TransformDelta {
  position?: number[];
  rotation?: number[];
  scale?: number[];
  type?: 'ObjectPosition' | 'ObjectRotation' | 'ObjectScale' | string;
  [key: string]: any;
}

export class ObjectManagerExtended extends Utils.EventEmitter {
  private objects: Map<string, any> = new Map();
  private selectedObjects: Set<string> = new Set();
  private parentChildMap: Map<string, Set<string>> = new Map();
  private throttleIntervalMs = 100;
  private pendingStreams = new Map<
    string,
    {
      timer: ReturnType<typeof setTimeout> | null;
      lastSentTime: number;
      pendingDelta: TransformDelta | null;
    }
  >();

  constructor(private bridge?: any) {
    super();
  }

  private getBridge() {
    return this.bridge || slBridge;
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
        void this.getBridge()?.streamObjectDelta?.(finalPayload);
        void this.getBridge()?.commitObjectTransform?.(finalPayload);
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
        void this.getBridge()?.streamObjectDelta?.(payload);
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

  /**
   * Requirement 3: Batched Protocol Serialization
   * Encode multiple modified primitives and link/delink operations into
   * chunked MultipleObjectUpdate and ObjectLink protocol messages.
   * Enforces 1200-byte UDP packet size limit.
   */
  commitBatchUpdate(
    payload: BatchUpdatePayload,
    options: { maxPacketSize?: number } = {},
  ): BatchUpdateResult {
    const maxPacketSize = options.maxPacketSize || MAX_UDP_PACKET_SIZE;
    const wholeLinkset = Boolean(payload.wholeLinkset);
    const linkedFlag = wholeLinkset ? UpdateType.Linked : 0;

    const agentUuid = payload.agentId ? new UUID(payload.agentId) : UUID.zero();
    const sessionUuid = payload.sessionId ? new UUID(payload.sessionId) : UUID.zero();

    const multipleObjectUpdateMessages: MultipleObjectUpdateMessage[] = [];
    const objectLinkMessages: ObjectLinkMessage[] = [];
    const objectDelinkMessages: ObjectDelinkMessage[] = [];

    // 1. Process and encode modified primitives into MultipleObjectUpdateMessage
    const rawObjectDataEntries: Array<{ ObjectLocalID: number; Type: number; Data: Buffer }> = [];

    const objectsList = payload.objects || [];
    for (const obj of objectsList) {
      const localId = Number(obj.localId) || 0;
      if (obj.id) {
        if (obj.primParams) {
          this.setPrimParams(obj.id, obj.primParams);
        }
        const existing = this.objects.get(obj.id) || {};
        if (obj.position)
          existing.position = Array.isArray(obj.position)
            ? obj.position
            : [obj.position.x, obj.position.y, obj.position.z];
        if (obj.rotation)
          existing.rotation = Array.isArray(obj.rotation)
            ? obj.rotation
            : [
                obj.rotation.x,
                obj.rotation.y,
                obj.rotation.z,
                (obj.rotation as any).w ?? (obj.rotation as any).s ?? 1,
              ];
        if (obj.scale)
          existing.scale = Array.isArray(obj.scale)
            ? obj.scale
            : [obj.scale.x, obj.scale.y, obj.scale.z];
        this.objects.set(obj.id, existing);
      }

      if (localId > 0) {
        if (obj.position !== undefined) {
          const v = toVector3(obj.position);
          rawObjectDataEntries.push({
            ObjectLocalID: localId,
            Type: UpdateType.Position | linkedFlag,
            Data: v.getBuffer(),
          });
        }
        if (obj.rotation !== undefined) {
          const q = toQuaternion(obj.rotation);
          rawObjectDataEntries.push({
            ObjectLocalID: localId,
            Type: UpdateType.Rotation | linkedFlag,
            Data: q.getBuffer(),
          });
        }
        if (obj.scale !== undefined) {
          const s = toVector3(obj.scale);
          rawObjectDataEntries.push({
            ObjectLocalID: localId,
            Type: UpdateType.Scale | linkedFlag,
            Data: s.getBuffer(),
          });
        }
      }
    }

    // Chunk MultipleObjectUpdate entries into messages <= maxPacketSize
    const BASE_MSG_OVERHEAD = 72;
    const ENTRY_SIZE = 18;

    let currentChunk: Array<{ ObjectLocalID: number; Type: number; Data: Buffer }> = [];
    let currentBytes = BASE_MSG_OVERHEAD;

    for (const entry of rawObjectDataEntries) {
      if (currentBytes + ENTRY_SIZE > maxPacketSize && currentChunk.length > 0) {
        const msg = new MultipleObjectUpdateMessage();
        msg.AgentData = {
          AgentID: agentUuid,
          SessionID: sessionUuid,
        };
        msg.ObjectData = currentChunk;
        multipleObjectUpdateMessages.push(msg);

        currentChunk = [];
        currentBytes = BASE_MSG_OVERHEAD;
      }
      currentChunk.push(entry);
      currentBytes += ENTRY_SIZE;
    }

    if (currentChunk.length > 0 || (rawObjectDataEntries.length === 0 && objectsList.length > 0)) {
      const msg = new MultipleObjectUpdateMessage();
      msg.AgentData = {
        AgentID: agentUuid,
        SessionID: sessionUuid,
      };
      msg.ObjectData = currentChunk;
      multipleObjectUpdateMessages.push(msg);
    }

    // 2. Process and encode ObjectLink messages
    const linksList = payload.links || [];
    for (const link of linksList) {
      if (link.parentId && link.childId) {
        this.linkChild(link.parentId, link.childId);
      }
    }

    if (linksList.length > 0) {
      const LINK_ENTRY_SIZE = 4;
      let currentLinkChunk: Array<{ ObjectLocalID: number }> = [];
      let currentLinkBytes = BASE_MSG_OVERHEAD;

      for (const link of linksList) {
        const idsToAdd: number[] = [];
        if (
          link.parentLocalId > 0 &&
          !currentLinkChunk.some((e) => e.ObjectLocalID === link.parentLocalId)
        ) {
          idsToAdd.push(link.parentLocalId);
        }
        if (
          link.childLocalId > 0 &&
          !currentLinkChunk.some((e) => e.ObjectLocalID === link.childLocalId)
        ) {
          idsToAdd.push(link.childLocalId);
        }

        for (const localId of idsToAdd) {
          if (currentLinkBytes + LINK_ENTRY_SIZE > maxPacketSize && currentLinkChunk.length > 0) {
            const linkMsg = new ObjectLinkMessage();
            linkMsg.AgentData = {
              AgentID: agentUuid,
              SessionID: sessionUuid,
            };
            linkMsg.ObjectData = currentLinkChunk;
            objectLinkMessages.push(linkMsg);

            currentLinkChunk = [];
            currentLinkBytes = BASE_MSG_OVERHEAD;
          }
          currentLinkChunk.push({ ObjectLocalID: localId });
          currentLinkBytes += LINK_ENTRY_SIZE;
        }
      }

      if (currentLinkChunk.length > 0) {
        const linkMsg = new ObjectLinkMessage();
        linkMsg.AgentData = {
          AgentID: agentUuid,
          SessionID: sessionUuid,
        };
        linkMsg.ObjectData = currentLinkChunk;
        objectLinkMessages.push(linkMsg);
      }
    }

    // 3. Process and encode ObjectDelink messages
    const delinksList = payload.delinks || [];
    for (const delink of delinksList) {
      if (delink.childId) {
        this.unlinkChild(delink.childId);
      }
    }

    if (delinksList.length > 0) {
      const DELINK_ENTRY_SIZE = 4;
      let currentDelinkChunk: Array<{ ObjectLocalID: number }> = [];
      let currentDelinkBytes = BASE_MSG_OVERHEAD;

      for (const delink of delinksList) {
        if (delink.localId > 0) {
          if (
            currentDelinkBytes + DELINK_ENTRY_SIZE > maxPacketSize &&
            currentDelinkChunk.length > 0
          ) {
            const delinkMsg = new ObjectDelinkMessage();
            delinkMsg.AgentData = {
              AgentID: agentUuid,
              SessionID: sessionUuid,
            };
            delinkMsg.ObjectData = currentDelinkChunk;
            objectDelinkMessages.push(delinkMsg);

            currentDelinkChunk = [];
            currentDelinkBytes = BASE_MSG_OVERHEAD;
          }
          currentDelinkChunk.push({ ObjectLocalID: delink.localId });
          currentDelinkBytes += DELINK_ENTRY_SIZE;
        }
      }

      if (currentDelinkChunk.length > 0) {
        const delinkMsg = new ObjectDelinkMessage();
        delinkMsg.AgentData = {
          AgentID: agentUuid,
          SessionID: sessionUuid,
        };
        delinkMsg.ObjectData = currentDelinkChunk;
        objectDelinkMessages.push(delinkMsg);
      }
    }

    const totalChunks =
      multipleObjectUpdateMessages.length + objectLinkMessages.length + objectDelinkMessages.length;

    return {
      multipleObjectUpdateMessages,
      objectLinkMessages,
      objectDelinkMessages,
      chunks: totalChunks,
      objectsUpdated: objectsList.length,
      linksUpdated: linksList.length + delinksList.length,
    };
  }
}
