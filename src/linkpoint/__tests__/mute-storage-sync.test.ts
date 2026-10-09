import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { ChatExtended } from '../phase2/chat-extended';
import { slBridge } from '../sl-bridge';
import { MuteFlag, MuteList, MuteType } from '../mute-list';

describe('Grid RPC mute sync and localStorage fallback', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('connected event in app.ts calls slBridge.requestMuteList()', async () => {
    await app.init();
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

    expect(JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]')).toContain('user-to-unmute');
    expect(JSON.parse(localStorage.getItem('linkpoint_muted_objects') || '[]')).toContain('object-to-unmute');

    chat.unmuteUser('user-to-unmute');
    chat.unmuteObject('object-to-unmute');

    expect(JSON.parse(localStorage.getItem('linkpoint_muted_users') || '[]')).not.toContain('user-to-unmute');
    expect(JSON.parse(localStorage.getItem('linkpoint_muted_objects') || '[]')).not.toContain('object-to-unmute');
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
      })
    );

    chat.unmuteUser(testUuid);

    expect(removeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: testUuid,
      })
    );
  });
});
