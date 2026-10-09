import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MuteFlag, MuteList, MuteType } from '../mute-list';
import { ChatExtended } from '../phase2/chat-extended';
import { indexedDBStore } from '../indexeddb-store';

const AGENT_A = '11111111-2222-3333-4444-555555555555';
const AGENT_B = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OBJECT_A = '99999999-8888-7777-6666-555555555555';

describe('Dual-tier synchronized mute engine with persistent local caching', () => {
  let transportUpdates: any[];
  let transportRemoves: any[];
  let transportRequests: number;
  let transportFail: boolean;

  const mockTransport = {
    update: vi.fn(async (entry) => {
      if (transportFail) throw new Error('Network error');
      transportUpdates.push(entry);
      return { sent: true };
    }),
    remove: vi.fn(async (entry) => {
      if (transportFail) throw new Error('Network error');
      transportRemoves.push(entry);
      return { sent: true };
    }),
    request: vi.fn(async () => {
      if (transportFail) throw new Error('Network error');
      transportRequests++;
      return { requested: true };
    }),
  };

  beforeEach(() => {
    transportUpdates = [];
    transportRemoves = [];
    transportRequests = 0;
    transportFail = false;
    vi.clearAllMocks();
  });

  it('persists mute entries to IndexedDB key mutelist_<agent_id> and reloads across sessions', async () => {
    const list1 = new MuteList(mockTransport);
    list1.setSelfId(AGENT_A);

    // Add mute entries
    expect(list1.add({ id: AGENT_B, name: 'Harasser Resident', type: MuteType.AGENT })).toBe(true);
    expect(list1.add({ id: OBJECT_A, name: 'Spam Emitter', type: MuteType.OBJECT })).toBe(true);
    expect(list1.add({ name: 'Spammer Legacy', type: MuteType.BY_NAME })).toBe(true);

    // Wait for async IDB save to finish
    await Promise.resolve();
    await Promise.resolve();

    // Verify IndexedDB has stored mutelist_<agent_id>
    const cached = await indexedDBStore.getMuteList(AGENT_A);
    expect(cached).not.toBeNull();
    expect(cached?.agentId).toBe(AGENT_A);
    expect(cached?.mutes).toHaveLength(2);
    expect(cached?.legacy).toContain('Spammer Legacy');

    // Simulate new session / app reload with new MuteList instance
    const list2 = new MuteList(mockTransport);
    list2.setSelfId(AGENT_A);

    await list2.loadFromCache();
    expect(list2.isMuted(AGENT_B)).toBe(true);
    expect(list2.isMuted(OBJECT_A)).toBe(true);
    expect(list2.isMuted(OBJECT_A, 'Spammer Legacy')).toBe(true);
  });

  it('maintains offline write queue when offline/disconnected and flushes queue upon reconnect', async () => {
    // Start offline (transport fails)
    transportFail = true;
    const offlineList = new MuteList(mockTransport);
    offlineList.setSelfId(AGENT_A);

    // Add mute while offline
    expect(offlineList.add({ id: AGENT_B, name: 'Offline Harasser', type: MuteType.AGENT })).toBe(true);
    await Promise.resolve(); await Promise.resolve();

    // Verify item is added locally and queued in pendingQueue
    expect(offlineList.isMuted(AGENT_B)).toBe(true);
    let snap = offlineList.snapshot();
    expect(snap.pendingQueue).toHaveLength(1);
    expect(snap.pendingQueue[0].entry.id).toBe(AGENT_B);

    // Re-enable network / restore connection
    transportFail = false;
    await offlineList.flushPendingQueue();

    // Verify queue was flushed to transport
    expect(mockTransport.update).toHaveBeenCalled();
    snap = offlineList.snapshot();
    expect(snap.pendingQueue).toHaveLength(0);
  });

  it('automatically requests mute list on grid connection when state is unloaded', () => {
    const list = new MuteList(mockTransport);
    expect(list.state).toBe('unloaded');

    const requested = list.requestGridSync();
    expect(requested).toBe(true);
    expect(list.state).toBe('requested');
    expect(mockTransport.request).toHaveBeenCalledTimes(1);
  });

  it('reconciles remote grid response while preserving pending offline modifications', async () => {
    // Offline addition
    transportFail = true;
    const list = new MuteList(mockTransport);
    list.setSelfId(AGENT_A);
    list.add({ id: AGENT_B, name: 'Offline Resident', type: MuteType.AGENT });
    await Promise.resolve(); await Promise.resolve();

    // Grid sends remote list that arrives later
    transportFail = false;
    list.load({
      state: 'loaded',
      mutes: [{ id: OBJECT_A, name: 'Grid Object', type: MuteType.OBJECT, flags: 0 }],
      legacy: ['Grid Legacy'],
    });

    // Verify both remote grid items AND pending local changes exist
    expect(list.isMuted(OBJECT_A)).toBe(true);
    expect(list.isMuted(OBJECT_A, 'Grid Legacy')).toBe(true);
    expect(list.isMuted(AGENT_B)).toBe(true); // preserved offline edit!
  });

  it('does NOT trigger grid network sync calls for MuteType.EXTERNAL entries', async () => {
    const list = new MuteList(mockTransport);
    list.setSelfId(AGENT_A);

    list.add({ id: OBJECT_A, name: 'External Local Item', type: MuteType.EXTERNAL });
    await Promise.resolve();

    expect(list.isMuted(OBJECT_A)).toBe(true);
    expect(mockTransport.update).not.toHaveBeenCalled();
    expect(list.snapshot().pendingQueue).toHaveLength(0);
  });

  it('delegates ChatExtended mute checks and filtering directly to unified MuteList', () => {
    const list = new MuteList();
    const chat = new ChatExtended();
    chat.attachGridMuteList(list);

    chat.muteUser(AGENT_B);
    chat.muteObject(OBJECT_A);

    expect(chat.isUserMuted(AGENT_B)).toBe(true);
    expect(chat.isObjectMuted(OBJECT_A)).toBe(true);

    // Filter incoming message
    expect(chat.shouldDisplayMessage({ fromId: AGENT_B, fromName: 'Harasser', text: 'Spam' })).toBe(false);
    expect(chat.shouldDisplayMessage({ fromId: OBJECT_A, fromName: 'Spam Box', text: 'Spam' })).toBe(false);

    // Unmute
    chat.unmuteUser(AGENT_B);
    expect(chat.isUserMuted(AGENT_B)).toBe(false);
    expect(chat.shouldDisplayMessage({ fromId: AGENT_B, fromName: 'Harasser', text: 'Hello' })).toBe(true);
  });
});
