/**
 * Transactional IndexedDB Store for Linkpoint
 *
 * Provides isolated per-agent ID storage for inventory folders, items, and contacts.
 * Supports paged query methods (getFolderContentsPage, getFriendsPage) and storage quota eviction.
 */

export interface InventoryFolderRecord {
  agentId: string;
  id: string;
  name: string;
  parent: string;
  type: string;
  folderType: number;
  version: number;
  children?: string[];
  updatedAt?: number;
}

export interface InventoryItemRecord {
  agentId: string;
  id: string;
  name: string;
  folderId: string;
  assetType: number;
  assetId: string;
  description: string;
  invType: number;
  flags: number;
  creationDate: number;
  ownerId: string;
  groupId: string;
  permissions?: any;
  data?: any;
  updatedAt?: number;
}

export interface ContactRecord {
  agentId: string;
  id: string;
  name: string;
  note: string;
  photo: string | null;
  links: any[];
  googleResourceName: string | null;
  savedAt: number;
  updatedAt: number;
  onlineStatus?: 'online' | 'offline';
}

export interface GroupNoticeRecord {
  agentId: string;
  id: string;
  groupId: string;
  subject: string;
  message: string;
  from: string;
  timestamp: number;
  hasAttachment?: boolean;
  attachment?: any;
  calendar?: any;
  updatedAt?: number;
}

export interface PagedFolderContents {
  folders: InventoryFolderRecord[];
  items: InventoryItemRecord[];
  totalFolders: number;
  totalItems: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PagedFriends {
  contacts: ContactRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DB_NAME = 'linkpoint_sl_cache_db';
const DB_VERSION = 4;

export const STORE_INVENTORY_FOLDERS = 'inventory_folders';
export const STORE_INVENTORY_ITEMS = 'inventory_items';
export const STORE_CONTACTS = 'contacts';
export const STORE_GROUP_NOTICES = 'group_notices';
export const STORE_LEGACY_MIGRATION = 'legacy_migration_status';
export const STORE_INVENTORY = 'inventory';
export const STORE_TEXTURES = 'textures';
export const STORE_TRANSACTIONS = 'transactions';
export const STORE_META = 'metadata';

export class IndexedDBStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase | null> | null = null;

  // In-memory fallback stores when IDB is unavailable (e.g., node / ssr / restricted iframe)
  private memFolders: Map<string, InventoryFolderRecord> = new Map(); // key: `${agentId}:${id}`
  private memItems: Map<string, InventoryItemRecord> = new Map(); // key: `${agentId}:${id}`
  private memContacts: Map<string, ContactRecord> = new Map(); // key: `${agentId}:${id}`
  private memNotices: Map<string, GroupNoticeRecord> = new Map(); // key: `${agentId}:${id}`
  private memMigration: Map<string, any> = new Map(); // key: agentId

  constructor() {}

  public async getDB(): Promise<IDBDatabase | null> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return null;
    }
    if (this.db) {
      return this.db;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e: any) => {
          const db: IDBDatabase = e.target.result;

          if (!db.objectStoreNames.contains(STORE_INVENTORY_FOLDERS)) {
            const folderStore = db.createObjectStore(STORE_INVENTORY_FOLDERS, {
              keyPath: ['agentId', 'id'],
            });
            folderStore.createIndex('by_parent', ['agentId', 'parent'], { unique: false });
          } else {
            const folderStore = e.target.transaction.objectStore(STORE_INVENTORY_FOLDERS);
            if (!folderStore.indexNames.contains('by_parent')) {
              folderStore.createIndex('by_parent', ['agentId', 'parent'], { unique: false });
            }
          }

          if (!db.objectStoreNames.contains(STORE_INVENTORY_ITEMS)) {
            const itemStore = db.createObjectStore(STORE_INVENTORY_ITEMS, {
              keyPath: ['agentId', 'id'],
            });
            itemStore.createIndex('by_folder', ['agentId', 'folderId'], { unique: false });
          } else {
            const itemStore = e.target.transaction.objectStore(STORE_INVENTORY_ITEMS);
            if (!itemStore.indexNames.contains('by_folder')) {
              itemStore.createIndex('by_folder', ['agentId', 'folderId'], { unique: false });
            }
          }

          if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
            const contactStore = db.createObjectStore(STORE_CONTACTS, {
              keyPath: ['agentId', 'id'],
            });
            contactStore.createIndex('by_agent', 'agentId', { unique: false });
          } else {
            const contactStore = e.target.transaction.objectStore(STORE_CONTACTS);
            if (!contactStore.indexNames.contains('by_agent')) {
              contactStore.createIndex('by_agent', 'agentId', { unique: false });
            }
          }

