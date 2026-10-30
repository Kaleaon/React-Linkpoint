/**
 * Dual-Transport Economy Synchronization Engine
 *
 * Primary transport: HTTP capability queries with 15-second timeout.
 * Fallback transport: Grid web RPCs or XMLRPC statement endpoints.
 *
 * Supports incremental delta queries using IndexedDB-persisted lastSyncedTimestamp cursor per agent UUID.
 * Enforces pagination chunk size limits (max 100 items/batch).
 * Preserves committed delta records without state drift on mid-sync network failures.
 * Pauses background sync loops when app is minimized or disconnected.
 */

import { Utils } from '../utils';
import { TransactionRecord } from '../economy-manager';
import { localCache } from '../local-cache';
import { indexedDBStore } from '../indexeddb-store';
import { slBridge } from '../sl-bridge';
import { CapabilitiesManager } from './capabilities';

export interface EconomySyncEngineConfig {
  capabilitiesManager?: CapabilitiesManager;
  requestTimeoutMs?: number; // default: 15000 (15s)
  batchSize?: number; // default: 100
}

export interface SyncProgressEvent {
  agentId: string;
  batch: TransactionRecord[];
  lastSyncedTimestamp: number;
  totalFetched: number;
  isLastBatch: boolean;
}

export class EconomySyncEngine extends Utils.EventEmitter {
  private agentId: string | null = null;
  public capabilitiesManager: CapabilitiesManager;
  private requestTimeoutMs: number = 15000;
  private batchSize: number = 100;

  private isSyncing: boolean = false;
  private isPaused: boolean = false;
  private pausedReason: string | null = null;

  // Bound listeners for cleanup
  private visibilityHandler: () => void;
  private onlineHandler: () => void;
  private offlineHandler: () => void;
  private bridgeDisconnectHandler: () => void;
  private bridgeConnectHandler: () => void;

  constructor(config: EconomySyncEngineConfig = {}) {
    super();
    this.capabilitiesManager = config.capabilitiesManager || new CapabilitiesManager();
    this.requestTimeoutMs = config.requestTimeoutMs ?? 15000;
    this.batchSize = config.batchSize ?? 100;

    this.visibilityHandler = () => this.handleVisibilityChange();
    this.onlineHandler = () => this.resume();
    this.offlineHandler = () => this.pause('Device offline');
    this.bridgeDisconnectHandler = () => this.pause('Grid disconnected');
    this.bridgeConnectHandler = () => this.resume();

    this.registerLifecycleListeners();
  }

  public setCapabilitiesManager(capabilitiesManager: CapabilitiesManager): void {
    this.capabilitiesManager = capabilitiesManager;
  }

  public setAgentId(agentId: string): void {
    this.agentId = agentId;
  }

  public getAgentId(): string {
    return this.agentId || 'current';
  }

