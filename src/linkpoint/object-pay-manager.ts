/**
 * Linkpoint - Cached Hybrid Object Pay Quote Manager
 *
 * Orchestrates object price queries across multi-transport protocols (HTTP capability
 * with UDP RequestPayPrice/PayPriceReply fallback) and maintains a time-to-live cache
 * with LRU bounded capacity and automatic speculative prefetch abort on avatar movement.
 */

import { Utils } from './utils';
import { slBridge, SLBridge } from './sl-bridge';
import { CapabilitiesManager } from './phase2/capabilities';

export interface ObjectPayQuote {
  objectId: string;
  defaultPrice: number;
  buttons: number[];
  hideCustom: boolean;
  timestamp: number;
}

export interface ObjectPayQuoteOptions {
  forceRefresh?: boolean;
  timeout?: number;
  signal?: AbortSignal;
}

export interface PrefetchQuoteOptions {
  objectPosition?: [number, number, number];
  signal?: AbortSignal;
  timeout?: number;
}

export class ObjectPayManager extends Utils.EventEmitter {
  public static readonly CACHE_TTL_MS = 120_000; // 120 seconds TTL
  public static readonly MAX_ENTRIES = 100; // Max 100 cached entries
  public static readonly PREFETCH_MAX_DISTANCE = 10; // 10 meters distance cutoff
  public static readonly DEFAULT_TIMEOUT_MS = 1500; // 1500ms UDP query target

  private cache = new Map<string, ObjectPayQuote>();
  private inFlight = new Map<string, Promise<ObjectPayQuote>>();
  private bridge: SLBridge;
  private capabilities?: CapabilitiesManager | null;
  private world?: any;

  constructor(bridge: SLBridge = slBridge, capabilities?: CapabilitiesManager | null, world?: any) {
    super();
    this.bridge = bridge;
    this.capabilities = capabilities;
    this.world = world;

    if (this.bridge) {
      this.bridge.bindObjectPayManager(this);
    }
  }

  public setCapabilitiesManager(caps: CapabilitiesManager | null): void {
    this.capabilities = caps;
  }

  public setWorld(world: any): void {
    this.world = world;
  }

  /**
   * Normalize an object UUID for consistent dictionary lookups.
   */
  private normalizeId(id: string): string {
    return String(id || '')
      .trim()
      .toLowerCase();
  }

