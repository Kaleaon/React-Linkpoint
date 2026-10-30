/**
 * EconomyService Middleware & Interceptor
 *
 * Implements a global middleware rule that intercepts all payment calls (payObject, payAvatar)
 * before network RPC calls reach slBridge, ensuring WCAG 2.2 SC 3.3.4 (Error Prevention) compliance.
 */

import { Utils } from '../linkpoint/utils';
import { liveRegionAnnouncer } from './LiveRegionAnnouncer';
import { TransactionRecord, PaymentParams } from '../linkpoint/economy-manager';

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

  public setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  public setTimeoutMs(ms: number): void {
    this.timeoutMs = Math.max(0, ms);
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
