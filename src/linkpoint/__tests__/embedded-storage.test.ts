import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactsStore } from '../contacts';
import { NoticeStore } from '../notices';
import { ChatExtended } from '../phase2/chat-extended';
import { ChatProtocolAdapter } from '../chat-protocol-adapter';
import { IndexedDBStore } from '../indexeddb-store';
import { Utils } from '../utils';

const restores: Array<() => void> = [];

function denyStorage(target: object, key: string) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, {
    configurable: true,
    get() {
      throw new DOMException('Storage access denied in embedded preview', 'SecurityError');
    },
  });
  restores.push(() => {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  });
}

afterEach(() => {
  restores
    .splice(0)
    .reverse()
    .forEach((restore) => restore());
  Utils.storage.memoryStore.clear();
  vi.restoreAllMocks();
});

describe('embedded previews with denied storage getters', () => {
  it('keeps viewer preferences in memory when localStorage cannot be accessed', () => {
    denyStorage(globalThis, 'localStorage');
    expect(Utils.storage.set('preview-preferences', { volume: 0.5 })).toBe(true);
    expect(Utils.storage.get('preview-preferences')).toEqual({ volume: 0.5 });
    expect(Utils.storage.remove('preview-preferences')).toBe(true);
    expect(Utils.storage.get('preview-preferences')).toBeNull();
  });

  it('constructs contacts and notices and retains received data for the session', () => {
    denyStorage(globalThis, 'localStorage');
    const contacts = new ContactsStore();
    const notices = new NoticeStore();
    contacts.saveFriends([{ id: 'friend-id', name: 'Friend Resident' }]);
    expect(contacts.get('friend-id')?.name).toBe('Friend Resident');
    const notice = notices.receive({
      id: 'notice-id',
      groupId: 'group-id',
      fromName: 'Officer',
      subject: 'Group meeting',
      message: 'Meeting reminder',
      timestamp: 1000,
    });
    expect(notice).not.toBeNull();
    expect(notices.list()).toEqual([notice]);
  });

  it('allows chat initialization and mute changes without persistent storage', () => {
    denyStorage(globalThis, 'localStorage');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chat = new ChatExtended(new ChatProtocolAdapter(new Utils.EventEmitter()));
    chat.muteUser('Muted Resident');
    expect(chat.isUserMuted('Muted Resident')).toBe(true);
    chat.unmuteUser('Muted Resident');
    expect(chat.isUserMuted('Muted Resident')).toBe(false);
  });

  it('uses the IndexedDB memory fallback when the API getter throws', async () => {
    denyStorage(window, 'indexedDB');
    const store = new IndexedDBStore();
    await store.saveFolders('preview-agent', [{ id: 'folder-id', parent: 'root', name: 'Folder' }]);
    const page = await store.getFolderContentsPage('preview-agent', 'root', 1, 20);
    expect(page.totalFolders).toBe(1);
    expect(page.folders[0]?.id).toBe('folder-id');
  });
});
