import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EconomySyncEngine } from '../phase2/economy-sync-engine';
import { EconomyManager } from '../economy-manager';
import { CapabilitiesManager } from '../phase2/capabilities';
import { localCache } from '../local-cache';
import { slBridge } from '../sl-bridge';

describe('EconomySyncEngine (Dual-Transport Sync Subsystem)', () => {
  let syncEngine: EconomySyncEngine;
  let capabilities: CapabilitiesManager;
  let economy: EconomyManager;
  const agentId = 'test-agent-uuid-7777';
  const now = Date.now();

  beforeEach(async () => {
    vi.restoreAllMocks();
    capabilities = new CapabilitiesManager();
    syncEngine = new EconomySyncEngine({
      capabilitiesManager: capabilities,
      requestTimeoutMs: 500, // Speed up timeout for tests
      batchSize: 100,
    });
    syncEngine.setAgentId(agentId);
    await syncEngine.setLastSyncedTimestamp(agentId, 0);
    await localCache.clearTransactions(agentId);

    economy = new EconomyManager(syncEngine);
    await economy.init(agentId);
    economy.transactions = [];
  });

  afterEach(() => {
    syncEngine.destroy();
  });

  it('queries capability first when capability URL is available', async () => {
    capabilities.setCapability(
      'UserTransactionHistory',
      'https://grid.example.com/cap/UserTxHistory',
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('cap/UserTxHistory')) {
        return new Response(
          JSON.stringify({
            transactions: [
              {
                id: 'cap-tx-1',
                amount: 100,
                type: 'payment',
                description: 'Cap payment',
                timestamp: now - 5000,
              },
            ],
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    const txs = await syncEngine.syncTransactions({ agentId, forceFullSync: true });

    expect(fetchSpy).toHaveBeenCalled();
    expect(txs.length).toBe(1);
    expect(txs[0].id).toBe('cap-tx-1');
  });

  it('falls back to grid web / XMLRPC RPCs when capability query times out or fails', async () => {
    capabilities.setCapability(
      'UserTransactionHistory',
      'https://grid.example.com/cap/UserTxHistory',
    );

    // Simulate capability timeout / failure
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error on capability'));

    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
    const fallbackSpy = vi.spyOn(slBridge, 'getTransactionHistory').mockResolvedValueOnce({
      balance: 500,
      transactions: [
        {
          id: 'fallback-tx-1',
          amount: 50,
          type: 'tip',
          description: 'Fallback tip',
          timestamp: now - 4000,
        },
      ],
      hasMore: false,
    });

    const txs = await syncEngine.syncTransactions({ agentId, forceFullSync: true });

    expect(fallbackSpy).toHaveBeenCalled();
    expect(txs.length).toBe(1);
    expect(txs[0].id).toBe('fallback-tx-1');
  });

  it('performs incremental delta syncing fetching only records newer than lastSyncedTimestamp', async () => {
    const baseTime = now - 10000;
    await syncEngine.setLastSyncedTimestamp(agentId, baseTime + 5000);

    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
    const fallbackSpy = vi
      .spyOn(slBridge, 'getTransactionHistory')
      .mockImplementation(async (params?: any) => {
        expect(params?.since).toBe(baseTime + 5000);
        return {
          balance: 1000,
          transactions: [
            {
              id: 'old-tx-1',
              amount: 10,
              type: 'payment',
              description: 'Old record',
              timestamp: baseTime + 4000, // older than baseTime + 5000
            },
            {
              id: 'new-tx-1',
              amount: 250,
              type: 'payment',
              description: 'New record',
              timestamp: baseTime + 6000, // newer than baseTime + 5000
            },
          ],
          hasMore: false,
        };
      });

    const txs = await syncEngine.syncTransactions({ agentId });

    expect(fallbackSpy).toHaveBeenCalled();
    expect(txs.length).toBe(1);
    expect(txs[0].id).toBe('new-tx-1');

    const updatedCursor = await syncEngine.getLastSyncedTimestamp(agentId);
    expect(updatedCursor).toBe(baseTime + 6000);
  });

  it('limits pagination chunk size to 100 transactions per batch', async () => {
    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);

    const baseTime = now - 20000;
    const batch1 = Array.from({ length: 100 }, (_, i) => ({
      id: `batch1-tx-${i}`,
      amount: 10,
      type: 'payment',
      description: `Tx ${i}`,
      timestamp: baseTime + i * 10,
    }));

    const batch2 = Array.from({ length: 20 }, (_, i) => ({
      id: `batch2-tx-${i}`,
      amount: 20,
      type: 'payment',
      description: `Tx batch2 ${i}`,
      timestamp: baseTime + 1000 + i * 10,
    }));

    let callCount = 0;
    vi.spyOn(slBridge, 'getTransactionHistory').mockImplementation(async (params?: any) => {
      expect(params?.limit).toBe(100);
      callCount++;
      if (callCount === 1) {
        return { transactions: batch1, hasMore: true };
      }
      return { transactions: batch2, hasMore: false };
    });

    const txs = await syncEngine.syncTransactions({ agentId, forceFullSync: true });

    expect(callCount).toBe(2);
    expect(txs.length).toBe(120);
  });

  it('preserves committed delta records without state corruption during mid-sync network failures', async () => {
    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);

    const baseTime = now - 30000;
    const batch1 = Array.from({ length: 100 }, (_, i) => ({
      id: `fail-batch1-tx-${i}`,
      amount: 5,
      type: 'payment',
      description: `Preserved Tx ${i}`,
      timestamp: baseTime + i * 10,
    }));

    let callCount = 0;
    vi.spyOn(slBridge, 'getTransactionHistory').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return { transactions: batch1, hasMore: true };
      }
      throw new Error('Mid-sync connection loss!');
    });

    const syncErrorSpy = vi.fn();
    syncEngine.on('sync_error', syncErrorSpy);

    const txs = await syncEngine.syncTransactions({ agentId, forceFullSync: true });

    expect(syncErrorSpy).toHaveBeenCalled();
    // Batch 1 records were committed to IndexedDB before failure occurred
    expect(txs.length).toBe(100);
    const cursor = await syncEngine.getLastSyncedTimestamp(agentId);
    expect(cursor).toBe(baseTime + 990);
  });

  it('pauses background sync loops when application is minimized or disconnected', async () => {
    syncEngine.pause('Application minimized');
    expect(syncEngine.isSyncPaused()).toBe(true);

    const skippedSpy = vi.fn();
    syncEngine.on('sync_skipped', skippedSpy);

    await syncEngine.syncTransactions({ agentId });
    expect(skippedSpy).toHaveBeenCalledWith({ reason: 'Application minimized' });

    syncEngine.resume();
    expect(syncEngine.isSyncPaused()).toBe(false);
  });

  it('causes EconomyManager to emit transactions_updated events as delta batches arrive', async () => {
    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);

    vi.spyOn(slBridge, 'getTransactionHistory').mockResolvedValueOnce({
      transactions: [
        {
          id: 'em-stream-1',
          amount: 75,
          type: 'tip',
          description: 'Stream tip',
          timestamp: now - 1000,
        },
      ],
      hasMore: false,
    });

    const updateSpy = vi.fn();
    economy.on('transactions_updated', updateSpy);

    await economy.fetchHistory();

    expect(updateSpy).toHaveBeenCalled();
    const currentTxs = economy.getTransactions();
    expect(currentTxs.some((t) => t.id === 'em-stream-1')).toBe(true);
  });
});
