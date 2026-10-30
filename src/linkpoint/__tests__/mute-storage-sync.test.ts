import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { ChatExtended } from '../phase2/chat-extended';
import { slBridge } from '../sl-bridge';
import { MuteFlag, MuteList, MuteType } from '../mute-list';

describe('Grid RPC mute sync and localStorage fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    slBridge.connected = false;
    vi.restoreAllMocks();
  });

  it('connected event in app.ts calls slBridge.requestMuteList()', async () => {
    await app.init();
    slBridge.connected = true;
    const spy = vi.spyOn(slBridge, 'requestMuteList').mockResolvedValue({ requested: true });
    app.protocol.emit('connected', { world_data: {} });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('localStorage stores muted user IDs and object names', () => {
    const chat = new ChatExtended();
    chat.muteUser('user-uuid-1');
    chat.muteObject('Annoying Object');

    const storedUsers = JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]');
    const storedObjects = JSON.parse(localStorage.getItem('linkpoint_muted_objects') || '[]');

    expect(storedUsers).toContain('user-uuid-1');
    expect(storedObjects).toContain('Annoying Object');
  });

  it('reloading the page restores local mutes from localStorage', () => {
    localStorage.setItem('linkpoint_muted_users', JSON.stringify(['restored-user-id']));
    localStorage.setItem('linkpoint_muted_objects', JSON.stringify(['restored-object-name']));

    const newChatInstance = new ChatExtended();

    expect(newChatInstance.isUserMuted('restored-user-id')).toBe(true);
    expect(newChatInstance.isObjectMuted('restored-object-name')).toBe(true);
    expect(newChatInstance.getMutedUsers()).toContain('restored-user-id');
    expect(newChatInstance.getMutedObjects()).toContain('restored-object-name');
  });

  it('unmuting users and objects updates localStorage accordingly', () => {
    const chat = new ChatExtended();
    chat.muteUser('user-to-unmute');
    chat.muteObject('object-to-unmute');

    expect(JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]')).toContain(
      'user-to-unmute',
    );
    expect(JSON.parse(localStorage.getItem('linkpoint_muted_objects') || '[]')).toContain(
      'object-to-unmute',
    );

    chat.unmuteUser('user-to-unmute');
    chat.unmuteObject('object-to-unmute');

    expect(JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]')).not.toContain(
      'user-to-unmute',
    );
    expect(JSON.parse(localStorage.getItem('linkpoint_muted_objects') || '[]')).not.toContain(
      'object-to-unmute',
    );
  });

  it('mute updates made while online send RPC messages to the grid', async () => {
    const updateSpy = vi.spyOn(slBridge, 'updateMuteEntry').mockResolvedValue({ sent: true });
    const removeSpy = vi.spyOn(slBridge, 'removeMuteEntry').mockResolvedValue({ sent: true });

    const gridMuteList = new MuteList({
      update: (entry) => slBridge.updateMuteEntry(entry),
      remove: (entry) => slBridge.removeMuteEntry(entry),
    });

    const chat = new ChatExtended();
    chat.attachGridMuteList(gridMuteList);

    const testUuid = '12345678-1234-1234-1234-123456789012';
    chat.muteUser(testUuid);

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: testUuid,
        type: MuteType.AGENT,
      }),
    );

    chat.unmuteUser(testUuid);

    expect(removeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: testUuid,
      }),
    );
  });

  it('standalone ChatExtended calls SLBridge RPCs when connected', async () => {
    slBridge.connected = true;
    const updateSpy = vi.spyOn(slBridge, 'updateMuteEntry').mockResolvedValue({ sent: true });
    const removeSpy = vi.spyOn(slBridge, 'removeMuteEntry').mockResolvedValue({ sent: true });

    const chat = new ChatExtended();
    const testUserUuid = '87654321-4321-4321-4321-210987654321';
    const testObjUuid = '11223344-5566-7788-9900-aabbccddeeff';

    chat.muteUser(testUserUuid);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: testUserUuid,
        type: MuteType.AGENT,
      }),
    );
    expect(JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]')).toContain(
      testUserUuid,
    );

    chat.muteObject(testObjUuid);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: testObjUuid,
        type: MuteType.OBJECT,
      }),
    );
    expect(JSON.parse(localStorage.getItem('linkpoint_muted_objects') || '[]')).toContain(
      testObjUuid,
    );

    chat.unmuteUser(testUserUuid);
    expect(removeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: testUserUuid,
      }),
    );

    chat.unmuteObject(testObjUuid);
    expect(removeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: testObjUuid,
      }),
    );
  });

  it('offline writes stay in browser local storage without dispatching RPCs', () => {
    slBridge.connected = false;
    const updateSpy = vi.spyOn(slBridge, 'updateMuteEntry');
    const removeSpy = vi.spyOn(slBridge, 'removeMuteEntry');

    const chat = new ChatExtended();
    chat.muteUser('offline-user-1');
    chat.muteObject('offline-object-1');

    expect(updateSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    expect(JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]')).toContain(
      'offline-user-1',
    );
    expect(JSON.parse(localStorage.getItem('linkpoint_muted_objects') || '[]')).toContain(
      'offline-object-1',
    );
  });

  it('grid mute list events update browser local storage with remote entries', () => {
    const chat = new ChatExtended();

    chat.reconcileGridMutes({
      mutes: [
        {
          id: '12345678-aaaa-bbbb-cccc-111122223333',
          name: 'Remote Resident',
          type: MuteType.AGENT,
          flags: 0,
        },
        {
          id: '87654321-cccc-bbbb-aaaa-333322221111',
          name: 'Remote Object',
          type: MuteType.OBJECT,
          flags: 0,
        },
      ],
      legacy: ['Legacy Remote Resident'],
    });

    const storedUsers = JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]');
    const storedObjects = JSON.parse(localStorage.getItem('linkpoint_muted_objects') || '[]');

    expect(storedUsers).toContain('12345678-aaaa-bbbb-cccc-111122223333');
    expect(storedUsers).toContain('Legacy Remote Resident');
    expect(storedObjects).toContain('87654321-cccc-bbbb-aaaa-333322221111');
  });

  it('reconcileGridMutes handles UUID and name case differences without duplicating', () => {
    localStorage.setItem(
      'linkpoint_muted_users',
      JSON.stringify(['12345678-ABCD-1234-1234-123456789012', 'Jane Doe']),
    );

    const chat = new ChatExtended();
    chat.reconcileGridMutes({
      mutes: [
        {
          id: '12345678-abcd-1234-1234-123456789012',
          name: 'Jane Doe',
          type: MuteType.AGENT,
          flags: 0,
        },
      ],
      legacy: ['jane doe'],
    });

    const storedUsers = JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]');
    expect(storedUsers.length).toBe(2);
  });
});
