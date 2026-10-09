import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GroupNoticeSyncEngine } from '../group-notice-sync-engine';
import { NoticeStore } from '../notices';
import { GroupsManager } from '../phase2/groups';
import { indexedDBStore } from '../indexeddb-store';

describe('GroupNoticeSyncEngine', () => {
  let noticeStore: NoticeStore;
  let groupsManager: GroupsManager;
  let syncEngine: GroupNoticeSyncEngine;

  beforeEach(() => {
    noticeStore = new NoticeStore(null, null);
    groupsManager = new GroupsManager(null, undefined, noticeStore);
    syncEngine = new GroupNoticeSyncEngine(groupsManager, noticeStore, {
      bucketCapacity: 2,
      refillRatePerSec: 10, // speed up tests
    });
  });

  afterEach(() => {
    syncEngine.destroy();
  });

  it('starts sync automatically for joined groups upon login', async () => {
    const mockGroups = [
      { id: 'group-1', name: 'Group 1' },
      { id: 'group-2', name: 'Group 2' },
      { id: 'group-3', name: 'Group 3' },
    ];

    const spyRequest = vi.spyOn(groupsManager, 'requestGroupNotices').mockResolvedValue([
      {
        id: 'notice-1',
        groupId: 'group-1',
        subject: 'Welcome',
        message: 'Hello Group',
        from: 'Admin',
        timestamp: Date.now(),
        calendar: null,
        attachment: null,
      },
    ]);

    const syncStartedPromise = new Promise((resolve) => syncEngine.once('sync_started', resolve));
    const syncCompletedPromise = new Promise((resolve) =>
      syncEngine.once('sync_completed', resolve),
    );

    syncEngine.startSync(mockGroups, { agentId: 'test-agent' });

    await syncStartedPromise;
    await syncCompletedPromise;

    expect(spyRequest).toHaveBeenCalledTimes(3);
    const stats = syncEngine.getStats();
    expect(stats.totalProcessed).toBe(3);
    expect(stats.successCount).toBe(3);
  });

  it('enforces token-bucket rate limiting and priority queue', async () => {
    const callOrder: string[] = [];

    vi.spyOn(groupsManager, 'requestGroupNotices').mockImplementation(async (groupId) => {
      callOrder.push(groupId);
      return [];
    });

    // Enqueue 4 groups: 2 normal priority, then 1 high priority, then 1 normal priority
    syncEngine.enqueueGroup('group-normal-1', 'NORMAL');
    syncEngine.enqueueGroup('group-normal-2', 'NORMAL');
    syncEngine.enqueueGroup('group-high-1', 'HIGH');
    syncEngine.enqueueGroup('group-normal-3', 'NORMAL');

    syncEngine.startSync([], { agentId: 'test-agent' });

    await new Promise((resolve) => syncEngine.once('sync_completed', resolve));

    // High priority item should be processed before normal priority items
    expect(callOrder[0]).toBe('group-high-1');
    expect(callOrder).toEqual([
      'group-high-1',
      'group-normal-1',
      'group-normal-2',
      'group-normal-3',
    ]);
  });

  it('persists group notices in IndexedDB and hydrates them for offline access', async () => {
    const mockNotices = [
      {
        id: 'notice-idb-1',
        groupId: 'group-offline-1',
        subject: 'Offline Announcement',
        message: 'Stored in IDB',
        from: 'Officer',
        timestamp: Date.now() - 1000,
        calendar: null,
        attachment: {
          hasAttachment: true,
          attachmentName: 'Free Gift',
          attachmentItemId: 'item-123',
          attachmentType: 6,
          attachmentOwnerId: 'owner-123',
          savedToInventoryAt: null,
        },
      },
    ];

    await indexedDBStore.saveGroupNotices('agent-idb', 'group-offline-1', mockNotices);

    const freshStore = new NoticeStore(null, null);
    await freshStore.hydrateFromIndexedDB('agent-idb');

    const cache = freshStore.getGroupCache('group-offline-1', 600000);
    expect(cache).not.toBeNull();
    expect(cache?.notices.length).toBe(1);
    expect(cache?.notices[0].subject).toBe('Offline Announcement');
    expect(cache?.notices[0].attachment?.attachmentName).toBe('Free Gift');
  });

  it('enforces 90-day age cleanup policy for historical notices', async () => {
    const oldTimestamp = Date.now() - 91 * 24 * 60 * 60 * 1000; // 91 days old
    const newTimestamp = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days old

    noticeStore.setAgentId('agent-cleanup');

    await indexedDBStore.saveGroupNotices('agent-cleanup', 'group-1', [
      {
        id: 'notice-old',
        groupId: 'group-1',
        subject: 'Old',
        message: 'Old',
        from: 'Admin',
        timestamp: oldTimestamp,
      },
      {
        id: 'notice-new',
        groupId: 'group-1',
        subject: 'New',
        message: 'New',
        from: 'Admin',
        timestamp: newTimestamp,
      },
    ]);

    await noticeStore.setGroupCache('group-1', [
      {
        id: 'notice-old',
        groupId: 'group-1',
        subject: 'Old',
        message: 'Old',
        from: 'Admin',
        timestamp: oldTimestamp,
        calendar: null,
        attachment: null,
      },
      {
        id: 'notice-new',
        groupId: 'group-1',
        subject: 'New',
        message: 'New',
        from: 'Admin',
        timestamp: newTimestamp,
        calendar: null,
        attachment: null,
      },
    ]);

    const result = await noticeStore.purgeExpiredOrExcessNotices(90, 50 * 1024 * 1024);
    expect(result.purged).toBeGreaterThanOrEqual(1);

    const remainingInDb = await indexedDBStore.getGroupNotices('agent-cleanup', 'group-1');
    expect(remainingInDb.some((n) => n.id === 'notice-old')).toBe(false);
    expect(remainingInDb.some((n) => n.id === 'notice-new')).toBe(true);
  });

  it('pauses and resumes queue processing when network state changes', async () => {
    syncEngine.pause('Data Saver mode active');
    const stats = syncEngine.getStats();
    expect(stats.isPaused).toBe(true);
    expect(stats.pausedReason).toBe('Data Saver mode active');

    syncEngine.resume();
    const resumedStats = syncEngine.getStats();
    expect(resumedStats.isPaused).toBe(false);
  });
});
