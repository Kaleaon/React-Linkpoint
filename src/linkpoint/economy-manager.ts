/**
 * Linkpoint - Modular Financial Manager
 *
 * Handles persistent transaction ledger (30-day retention), quick-tip preset calculations,
 * payment RPC dispatching for avatars & objects, background transaction reconciliation,
 * and local cache synchronization via localCache (IndexedDB STORE_TRANSACTIONS).
 */

import { Utils } from './utils';
import { localCache } from './local-cache';
import { slBridge } from './sl-bridge';
import { EconomySyncEngine, SyncProgressEvent } from './phase2/economy-sync-engine';
import { economyService } from '../services/EconomyService';

export interface TransactionRecord {
  id: string;
  agentId: string;
  targetId: string;
  targetName: string;
  targetType: 'avatar' | 'object' | 'group' | 'system';
  amount: number;
  type: 'payment' | 'tip' | 'purchase' | 'refund' | 'transfer' | 'balance';
  description: string;
  timestamp: number;
  status: 'success' | 'failed' | 'declined' | 'pending';
}

export interface PaymentParams {
  targetId: string;
  targetName?: string;
  amount: number;
  description?: string;
  isSystemSync?: boolean;
  targetType?: 'avatar' | 'object' | 'group' | 'system';
}

export interface MoneyTransferParams {
  agentId: string;
  sessionId?: string;
  sourceId?: string;
  destinationId: string;
  amount: number;
  transactionType?: number;
  aggregateAmount?: number;
  transactionFlags?: number;
  description?: string;
}

/**
 * Serializes a MoneyTransferRequest packet for L$ transfer over UDP (Message ID: 0xFFFF00FC).
 */
export function serializeMoneyTransferRequest(params: MoneyTransferParams): Uint8Array {
  if (!params.agentId || !params.destinationId) {
    throw new Error('agentId and destinationId are required for MoneyTransferRequest');
  }

  const parseUuid = (uuid: string): Uint8Array => {
    const hex = (uuid || '00000000-0000-0000-0000-000000000000').replace(/-/g, '');
    const bytes = new Uint8Array(16);
    if (hex.length !== 32) {
      return bytes;
    }
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16) || 0;
    }
    return bytes;
  };

  const agentIdBytes = parseUuid(params.agentId);
  const sessionIdBytes = parseUuid(params.sessionId || '00000000-0000-0000-0000-000000000000');
  const sourceIdBytes = parseUuid(params.sourceId || params.agentId);
  const destIdBytes = parseUuid(params.destinationId);

  const descStr = params.description || '';
  const descBytes = new TextEncoder().encode(descStr);
  const descLen = Math.min(descBytes.length, 255);

  const totalSize = 4 + 16 + 16 + 16 + 16 + 4 + 4 + 4 + 1 + 1 + descLen;
  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);

  // Low frequency Message ID 252 (0xFFFF00FC)
  view.setUint32(0, 0xffff00fc, false);

  let offset = 4;
  // AgentData
  buffer.set(agentIdBytes, offset);
  offset += 16;
  buffer.set(sessionIdBytes, offset);
  offset += 16;

  // MoneyData
  buffer.set(sourceIdBytes, offset);
  offset += 16;
  buffer.set(destIdBytes, offset);
  offset += 16;

  const transType = params.transactionType ?? 5001; // 5001 = TRANS_OBJECT_PAY
  view.setInt32(offset, transType, true);
  offset += 4;

  const amount = Math.floor(params.amount || 0);
  view.setInt32(offset, amount, true);
  offset += 4;

  const aggregateAmount = Math.floor(params.aggregateAmount || 0);
  view.setInt32(offset, aggregateAmount, true);
  offset += 4;

  view.setUint8(offset, params.transactionFlags ?? 0);
  offset += 1;

  view.setUint8(offset, descLen);
  offset += 1;

  buffer.set(descBytes.subarray(0, descLen), offset);

  return buffer;
}

export interface EconomyStats {
  balance: number | null;
  currencySymbol?: string;
  isZeroCurrency?: boolean;
  totalTransactions: number;
  totalSpent30Days: number;
  totalReceived30Days: number;
  oldestTransactionDate: string | null;
}

