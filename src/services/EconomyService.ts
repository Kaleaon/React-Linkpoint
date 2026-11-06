/**
 * EconomyService Middleware & Interceptor
 *
 * Implements a global middleware rule that intercepts all payment calls (payObject, payAvatar)
 * before network RPC calls reach slBridge, ensuring WCAG 2.2 SC 3.3.4 (Error Prevention) compliance.
 */

import { Utils } from '../linkpoint/utils';
import { liveRegionAnnouncer } from './LiveRegionAnnouncer';
import { TransactionRecord, PaymentParams } from '../linkpoint/economy-manager';
import type { SyncProgressEvent } from '../linkpoint/phase2/economy-sync-engine';

export interface PendingTransactionRequest {
  id: string;
  params: PaymentParams;
  targetType: 'avatar' | 'object' | 'group' | 'system';
  currencySymbol: string;
  currentBalance: number | null;
  expectedRemainingBalance: number | null;
  createdAt: number;
  execute: () => Promise<TransactionRecord>;
  resolve: (value: TransactionRecord | PromiseLike<TransactionRecord>) => void;
  reject: (reason?: any) => void;
  timeoutId?: any;
}

export interface EconomyServiceOptions {
  timeoutMs?: number;
  autoApprove?: boolean;
}

export class EconomyService extends Utils.EventEmitter {
  private static instance: EconomyService | null = null;
  private pendingQueue: PendingTransactionRequest[] = [];
  private timeoutMs: number = 120000; // 2 minutes default timeout
  private autoApprove: boolean = false;
  private currentBalance: number | null = null;
  private transactions: TransactionRecord[] = [];
  private isSyncing: boolean = false;
  private syncHandler?: () => Promise<TransactionRecord[]>;

  constructor(options?: EconomyServiceOptions) {
    super();
    if (options?.timeoutMs !== undefined) {
      this.timeoutMs = options.timeoutMs;
    }
    if (options?.autoApprove !== undefined) {
      this.autoApprove = options.autoApprove;
    }
  }

  public static getInstance(): EconomyService {
    if (!EconomyService.instance) {
      EconomyService.instance = new EconomyService();
    }
    return EconomyService.instance;
  }

  public setCurrentBalance(balance: number | null): void {
    this.currentBalance = balance;
  }

  public getCurrentBalance(): number | null {
    return this.currentBalance;
  }

  /**
   * Pre-flight balance check: Validates that the resident has sufficient L$ balance
   * before initiating a financial transaction (e.g. land purchase).
   * Aborts with a user-facing warning if balance is lower than the required amount.
   */
  public validateBalance(requiredAmount: number, balance?: number | null): boolean {
    const bal = balance !== undefined ? balance : this.currentBalance;
    if (bal !== null && typeof bal === 'number' && bal < requiredAmount) {
      throw new Error(
        `Insufficient L$ balance: required L$ ${requiredAmount.toLocaleString()}, available L$ ${bal.toLocaleString()}`,
      );
    }
    return true;
  }

  public setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  public setTimeoutMs(ms: number): void {
    this.timeoutMs = Math.max(0, ms);
  }

  public isTransactionSyncing(): boolean {
    return this.isSyncing;
  }

  public isSyncingTransactions(): boolean {
    return this.isSyncing;
  }

  public getTransactions(): TransactionRecord[] {
    return [...this.transactions];
  }

  public setTransactions(transactions: TransactionRecord[]): void {
    this.transactions = [...transactions];
    this.emit('transactions_updated', this.transactions);
  }

  public registerSyncHandler(handler: () => Promise<TransactionRecord[]>): void {
    this.syncHandler = handler;
  }

  public async refreshTransactions(): Promise<TransactionRecord[]> {
    if (this.syncHandler) {
      return this.syncHandler();
    }
    return this.transactions;
  }

  public notifySyncStarted(event?: any): void {
    this.isSyncing = true;
    this.emit('sync_started', event);
  }

  public notifyBatchCommitted(event: SyncProgressEvent): void {
    if (Array.isArray(event?.batch)) {
      const existingIds = new Set(this.transactions.map((t) => t.id));
      for (const record of event.batch) {
        if (!existingIds.has(record.id)) {
          this.transactions.push(record);
          existingIds.add(record.id);
        }
      }
    }
    this.emit('batch_committed', event);
    this.emit('delta_batch_received', event);
    this.emit('sync_progress', event);
    this.emit('transactions_updated', this.getTransactions());
  }

