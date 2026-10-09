/**
 * Proactive Background Group Notice Synchronization Engine
 *
 * Automatically fetches historical group notice headers across all joined groups upon session login.
 * Implements a token-bucket rate limiter with priority request queueing to prevent grid RPC burst limits
 * and simulator disconnects. Supports offline pausing and data saver detection.
 */

import { Utils } from './utils';
import type { GroupsManager } from './phase2/groups';
import type { NoticeStore } from './notices';

export type SyncPriority = 'HIGH' | 'NORMAL';

export interface SyncQueueItem {
  groupId: string;
  priority: SyncPriority;
  forceRefresh?: boolean;
  addedAt: number;
}

export interface SyncEngineConfig {
  /** Maximum token capacity for burst requests (default: 2). */
  bucketCapacity?: number;
  /** Tokens added per second (default: 2 tokens/sec = max 2 requests/sec). */
  refillRatePerSec?: number;
  /** Maximum timeout per group notice request in ms (default: 10000 ms). */
  requestTimeoutMs?: number;
  /** Target sync completion time for 100% joined groups in seconds (default: 30s). */
  targetSyncDurationSec?: number;
}

export class GroupNoticeSyncEngine extends Utils.EventEmitter {
  private groupsManager: GroupsManager | null = null;
  private noticeStore: NoticeStore | null = null;

  // Token-Bucket Rate Limiter state
  private bucketCapacity: number;
  private refillRatePerSec: number;
  private tokens: number;
  private lastRefillTimestamp: number;

  // Queue state
  private queue: SyncQueueItem[] = [];
  private activeSyncGroupIds: Set<string> = new Set();
  private processingTimer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout> | null =
    null;

  // Execution state
  private isRunning = false;
  private isPaused = false;
  private pausedReason: string | null = null;
  private agentId: string | null = null;

  // Stats & Metrics
  private totalProcessed = 0;
  private successCount = 0;
  private failCount = 0;
  private syncStartTime: number | null = null;
  private syncEndTime: number | null = null;

  // Network & Data Saver event handlers
  private onlineHandler: () => void;
  private offlineHandler: () => void;