export class EconomyManager extends Utils.EventEmitter {
  public balance: number | null = null;
  public currencySymbol: string = 'L$';
  public isZeroCurrency: boolean = false;
  public transactions: TransactionRecord[] = [];
  public activeAgentId: string = 'current';
  public syncEngine: EconomySyncEngine;

  constructor(syncEngine?: EconomySyncEngine) {
    super();
    this.syncEngine = syncEngine || new EconomySyncEngine();
    this.setupListeners();
    this.setupSyncEngineListeners();
  }

  public setGridCurrency(symbol: string = 'L$', isZeroCurrency = false): void {
    this.currencySymbol = symbol || 'L$';
    this.isZeroCurrency = Boolean(isZeroCurrency);
    this.emit('currency_updated', {
      currencySymbol: this.currencySymbol,
      isZeroCurrency: this.isZeroCurrency,
    });
  }

  private setupSyncEngineListeners(): void {
    this.syncEngine.on('delta_batch_received', (event: SyncProgressEvent) => {
      if (Array.isArray(event.batch)) {
        for (const tx of event.batch) {
          void this.recordTransaction(tx, false);
        }
        this.emit('transactions_updated', this.getTransactions());
      }
    });

    this.syncEngine.on('sync_completed', () => {
      this.emit('transactions_updated', this.getTransactions());
    });
  }

  private setupListeners() {
    slBridge.on('balance_updated', (data: any) => {
      if (typeof data === 'number') {
        this.balance = data;
      } else if (data && typeof data === 'object') {
        if (typeof data.balance === 'number' || data.balance === null) {
          this.balance = data.balance;
        }
        if (data.currencySymbol || data.currency_symbol) {
          this.currencySymbol = data.currencySymbol || data.currency_symbol;
        }
        if (
          typeof data.isZeroCurrency === 'boolean' ||
          typeof data.is_zero_currency === 'boolean'
        ) {
          this.isZeroCurrency = Boolean(data.isZeroCurrency ?? data.is_zero_currency);
        }
        if (data.transaction) {
          void this.recordTransaction(data.transaction);
        }
      } else if (data === null) {
        this.balance = null;
      }
      this.emit('balance_updated', {
        balance: this.balance,
        currencySymbol: this.currencySymbol,
        isZeroCurrency: this.isZeroCurrency,
      });
    });

    slBridge.on('transaction-recorded', (tx: any) => {
      void this.recordTransaction(tx);
    });
  }

  /**
   * Initialize EconomyManager for active agent UUID.
   * Loads 30-day cached transaction records from IndexedDB.
   */
  public async init(agentId?: string): Promise<void> {
    if (agentId) {
      this.activeAgentId = agentId;
    }
    this.syncEngine.setAgentId(this.activeAgentId);

    // Prune entries older than 30 days
    await localCache.pruneOldTransactions(this.activeAgentId, 30);

    // Load cached 30-day transaction history from IndexedDB
    const cached = await localCache.getTransactions(this.activeAgentId);
    this.transactions = cached;
    this.emit('transactions_updated', this.transactions);
  }

  /**
   * Quick-tip preset amounts (standard tipping amounts).
   */
  public getQuickTipPresets(): number[] {
    return [5, 10, 50, 100];
  }

  /**
   * Helper method to serialize a MoneyTransferRequest UDP packet.
   */
  public serializeMoneyTransferRequest(params: MoneyTransferParams): Uint8Array {
    return serializeMoneyTransferRequest(params);
  }

  /**
   * Send payment to an in-world Object (tip jar, vendor, rental box, etc.)
   */
  public async payObject(params: PaymentParams): Promise<TransactionRecord> {
    if (this.isZeroCurrency) {
      throw new Error('Payments are disabled on zero-currency grids');
    }
    const targetId = params.targetId;
    if (!targetId) {
      throw new Error('Target object ID is required');
    }
    const amount = Math.floor(Number(params.amount));
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be a positive integer');
    }

    if (this.balance !== null && amount > this.balance) {
      throw new Error(
        `Insufficient L$ balance: available L$ ${this.balance}, required L$ ${amount}`,
      );
    }

    const description = params.description || `Payment to object ${params.targetName || targetId}`;
    const targetName = params.targetName || 'Object';

