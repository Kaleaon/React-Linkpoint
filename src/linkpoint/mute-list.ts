import { Utils } from './utils';

/**
 * The account's mute list, following the official viewer (`indra/newview/llmutelist.cpp` / `.h`, github.com/secondlife/viewer
 * and Firestorm). The grid keeps the list; the core downloads it and forwards each change, and this class holds the
 * working copy with the viewer's rules for flags, legacy by-name mutes and lookups.
 */

/** `LLMute::EType`. */
export const MuteType = { BY_NAME: 0, AGENT: 1, OBJECT: 2, GROUP: 3, EXTERNAL: 4 } as const;
export type MuteTypeValue = typeof MuteType[keyof typeof MuteType];

/**
 * `LLMute` flag bits. A set bit means "this property is NOT muted" (older entries have flags 0 = everything muted), so a
 * lookup that passes a flag treats an entry with that bit set as not muted.
 */
export const MuteFlag = { TEXT_CHAT: 0x1, VOICE_CHAT: 0x2, PARTICLES: 0x4, OBJECT_SOUNDS: 0x8, ALL: 0xf } as const;

export interface MuteEntry { id: string; name: string; type: MuteTypeValue; flags: number }

/** The default limit of `MuteListLimit` in the viewer's settings. */
export const MUTE_LIST_LIMIT = 1000;
const NULL_UUID = '00000000-0000-0000-0000-000000000000';
const lc = (id: string) => (id || '').toLowerCase();

/** `LLMuteList::isLinden`: "." counts as a space, and the second word of the name is "linden". */
export function isLinden(name: string): boolean {
  const tokens = (name || '').replace(/\./g, ' ').split(' ').filter(Boolean);
  return tokens.length >= 2 && tokens[1].toLowerCase() === 'linden';
}

export type MuteLoadState = 'unloaded' | 'requested' | 'loaded' | 'failed';

/** How the grid is told about changes. `slBridge` provides it; tests supply a fake. */
export interface MuteTransport {
  update(entry: MuteEntry): Promise<unknown>;
  remove(entry: { id: string; name: string; type: number }): Promise<unknown>;
  request?(): Promise<unknown>;
}

export class MuteList extends Utils.EventEmitter {
  private mutes = new Map<string, MuteEntry>();
  private legacy = new Set<string>();
  state: MuteLoadState = 'unloaded';
  /** Our own id: a mute by name never silences ourselves (FIRE-8540). */
  selfId = '';

  constructor(private transport: MuteTransport | null = null) { super(); }

  setTransport(transport: MuteTransport | null) { this.transport = transport; }
  setSelfId(id: string) { this.selfId = lc(id); }

  /** Replace the list with what the grid sent (`loadFromFile`). */
  load(result: { state: 'loaded' | 'failed'; mutes?: MuteEntry[]; legacy?: string[] }) {
    if (result.state !== 'loaded') {
      this.state = 'failed';
      this.emit('changed', this.snapshot());
      return;
    }
    this.mutes.clear(); this.legacy.clear();
    for (const m of result.mutes ?? []) this.mutes.set(lc(m.id), { ...m, id: lc(m.id) });
    for (const name of result.legacy ?? []) this.legacy.add(name);
    this.state = 'loaded';
    this.emit('changed', this.snapshot());
  }

  /** Forget everything (logout). */
  clear() {
    this.mutes.clear(); this.legacy.clear(); this.state = 'unloaded';
    this.emit('changed', this.snapshot());
  }

  snapshot() { return { state: this.state, mutes: [...this.mutes.values()].map((m) => ({ ...m })), legacy: [...this.legacy] }; }
  get count() { return this.mutes.size + this.legacy.size; }

  /** `LLMuteList::isMuted(id, name, flags)`. */
  isMuted(id: string, name = '', flags = 0): boolean {
    if (this.mutes.size === 0 && this.legacy.size === 0) return false;
    const key = lc(id);
    if (key && key === this.selfId) return false;
    const entry = this.mutes.get(key);
    if (entry) return !(flags & entry.flags); // any flag passed that the entry has set means "not muted for this"
    if (!name) return false;
    return this.legacy.has(name);
  }

