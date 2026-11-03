import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ObjectPayManager, ObjectPayQuote } from '../object-pay-manager';
import { SLBridge } from '../sl-bridge';
import { CapabilitiesManager } from '../phase2/capabilities';
import { Utils } from '../utils';

describe('ObjectPayManager Subsystem', () => {
  let bridge: SLBridge;
  let caps: CapabilitiesManager;
  let mockWorld: any;
  let manager: ObjectPayManager;

  beforeEach(() => {
    vi.useRealTimers();
    bridge = new SLBridge();
    caps = new CapabilitiesManager();
    mockWorld = new Utils.EventEmitter() as any;
    mockWorld.avatarPosition = [100, 100, 20];
    manager = new ObjectPayManager(bridge, caps, mockWorld);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Criterion 1: stores valid price quotes with timestamp and object UUID keys', async () => {
    const objectId = '11111111-2222-3333-4444-555555555555';
    const mockQuote: ObjectPayQuote = {
      objectId,
      defaultPrice: 50,
      buttons: [10, 25, 50, 100],
      hideCustom: false,
      timestamp: Date.now(),
    };

    vi.spyOn(bridge, 'requestPayPrice').mockResolvedValueOnce(mockQuote);

    const quote = await manager.getQuote(objectId);
    expect(quote.objectId).toBe(objectId);
    expect(quote.defaultPrice).toBe(50);
    expect(quote.buttons).toEqual([10, 25, 50, 100]);
    expect(quote.hideCustom).toBe(false);
    expect(quote.timestamp).toBeGreaterThan(0);

    // Assert it is stored in the cache
    expect(manager.hasValidQuote(objectId)).toBe(true);
    const cached = manager.getCachedQuote(objectId);
    expect(cached).not.toBeNull();
    expect(cached?.objectId).toBe(objectId);
    expect(cached?.buttons).toEqual([10, 25, 50, 100]);
  });

  it('Criterion 2: cached quotes return immediately (<50ms) without triggering network requests during 120s window', async () => {
    const objectId = 'vendor-uuid-repeated';
    const mockQuote: ObjectPayQuote = {
      objectId,
      defaultPrice: 20,
      buttons: [5, 10, 20, 50],
      hideCustom: false,
      timestamp: Date.now(),
    };

    const spy = vi.spyOn(bridge, 'requestPayPrice').mockResolvedValueOnce(mockQuote);

    // Initial query
    const initial = await manager.getQuote(objectId);
    expect(initial.defaultPrice).toBe(20);
    expect(spy).toHaveBeenCalledTimes(1);

    // Subsequent query within validity window
    const startTime = performance.now();
    const second = await manager.getQuote(objectId);
    const elapsed = performance.now() - startTime;

    expect(second).toEqual(initial);
    // Verified: No second network call triggered
    expect(spy).toHaveBeenCalledTimes(1);
    // Success metric: Resolves in under 50ms from memory cache
    expect(elapsed).toBeLessThan(50);
  });

  it('Constraint 1: cache entries expire after 120 seconds to prevent stale pricing', async () => {
    const objectId = 'stale-vendor-uuid';
    const initialQuote: ObjectPayQuote = {
      objectId,
      defaultPrice: 30,
      buttons: [10, 20, 30, 40],
      hideCustom: false,
      timestamp: Date.now() - 120001, // Expired (older than 120s)
    };

    // Pre-populate with expired entry
    (manager as any).cache.set(objectId.toLowerCase(), initialQuote);
    expect(manager.hasValidQuote(objectId)).toBe(false);
    expect(manager.getCachedQuote(objectId)).toBeNull();

    // Querying after expiration triggers a fresh network call
    const freshQuote: ObjectPayQuote = {
      objectId,
      defaultPrice: 45,
      buttons: [15, 30, 45, 60],
      hideCustom: false,
      timestamp: Date.now(),
    };
    const spy = vi.spyOn(bridge, 'requestPayPrice').mockResolvedValueOnce(freshQuote);

    const result = await manager.getQuote(objectId);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.defaultPrice).toBe(45);
  });

  it('Constraint 2: cache size does not exceed 100 entries, evicting oldest (LRU)', async () => {
    // Fill cache with 100 entries
    for (let i = 0; i < 100; i++) {
      (manager as any).storeInCache(`obj-${i}`, {
        objectId: `obj-${i}`,
        defaultPrice: i,
        buttons: [i],
        hideCustom: false,
        timestamp: Date.now(),
      });
    }

    expect(manager.getCacheSize()).toBe(100);
    expect(manager.hasValidQuote('obj-0')).toBe(true);

    // Insert 101st entry
    (manager as any).storeInCache('obj-100', {
      objectId: 'obj-100',
      defaultPrice: 100,
      buttons: [100],
      hideCustom: false,
      timestamp: Date.now(),
    });

    expect(manager.getCacheSize()).toBe(100);
    // The oldest entry ('obj-0') should have been evicted
    expect(manager.hasValidQuote('obj-0')).toBe(false);
    expect(manager.hasValidQuote('obj-100')).toBe(true);
  });

  it('Constraint 3: speculative prefetch aborts automatically if user is or moves farther than 10 meters', async () => {
    const objectId = 'far-vendor-object';
    mockWorld.avatarPosition = [100, 100, 20];
    const farPosition: [number, number, number] = [120, 100, 20]; // 20m away (> 10m limit)

    const spy = vi.spyOn(bridge, 'requestPayPrice');

    // Case 1: Already farther than 10 meters at start
    const resultFar = await manager.prefetchQuote(objectId, {
      objectPosition: farPosition,
    });
    expect(resultFar).toBeNull();
    expect(spy).not.toHaveBeenCalled();

    // Case 2: Within 10m initially, but moves farther than 10m during prefetch
    const nearPosition: [number, number, number] = [102, 100, 20]; // 2m away
    spy.mockImplementationOnce(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            objectId,
            defaultPrice: 50,
            buttons: [10, 50],
            hideCustom: false,
            timestamp: Date.now(),
          });
        }, 100);
      });
    });

    const prefetchPromise = manager.prefetchQuote(objectId, {
      objectPosition: nearPosition,
    });

    // Simulate avatar moving 15m away
    mockWorld.avatarPosition = [120, 100, 20];
    mockWorld.emit('position_changed', [120, 100, 20]);

    const resultMoved = await prefetchPromise;
    expect(resultMoved).toBeNull();
  });

  it('Speculative prefetch succeeds and caches quote when avatar remains within 10 meters', async () => {
    const objectId = 'near-vendor-object';
    mockWorld.avatarPosition = [100, 100, 20];
    const nearPosition: [number, number, number] = [104, 100, 20]; // 4m away (< 10m)

    const expectedQuote: ObjectPayQuote = {
      objectId,
      defaultPrice: 15,
      buttons: [5, 10, 15, 20],
      hideCustom: false,
      timestamp: Date.now(),
    };
    vi.spyOn(bridge, 'requestPayPrice').mockResolvedValueOnce(expectedQuote);

    const prefetchResult = await manager.prefetchQuote(objectId, {
      objectPosition: nearPosition,
    });

    expect(prefetchResult).not.toBeNull();
    expect(prefetchResult?.defaultPrice).toBe(15);
    expect(manager.hasValidQuote(objectId)).toBe(true);

    // Subsequent dialog open gets quote synchronously from cache
    const dialogQuote = manager.getCachedQuote(objectId);
    expect(dialogQuote?.defaultPrice).toBe(15);
  });

  it('Criterion 5: cache purges expired entries automatically upon region boundary transitions', () => {
    const now = Date.now();
    // Add 1 valid entry and 2 expired entries
    (manager as any).storeInCache('fresh-obj', {
      objectId: 'fresh-obj',
      defaultPrice: 10,
      buttons: [10],
      hideCustom: false,
      timestamp: now,
    });
    (manager as any).storeInCache('expired-1', {
      objectId: 'expired-1',
      defaultPrice: 20,
      buttons: [20],
      hideCustom: false,
      timestamp: now - 130000,
    });
    (manager as any).storeInCache('expired-2', {
      objectId: 'expired-2',
      defaultPrice: 30,
      buttons: [30],
      hideCustom: false,
      timestamp: now - 150000,
    });

    expect(manager.getCacheSize()).toBe(3);

    // Region boundary transition event
    manager.onRegionChange();

    expect(manager.getCacheSize()).toBe(1);
    expect(manager.hasValidQuote('fresh-obj')).toBe(true);
    expect(manager.getCachedQuote('expired-1')).toBeNull();
    expect(manager.getCachedQuote('expired-2')).toBeNull();
  });

  it('Requirement 3: supports optional HTTP capability negotiation when simulator advertises object price capability', async () => {
    const objectId = 'cap-vendor-99';
    caps.setCapability('ObjectPayPrice', 'https://sim.example.com/caps/object_pay_price_123');

    const mockCapResponse = {
      default_price: 75,
      buttons: [25, 50, 75, 100],
      hide_custom: false,
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockCapResponse,
    } as any);

    const udpSpy = vi.spyOn(bridge, 'requestPayPrice');

    const quote = await manager.getQuote(objectId);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://sim.example.com/caps/object_pay_price_123',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(udpSpy).not.toHaveBeenCalled();
    expect(quote.defaultPrice).toBe(75);
    expect(quote.buttons).toEqual([25, 50, 75, 100]);
    expect(quote.hideCustom).toBe(false);
  });

  it('Requirement 2 & 3: falls back cleanly to UDP circuit when capability query fails', async () => {
    const objectId = 'fallback-vendor-44';
    caps.setCapability('ObjectPayPrice', 'https://sim.example.com/caps/failing_cap');

    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Capability network timeout'));

    const udpQuote: ObjectPayQuote = {
      objectId,
      defaultPrice: -2, // hide custom
      buttons: [100, 200, 500, 1000],
      hideCustom: true,
      timestamp: Date.now(),
    };
    const udpSpy = vi.spyOn(bridge, 'requestPayPrice').mockResolvedValueOnce(udpQuote);

    const quote = await manager.getQuote(objectId);

    expect(udpSpy).toHaveBeenCalledWith({
      objectId,
      timeout: 1500,
    });
    expect(quote.defaultPrice).toBe(-2);
    expect(quote.hideCustom).toBe(true);
    expect(quote.buttons).toEqual([100, 200, 500, 1000]);
  });

  it('Requirement 4: explicit cache invalidation controls (invalidateQuote)', async () => {
    (manager as any).storeInCache('obj-a', {
      objectId: 'obj-a',
      defaultPrice: 10,
      buttons: [10],
      hideCustom: false,
      timestamp: Date.now(),
    });
    (manager as any).storeInCache('obj-b', {
      objectId: 'obj-b',
      defaultPrice: 20,
      buttons: [20],
      hideCustom: false,
      timestamp: Date.now(),
    });

    expect(manager.getCacheSize()).toBe(2);

    // Invalidate single item
    manager.invalidateQuote('obj-a');
    expect(manager.hasValidQuote('obj-a')).toBe(false);
    expect(manager.hasValidQuote('obj-b')).toBe(true);
    expect(manager.getCacheSize()).toBe(1);

    // Clear entire cache
    manager.clearCache();
    expect(manager.getCacheSize()).toBe(0);
    expect(manager.hasValidQuote('obj-b')).toBe(false);
  });

  it('slBridge delegates cached queries and invalidations to ObjectPayManager', async () => {
    const objectId = 'bridge-obj-123';
    const mockQuote: ObjectPayQuote = {
      objectId,
      defaultPrice: 60,
      buttons: [20, 40, 60],
      hideCustom: false,
      timestamp: Date.now(),
    };

    vi.spyOn(bridge, 'requestPayPrice').mockResolvedValueOnce(mockQuote);

    const quote = await bridge.getObjectPayQuote(objectId);
    expect(quote.defaultPrice).toBe(60);

    // Verify quote is cached through manager
    expect(manager.hasValidQuote(objectId)).toBe(true);

    // Invalidate through bridge
    bridge.invalidateObjectPayQuote(objectId);
    expect(manager.hasValidQuote(objectId)).toBe(false);
  });
});
