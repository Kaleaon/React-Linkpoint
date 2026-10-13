import { Utils } from './utils';
import { indexedDBStore } from './indexeddb-store';

/**
 * The account's mute list, following the official viewer (`indra/newview/llmutelist.cpp` / `.h`, github.com/secondlife/viewer
 * and Firestorm). The grid keeps the list; the core downloads it and forwards each change, and this class holds the
 * working copy with the viewer's rules for flags, legacy by-name mutes and lookups.
 */

/** `LLMute::EType`. */
export const MuteType = { BY_NAME: 0, AGENT: 1, OBJECT: 2, GROUP: 3, EXTERNAL: 4 } as const;
export type MuteTypeValue = (typeof MuteType)[keyof typeof MuteType];

/**
 * `LLMute` flag bits. A set bit means "this property is NOT muted" (older entries have flags 0 = everything muted), so a
 * lookup that passes a flag treats an entry with that bit set as not muted.
 */
export const MuteFlag = {
  TEXT_CHAT: 0x1,
  VOICE_CHAT: 0x2,
  PARTICLES: 0x4,
  OBJECT_SOUNDS: 0x8,
  ALL: 0xf,
} as const;

export interface MuteEntry {
  id: string;
  name: string;
  type: MuteTypeValue;
  flags: number;
}

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
  private mutesByNameLower = new Map<string, MuteEntry>();
  private legacy = new Set<string>();
  private legacyLower = new Set<string>();
  private pendingQueue: Array<{ kind: 'update' | 'remove'; entry: MuteEntry }> = [];
  state: MuteLoadState = 'unloaded';
  /** Our own id: a mute by name never silences ourselves (FIRE-8540). */
  selfId = '';

  constructor(private transport: MuteTransport | null = null) {
    super();
  }

  setTransport(transport: MuteTransport | null) {
    this.transport = transport;
  }
  setSelfId(id: string) {
    this.selfId = lc(id);
    void this.loadFromCache();
  }

  private indexMuteEntry(entry: MuteEntry) {
    if (entry.type === MuteType.AGENT && entry.name) {
      this.mutesByNameLower.set(entry.name.toLowerCase(), entry);
    }
  }

  private unindexMuteEntry(entry: MuteEntry) {
    if (entry.type === MuteType.AGENT && entry.name) {
      const lower = entry.name.toLowerCase();
      const current = this.mutesByNameLower.get(lower);
      if (current && current.id === entry.id) {
        let replacement: MuteEntry | undefined;
        for (const m of this.mutes.values()) {
          if (m.id !== entry.id && m.type === MuteType.AGENT && m.name.toLowerCase() === lower) {
            replacement = m;
            break;
          }
        }
        if (replacement) {
          this.mutesByNameLower.set(lower, replacement);
        } else {
          this.mutesByNameLower.delete(lower);
        }
      }
    }
  }

  private indexLegacyName(name: string) {
    if (name) {
      this.legacy.add(name);
      this.legacyLower.add(name.toLowerCase());
    }
  }

  private unindexLegacyName(name: string) {
    if (name) {
      this.legacy.delete(name);
      this.rebuildLegacyLower();
    }
  }

  private rebuildLegacyLower() {
    this.legacyLower.clear();
    for (const leg of this.legacy) {
      this.legacyLower.add(leg.toLowerCase());
    }
  }

  /** Load persisted mutes and pending write queue from IndexedDB (`mutelist_<agent_id>`). */
  async loadFromCache(): Promise<boolean> {
    const key = this.selfId || 'local';
    try {
      const cached = await indexedDBStore.getMuteList(key);
      if (
        cached &&
        (cached.mutes?.length || cached.legacy?.length || cached.pendingQueue?.length)
      ) {
        if (this.state === 'unloaded') {
          for (const m of cached.mutes || []) {
            const entry = { ...m, id: lc(m.id) };
            this.mutes.set(entry.id, entry);
            this.indexMuteEntry(entry);
          }
          for (const name of cached.legacy || []) {
            this.indexLegacyName(name);
          }
          this.state = 'loaded';
        }
        if (Array.isArray(cached.pendingQueue)) {
          this.pendingQueue = cached.pendingQueue.map((item) => ({
            kind: item.kind,
            entry: { ...item.entry, id: lc(item.entry.id) },
          }));
        }
        this.emit('changed', this.snapshot());
        return true;
      }
    } catch (err) {
      console.warn('[MuteList] loadFromCache failed:', err);
    }
    return false;
  }

  /** Persist current active mutes and pending queue to IndexedDB key `mutelist_<agent_id>`. */
  async saveToCache(): Promise<void> {
    const key = this.selfId || 'local';
    try {
      await indexedDBStore.saveMuteList(key, {
        mutes: [...this.mutes.values()].map((m) => ({ ...m })),
        legacy: [...this.legacy],
        pendingQueue: [...this.pendingQueue],
      });
    } catch (err) {
      console.warn('[MuteList] saveToCache failed:', err);
    }
  }

  /** Request mute list from grid bridge if available. */
  requestGridSync(): boolean {
    if (this.transport?.request) {
      this.state = 'requested';
      void Promise.resolve(this.transport.request()).catch((err) => {
        console.warn('[MuteList] requestGridSync failed:', err);
        this.state = 'failed';
      });
      return true;
    }
    return false;
  }

  /** Replace the list with what the grid sent (`loadFromFile`), reconciling local pending queue. */
  load(result: { state: 'loaded' | 'failed'; mutes?: MuteEntry[]; legacy?: string[] }) {
    if (result.state !== 'loaded') {
      this.state = 'failed';
      this.emit('changed', this.snapshot());
      return;
    }
    this.mutes.clear();
    this.mutesByNameLower.clear();
    this.legacy.clear();
    this.legacyLower.clear();
    for (const m of result.mutes ?? []) {
      const entry = { ...m, id: lc(m.id) };
      this.mutes.set(entry.id, entry);
      this.indexMuteEntry(entry);
    }
    for (const name of result.legacy ?? []) {
      this.indexLegacyName(name);
    }

    // Reconcile pending queue entries made while offline/disconnected
    for (const queued of this.pendingQueue) {
      if (queued.kind === 'update') {
        if (queued.entry.type === MuteType.BY_NAME) {
          if (queued.entry.name) this.indexLegacyName(queued.entry.name);
        } else if (queued.entry.id) {
          const id = lc(queued.entry.id);
          const existing = this.mutes.get(id);
          if (existing) this.unindexMuteEntry(existing);
          const entry = { ...queued.entry, id };
          this.mutes.set(id, entry);
          this.indexMuteEntry(entry);
        }
      } else if (queued.kind === 'remove') {
        if (queued.entry.type === MuteType.BY_NAME || !queued.entry.id) {
          if (queued.entry.name) this.unindexLegacyName(queued.entry.name);
        } else if (queued.entry.id) {
          const id = lc(queued.entry.id);
          const existing = this.mutes.get(id);
          if (existing) {
            this.unindexMuteEntry(existing);
            this.mutes.delete(id);
          }
        }
      }
    }

    this.state = 'loaded';
    void this.saveToCache();
    this.emit('changed', this.snapshot());
    void this.flushPendingQueue();
  }

  /** Forget everything (logout). */
  clear() {
    this.mutes.clear();
    this.mutesByNameLower.clear();
    this.legacy.clear();
    this.legacyLower.clear();
    this.pendingQueue = [];
    this.state = 'unloaded';
    this.emit('changed', this.snapshot());
  }

  snapshot() {
    return {
      state: this.state,
      mutes: [...this.mutes.values()].map((m) => ({ ...m })),
      legacy: [...this.legacy],
      pendingQueue: [...this.pendingQueue].map((p) => ({ ...p, entry: { ...p.entry } })),
    };
  }
  get count() {
    return this.mutes.size + this.legacy.size;
  }

  /** `LLMuteList::isMuted(id, name, flags)`. */
  isMuted(id: string, name = '', flags = 0): boolean {
    if (this.mutes.size === 0 && this.legacy.size === 0) return false;
    let entry = id ? this.mutes.get(id) : undefined;
    let key = id;
    if (!entry && id) {
      key = lc(id);
      entry = this.mutes.get(key);
    }
    if (key && key === this.selfId) return false;
    if (entry) return !(flags & entry.flags); // any flag passed that the entry has set means "not muted for this"
    if (key && this.legacyLower.has(key)) return true;
    if (!name) return false;
    return this.legacy.has(name);
  }

  /** `LLMuteList::isMuted(username)`: by account name, ignoring case. */
  isMutedByName(name: string): boolean {
    if (!name) return false;
    const wanted = name.toLowerCase();
    const entry = this.mutesByNameLower.get(wanted);
    if (entry) {
      return !(MuteFlag.TEXT_CHAT & entry.flags);
    }
    return this.legacyLower.has(wanted);
  }

  /**
   * `LLMuteList::add`. `flags` are the properties to mute (0 = all). Returns false when refused: a Linden's text, ourselves,
   * the list limit, or a bad by-name entry.
   */
  add(mute: { id?: string; name: string; type: MuteTypeValue }, flags = 0): boolean {
    const id = lc(mute.id || '');
    if (
      mute.type === MuteType.AGENT &&
      isLinden(mute.name) &&
      (flags & MuteFlag.TEXT_CHAT || flags === 0)
    )
      return false;
    if (mute.type === MuteType.AGENT && id === this.selfId && id) return false;
    if (this.count >= MUTE_LIST_LIMIT) return false;

    if (mute.type === MuteType.BY_NAME) {
      if (!mute.name) return false; // an empty string cannot be muted by name
      if (id && id !== NULL_UUID) return false; // by-name mutes have a null id
      if (this.legacy.has(mute.name)) return false; // duplicate
      this.indexLegacyName(mute.name);
      this.send('update', { id: NULL_UUID, name: mute.name, type: MuteType.BY_NAME, flags: 0 });
      this.emit('entry_changed', {
        entry: { id: NULL_UUID, name: mute.name, type: MuteType.BY_NAME, flags: 0 },
        removed: false,
      });
      this.emit('changed', this.snapshot());
      return true;
    }

    if (!id || id === NULL_UUID) return false;
    const existing = this.mutes.get(id);
    if (existing) {
      this.unindexMuteEntry(existing);
    }
    // A new entry starts as "nothing muted" and the requested properties are switched off; an existing one keeps its flags.
    let entryFlags = existing ? existing.flags : MuteFlag.ALL;
    entryFlags = flags ? entryFlags & ~flags : 0;
    const entry: MuteEntry = { id, name: mute.name, type: mute.type, flags: entryFlags >>> 0 };
    this.mutes.set(id, entry);
    this.indexMuteEntry(entry);
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
      this.unindexMuteEntry(entry);
      this.mutes.delete(id);
      if (drop) this.send('remove', local);
      else {
        this.mutes.set(id, local);
        this.indexMuteEntry(local);
        this.send('update', local);
      }
      this.emit('entry_changed', { entry: { ...local }, removed: drop });
      this.emit('changed', this.snapshot());
      return true;
    }
    const name = mute.name ?? '';
    if (this.legacy.has(name)) {
      this.unindexLegacyName(name);
      this.send('remove', { id: NULL_UUID, name, type: MuteType.BY_NAME, flags: 0 });
      this.emit('entry_changed', {
        entry: { id: NULL_UUID, name, type: MuteType.BY_NAME, flags: 0 },
        removed: true,
      });
      this.emit('changed', this.snapshot());
      return true;
    }
    return false;
  }

  /** An agent's account name changed (`onAccountNameChanged`): keep the stored name current. */
  rename(id: string, name: string) {
    const entry = this.mutes.get(lc(id));
    if (!entry || entry.name === name) return;
    this.unindexMuteEntry(entry);
    entry.name = name;
    this.indexMuteEntry(entry);
    this.send('update', entry);
    this.emit('changed', this.snapshot());
  }

  private enqueuePending(kind: 'update' | 'remove', entry: MuteEntry) {
    const key = entry.type === MuteType.BY_NAME ? `name:${entry.name}` : `id:${lc(entry.id)}`;
    this.pendingQueue = this.pendingQueue.filter((item) => {
      const itemKey =
        item.entry.type === MuteType.BY_NAME
          ? `name:${item.entry.name}`
          : `id:${lc(item.entry.id)}`;
      return itemKey !== key;
    });
    this.pendingQueue.push({ kind, entry: { ...entry } });
  }

  private removeFromPending(entry: MuteEntry) {
    const key = entry.type === MuteType.BY_NAME ? `name:${entry.name}` : `id:${lc(entry.id)}`;
    this.pendingQueue = this.pendingQueue.filter((item) => {
      const itemKey =
        item.entry.type === MuteType.BY_NAME
          ? `name:${item.entry.name}`
          : `id:${lc(item.entry.id)}`;
      return itemKey !== key;
    });
  }

  private send(kind: 'update' | 'remove', entry: MuteEntry) {
    void this.saveToCache();
    if (entry.type === MuteType.EXTERNAL) return; // Mute entries for external or local-only items MUST NOT trigger grid network sync calls

    if (!this.transport) {
      this.enqueuePending(kind, entry);
      void this.saveToCache();
      return;
    }

    const result = kind === 'update' ? this.transport.update(entry) : this.transport.remove(entry);
    void Promise.resolve(result)
      .then(() => {
        this.removeFromPending(entry);
        void this.saveToCache();
      })
      .catch((error: unknown) => {
        console.warn(`[MuteList] could not ${kind} ${entry.name} on the grid:`, error);
        this.enqueuePending(kind, entry);
        void this.saveToCache();
        this.emit('sync_error', { kind, entry, error });
      });
  }

  /** Flush the offline write queue to the backend grid circuit. */
  async flushPendingQueue(): Promise<void> {
    if (!this.transport || this.pendingQueue.length === 0) return;
    const queueToFlush = [...this.pendingQueue];
    for (const item of queueToFlush) {
      try {
        if (item.kind === 'update') {
          await this.transport.update(item.entry);
        } else {
          await this.transport.remove(item.entry);
        }
        this.removeFromPending(item.entry);
      } catch (err) {
        console.warn('[MuteList] flushPendingQueue item failed:', err);
        break;
      }
    }
    await this.saveToCache();
  }
}