  public notifySyncProgress(event: SyncProgressEvent): void {
    this.emit('sync_progress', event);
  }

  public notifySyncCompleted(event: any): void {
    this.isSyncing = false;
    if (Array.isArray(event?.transactions)) {
      this.transactions = [...event.transactions];
    }
    this.emit('sync_completed', event);
    this.emit('transactions_updated', this.getTransactions());
  }

  public notifySyncError(error: any): void {
    this.isSyncing = false;
    this.emit('sync_error', error);
  }

  public notifySyncPaused(event?: any): void {
    this.emit('sync_paused', event);
  }

  public notifySyncResumed(): void {
    this.emit('sync_resumed');
  }

  public getPendingRequests(): PendingTransactionRequest[] {
    return [...this.pendingQueue];
  }

  /**
   * Middleware interceptor for payment calls.
   * Creates a pending request object, queues it, and returns a Promise.
   */
  public async interceptPay(options: {
    params: PaymentParams;
    targetType: 'avatar' | 'object' | 'group' | 'system';
    currencySymbol: string;
    currentBalance: number | null;
    execute: () => Promise<TransactionRecord>;
  }): Promise<TransactionRecord> {
    const { params, targetType, currencySymbol, currentBalance, execute } = options;

    // System sync calls & auto-approve bypass the confirmation queue
    if (
      params.isSystemSync ||
      params.targetType === 'system' ||
      targetType === 'system' ||
      this.autoApprove
    ) {
      return execute();
    }

    const id = `tx_req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const expectedRemainingBalance =
      currentBalance !== null && typeof currentBalance === 'number'
        ? Math.max(0, currentBalance - (params.amount || 0))
        : null;

    return new Promise<TransactionRecord>((resolve, reject) => {
      let timeoutId: any = null;

      if (this.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          this.cancelTransaction(id, 'Transaction confirmation timed out');
        }, this.timeoutMs);
      }

      const pendingReq: PendingTransactionRequest = {
        id,
        params,
        targetType,
        currencySymbol,
        currentBalance,
        expectedRemainingBalance,
        createdAt: Date.now(),
        execute,
        resolve,
        reject,
        timeoutId,
      };

      this.pendingQueue.push(pendingReq);

      const recipientName = params.targetName || (targetType === 'object' ? 'Object' : 'Resident');
      liveRegionAnnouncer.announce(
        `Transaction confirmation required: Pay ${currencySymbol} ${params.amount} to ${recipientName}`,
        'assertive',
      );

      this.emit('confirmation_needed', pendingReq);
      this.emit('queue_updated', this.getPendingRequests());
    });
  }

  /**
   * Approve a pending transaction by ID.
   * Resolves the promise and dispatches the call to slBridge.
   */
  public async approveTransaction(id: string): Promise<TransactionRecord> {
    const index = this.pendingQueue.findIndex((req) => req.id === id);
    if (index === -1) {
      throw new Error(`Pending transaction with ID ${id} not found`);
    }

    const [req] = this.pendingQueue.splice(index, 1);
    if (req.timeoutId) {
      clearTimeout(req.timeoutId);
    }

    this.emit('queue_updated', this.getPendingRequests());

    try {
      const result = await req.execute();
      req.resolve(result);
      return result;
    } catch (err) {
      req.reject(err);
      throw err;
    }
  }

  /**
   * Cancel a pending transaction by ID.
   * Rejects the promise with 'Transaction cancelled by user' (or provided reason).
   */
  public cancelTransaction(id: string, reason = 'Transaction cancelled by user'): void {
    const index = this.pendingQueue.findIndex((req) => req.id === id);
    if (index === -1) {
      return;
    }

    const [req] = this.pendingQueue.splice(index, 1);
    if (req.timeoutId) {
      clearTimeout(req.timeoutId);
    }

    this.emit('queue_updated', this.getPendingRequests());

    const err = new Error(reason);
    req.reject(err);
  }

  /**
   * Clear all pending transaction requests (e.g., during teardown/unmount).
   */
  public clearQueue(reason = 'Transaction cancelled by user'): void {
    const queueToClear = [...this.pendingQueue];
    this.pendingQueue = [];
    this.emit('queue_updated', []);

    for (const req of queueToClear) {
      if (req.timeoutId) {
        clearTimeout(req.timeoutId);
      }
      req.reject(new Error(reason));
    }
  }
}

export const economyService = EconomyService.getInstance();
