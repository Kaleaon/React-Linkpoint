/**
 * Reactive Delta Selectors for Linkpoint State Management
 *
 * Allows components and services to subscribe to targeted delta updates for specific
 * entity IDs (contacts, inventory folders, items). High-frequency status updates (such
 * as presence updates) emit events ONLY to subscribers of changed entity IDs, eliminating
 * full-dataset array re-evaluations and allocations.
 */

export type EntityType = 'contact' | 'folder' | 'item' | 'transaction';
export type DeltaAction = 'add' | 'update' | 'delete' | 'presence';

export interface EntityDelta<T = any> {
  entityType: EntityType;
  id: string;
  action: DeltaAction;
  payload: Partial<T>;
  previousPayload?: Partial<T>;
  timestamp: number;
}

export type DeltaCallback<T = any> = (delta: EntityDelta<T>) => void;

export class DeltaSelectorStore {
  private entitySubscribers: Map<string, Set<DeltaCallback>> = new Map();
  private typeSubscribers: Map<EntityType, Set<DeltaCallback>> = new Map();
  private lastDeltas: Map<string, EntityDelta> = new Map();

  /**
   * Subscribe to delta updates for a specific entity ID.
   * Returns an unsubscribe function.
   */
  public subscribeEntity<T = any>(
    entityType: EntityType,
    entityId: string,
    callback: DeltaCallback<T>,
  ): () => void {
    const key = `${entityType}:${entityId.toLowerCase()}`;
    if (!this.entitySubscribers.has(key)) {
      this.entitySubscribers.set(key, new Set());
    }
    const set = this.entitySubscribers.get(key)!;
    set.add(callback as DeltaCallback);

    return () => {
      set.delete(callback as DeltaCallback);
      if (set.size === 0) {
        this.entitySubscribers.delete(key);
      }
    };
  }

  /**
   * Subscribe to delta updates for all entities of a given EntityType.
   * Returns an unsubscribe function.
   */
  public subscribeType<T = any>(entityType: EntityType, callback: DeltaCallback<T>): () => void {
    if (!this.typeSubscribers.has(entityType)) {
      this.typeSubscribers.set(entityType, new Set());
    }
    const set = this.typeSubscribers.get(entityType)!;
    set.add(callback as DeltaCallback);

    return () => {
      set.delete(callback as DeltaCallback);
      if (set.size === 0) {
        this.typeSubscribers.delete(entityType);
      }
    };
  }

  /**
   * Emit a delta update for a specific entity.
   * Only listeners subscribed to this exact entity ID (or type) receive the update.
   */
  public emitDelta<T = any>(
    entityType: EntityType,
    entityId: string,
    action: DeltaAction,
    payload: Partial<T>,
    previousPayload?: Partial<T>,
  ): EntityDelta<T> {
    const id = String(entityId).toLowerCase();
    const delta: EntityDelta<T> = {
      entityType,
      id,
      action,
      payload,
      previousPayload,
      timestamp: Date.now(),
    };

    const key = `${entityType}:${id}`;
    this.lastDeltas.set(key, delta);

    // Notify specific entity subscribers
    const entitySet = this.entitySubscribers.get(key);
    if (entitySet) {
      for (const cb of entitySet) {
        try {
          cb(delta);
        } catch (err) {
          console.error(`[DeltaSelectorStore] Error in entity callback for ${key}:`, err);
        }
      }
    }

    // Notify type subscribers
    const typeSet = this.typeSubscribers.get(entityType);
    if (typeSet) {
      for (const cb of typeSet) {
        try {
          cb(delta);
        } catch (err) {
          console.error(`[DeltaSelectorStore] Error in type callback for ${entityType}:`, err);
        }
      }
    }

    return delta;
  }

  /**
   * Retrieve the last recorded delta for an entity.
   */
  public getLastDelta<T = any>(entityType: EntityType, entityId: string): EntityDelta<T> | null {
    const key = `${entityType}:${String(entityId).toLowerCase()}`;
    return (this.lastDeltas.get(key) as EntityDelta<T>) || null;
  }

  public getStats() {
    let totalEntityListeners = 0;
    for (const set of this.entitySubscribers.values()) {
      totalEntityListeners += set.size;
    }

    let totalTypeListeners = 0;
    for (const set of this.typeSubscribers.values()) {
      totalTypeListeners += set.size;
    }

    return {
      entitySubscriptions: this.entitySubscribers.size,
      totalEntityListeners,
      typeSubscriptions: this.typeSubscribers.size,
      totalTypeListeners,
      cachedDeltas: this.lastDeltas.size,
    };
  }

  public clear() {
    this.entitySubscribers.clear();
    this.typeSubscribers.clear();
    this.lastDeltas.clear();
  }
}

export const deltaSelectorStore = new DeltaSelectorStore();