  /**
   * Returns a cached quote if present and unexpired (< 120s).
   */
  public getCachedQuote(objectId: string): ObjectPayQuote | null {
    const key = this.normalizeId(objectId);
    if (!key) return null;
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ObjectPayManager.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  /**
   * Checks whether an unexpired quote exists in memory for this object.
   */
  public hasValidQuote(objectId: string): boolean {
    return this.getCachedQuote(objectId) !== null;
  }

  /**
   * Retrieves the current number of cached quotes.
   */
  public getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Explicitly invalidate cached quote(s).
   * If objectId is specified, removes only that object quote; otherwise purges all entries.
   */
  public invalidateQuote(objectId?: string): void {
    if (objectId) {
      const key = this.normalizeId(objectId);
      const existed = this.cache.delete(key);
      if (existed) {
        this.emit('quote_invalidated', objectId);
      }
    } else {
      this.cache.clear();
      this.emit('cache_purged');
    }
  }

  /**
   * Convenience alias to invalidate all cached entries.
   */
  public clearCache(): void {
    this.invalidateQuote();
  }

  /**
   * Purges expired entries older than 120 seconds.
   * Returns the count of purged entries.
   */
  public purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > ObjectPayManager.CACHE_TTL_MS) {
        this.cache.delete(key);
        purged++;
      }
    }
    if (purged > 0) {
      this.emit('expired_purged', { count: purged });
    }
    return purged;
  }

  /**
   * Automatically triggered upon region boundary transitions.
   * Purges expired entries according to Acceptance Criterion 5.
   */
  public onRegionChange(): void {
    this.purgeExpired();
    this.emit('region_transition');
  }

  /**
   * Store a valid quote in cache, enforcing max capacity of 100 entries.
   */
  private storeInCache(key: string, quote: ObjectPayQuote): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= ObjectPayManager.MAX_ENTRIES) {
      // Evict oldest entry (LRU order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, quote);
    this.emit('quote_cached', quote);
  }

  /**
   * Fetch an object pay quote using multi-transport (HTTP capability -> UDP circuit).
   * Resolves immediately from memory cache if unexpired (< 120s).
   */
  public async getQuote(
    objectId: string,
    options?: ObjectPayQuoteOptions,
  ): Promise<ObjectPayQuote> {
    if (!objectId) {
      throw new Error('A target object ID is required');
    }
    const key = this.normalizeId(objectId);

    // 1. Check local memory cache
    if (!options?.forceRefresh) {
      const cached = this.getCachedQuote(key);
      if (cached) {
        // Refresh LRU position
        this.cache.delete(key);
        this.cache.set(key, cached);
        return cached;
      }
    }

    // 2. Request deduplication for concurrent in-flight queries
    if (!options?.forceRefresh && this.inFlight.has(key)) {
      const existingPromise = this.inFlight.get(key)!;
      if (!options?.signal) {
        return existingPromise;
      }
      return new Promise<ObjectPayQuote>((resolve, reject) => {
        if (options.signal!.aborted) {
          return reject(new Error('Object pay quote request aborted'));
        }
        const onAbort = () => reject(new Error('Object pay quote request aborted'));
        options.signal!.addEventListener('abort', onAbort, { once: true });
        existingPromise.then(
          (val) => {
            options.signal!.removeEventListener('abort', onAbort);
            resolve(val);
          },
          (err) => {
            options.signal!.removeEventListener('abort', onAbort);
            reject(err);
          },
        );
      });
    }

    const queryPromise = (async (): Promise<ObjectPayQuote> => {
      // Check abort signal
      if (options?.signal?.aborted) {
        throw new Error('Object pay quote request aborted');
      }

      // 3. Multi-transport Strategy: Try HTTP capability first if advertised
      let quote: ObjectPayQuote | null = null;
      const capUrl = this.capabilities?.getObjectPayPriceUrl?.();
      if (capUrl && typeof fetch === 'function') {
        try {
          const res = await (this.capabilities?.fetchWithRetry
            ? this.capabilities.fetchWithRetry(capUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json, application/llsd+xml',
                },
                body: JSON.stringify({ object_id: objectId }),
                signal: options?.signal,
              })
            : fetch(capUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'application/json, application/llsd+xml',
                },
                body: JSON.stringify({ object_id: objectId }),
                signal: options?.signal,
              }));

          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data && typeof data === 'object') {
              const defaultPrice =
                typeof data.defaultPrice === 'number'
                  ? data.defaultPrice
                  : typeof data.default_price === 'number'
                    ? data.default_price
                    : typeof data.DefaultPayPrice === 'number'
                      ? data.DefaultPayPrice
                      : -1;
              const rawButtons = Array.isArray(data.buttons)
                ? data.buttons
                : Array.isArray(data.button_data)
                  ? data.button_data
                  : Array.isArray(data.pay_buttons)
                    ? data.pay_buttons
                    : Array.isArray(data.ButtonData)
                      ? data.ButtonData.map((b: any) => (typeof b === 'object' ? b.PayButton : b))
                      : [];
              const buttons = rawButtons.map((b: any) =>
                typeof b === 'number' ? b : Number(b) || 0,
              );
              quote = {
                objectId: String(objectId),
                defaultPrice,
                buttons,
                hideCustom: defaultPrice === -2,
                timestamp: Date.now(),
              };
            }
          }
        } catch {
          // Capability query failed or not supported; gracefully fallback to UDP
        }
      }

      if (options?.signal?.aborted) {
        throw new Error('Object pay quote request aborted');
      }

      // 4. Primary UDP fallback transport via slBridge
      if (!quote) {
        const timeout =
          typeof options?.timeout === 'number'
            ? options.timeout
            : ObjectPayManager.DEFAULT_TIMEOUT_MS;
        const bridgePromise = this.bridge.requestPayPrice({
          objectId,
          timeout,
        });

        const res = options?.signal
          ? await new Promise<any>((resolve, reject) => {
              if (options.signal!.aborted) {
                return reject(new Error('Object pay quote request aborted'));
              }
              const onAbort = () => reject(new Error('Object pay quote request aborted'));
              options.signal!.addEventListener('abort', onAbort, { once: true });
              bridgePromise.then(
                (val) => {
                  options.signal!.removeEventListener('abort', onAbort);
                  resolve(val);
                },
                (err) => {
                  options.signal!.removeEventListener('abort', onAbort);
                  reject(err);
                },
              );
            })
          : await bridgePromise;

        if (options?.signal?.aborted) {
          throw new Error('Object pay quote request aborted');
        }

        const defaultPrice = typeof res?.defaultPrice === 'number' ? res.defaultPrice : -1;
        const buttons = Array.isArray(res?.buttons)
          ? res.buttons.map((b: any) => (typeof b === 'number' ? b : Number(b) || 0))
          : [];

        quote = {
          objectId: String(objectId),
          defaultPrice,
          buttons,
          hideCustom: typeof res?.hideCustom === 'boolean' ? res.hideCustom : defaultPrice === -2,
          timestamp: typeof res?.timestamp === 'number' ? res.timestamp : Date.now(),
        };
      }

      if (options?.signal?.aborted) {
        throw new Error('Object pay quote request aborted');
      }

      // Store in memory cache
      this.storeInCache(key, quote);
      return quote;
    })();

    this.inFlight.set(key, queryPromise);
    try {
      return await queryPromise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Speculatively prefetch an object pay quote (e.g. on object focus or right click).
   * Aborts automatically if avatar is or moves farther than 10 meters away.
   */
  public async prefetchQuote(
    objectId: string,
    options?: PrefetchQuoteOptions,
  ): Promise<ObjectPayQuote | null> {
    if (!objectId) return null;
    const key = this.normalizeId(objectId);

    // If already validly cached, return immediately
    const cached = this.getCachedQuote(key);
    if (cached) return cached;

    const avatarPos = this.getAvatarPosition();
    const objectPos = options?.objectPosition;

    // Distance check: abort if avatar is currently farther than 10m
    if (avatarPos && objectPos) {
      const dist = this.calculateDistance(avatarPos, objectPos);
      if (dist > ObjectPayManager.PREFETCH_MAX_DISTANCE) {
        return null;
      }
    }

    // Create an internal abort controller to cancel if avatar moves > 10m away
    const internalAbort = new AbortController();
    let moveListener: ((pos: any) => void) | null = null;

    if (this.world && typeof this.world.on === 'function' && objectPos) {
      moveListener = (pos: [number, number, number]) => {
        if (pos) {
          const currentDist = this.calculateDistance(pos, objectPos);
          if (currentDist > ObjectPayManager.PREFETCH_MAX_DISTANCE) {
            internalAbort.abort();
          }
        }
      };
      this.world.on('position_changed', moveListener);
    }

    // Link optional external signal if provided
    const onExternalAbort = () => internalAbort.abort();
    if (options?.signal) {
      if (options.signal.aborted) return null;
      options.signal.addEventListener('abort', onExternalAbort);
    }

    try {
      const quote = await this.getQuote(objectId, {
        signal: internalAbort.signal,
        timeout: options?.timeout,
      });
      if (internalAbort.signal.aborted) {
        return null;
      }
      return quote;
    } catch {
      return null;
    } finally {
      if (moveListener && this.world && typeof this.world.off === 'function') {
        this.world.off('position_changed', moveListener);
      }
      if (options?.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private getAvatarPosition(): [number, number, number] | null {
    if (this.world && Array.isArray(this.world.avatarPosition)) {
      return this.world.avatarPosition;
    }
    return null;
  }

  private calculateDistance(a: [number, number, number], b: [number, number, number]): number {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
