import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EconomyService } from '../EconomyService';
import { liveRegionAnnouncer } from '../LiveRegionAnnouncer';

describe('EconomyService Middleware Subsystem', () => {
  let service: EconomyService;

  beforeEach(() => {
    service = new EconomyService({ timeoutMs: 500 });
  });

  afterEach(() => {
    service.clearQueue('Test teardown');
  });

  it('queues payment requests and returns pending promise', async () => {
    const executeSpy = vi.fn().mockResolvedValue({ id: 'tx-100', status: 'success' });
    const confirmationNeededSpy = vi.fn();
    service.on('confirmation_needed', confirmationNeededSpy);

    const promise = service.interceptPay({
      params: { targetId: 'avatar-123', targetName: 'Luna Resident', amount: 50 },
      targetType: 'avatar',
      currencySymbol: 'L$',
      currentBalance: 200,
      execute: executeSpy,
    });

    // Check request is queued
    const pending = service.getPendingRequests();
    expect(pending.length).toBe(1);
    expect(pending[0].params.targetName).toBe('Luna Resident');
    expect(pending[0].currencySymbol).toBe('L$');
    expect(pending[0].currentBalance).toBe(200);
    expect(pending[0].expectedRemainingBalance).toBe(150);

    expect(confirmationNeededSpy).toHaveBeenCalledWith(pending[0]);
    expect(executeSpy).not.toHaveBeenCalled();

    // Approve transaction
    const approvePromise = service.approveTransaction(pending[0].id);
    const result = await promise;
    await approvePromise;

    expect(executeSpy).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'tx-100', status: 'success' });
    expect(service.getPendingRequests().length).toBe(0);
  });

  it('rejects payment request with "Transaction cancelled by user" on cancellation', async () => {
    const executeSpy = vi.fn();

    const promise = service.interceptPay({
      params: { targetId: 'obj-456', targetName: 'Tip Jar', amount: 100 },
      targetType: 'object',
      currencySymbol: 'L$',
      currentBalance: 500,
      execute: executeSpy,
    });

    const pending = service.getPendingRequests();
    expect(pending.length).toBe(1);

    service.cancelTransaction(pending[0].id, 'Transaction cancelled by user');

    await expect(promise).rejects.toThrow('Transaction cancelled by user');
    expect(executeSpy).not.toHaveBeenCalled();
    expect(service.getPendingRequests().length).toBe(0);
  });

  it('bypasses confirmation queue for system sync requests', async () => {
    const executeSpy = vi.fn().mockResolvedValue({ id: 'tx-sys-1', status: 'success' });

    const result = await service.interceptPay({
      params: { targetId: 'sys-0', amount: 10, isSystemSync: true },
      targetType: 'system',
      currencySymbol: 'L$',
      currentBalance: 100,
      execute: executeSpy,
    });

    expect(executeSpy).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'tx-sys-1', status: 'success' });
    expect(service.getPendingRequests().length).toBe(0);
  });

  it('bypasses confirmation queue when autoApprove option is enabled', async () => {
    service.setAutoApprove(true);
    const executeSpy = vi.fn().mockResolvedValue({ id: 'tx-auto-1', status: 'success' });

    const result = await service.interceptPay({
      params: { targetId: 'avatar-777', amount: 25 },
      targetType: 'avatar',
      currencySymbol: 'L$',
      currentBalance: 100,
      execute: executeSpy,
    });

    expect(executeSpy).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'tx-auto-1', status: 'success' });
    expect(service.getPendingRequests().length).toBe(0);
  });

  it('cancels transaction automatically when timeout expires', async () => {
    vi.useFakeTimers();
    try {
      const executeSpy = vi.fn();

      const promise = service.interceptPay({
        params: { targetId: 'avatar-timeout', amount: 30 },
        targetType: 'avatar',
        currencySymbol: 'L$',
        currentBalance: 100,
        execute: executeSpy,
      });

      expect(service.getPendingRequests().length).toBe(1);

      vi.advanceTimersByTime(600);

      await expect(promise).rejects.toThrow('Transaction confirmation timed out');
      expect(executeSpy).not.toHaveBeenCalled();
      expect(service.getPendingRequests().length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces confirmation requirement via liveRegionAnnouncer', async () => {
    const announceSpy = vi.spyOn(liveRegionAnnouncer, 'announce');

    const promise = service.interceptPay({
      params: { targetId: 'avatar-99', targetName: 'Announce Target', amount: 75 },
      targetType: 'avatar',
      currencySymbol: 'OS$',
      currentBalance: 500,
      execute: vi.fn(),
    });
    promise.catch(() => {});

    expect(announceSpy).toHaveBeenCalledWith(
      'Transaction confirmation required: Pay OS$ 75 to Announce Target',
      'assertive',
    );
  });

  describe('Pre-flight balance validation', () => {
    it('sets and gets current balance', () => {
      expect(service.getCurrentBalance()).toBeNull();
      service.setCurrentBalance(1250);
      expect(service.getCurrentBalance()).toBe(1250);
      service.setCurrentBalance(null);
      expect(service.getCurrentBalance()).toBeNull();
    });

    it('validateBalance passes when balance is sufficient or equal to required price', () => {
      service.setCurrentBalance(1500);
      expect(service.validateBalance(1500)).toBe(true);
      expect(service.validateBalance(1000)).toBe(true);
      expect(service.validateBalance(2000, 2500)).toBe(true);
    });

    it('validateBalance aborts with error when balance is lower than required price', () => {
      service.setCurrentBalance(350);
      expect(() => service.validateBalance(1500)).toThrow(
        'Insufficient L$ balance: required L$ 1,500, available L$ 350',
      );

      expect(() => service.validateBalance(500, 100)).toThrow(
        'Insufficient L$ balance: required L$ 500, available L$ 100',
      );
    });

    it('validateBalance passes when balance is unknown (null) to avoid blocking uninitialized states', () => {
      service.setCurrentBalance(null);
      expect(service.validateBalance(1500)).toBe(true);
    });
  });

  it('coordinates transaction state and notifies listeners when batches commit', () => {
    const batchCommittedSpy = vi.fn();
    const txUpdatedSpy = vi.fn();
    service.on('batch_committed', batchCommittedSpy);
    service.on('transactions_updated', txUpdatedSpy);

    const testBatch = [
      {
        id: 'batch-tx-1',
        agentId: 'agent-1',
        targetId: 'target-1',
        targetName: 'Store',
        targetType: 'object' as const,
        amount: -50,
        type: 'payment' as const,
        description: 'Shirt purchase',
        timestamp: Date.now(),
        status: 'success' as const,
      },
    ];

    service.notifySyncStarted({ agentId: 'agent-1' });
    expect(service.isTransactionSyncing()).toBe(true);

    service.notifyBatchCommitted({
      agentId: 'agent-1',
      batch: testBatch,
      lastSyncedTimestamp: testBatch[0].timestamp,
      totalFetched: 1,
      isLastBatch: true,
    });

    expect(batchCommittedSpy).toHaveBeenCalledOnce();
    expect(txUpdatedSpy).toHaveBeenCalled();
    expect(service.getTransactions().length).toBe(1);
    expect(service.getTransactions()[0].id).toBe('batch-tx-1');

    service.notifySyncCompleted({ agentId: 'agent-1', totalFetched: 1, transactions: testBatch });
    expect(service.isTransactionSyncing()).toBe(false);
  });

  it('delegates refreshTransactions to registered sync handler', async () => {
    const mockTxs = [
      {
        id: 'refreshed-1',
        agentId: 'agent-1',
        targetId: 't-1',
        targetName: 'User',
        targetType: 'avatar' as const,
        amount: 25,
        type: 'tip' as const,
        description: 'Tip',
        timestamp: Date.now(),
        status: 'success' as const,
      },
    ];

    const handler = vi.fn().mockResolvedValue(mockTxs);
    service.registerSyncHandler(handler);

    const result = await service.refreshTransactions();
    expect(handler).toHaveBeenCalledOnce();
    expect(result).toEqual(mockTxs);
  });
});