    const executePayment = async (): Promise<TransactionRecord> => {
      try {
        let res: any;
        if (this.syncEngine?.capabilitiesManager?.getPayObjectUrl?.()) {
          res = await this.syncEngine.capabilitiesManager.executePayObjectCapability(
            targetId,
            amount,
            description,
          );
        } else {
          res = await slBridge.payObject({
            targetId,
            amount,
            description,
            targetName,
            currencySymbol: this.currencySymbol,
            isZeroCurrency: this.isZeroCurrency,
          });
        }

        const record: TransactionRecord = {
          id: res?.transaction?.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          agentId: this.activeAgentId,
          targetId,
          targetName,
          targetType: 'object',
          amount,
          type: 'payment',
          description,
          timestamp: Date.now(),
          status: 'success',
        };

        await this.recordTransaction(record);

        if (this.balance !== null) {
          this.balance = Math.max(0, this.balance - amount);
          this.emit('balance_updated', {
            balance: this.balance,
            currencySymbol: this.currencySymbol,
            isZeroCurrency: this.isZeroCurrency,
          });
        }

        return record;
      } catch (err: any) {
        const failedRecord: TransactionRecord = {
          id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          agentId: this.activeAgentId,
          targetId,
          targetName,
          targetType: 'object',
          amount,
          type: 'payment',
          description: `${description} (Failed: ${err.message || 'Declined'})`,
          timestamp: Date.now(),
          status: 'failed',
        };
        await this.recordTransaction(failedRecord);
        throw new Error(err.message || 'Payment declined or failed');
      }
    };