          if (!db.objectStoreNames.contains(STORE_GROUP_NOTICES)) {
            const noticeStore = db.createObjectStore(STORE_GROUP_NOTICES, {
              keyPath: ['agentId', 'id'],
            });
            noticeStore.createIndex('by_group', ['agentId', 'groupId'], { unique: false });
            noticeStore.createIndex('by_agent', 'agentId', { unique: false });
            noticeStore.createIndex('timestamp', 'timestamp', { unique: false });
          } else {
            const noticeStore = e.target.transaction.objectStore(STORE_GROUP_NOTICES);
            if (!noticeStore.indexNames.contains('by_group')) {
              noticeStore.createIndex('by_group', ['agentId', 'groupId'], { unique: false });
            }
          }

          if (!db.objectStoreNames.contains(STORE_LEGACY_MIGRATION)) {
            db.createObjectStore(STORE_LEGACY_MIGRATION, { keyPath: 'agentId' });
          }

          // Ensure existing legacy stores exist
          if (!db.objectStoreNames.contains(STORE_TEXTURES)) {
            db.createObjectStore(STORE_TEXTURES, { keyPath: 'uuid' });
          }
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: 'key' });
          }
          if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
            const txStore = db.createObjectStore(STORE_TRANSACTIONS, { keyPath: 'id' });
            txStore.createIndex('agentId', 'agentId', { unique: false });
            txStore.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };

        req.onsuccess = (e: any) => {
          this.db = e.target.result;
          resolve(this.db);
        };

        req.onerror = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });

    return this.initPromise;
  }

  // --- Folder Operations ---

  public async saveFolders(agentId: string, folders: any[]): Promise<void> {
    const db = await this.getDB();
    const records: InventoryFolderRecord[] = folders.map((f) => ({
      agentId,
      id: String(f.id || f.folder_id || f.category_id || ''),
      name: String(f.name || f.folder_name || 'Folder'),
      parent: String(f.parent || f.parent_id || f.parentId || ''),
      type: 'folder',
      folderType: Number(f.folderType ?? f.preferred_type ?? f.type_default ?? -1),
      version: Number(f.version ?? 1),
      children: Array.isArray(f.children) ? [...f.children] : [],
      updatedAt: Date.now(),
    }));

    // Update memory fallback
    for (const r of records) {
      if (r.id) {
        this.memFolders.set(`${agentId}:${r.id}`, r);
      }
    }

    if (!db) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_INVENTORY_FOLDERS], 'readwrite');
        const store = tx.objectStore(STORE_INVENTORY_FOLDERS);
        for (const r of records) {
          if (r.id) store.put(r);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- Item Operations ---

  public async saveItems(agentId: string, items: any[]): Promise<void> {
    const db = await this.getDB();
    const records: InventoryItemRecord[] = items.map((item) => ({
      agentId,
      id: String(item.id || item.item_id || ''),
      name: String(item.name || item.item_name || 'Item'),
      folderId: String(item.folderId || item.parent || item.parent_id || ''),
      assetType: Number(item.assetType ?? item.asset_type ?? 0),
      assetId: String(item.assetId || item.asset_id || ''),
      description: String(item.description || item.desc || ''),
      invType: Number(item.invType ?? item.inv_type ?? 0),
      flags: Number(item.flags ?? 0),
      creationDate: Number(item.creationDate || item.creation_date || 0),
      ownerId: String(item.ownerId || item.owner_id || agentId),
      groupId: String(item.groupId || item.group_id || ''),
      permissions: item.permissions || {},
      data: item.data || null,
      updatedAt: Date.now(),
    }));

    for (const r of records) {
      if (r.id) {
        this.memItems.set(`${agentId}:${r.id}`, r);
      }
    }

    if (!db) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_INVENTORY_ITEMS], 'readwrite');
        const store = tx.objectStore(STORE_INVENTORY_ITEMS);
        for (const r of records) {
          if (r.id) store.put(r);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Paged Query Method: getFolderContentsPage
   * Direct IndexDB cursor/range query without loading or allocating full inventory trees.
   */
  public async getFolderContentsPage(
    agentId: string,
    folderId: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<PagedFolderContents> {
    const db = await this.getDB();
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);

    if (!db) {
      // Memory fallback query
      const matchingFolders: InventoryFolderRecord[] = [];
      for (const [key, folder] of this.memFolders.entries()) {
        if (folder.agentId === agentId && folder.parent === folderId) {
          matchingFolders.push(folder);
        }
      }

      const matchingItems: InventoryItemRecord[] = [];
      for (const [key, item] of this.memItems.entries()) {
        if (item.agentId === agentId && item.folderId === folderId) {
          matchingItems.push(item);
        }
      }

      const totalFolders = matchingFolders.length;
      const totalItems = matchingItems.length;
      const totalEntries = totalFolders + totalItems;
      const totalPages = Math.max(1, Math.ceil(totalEntries / safePageSize));

      const startIndex = (safePage - 1) * safePageSize;
      const combined = [
        ...matchingFolders.map((f) => ({ kind: 'folder' as const, data: f })),
        ...matchingItems.map((i) => ({ kind: 'item' as const, data: i })),
      ];
      const pageSlice = combined.slice(startIndex, startIndex + safePageSize);

      return {
        folders: pageSlice
          .filter((e) => e.kind === 'folder')
          .map((e) => e.data as InventoryFolderRecord),
        items: pageSlice.filter((e) => e.kind === 'item').map((e) => e.data as InventoryItemRecord),
        totalFolders,
        totalItems,
        page: safePage,
        pageSize: safePageSize,
        totalPages,
      };
    }

    // Query IDB using indexes
    const folders: InventoryFolderRecord[] = await new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_INVENTORY_FOLDERS], 'readonly');
        const index = tx.objectStore(STORE_INVENTORY_FOLDERS).index('by_parent');
        const range = IDBKeyRange.only([agentId, folderId]);
        const req = index.getAll(range);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    const items: InventoryItemRecord[] = await new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_INVENTORY_ITEMS], 'readonly');
        const index = tx.objectStore(STORE_INVENTORY_ITEMS).index('by_folder');
        const range = IDBKeyRange.only([agentId, folderId]);
        const req = index.getAll(range);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    const totalFolders = folders.length;
    const totalItems = items.length;
    const totalEntries = totalFolders + totalItems;
    const totalPages = Math.max(1, Math.ceil(totalEntries / safePageSize));

    const startIndex = (safePage - 1) * safePageSize;
    const combined = [
      ...folders.map((f) => ({ kind: 'folder' as const, data: f })),
      ...items.map((i) => ({ kind: 'item' as const, data: i })),
    ];
    const pageSlice = combined.slice(startIndex, startIndex + safePageSize);

    return {
      folders: pageSlice
        .filter((e) => e.kind === 'folder')
        .map((e) => e.data as InventoryFolderRecord),
      items: pageSlice.filter((e) => e.kind === 'item').map((e) => e.data as InventoryItemRecord),
      totalFolders,
      totalItems,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  // --- Contacts Operations ---

  public async saveContacts(agentId: string, contacts: any[]): Promise<void> {
    const db = await this.getDB();
    const records: ContactRecord[] = contacts.map((c) => ({
      agentId,
      id: String(c.id || ''),
      name: String(c.name || ''),
      note: String(c.note || ''),
      photo: c.photo || null,
      links: Array.isArray(c.links) ? [...c.links] : [],
      googleResourceName: c.googleResourceName || null,
      savedAt: Number(c.savedAt || Date.now()),
      updatedAt: Number(c.updatedAt || Date.now()),
      onlineStatus: c.onlineStatus || 'offline',
    }));

    for (const r of records) {
      if (r.id) {
        this.memContacts.set(`${agentId}:${r.id}`, r);
      }
    }

    if (!db) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_CONTACTS], 'readwrite');
        const store = tx.objectStore(STORE_CONTACTS);
        for (const r of records) {
          if (r.id) store.put(r);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async saveContact(agentId: string, contact: any): Promise<void> {
    return this.saveContacts(agentId, [contact]);
  }

  public async deleteContact(agentId: string, contactId: string): Promise<void> {
    this.memContacts.delete(`${agentId}:${contactId}`);
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_CONTACTS], 'readwrite');
        const store = tx.objectStore(STORE_CONTACTS);
        store.delete([agentId, contactId]);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Paged Query Method: getFriendsPage
   */
  public async getFriendsPage(
    agentId: string,
    page: number = 1,
    pageSize: number = 50,
    filter?: string,
  ): Promise<PagedFriends> {
    const db = await this.getDB();
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);

    let allContacts: ContactRecord[] = [];

    if (!db) {
      for (const [key, contact] of this.memContacts.entries()) {
        if (contact.agentId === agentId) {
          allContacts.push(contact);
        }
      }
    } else {
      allContacts = await new Promise((resolve) => {
        try {
          const tx = db.transaction([STORE_CONTACTS], 'readonly');
          const index = tx.objectStore(STORE_CONTACTS).index('by_agent');
          const range = IDBKeyRange.only(agentId);
          const req = index.getAll(range);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    }

    if (filter) {
      const q = filter.toLowerCase();
      allContacts = allContacts.filter(
        (c) => c.name.toLowerCase().includes(q) || c.note.toLowerCase().includes(q),
      );
    }

    allContacts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const total = allContacts.length;
    const totalPages = Math.max(1, Math.ceil(total / safePageSize));
    const startIndex = (safePage - 1) * safePageSize;
    const pageSlice = allContacts.slice(startIndex, startIndex + safePageSize);

    return {
      contacts: pageSlice,
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages,
    };
  }

  // --- Group Notices Operations ---

  public async saveGroupNotices(agentId: string, groupId: string, notices: any[]): Promise<void> {
    const safeAgentId = agentId || 'local_user';
    const db = await this.getDB();
    const records: GroupNoticeRecord[] = notices.map((n) => ({
      agentId: safeAgentId,
      id: String(n.id || `notice-${Date.now()}-${Math.random()}`),
      groupId: String(n.groupId || groupId),
      subject: String(n.subject || 'Group Notice'),
      message: String(n.message || ''),
      from: String(n.from || n.fromName || 'Group Admin'),
      timestamp: Number(n.timestamp || Date.now()),
      hasAttachment: Boolean(n.hasAttachment || n.attachment),
      attachment: n.attachment || null,
      calendar: n.calendar || null,
      updatedAt: Date.now(),
    }));

    for (const r of records) {
      if (r.id) {
        this.memNotices.set(`${safeAgentId}:${r.id}`, r);
      }
    }

    if (!db) return;

    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([STORE_GROUP_NOTICES], 'readwrite');
        const store = tx.objectStore(STORE_GROUP_NOTICES);
        for (const r of records) {
          if (r.id) store.put(r);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  public async getGroupNotices(agentId: string, groupId: string): Promise<GroupNoticeRecord[]> {
    const safeAgentId = agentId || 'local_user';
    const db = await this.getDB();

    if (!db) {
      const results: GroupNoticeRecord[] = [];
      for (const record of this.memNotices.values()) {
        if (record.agentId === safeAgentId && record.groupId === groupId) {
          results.push(record);
        }
      }
      return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_GROUP_NOTICES], 'readonly');
        const index = tx.objectStore(STORE_GROUP_NOTICES).index('by_group');
        const range = IDBKeyRange.only([safeAgentId, groupId]);
        const req = index.getAll(range);
        req.onsuccess = () => {
          const list = req.result || [];
          resolve(list.sort((a: any, b: any) => b.timestamp - a.timestamp));
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  public async getAllGroupNotices(agentId: string): Promise<GroupNoticeRecord[]> {
    const safeAgentId = agentId || 'local_user';
    const db = await this.getDB();

    if (!db) {
      const results: GroupNoticeRecord[] = [];
      for (const record of this.memNotices.values()) {
        if (!agentId || record.agentId === safeAgentId) {
          results.push(record);
        }
      }
      return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_GROUP_NOTICES], 'readonly');
        const index = tx.objectStore(STORE_GROUP_NOTICES).index('by_agent');
        const range = IDBKeyRange.only(safeAgentId);
        const req = index.getAll(range);
        req.onsuccess = () => {
          const list = req.result || [];
          resolve(list.sort((a: any, b: any) => b.timestamp - a.timestamp));
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  public async purgeOldGroupNotices(
    agentId?: string,
    maxAgeMs: number = 90 * 24 * 60 * 60 * 1000,
    maxDbSizeBytes: number = 50 * 1024 * 1024,
  ): Promise<{ purged: number }> {
    let purged = 0;
    const cutoff = Date.now() - maxAgeMs;

    // Purge memory fallback
    for (const [key, record] of this.memNotices.entries()) {
      if ((!agentId || record.agentId === agentId) && record.timestamp < cutoff) {
        this.memNotices.delete(key);
        purged++;
      }
    }

    const db = await this.getDB();
    if (!db) return { purged };

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([STORE_GROUP_NOTICES], 'readwrite');
        const store = tx.objectStore(STORE_GROUP_NOTICES);
        const req = store.openCursor();

        req.onsuccess = (e: any) => {
          const cursor = e.target.result;
          if (cursor) {
            const val = cursor.value;
            if ((!agentId || val.agentId === agentId) && val.timestamp < cutoff) {
              cursor.delete();
              purged++;
            }
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        if (usage > maxDbSizeBytes) {
          const all = await this.getAllGroupNotices(agentId || '');
          if (all.length > 500) {
            const excess = all.slice(500);
            const tx = db.transaction([STORE_GROUP_NOTICES], 'readwrite');
            const store = tx.objectStore(STORE_GROUP_NOTICES);
            for (const item of excess) {
              store.delete([item.agentId, item.id]);
              purged++;
            }
          }
        }
      } catch {
        // ignore estimation error
      }
    }

    return { purged };
  }

  // --- Migration Tracking ---

  public async isMigrated(agentId: string): Promise<boolean> {
    if (this.memMigration.get(agentId)) {
      return true;
    }
    const db = await this.getDB();
    if (!db) return false;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_LEGACY_MIGRATION], 'readonly');
        const req = tx.objectStore(STORE_LEGACY_MIGRATION).get(agentId);
        req.onsuccess = () => resolve(Boolean(req.result?.migrated));
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async setMigrated(agentId: string, details: any = {}): Promise<void> {
    this.memMigration.set(agentId, { agentId, migrated: true, timestamp: Date.now(), ...details });
    const db = await this.getDB();
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction([STORE_LEGACY_MIGRATION], 'readwrite');
        tx.objectStore(STORE_LEGACY_MIGRATION).put({
          agentId,
          migrated: true,
          timestamp: Date.now(),
          ...details,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  // --- Quota & Eviction Rules ---

  public async checkQuotaAndEvict(
    agentId?: string,
  ): Promise<{ evicted: number; remainingMb: number }> {
    let evictedCount = 0;
    const db = await this.getDB();

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 1;
        const ratio = usage / quota;

        // If usage > 80% or quota nearing limit, evict temporary textures & old transaction logs
        if (ratio > 0.8 || usage > 200 * 1024 * 1024) {
          if (db) {
            await new Promise<void>((resolve) => {
              const tx = db.transaction([STORE_TEXTURES], 'readwrite');
              const store = tx.objectStore(STORE_TEXTURES);
              const clearReq = store.clear();
              clearReq.onsuccess = () => {
                evictedCount++;
                resolve();
              };
              clearReq.onerror = () => resolve();
            });
          }
        }
      } catch {
        // Estimate error
      }
    }

    return { evicted: evictedCount, remainingMb: 50 };
  }
}

export const indexedDBStore = new IndexedDBStore();