  constructor(
    groupsManager?: GroupsManager,
    noticeStore?: NoticeStore,
    config: SyncEngineConfig = {},
  ) {
    super();
    this.groupsManager = groupsManager || null;
    this.noticeStore = noticeStore || null;

    this.bucketCapacity = config.bucketCapacity ?? 2;
    this.refillRatePerSec = config.refillRatePerSec ?? 2;
    this.tokens = this.bucketCapacity;
    this.lastRefillTimestamp = Date.now();

    this.onlineHandler = () => this.handleNetworkRecovery();
    this.offlineHandler = () => this.handleNetworkDegradation('offline');

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
    }
  }

  setGroupsManager(groupsManager: GroupsManager) {
    this.groupsManager = groupsManager;
  }

  setNoticeStore(noticeStore: NoticeStore) {
    this.noticeStore = noticeStore;
  }

  setAgentId(agentId: string) {
    this.agentId = agentId;
  }

  /** Refill token bucket based on elapsed time. */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillTimestamp) / 1000;
    if (elapsedSec > 0) {
      this.tokens = Math.min(this.bucketCapacity, this.tokens + elapsedSec * this.refillRatePerSec);
      this.lastRefillTimestamp = now;
    }
  }

  /** Try to consume a token. Returns true if available. */
  private consumeToken(): boolean {
    this.refillTokens();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Check whether background sync should be paused due to network or data saver. */
  public isDataSaverOrOffline(): { paused: boolean; reason: string | null } {
    if (typeof navigator !== 'undefined') {
      if (navigator.onLine === false) {
        return { paused: true, reason: 'Device is offline' };
      }
      const conn = (navigator as any).connection;
      if (conn?.saveData === true) {
        return { paused: true, reason: 'Cellular Data Saver mode is active' };
      }
    }
    return { paused: false, reason: null };
  }

  /**
   * Start background synchronization across joined groups.
   */
  startSync(
    groups: Array<string | { id: string }>,
    options: { force?: boolean; agentId?: string } = {},
  ): void {
    if (options.agentId) {
      this.agentId = options.agentId;
      if (this.noticeStore) {
        this.noticeStore.setAgentId(options.agentId);
      }
    }

    const groupIds = groups
      .map((g) => (typeof g === 'string' ? g : g.id))
      .filter((id): id is string => Boolean(id && typeof id === 'string'));

    this.isRunning = true;
    this.syncStartTime = Date.now();
    this.syncEndTime = null;

    // Check data saver or offline status
    const networkCheck = this.isDataSaverOrOffline();
    if (networkCheck.paused) {
      this.pause(networkCheck.reason || 'Network restricted');
    }

    // Enqueue all joined groups for NORMAL priority background sync
    for (const gid of groupIds) {
      this.enqueueGroup(gid, 'NORMAL', options.force ?? false);
    }

    if (this.queue.length === 0) {
      this.checkSyncCompletion();
      return;
    }

    this.emit('sync_started', {
      totalGroups: groupIds.length,
      queuedGroups: this.queue.length,
      startTime: this.syncStartTime,
    });

    this.scheduleQueueProcessor();
  }

  /**
   * Enqueue a single group request into the priority queue.
   */
  enqueueGroup(
    groupId: string,
    priority: SyncPriority = 'NORMAL',
    forceRefresh: boolean = false,
  ): void {
    if (!groupId) return;

    // Avoid duplicate queueing if already queued or currently syncing
    const existingIndex = this.queue.findIndex((item) => item.groupId === groupId);
    if (existingIndex >= 0) {
      // If higher priority request comes in, upgrade priority
      if (priority === 'HIGH' && this.queue[existingIndex].priority !== 'HIGH') {
        this.queue[existingIndex].priority = 'HIGH';
        if (forceRefresh) this.queue[existingIndex].forceRefresh = true;
        this.sortQueue();
      }
      return;
    }

    this.queue.push({
      groupId,
      priority,
      forceRefresh,
      addedAt: Date.now(),
    });

    this.sortQueue();

    if (this.isRunning && !this.isPaused) {
      this.scheduleQueueProcessor();
    }
  }

  /**
   * Priority queue sorting: HIGH priority items first, then FIFO by addedAt timestamp.
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === 'HIGH' ? -1 : 1;
      }
      return a.addedAt - b.addedAt;
    });
  }

  /** Schedule processing loop. */
  private scheduleQueueProcessor(): void {
    if (this.processingTimer) return;

    this.processingTimer = setTimeout(() => {
      this.processingTimer = null;
      this.processNextQueueItem();
    }, 50);
  }

  /** Process next item in priority queue with token bucket rate limiting. */
  private async processNextQueueItem(): Promise<void> {
    if (!this.isRunning || this.isPaused || this.queue.length === 0) {
      this.checkSyncCompletion();
      return;
    }

    // Re-check network / data saver
    const networkCheck = this.isDataSaverOrOffline();
    if (networkCheck.paused) {
      this.pause(networkCheck.reason || 'Network restricted');
      return;
    }

    // Token-bucket rate limiting check
    if (!this.consumeToken()) {
      // Throttled due to rate limiting - schedule next check in 250ms
      this.emit('rate_limit_throttled', { queueLength: this.queue.length });
      this.processingTimer = setTimeout(() => {
        this.processingTimer = null;
        this.processNextQueueItem();
      }, 250);
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeSyncGroupIds.add(item.groupId);
    this.emit('group_sync_start', { groupId: item.groupId, priority: item.priority });

    try {
      if (this.groupsManager) {
        const notices = await this.groupsManager.requestGroupNotices(item.groupId, {
          forceRefresh: item.forceRefresh,
          noticeStore: this.noticeStore || undefined,
        });

        this.totalProcessed++;
        this.successCount++;
        this.emit('group_sync_complete', {
          groupId: item.groupId,
          noticeCount: notices.length,
          success: true,
        });
      } else {
        this.totalProcessed++;
        this.successCount++;
        this.emit('group_sync_complete', {
          groupId: item.groupId,
          noticeCount: 0,
          success: true,
        });
      }
    } catch (err) {
      this.totalProcessed++;
      this.failCount++;
      this.emit('group_sync_complete', {
        groupId: item.groupId,
        noticeCount: 0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.activeSyncGroupIds.delete(item.groupId);
      // Process next item
      if (this.queue.length > 0) {
        this.scheduleQueueProcessor();
      } else {
        this.checkSyncCompletion();
      }
    }
  }

  private checkSyncCompletion(): void {
    if (this.queue.length === 0 && this.activeSyncGroupIds.size === 0 && this.isRunning) {
      this.syncEndTime = Date.now();
      const durationMs = this.syncStartTime ? this.syncEndTime - this.syncStartTime : 0;

      this.emit('sync_completed', {
        totalGroups: this.totalProcessed,
        successCount: this.successCount,
        failCount: this.failCount,
        durationMs,
        withinTarget30s: durationMs <= 30000,
      });

      // Run 90-day / 50MB storage cleanup policy
      if (this.noticeStore) {
        this.noticeStore.purgeExpiredOrExcessNotices(90, 50 * 1024 * 1024).catch(() => {});
      }
    }
  }

  pause(reason: string = 'Paused'): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.pausedReason = reason;
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    this.emit('sync_paused', { reason });
  }

  resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.pausedReason = null;
    this.emit('sync_resumed');
    if (this.isRunning && this.queue.length > 0) {
      this.scheduleQueueProcessor();
    }
  }

  stop(): void {
    this.isRunning = false;
    this.queue = [];
    this.activeSyncGroupIds.clear();
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
  }

  private handleNetworkDegradation(reason: string): void {
    this.pause(`Network degraded: ${reason}`);
  }

  private handleNetworkRecovery(): void {
    if (this.isPaused) {
      this.resume();
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      pausedReason: this.pausedReason,
      queueLength: this.queue.length,
      activeSyncCount: this.activeSyncGroupIds.size,
      totalProcessed: this.totalProcessed,
      successCount: this.successCount,
      failCount: this.failCount,
      tokensAvailable: this.tokens,
      lastSyncDurationMs:
        this.syncStartTime && this.syncEndTime ? this.syncEndTime - this.syncStartTime : null,
    };
  }

  destroy(): void {
    this.stop();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
    }
  }
}