    return economyService.interceptPay({
      params: { ...params, amount, description, targetName },
      targetType: 'object',
      currencySymbol: this.currencySymbol,
      currentBalance: this.balance,
      execute: executePayment,
    });
  }

  /**
   * Send payment/tip to another Resident/Avatar.
   */
  public async payAvatar(params: PaymentParams): Promise<TransactionRecord> {
    if (this.isZeroCurrency) {
      throw new Error('Payments are disabled on zero-currency grids');
    }
    const targetId = params.targetId;
    if (!targetId) {
      throw new Error('Target avatar ID is required');
    }
    const amount = Math.floor(Number(params.amount));
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Payment amount must be a positive integer');
    }

    if (this.balance !== null && amount > this.balance) {
      throw new Error(
        `Insufficient L$ balance: available L$ ${this.balance}, required L$ ${amount}`,
      );
    }

    const description = params.description || `Gift to ${params.targetName || targetId}`;
    const targetName = params.targetName || 'Resident';

    const executePayment = async (): Promise<TransactionRecord> => {
      try {
        const res = await slBridge.payAvatar({
          targetId,
          amount,
          description,
          targetName,
          currencySymbol: this.currencySymbol,
          isZeroCurrency: this.isZeroCurrency,
        });

        const record: TransactionRecord = {
          id: res?.transaction?.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          agentId: this.activeAgentId,
          targetId,
          targetName,
          targetType: 'avatar',
          amount,
          type: 'tip',
          description,
          timestamp: Date.now(),
          status: 'success',
        };

        await this.recordTransaction(record);

        if (this.balance !== null) {
          this.balance = Math.max(0, this.balance - amount);
          this.emit('balance_updated', {
            balance: this.balance,
            currencySymbol: this.currencySymbol,
            isZeroCurrency: this.isZeroCurrency,
          });
        }

        return record;
      } catch (err: any) {
        const failedRecord: TransactionRecord = {
          id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          agentId: this.activeAgentId,
          targetId,
          targetName,
          targetType: 'avatar',
          amount,
          type: 'tip',
          description: `${description} (Failed: ${err.message || 'Declined'})`,
          timestamp: Date.now(),
          status: 'failed',
        };
        await this.recordTransaction(failedRecord);
        throw new Error(err.message || 'Payment declined or failed');
      }
    };

    return economyService.interceptPay({
      params: { ...params, amount, description, targetName },
      targetType: 'avatar',
      currencySymbol: this.currencySymbol,
      currentBalance: this.balance,
      execute: executePayment,
    });
  }

  /**
   * Background transaction reconciliation: fetch remote history via EconomySyncEngine and sync with local cache.
   */
  public async fetchHistory(): Promise<TransactionRecord[]> {
    if (slBridge.connected) {
      try {
        const bal = await slBridge.getBalance();
        if (typeof bal?.balance === 'number' || bal?.balance === null) {
          this.balance = bal.balance;
        }
        if (bal?.currencySymbol || bal?.currency_symbol) {
          this.currencySymbol = bal.currencySymbol || bal.currency_symbol || this.currencySymbol;
        }
        if (
          typeof bal?.isZeroCurrency === 'boolean' ||
          typeof bal?.is_zero_currency === 'boolean'
        ) {
          this.isZeroCurrency = Boolean(bal.isZeroCurrency ?? bal.is_zero_currency);
        }
        this.emit('balance_updated', {
          balance: this.balance,
          currencySymbol: this.currencySymbol,
          isZeroCurrency: this.isZeroCurrency,
        });
      } catch {
        // Balance fetch fallback
      }
    }

    try {
      await this.syncEngine.syncTransactions({ agentId: this.activeAgentId });
    } catch {
      // Sync engine error fallback
    }

    const updated = await localCache.getTransactions(this.activeAgentId);
    this.transactions = updated;
    return this.getTransactions();
  }

  /**
   * Save transaction to local cache & memory state, enforcing 30-day retention window.
   */
  public async recordTransaction(tx: Partial<TransactionRecord>, emitEvent = true): Promise<void> {
    const record: TransactionRecord = {
      id: tx.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agentId: tx.agentId || this.activeAgentId,
      targetId: tx.targetId || '',
      targetName: tx.targetName || 'Second Life',
      targetType: tx.targetType || 'avatar',
      amount: Number(tx.amount) || 0,
      type: tx.type || 'payment',
      description: String(tx.description || 'L$ transaction'),
      timestamp: Number(tx.timestamp) || Date.now(),
      status: tx.status || 'success',
    };

    // Prevent duplicate entries
    const existingIndex = this.transactions.findIndex((t) => t.id === record.id);
    if (existingIndex >= 0) {
      this.transactions[existingIndex] = record;
    } else {
      this.transactions.unshift(record);
    }

    // 30-day cutoff filter
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    this.transactions = this.transactions
      .filter((t) => t.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);

    // Sync to IndexedDB
    await localCache.saveTransaction(this.activeAgentId, record);

    if (emitEvent) {
      this.emit('transaction_added', record);
      this.emit('transactions_updated', this.transactions);
    }
  }

  /**
   * Get 30-day transactions filtered by search query.
   */
  public getTransactions(searchQuery?: string): TransactionRecord[] {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filtered = this.transactions.filter((t) => t.timestamp >= cutoff);

    if (!searchQuery || !searchQuery.trim()) {
      return filtered;
    }

    const q = searchQuery.trim().toLowerCase();
    return filtered.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        t.targetName.toLowerCase().includes(q) ||
        t.targetId.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        String(t.amount).includes(q),
    );
  }

  /**
   * Calculate summary statistics for 30-day transactions.
   */
  public getStats(): EconomyStats {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const valid = this.transactions.filter((t) => t.timestamp >= cutoff && t.status === 'success');

    let totalSpent = 0;
    let totalReceived = 0;
    let oldestTimestamp: number | null = null;

    for (const tx of valid) {
      if (tx.amount < 0 || tx.type === 'payment') {
        totalSpent += Math.abs(tx.amount);
      } else {
        totalReceived += tx.amount;
      }

      if (oldestTimestamp === null || tx.timestamp < oldestTimestamp) {
        oldestTimestamp = tx.timestamp;
      }
    }

    return {
      balance: this.balance,
      currencySymbol: this.currencySymbol,
      isZeroCurrency: this.isZeroCurrency,
      totalTransactions: valid.length,
      totalSpent30Days: totalSpent,
      totalReceived30Days: totalReceived,
      oldestTransactionDate: oldestTimestamp
        ? new Date(oldestTimestamp).toLocaleDateString()
        : null,
    };
  }

  /**
   * Clear all local transaction records.
   */
  public async clearHistory(): Promise<void> {
    this.transactions = [];
    await localCache.clearTransactions(this.activeAgentId);
    this.emit('transactions_updated', []);
  }
}

export const economyManager = new EconomyManager();