  private registerLifecycleListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    }
    slBridge.on('disconnected', this.bridgeDisconnectHandler);
    slBridge.on('connected', this.bridgeConnectHandler);
  }

  private handleVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.pause('Application minimized');
    } else {
      this.resume();
    }
  }

  public pause(reason: string = 'Paused'): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.pausedReason = reason;
    this.emit('sync_paused', { reason });
  }

  public resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.pausedReason = null;
    this.emit('sync_resumed');
  }

  public isSyncPaused(): boolean {
    if (this.isPaused) return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return false;
  }

  /**
   * Persisted cursor: get lastSyncedTimestamp per agent UUID from IndexedDB STORE_META
   */
  public async getLastSyncedTimestamp(agentId?: string): Promise<number> {
    const targetAgentId = agentId || this.getAgentId();
    const metaKey = `economy_last_synced_${targetAgentId}`;
    const val = await indexedDBStore.getMeta(metaKey);
    return typeof val === 'number' && !isNaN(val) ? val : 0;
  }

  /**
   * Persisted cursor: set lastSyncedTimestamp per agent UUID into IndexedDB STORE_META
   */
  public async setLastSyncedTimestamp(agentId: string, timestamp: number): Promise<void> {
    const targetAgentId = agentId || this.getAgentId();
    const metaKey = `economy_last_synced_${targetAgentId}`;
    await indexedDBStore.setMeta(metaKey, timestamp);
  }

  /**
   * Resolve capability URL for transaction history if available.
   */
  private resolveCapabilityUrl(customUrl?: string): string | null {
    if (customUrl) return customUrl;
    if (!this.capabilitiesManager) return null;

    const possibleCaps = [
      'UserTransactionHistory',
      'TransactionHistory',
      'UserTransactionStatement',
      'GetTransactionHistory',
    ];

    for (const capName of possibleCaps) {
      const url = this.capabilitiesManager.resolveCapability(capName);
      if (url) return url;
    }
    return null;
  }

  /**
   * Execute fetch with enforced timeout (default 15 seconds)
   */
  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Capability query timed out after ${this.requestTimeoutMs / 1000} seconds`);
      }
      throw err;
    }
  }

  /**
   * Fetch a single batch via HTTP Capability query with 15s timeout
   */
  private async fetchViaCapability(
    capUrl: string,
    since: number,
    limit: number,
    offset: number,
  ): Promise<{
    transactions: TransactionRecord[];
    balance?: number;
    currencySymbol?: string;
    isZeroCurrency?: boolean;
    hasMore?: boolean;
  }> {
    const queryUrl = new URL(
      capUrl,
      typeof window !== 'undefined' ? window.location.href : 'http://localhost',
    );
    queryUrl.searchParams.set('since', String(since));
    queryUrl.searchParams.set('limit', String(limit));
    queryUrl.searchParams.set('offset', String(offset));

    const response = await this.fetchWithTimeout(queryUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json, text/xml, application/llsd+xml' },
    });

    if (!response.ok) {
      throw new Error(`Capability HTTP error ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let data: any;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        // Simple XML or plain text parse attempt
        data = { raw: text };
      }
    }

    const rawTxs = Array.isArray(data) ? data : data?.transactions || data?.records || [];
    const converted = rawTxs.map((t: any) => this.normalizeTransactionRecord(t));

    return {
      transactions: converted,
      balance: typeof data?.balance === 'number' ? data.balance : undefined,
      currencySymbol: data?.currencySymbol || data?.currency_symbol,
      isZeroCurrency: data?.isZeroCurrency ?? data?.is_zero_currency,
      hasMore: typeof data?.hasMore === 'boolean' ? data.hasMore : rawTxs.length >= limit,
    };
  }

  /**
   * Fetch a single batch via Grid Web / XMLRPC Fallback Transport
   */
  private async fetchViaFallback(
    since: number,
    limit: number,
    offset: number,
  ): Promise<{
    transactions: TransactionRecord[];
    balance?: number;
    currencySymbol?: string;
    isZeroCurrency?: boolean;
    hasMore?: boolean;
  }> {
    if (!slBridge.connected) {
      return { transactions: [] };
    }

    const remote = await slBridge.getTransactionHistory({ since, limit, offset });
    const rawTxs = Array.isArray(remote?.transactions) ? remote.transactions : [];
    const converted = rawTxs.map((t: any) => this.normalizeTransactionRecord(t));

    return {
      transactions: converted,
      balance: typeof remote?.balance === 'number' ? remote.balance : undefined,
      currencySymbol: remote?.currencySymbol || remote?.currency_symbol,
      isZeroCurrency: remote?.isZeroCurrency ?? remote?.is_zero_currency,
      hasMore: typeof remote?.hasMore === 'boolean' ? remote.hasMore : rawTxs.length >= limit,
    };
  }

  /**
   * Convert arbitrary remote response structure into standard TransactionRecord
   */
  public normalizeTransactionRecord(raw: any): TransactionRecord {
    const now = Date.now();
    const ts = Number(raw.timestamp || raw.time || raw.date || now);

    return {
      id: String(
        raw.id || raw.transaction_id || `tx_${ts}_${Math.random().toString(36).slice(2, 7)}`,
      ),
      agentId: String(raw.agentId || raw.agent_id || this.getAgentId()),
      targetId: String(raw.targetId || raw.target_id || raw.to_id || raw.from_id || ''),
      targetName: String(
        raw.targetName || raw.target_name || raw.to_name || raw.from_name || 'Grid Ledger',
      ),
      targetType: (raw.targetType || raw.target_type || 'avatar') as any,
      amount: Number(raw.amount) || 0,
      type: (raw.type || 'payment') as any,
      description: String(raw.description || raw.desc || 'L$ transaction'),
      timestamp: isNaN(ts) ? now : ts,
      status: (raw.status || 'success') as any,
    };
  }

  /**
   * Execute dual-transport statement synchronization with incremental delta queries.
   */
  public async syncTransactions(
    options: {
      agentId?: string;
      forceFullSync?: boolean;
      capabilityUrl?: string;
    } = {},
  ): Promise<TransactionRecord[]> {
    const targetAgentId = options.agentId || this.getAgentId();
    this.setAgentId(targetAgentId);

    if (this.isSyncPaused()) {
      this.emit('sync_skipped', { reason: this.pausedReason || 'Sync paused' });
      return localCache.getTransactions(targetAgentId);
    }

    if (this.isSyncing) {
      return localCache.getTransactions(targetAgentId);
    }

    this.isSyncing = true;
    let totalFetchedCount = 0;
    let currentCursor = options.forceFullSync
      ? 0
      : await this.getLastSyncedTimestamp(targetAgentId);

    this.emit('sync_started', {
      agentId: targetAgentId,
      lastSyncedTimestamp: currentCursor,
      forceFullSync: Boolean(options.forceFullSync),
    });

    const capUrl = this.resolveCapabilityUrl(options.capabilityUrl);

    let offset = 0;
    let hasMore = true;
    const existingLocal = await localCache.getTransactions(targetAgentId);
    const knownIds = new Set<string>(existingLocal.map((t) => t.id));

    try {
      while (hasMore && !this.isSyncPaused()) {
        let batchResult: {
          transactions: TransactionRecord[];
          balance?: number;
          currencySymbol?: string;
          isZeroCurrency?: boolean;
          hasMore?: boolean;
        };

        let transportType: 'capability' | 'fallback' = 'capability';

        // Try primary Capability transport if capability URL exists
        if (capUrl) {
          try {
            batchResult = await this.fetchViaCapability(
              capUrl,
              currentCursor,
              this.batchSize,
              offset,
            );
          } catch (capErr) {
            console.warn(
              '[EconomySyncEngine] Capability transport failed or timed out, falling back to web/XMLRPC:',
              capErr,
            );
            transportType = 'fallback';
            batchResult = await this.fetchViaFallback(currentCursor, this.batchSize, offset);
          }
        } else {
          transportType = 'fallback';
          batchResult = await this.fetchViaFallback(currentCursor, this.batchSize, offset);
        }

        this.emit('transport_used', { transportType, count: batchResult.transactions.length });

        const newRecords: TransactionRecord[] = [];
        let maxBatchTimestamp = currentCursor;

        for (const record of batchResult.transactions) {
          // Enforce incremental delta rule: only accept records strictly newer than lastSyncedTimestamp
          // (or if full sync requested, accept all)
          if (
            !knownIds.has(record.id) &&
            (options.forceFullSync || record.timestamp > currentCursor)
          ) {
            knownIds.add(record.id);
            newRecords.push(record);
            if (record.timestamp > maxBatchTimestamp) {
              maxBatchTimestamp = record.timestamp;
            }
          }
        }

        // Commit batch records immediately into IndexedDB STORE_TRANSACTIONS
        for (const txRecord of newRecords) {
          await localCache.saveTransaction(targetAgentId, txRecord);
        }

        totalFetchedCount += newRecords.length;

        // Update cursor if newer records were committed
        if (maxBatchTimestamp > currentCursor) {
          currentCursor = maxBatchTimestamp;
          await this.setLastSyncedTimestamp(targetAgentId, currentCursor);
        }

        const isLast = !batchResult.hasMore || batchResult.transactions.length < this.batchSize;
        hasMore = !isLast;
        offset += batchResult.transactions.length;

        // Stream progress event with committed delta batch
        const progressEvent: SyncProgressEvent = {
          agentId: targetAgentId,
          batch: newRecords,
          lastSyncedTimestamp: currentCursor,
          totalFetched: totalFetchedCount,
          isLastBatch: isLast,
        };

        this.emit('delta_batch_received', progressEvent);
        this.emit('sync_progress', progressEvent);

        if (isLast) break;
      }
    } catch (syncErr: any) {
      console.error('[EconomySyncEngine] Mid-sync network error occurred:', syncErr);
      this.emit('sync_error', {
        agentId: targetAgentId,
        error: syncErr.message || String(syncErr),
        totalFetched: totalFetchedCount,
        lastSyncedTimestamp: currentCursor,
      });
      // Mid-sync failure preserves committed delta records and updated cursor without corrupting state!
    } finally {
      this.isSyncing = false;
    }

    const updatedTransactions = await localCache.getTransactions(targetAgentId);
    this.emit('sync_completed', {
      agentId: targetAgentId,
      totalFetched: totalFetchedCount,
      lastSyncedTimestamp: currentCursor,
      transactions: updatedTransactions,
    });

    return updatedTransactions;
  }

  public getStats() {
    return {
      agentId: this.agentId,
      isSyncing: this.isSyncing,
      isPaused: this.isPaused,
      pausedReason: this.pausedReason,
      hasCapabilitiesManager: Boolean(this.capabilitiesManager),
      requestTimeoutMs: this.requestTimeoutMs,
      batchSize: this.batchSize,
    };
  }

  public destroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
    }
  }
}
