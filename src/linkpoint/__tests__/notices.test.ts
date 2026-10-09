// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_NOTICES, NOTICES_STORAGE_KEY, NoticeStore } from '../notices';
import { Utils } from '../utils';

beforeEach(() => localStorage.clear());
const sent = (over: any = {}) => ({
  id: 'n1',
  groupId: 'g1',
  fromName: 'Officer',
  subject: 'Dance Saturday 7pm',
  message: 'Bring friends',
  timestamp: 1000,
  ...over,
});

describe('NoticeStore', () => {
  it('stores notices the grid sends, newest first, ignoring repeats', () => {
    const protocol = new Utils.EventEmitter();
    const store = new NoticeStore(protocol as any);
    store.init();
    const received = vi.fn();
    store.on('notice_received', received);
    protocol.emit('group_notice', sent());
    protocol.emit('group_notice', sent({ id: 'n2', timestamp: 2000, subject: 'Later' }));
    protocol.emit('group_notice', sent());
    expect(store.list().map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(received).toHaveBeenCalledTimes(2);
    expect(store.get('n1')).toMatchObject({
      subject: 'Dance Saturday 7pm',
      from: 'Officer',
      groupId: 'g1',
      calendar: null,
    });
  });

  it('receives both group_notice and group-notice events idempotently', () => {
    const protocol = new Utils.EventEmitter();
    const store = new NoticeStore(protocol as any);
    store.init();
    store.init(); // Test idempotency of init()
    protocol.emit('group-notice', sent({ id: 'n3', subject: 'Hyphen Notice' }));
    protocol.emit('group_notice', sent({ id: 'n4', subject: 'Snake Notice' }));
    expect(store.get('n3')?.subject).toBe('Hyphen Notice');
    expect(store.get('n4')?.subject).toBe('Snake Notice');
  });

  it('gives a notice with no id its own id, and rejects non-objects', () => {
    const store = new NoticeStore();
    expect(store.receive(null)).toBeNull();
    expect(store.receive('text')).toBeNull();
    const a = store.receive({ subject: 'A' })!;
    const b = store.receive({ subject: 'B' })!;
    expect(a.id).not.toBe(b.id);
    expect(a.from).toBe('Resident');
  });

  it('survives a reload', () => {
    new NoticeStore().receive(sent());
    expect(new NoticeStore().get('n1')!.message).toBe('Bring friends');
  });

  it('remembers what was added to a calendar so it is not added twice', () => {
    const store = new NoticeStore();
    store.receive(sent());
    store.markAdded('n1', {
      eventId: 'abc123',
      link: 'https://www.google.com/calendar/event?eid=xyz',
    });
    expect(store.get('n1')!.calendar).toMatchObject({
      eventId: 'abc123',
      link: 'https://www.google.com/calendar/event?eid=xyz',
    });
    expect(new NoticeStore().get('n1')!.calendar!.eventId).toBe('abc123');
    store.clearAdded('n1');
    expect(store.get('n1')!.calendar).toBeNull();
    expect(() => store.markAdded('missing', { eventId: null, link: null })).toThrow(/not saved/);
  });

  it('does not trust stored links or ids', () => {
    localStorage.setItem(
      NOTICES_STORAGE_KEY,
      JSON.stringify({
        notices: [
          {
            id: 'x',
            subject: 'S',
            calendar: { eventId: '../evil', link: 'javascript:alert(1)', addedAt: 5 },
          },
          { id: '', subject: 'no id' },
          null,
          7,
        ],
      }),
    );
    const notice = new NoticeStore().get('x')!;
    expect(notice.calendar).toEqual({ eventId: null, link: null, addedAt: 5 });
  });

  it('keeps at most MAX_NOTICES, dropping the oldest, and can remove or clear', () => {
    const store = new NoticeStore();
    for (let i = 0; i < MAX_NOTICES + 3; i++) store.receive(sent({ id: `n${i}`, timestamp: i }));
    expect(store.list()).toHaveLength(MAX_NOTICES);
    expect(store.get('n0')).toBeNull();
    expect(store.remove('n5')).toBe(true);
    expect(store.remove('n5')).toBe(false);
    store.clear();
    expect(store.list()).toHaveLength(0);
  });

  it('keeps working in memory and says so when storage is full', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    const store = new NoticeStore(null, storage);
    const failed = vi.fn();
    store.on('storage_error', failed);
    store.receive(sent());
    expect(failed).toHaveBeenCalled();
    expect(store.get('n1')).not.toBeNull();
  });

  it('hands a requested notice to the calendar once, and ignores an unknown one', () => {
    const store = new NoticeStore();
    store.receive(sent());
    const changed = vi.fn();
    store.on('focus_changed', changed);
    store.focus('n1');
    expect(changed).toHaveBeenCalledWith('n1');
    expect(store.takeFocus()).toBe('n1');
    expect(store.takeFocus()).toBeNull();
    store.focus('missing');
    expect(store.takeFocus()).toBeNull();
  });

  it('preserves attachment metadata and updates savedToInventoryAt', () => {
    const store = new NoticeStore();
    store.receive(
      sent({
        id: 'att1',
        hasAttachment: true,
        attachmentName: 'Weekly Gift Landmark',
        attachmentItemId: 'item-100',
        attachmentType: 3,
        attachmentOwnerId: 'owner-200',
      }),
    );
    const notice = store.get('att1')!;
    expect(notice.attachment).toMatchObject({
      hasAttachment: true,
      attachmentName: 'Weekly Gift Landmark',
      attachmentItemId: 'item-100',
      attachmentType: 3,
      attachmentOwnerId: 'owner-200',
      savedToInventoryAt: null,
    });
    expect(notice.hasAttachment).toBe(true);

    store.markAttachmentSaved('att1', 5000);
    expect(store.get('att1')!.attachment?.savedToInventoryAt).toBe(5000);
    expect(new NoticeStore().get('att1')!.attachment?.savedToInventoryAt).toBe(5000);
  });

  it('sanitizes legacy saved notices without attachment fields cleanly to attachment: null', () => {
    localStorage.setItem(
      NOTICES_STORAGE_KEY,
      JSON.stringify({
        notices: [
          {
            id: 'legacy1',
            subject: 'Old Notice',
            message: 'Old message',
            from: 'Old Friend',
            timestamp: 100,
          },
        ],
      }),
    );
    const notice = new NoticeStore().get('legacy1')!;
    expect(notice.attachment).toBeNull();
    expect(notice.hasAttachment).toBe(false);
  });

  it('enforces 5-minute TTL group notice caching and persistence across reloads', () => {
    const store = new NoticeStore();
    const notices = [
      {
        id: 'n10',
        groupId: 'g1',
        subject: 'TTL Notice 1',
        message: 'Msg 1',
        from: 'Admin',
        timestamp: 1000,
        calendar: null,
        attachment: null,
      },
    ];
    store.setGroupCache('g1', notices, Date.now());

    expect(store.isGroupCacheValid('g1')).toBe(true);
    const cache = store.getGroupCache('g1')!;
    expect(cache.valid).toBe(true);
    expect(cache.notices[0].subject).toBe('TTL Notice 1');

    // Reload from storage
    const store2 = new NoticeStore();
    expect(store2.isGroupCacheValid('g1')).toBe(true);
    expect(store2.getGroupCache('g1')?.notices[0].subject).toBe('TTL Notice 1');

    // Check expired TTL (6 minutes ago)
    const oldTime = Date.now() - 6 * 60 * 1000;
    store.setGroupCache('g2', notices, oldTime);
    expect(store.isGroupCacheValid('g2')).toBe(false);
    expect(store.getGroupCache('g2')?.valid).toBe(false);
    expect(store.getGroupCache('g2')?.notices).toHaveLength(1);
  });

  it('tracks notice history unavailable status', () => {
    const store = new NoticeStore();
    const statusFn = vi.fn();
    store.on('notice_history_status', statusFn);

    expect(store.isHistoryUnavailable('g1')).toBe(false);
    store.setHistoryUnavailable('g1', true);
    expect(store.isHistoryUnavailable('g1')).toBe(true);
    expect(statusFn).toHaveBeenCalledWith({
      groupId: 'g1',
      unavailable: true,
      isAnyUnavailable: true,
    });

    store.setHistoryUnavailable('g1', false);
    expect(store.isHistoryUnavailable('g1')).toBe(false);
  });
});
