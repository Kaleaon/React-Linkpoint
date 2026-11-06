import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { app } from '../app';
import { localCache } from '../local-cache';
import { slBridge } from '../sl-bridge';

describe('LinkpointApp Economy Statement Sync Wiring', () => {
  const agentId = 'test-agent-wiring-1234';
  const now = Date.now();

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ transactions: [], hasMore: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    app.capabilities.clearCache();
    await localCache.clearTransactions(agentId);
    await app.economy.syncEngine.setLastSyncedTimestamp(agentId, 0);
    app.economy.activeAgentId = agentId;
    app.economy.syncEngine.setAgentId(agentId);
    app.economy.transactions = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Requirement 1: feeds seed capabilities into CapabilitiesManager on capabilities_ready and resolves transaction URL', async () => {
    const seedCaps = {
      UserTransactionHistory: 'https://sim.example.com/cap/UserTransactionHistory',
    };

    // Emit capabilities_ready
    app.protocol.emit('capabilities_ready', seedCaps);

    // CapabilitiesManager should now resolve UserTransactionHistory
    const resolvedUrl = app.capabilities.resolveCapability('UserTransactionHistory');
    expect(resolvedUrl).toBe('https://sim.example.com/cap/UserTransactionHistory');
  });

  it('Criterion 1 & 2: populates historical records from capability endpoint with fallback to slBridge', async () => {
    // 1. Without capability URL: falls back to slBridge
    app.capabilities.clearCache();
    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
    const fallbackSpy = vi.spyOn(slBridge, 'getTransactionHistory').mockResolvedValueOnce({
      balance: 1200,
      transactions: [
        {
          id: 'fb-tx-101',
          amount: 200,
          type: 'payment',
          description: 'Fallback land rent',
          timestamp: now - 3000,
        },
      ],
      hasMore: false,
    });

    const txsFallback = await app.economy.fetchHistory();
    expect(fallbackSpy).toHaveBeenCalled();
    expect(txsFallback.some((t) => t.id === 'fb-tx-101')).toBe(true);

    // 2. With capability URL: queries capability endpoint first
    app.capabilities.setCapability(
      'UserTransactionHistory',
      'https://sim.example.com/cap/UserTransactionHistory',
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url: string | URL | Request) => {
        if (String(url).includes('UserTransactionHistory')) {
          return new Response(
            JSON.stringify({
              transactions: [
                {
                  id: 'cap-tx-202',
                  amount: 75,
                  type: 'tip',
                  description: 'Capability DJ tip',
                  timestamp: now - 1000,
                },
              ],
              hasMore: false,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 404 });
      });

    const txsCap = await app.economy.fetchHistory();
    expect(fetchSpy).toHaveBeenCalled();
    expect(txsCap.some((t) => t.id === 'cap-tx-202')).toBe(true);
  });

  it('Criterion 3: enforces incremental delta pagination only fetching records newer than cursor', async () => {
    app.capabilities.setCapability(
      'UserTransactionHistory',
      'https://sim.example.com/cap/UserTransactionHistory',
    );

    const baseTime = now - 50000;
    await app.economy.syncEngine.setLastSyncedTimestamp(agentId, baseTime + 10000);

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url: string | URL | Request) => {
        const urlObj = new URL(String(url));
        expect(urlObj.searchParams.get('since')).toBe(String(baseTime + 10000));
        expect(urlObj.searchParams.get('limit')).toBe('100');

        return new Response(
          JSON.stringify({
            transactions: [
              {
                id: 'delta-old-ignored',
                amount: 10,
                type: 'payment',
                description: 'Ignored old tx',
                timestamp: baseTime + 5000,
              },
              {
                id: 'delta-new-committed',
                amount: 50,
                type: 'tip',
                description: 'Committed new tx',
                timestamp: baseTime + 15000,
              },
            ],
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      });

    const results = await app.economy.syncEngine.syncTransactions({ agentId });
    expect(fetchSpy).toHaveBeenCalled();
    expect(results.some((t) => t.id === 'delta-new-committed')).toBe(true);
    expect(results.some((t) => t.id === 'delta-old-ignored')).toBe(false);

    const newCursor = await app.economy.syncEngine.getLastSyncedTimestamp(agentId);
    expect(newCursor).toBe(baseTime + 15000);
  });

  it('Criterion 4: persists all fetched records in IndexedDB across offline restarts', async () => {
    // Commit a record
    const testRecord = {
      id: 'persisted-tx-1',
      agentId,
      targetId: 'target-1',
      targetName: 'Shop',
      targetType: 'object' as const,
      amount: -30,
      type: 'payment' as const,
      description: 'Test purchase',
      timestamp: now - 500,
      status: 'success' as const,
    };
    await localCache.saveTransaction(agentId, testRecord);

    // Simulate new session restart by re-initializing economy manager
    await app.economy.init(agentId);
    const loadedRecords = app.economy.getTransactions();

    expect(loadedRecords.length).toBeGreaterThanOrEqual(1);
    expect(loadedRecords.some((t) => t.id === 'persisted-tx-1')).toBe(true);
  });
});