  /** `LLMuteList::isMuted(username)`: by account name, ignoring case. */
  isMutedByName(name: string): boolean {
    const wanted = (name || '').toLowerCase();
    for (const m of this.mutes.values()) if (m.type === MuteType.AGENT && m.name.toLowerCase() === wanted) return true;
    return this.legacy.has(name);
  }

  /**
   * `LLMuteList::add`. `flags` are the properties to mute (0 = all). Returns false when refused: a Linden's text, ourselves,
   * the list limit, or a bad by-name entry.
   */
  add(mute: { id?: string; name: string; type: MuteTypeValue }, flags = 0): boolean {
    const id = lc(mute.id || '');
    if (mute.type === MuteType.AGENT && isLinden(mute.name) && ((flags & MuteFlag.TEXT_CHAT) || flags === 0)) return false;
    if (mute.type === MuteType.AGENT && id === this.selfId && id) return false;
    if (this.count >= MUTE_LIST_LIMIT) return false;

    if (mute.type === MuteType.BY_NAME) {
      if (!mute.name) return false; // an empty string cannot be muted by name
      if (id && id !== NULL_UUID) return false; // by-name mutes have a null id
      if (this.legacy.has(mute.name)) return false; // duplicate
      this.legacy.add(mute.name);
      this.send('update', { id: NULL_UUID, name: mute.name, type: MuteType.BY_NAME, flags: 0 });
      this.emit('entry_changed', { entry: { id: NULL_UUID, name: mute.name, type: MuteType.BY_NAME, flags: 0 }, removed: false });
      this.emit('changed', this.snapshot());
      return true;
    }

    if (!id || id === NULL_UUID) return false;
    const existing = this.mutes.get(id);
    // A new entry starts as "nothing muted" and the requested properties are switched off; an existing one keeps its flags.
    let entryFlags = existing ? existing.flags : MuteFlag.ALL;
    entryFlags = flags ? entryFlags & ~flags : 0;
    const entry: MuteEntry = { id, name: mute.name, type: mute.type, flags: entryFlags >>> 0 };
    this.mutes.set(id, entry);
    this.send('update', entry);
    this.emit('entry_changed', { entry: { ...entry }, removed: false });
    this.emit('changed', this.snapshot());
    return true;
  }

  /**
   * `LLMuteList::remove`. With flags, only those properties are unmuted (the entry goes when nothing is left muted);
   * with none, the entry is removed. Returns whether something was found.
   */
  remove(mute: { id?: string; name?: string }, flags = 0): boolean {
    const id = lc(mute.id || '');
    const entry = id ? this.mutes.get(id) : undefined;
    if (entry) {
      const local = { ...entry };
      let drop = true;
      if (flags) {
        local.flags |= flags;
        drop = local.flags === MuteFlag.ALL;
      } else {
        local.flags = MuteFlag.ALL;
      }
      this.mutes.delete(id);
      if (drop) this.send('remove', local);
      else { this.mutes.set(id, local); this.send('update', local); }
      this.emit('entry_changed', { entry: { ...local }, removed: drop });
      this.emit('changed', this.snapshot());
      return true;
    }
    const name = mute.name ?? '';
    if (this.legacy.delete(name)) {
      this.send('remove', { id: NULL_UUID, name, type: MuteType.BY_NAME, flags: 0 });
      this.emit('entry_changed', { entry: { id: NULL_UUID, name, type: MuteType.BY_NAME, flags: 0 }, removed: true });
      this.emit('changed', this.snapshot());
      return true;
    }
    return false;
  }

  /** An agent's account name changed (`onAccountNameChanged`): keep the stored name current. */
  rename(id: string, name: string) {
    const entry = this.mutes.get(lc(id));
    if (!entry || entry.name === name) return;
    entry.name = name;
    this.send('update', entry);
    this.emit('changed', this.snapshot());
  }

  private send(kind: 'update' | 'remove', entry: MuteEntry) {
    if (!this.transport) return;
    const result = kind === 'update' ? this.transport.update(entry) : this.transport.remove(entry);
    void Promise.resolve(result).catch((error: unknown) => {
      console.warn(`[MuteList] could not ${kind} ${entry.name} on the grid:`, error);
      this.emit('sync_error', { kind, entry, error });
    });
  }
}
