import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatExtended } from '../phase2/chat-extended';
import { MuteFlag, MuteList, MuteType, isLinden, type MuteEntry } from '../mute-list';

const BOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OBJ = '11111111-1111-1111-1111-111111111111';
const ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NULL = '00000000-0000-0000-0000-000000000000';

let updates: MuteEntry[];
let removes: unknown[];
let list: MuteList;
beforeEach(() => {
  updates = [];
  removes = [];
  list = new MuteList({
    update: async (e) => {
      updates.push(e);
    },
    remove: async (e) => {
      removes.push(e);
    },
  });
  list.setSelfId(ME);
  list.load({ state: 'loaded', mutes: [], legacy: [] });
});

describe('MuteList (LLMuteList)', () => {
  it('muting a resident silences everything: all flag bits cleared', () => {
    expect(list.add({ id: BOB, name: 'Bob Resident', type: MuteType.AGENT })).toBe(true);
    expect(updates).toEqual([{ id: BOB, name: 'Bob Resident', type: 1, flags: 0 }]);
    expect(list.isMuted(BOB)).toBe(true);
    expect(list.isMuted(BOB, '', MuteFlag.TEXT_CHAT)).toBe(true);
  });

  it('muting only some properties sets the others\' bits, and a lookup with a set bit is "not muted"', () => {
    list.add(
      { id: BOB, name: 'Bob', type: MuteType.AGENT },
      MuteFlag.TEXT_CHAT | MuteFlag.VOICE_CHAT,
    );
    expect(updates[0].flags).toBe(MuteFlag.PARTICLES | MuteFlag.OBJECT_SOUNDS);
    expect(list.isMuted(BOB, '', MuteFlag.TEXT_CHAT)).toBe(true);
    expect(list.isMuted(BOB, '', MuteFlag.OBJECT_SOUNDS)).toBe(false);
    expect(list.isMuted(BOB, '', MuteFlag.PARTICLES)).toBe(false);
  });

  it('adding more properties to an existing entry keeps its flags and clears the new bits', () => {
    list.add({ id: BOB, name: 'Bob', type: MuteType.AGENT }, MuteFlag.TEXT_CHAT);
    list.add({ id: BOB, name: 'Bob', type: MuteType.AGENT }, MuteFlag.VOICE_CHAT);
    expect(updates.at(-1)!.flags).toBe(MuteFlag.PARTICLES | MuteFlag.OBJECT_SOUNDS);
    list.add({ id: BOB, name: 'Bob', type: MuteType.AGENT }); // 0 = everything
    expect(updates.at(-1)!.flags).toBe(0);
  });

  it('unmuting some properties updates the entry; unmuting all of what is left removes it', () => {
    list.add({ id: BOB, name: 'Bob', type: MuteType.AGENT });
    expect(list.remove({ id: BOB }, MuteFlag.TEXT_CHAT)).toBe(true);
    expect(updates.at(-1)!.flags).toBe(MuteFlag.TEXT_CHAT);
    expect(list.isMuted(BOB, '', MuteFlag.TEXT_CHAT)).toBe(false);
    expect(list.isMuted(BOB)).toBe(true);
    list.remove({ id: BOB }, MuteFlag.ALL);
    expect(removes).toHaveLength(1);
    expect(list.isMuted(BOB)).toBe(false);
  });

  it('remove with no flags removes the entry and tells the grid; an unknown one is not found', () => {
    list.add({ id: OBJ, name: 'Box', type: MuteType.OBJECT });
    expect(list.remove({ id: OBJ })).toBe(true);
    expect(removes).toEqual([{ id: OBJ, name: 'Box', type: 2, flags: MuteFlag.ALL }]);
    expect(list.remove({ id: OBJ })).toBe(false);
  });

  it('legacy by-name mutes: names only, null id, no duplicates, matched by the exact name', () => {
    expect(list.add({ name: 'Spammy Thing', type: MuteType.BY_NAME })).toBe(true);
    expect(updates[0]).toEqual({ id: NULL, name: 'Spammy Thing', type: 0, flags: 0 });
    expect(list.add({ name: 'Spammy Thing', type: MuteType.BY_NAME })).toBe(false);
    expect(list.add({ name: '', type: MuteType.BY_NAME })).toBe(false);
    expect(list.add({ id: BOB, name: 'x', type: MuteType.BY_NAME })).toBe(false);
    expect(list.isMuted(OBJ, 'Spammy Thing')).toBe(true);
    expect(list.isMuted(OBJ, 'spammy thing')).toBe(false);
    expect(list.isMuted(OBJ, '')).toBe(false);
    expect(list.remove({ name: 'Spammy Thing' })).toBe(true);
    expect(removes[0]).toMatchObject({ type: 0, name: 'Spammy Thing' });
    expect(list.isMuted(OBJ, 'Spammy Thing')).toBe(false);
  });

  it('never mutes ourselves, not even by a by-name entry with our name', () => {
    expect(list.add({ id: ME, name: 'Me Resident', type: MuteType.AGENT })).toBe(false);
    list.add({ name: 'Me Resident', type: MuteType.BY_NAME });
    expect(list.isMuted(ME, 'Me Resident')).toBe(false);
  });

  it("refuses to mute a Linden's text, but allows muting other properties", () => {
    expect(isLinden('Philip Linden')).toBe(true);
    expect(isLinden('philip.linden')).toBe(true);
    expect(isLinden('Linden Lab')).toBe(false);
    expect(isLinden('Bob Resident')).toBe(false);
    expect(list.add({ id: BOB, name: 'Philip Linden', type: MuteType.AGENT })).toBe(false);
    expect(
      list.add({ id: BOB, name: 'Philip Linden', type: MuteType.AGENT }, MuteFlag.TEXT_CHAT),
    ).toBe(false);
    expect(
      list.add({ id: BOB, name: 'Philip Linden', type: MuteType.AGENT }, MuteFlag.PARTICLES),
    ).toBe(true);
  });

  it('stops at the limit of 1000 entries', () => {
    list.load({
      state: 'loaded',
      mutes: Array.from({ length: 1000 }, (_, n) => ({
        id: `00000000-0000-0000-0000-${String(n + 1).padStart(12, '0')}`,
        name: `n${n}`,
        type: 1,
        flags: 0,
      })),
      legacy: [],
    });
    expect(list.add({ id: BOB, name: 'One Too Many', type: MuteType.AGENT })).toBe(false);
  });

  it('loads what the grid sent, compares ids case-insensitively, and keeps a failed load empty', () => {
    list.load({
      state: 'loaded',
      mutes: [{ id: BOB.toUpperCase(), name: 'Bob', type: 1, flags: 0 }],
      legacy: ['Old'],
    });
    expect(list.isMuted(BOB)).toBe(true);
    expect(list.isMuted(OBJ, 'Old')).toBe(true);
    expect(list.state).toBe('loaded');
    list.clear();
    list.load({ state: 'failed' });
    expect(list.state).toBe('failed');
    expect(list.isMuted(BOB)).toBe(false);
  });

  it("keeps a muted resident's stored name current when their account name changes", () => {
    list.add({ id: BOB, name: 'Old Name', type: MuteType.AGENT });
    list.rename(BOB, 'New Name');
    expect(updates.at(-1)).toMatchObject({ id: BOB, name: 'New Name' });
    expect(list.isMutedByName('new name')).toBe(true);
  });

  it('reports a grid update that failed without losing the local change', async () => {
    const failing = new MuteList({
      update: async () => {
        throw new Error('offline');
      },
      remove: async () => {},
    });
    failing.load({ state: 'loaded', mutes: [], legacy: [] });
    const onError = vi.fn();
    failing.on('sync_error', onError);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    failing.add({ id: BOB, name: 'Bob', type: MuteType.AGENT });
    await Promise.resolve();
    await Promise.resolve();
    expect(failing.isMuted(BOB)).toBe(true);
    expect(onError).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('mute list in chat, sound and voice', () => {
  const makeChat = () => {
    const chat = new ChatExtended({ on: () => {} } as any);
    chat.attachGridMuteList(list, (id) => (id === OBJ ? 'Box' : undefined));
    return chat;
  };

  it('ChatExtended mutes through the grid list: a UUID is a resident, a name is a legacy mute', () => {
    const chat = makeChat();
    chat.muteUser(BOB);
    chat.muteUser('Some Name');
    chat.muteObject(OBJ);
    expect(updates.map((u) => [u.type, u.name])).toEqual([
      [1, BOB],
      [0, 'Some Name'],
      [2, 'Box'],
    ]);
    expect(chat.getMutedUsers()).toEqual([BOB, 'Some Name']);
    expect(chat.getMutedObjects()).toEqual([OBJ]);
    chat.unmuteUser(BOB);
    chat.unmuteObject(OBJ);
    expect(chat.getMutedUsers()).toEqual(['Some Name']);
    expect(chat.getMutedObjects()).toEqual([]);
  });

  it('drops text from a muted speaker, from an object owned by a muted resident, and from a muted group; keeps voice-only mutes', () => {
    const chat = makeChat();
    list.add({ id: BOB, name: 'Bob', type: MuteType.AGENT });
    expect(chat.shouldDisplayMessage({ fromId: BOB, fromName: 'Bob', text: 'hi' })).toBe(false);
    expect(
      chat.shouldDisplayMessage({ fromId: OBJ, fromName: 'Box', ownerId: BOB, text: 'hi' }),
    ).toBe(false);
    expect(
      chat.shouldDisplayMessage({ fromId: OBJ, fromName: 'Box', ownerId: ME, text: 'hi' }),
    ).toBe(true);
    list.add({ id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'G', type: MuteType.GROUP });
    expect(
      chat.shouldDisplayMessage({
        groupId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        fromId: ME,
        text: 'x',
      }),
    ).toBe(false);
    list.remove({ id: BOB });
    list.add(
      { id: BOB, name: 'Bob', type: MuteType.AGENT },
      MuteFlag.VOICE_CHAT | MuteFlag.PARTICLES,
    ); // mute only voice and particles
    expect(chat.shouldDisplayMessage({ fromId: BOB, fromName: 'Bob', text: 'hi' })).toBe(true);
    list.add({ id: BOB, name: 'Bob', type: MuteType.AGENT }, MuteFlag.TEXT_CHAT); // now text too
    expect(chat.shouldDisplayMessage({ fromId: BOB, fromName: 'Bob', text: 'hi' })).toBe(false);
    list.remove({ id: BOB }, MuteFlag.TEXT_CHAT);
    expect(chat.shouldDisplayMessage({ fromId: BOB, fromName: 'Bob', text: 'hi' })).toBe(true);
  });

  it('a legacy mute by name hides an object that speaks under that name', () => {
    const chat = makeChat();
    list.add({ name: 'Annoying Box', type: MuteType.BY_NAME });
    expect(
      chat.shouldDisplayMessage({ fromId: OBJ, fromName: 'Annoying Box', text: 'buy now' }),
    ).toBe(false);
  });

  it('announces entry changes so voice can follow, with the flag meaning of the viewer', () => {
    const seen: Array<{ id: string; flags: number; removed: boolean }> = [];
    list.on('entry_changed', ({ entry, removed }: any) =>
      seen.push({ id: entry.id, flags: entry.flags, removed }),
    );
    list.add({ id: BOB, name: 'Bob', type: MuteType.AGENT });
    list.remove({ id: BOB }, MuteFlag.VOICE_CHAT);
    list.remove({ id: BOB });
    expect(seen.map((s) => [s.flags & MuteFlag.VOICE_CHAT, s.removed])).toEqual([
      [0, false],
      [2, false],
      [2, true],
    ]);
  });
});
