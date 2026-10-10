// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewerSession } from '../../../core/viewer-session.cjs';
import { METHODS } from '../../../core/viewer-api.cjs';
import { slBridge } from '../sl-bridge';
import { NoticeStore } from '../notices';
import { GroupsManager } from '../phase2/groups';
import { app } from '../app';

describe('On-demand historical group notice retrieval via grid RPC', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('viewer-api.cjs includes getGroupNotices and getGroupNoticeDetail in METHODS set', () => {
    expect(METHODS.has('getGroupNotices')).toBe(true);
    expect(METHODS.has('getGroupNoticeDetail')).toBe(true);
  });

  it('ViewerSession implements getGroupNotices and getGroupDetails section notices', async () => {
    const mockNotices = [
      {
        NoticeID: 'notice-uuid-101',
        GroupID: '00000000-0000-0000-0000-000000000001',
        Subject: 'Historical Announcement',
        Message: 'Welcome to the historical event.',
        FromName: 'Admin Resident',
        Timestamp: 1700000000,
        HasAttachment: true,
        AttachmentItemName: 'Event Landmark',
        AttachmentItemID: 'item-uuid-201',
        AttachmentType: 3,
        AttachmentOwnerID: 'owner-uuid-301',
      },
    ];

    const groupsCmd = {
      getGroupNotices: vi.fn().mockResolvedValue(mockNotices),
      getGroupProfile: vi.fn(),
      getMemberList: vi.fn(),
      getGroupRoles: vi.fn(),
    };

    const session = new ViewerSession(() => undefined);
    session.bot = { clientCommands: { groups: groupsCmd } } as any;

    const notices = await session.getGroupNotices({
      groupId: '00000000-0000-0000-0000-000000000001',
    });
    expect(groupsCmd.getGroupNotices).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      id: 'notice-uuid-101',
      subject: 'Historical Announcement',
      from: 'Admin Resident',
      hasAttachment: true,
      attachmentName: 'Event Landmark',
      attachmentItemId: 'item-uuid-201',
      attachmentType: 3,
    });

    const detailsNotices = await (session as any).getGroupDetails({
      groupId: '00000000-0000-0000-0000-000000000001',
      section: 'notices',
    });
    expect(detailsNotices).toEqual(notices);
  });

  it('GroupsManager exposes fetchGroupNotices and merges records into NoticeStore', async () => {
    const store = new NoticeStore();
    const manager = new GroupsManager(null, undefined, store);

    const mockNoticeList = [
      {
        id: 'notice-hist-1',
        groupId: 'g-123',
        subject: 'Merged Notice',
        message: 'Notice detail text',
        from: 'Group Host',
        timestamp: 1700000100,
      },
    ];

    vi.spyOn(manager, 'requestGroupNotices').mockResolvedValue(mockNoticeList as any);

    const result = await manager.fetchGroupNotices('g-123');
    expect(result).toHaveLength(1);
    expect(store.get('notice-hist-1')).not.toBeNull();
    expect(store.get('notice-hist-1')?.subject).toBe('Merged Notice');
  });

  it('NoticeStore deduplicates live event streaming and historical RPC backfill by notice UUID', () => {
    const store = new NoticeStore();

    // Receive live notice streaming packet
    const liveNotice = store.receive({
      id: 'notice-uuid-999',
      groupId: 'group-x',
      subject: 'Live Stream Notice',
      message: 'Arrived live via EventQueue',
      from: 'Live Host',
      timestamp: 1700000000,
    });
    expect(liveNotice?.subject).toBe('Live Stream Notice');
    expect(store.list()).toHaveLength(1);

    // Historical RPC backfill arrives containing same notice UUID
    const backfillNotice = store.receive({
      id: 'notice-uuid-999',
      groupId: 'group-x',
      subject: 'Live Stream Notice',
      message: 'Arrived live via EventQueue',
      from: 'Live Host',
      timestamp: 1700000000,
    });

    // Same notice returned, no duplicates created in store
    expect(backfillNotice?.id).toBe('notice-uuid-999');
    expect(store.list()).toHaveLength(1);
  });

  it('slBridge exposes fetchGroupNotices and calls viewer session RPC', async () => {
    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
    const callSpy = vi
      .spyOn(slBridge as any, 'call')
      .mockResolvedValue([{ id: 'n1', subject: 'RPC Notice' }]);

    const res = await slBridge.fetchGroupNotices('g-abc');
    expect(callSpy).toHaveBeenCalledWith('getGroupNotices', { groupId: 'g-abc' });
    expect(res).toEqual([{ id: 'n1', subject: 'RPC Notice' }]);
  });

  it('LinkpointApp.loadGroupDetails populates NoticeStore and GroupsManager when loading notices', async () => {
    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
    vi.spyOn(slBridge, 'sessionId', 'get').mockReturnValue('session-1');
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);

    const fetchedNotices = [
      {
        id: 'notice-rpc-55',
        groupId: 'group-55',
        subject: 'Weekly Meeting',
        message: 'Don’t forget the meeting.',
        from: 'President',
        timestamp: 1700000200,
      },
    ];

    vi.spyOn(slBridge, 'fetchGroupDetails').mockResolvedValue(fetchedNotices);

    const result = await app.loadGroupDetails('group-55', 'notices');
    expect(result).toEqual(fetchedNotices);
    expect(app.notices.get('notice-rpc-55')).not.toBeNull();
    expect(app.groups.getGroupNotices('group-55')).toHaveLength(1);
  });
});
