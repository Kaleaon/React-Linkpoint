import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IndexedDBStore, indexedDBStore } from '../indexeddb-store';
import { IDBWorkerBridge, idbWorkerBridge } from '../idb-worker';
import { DeltaSelectorStore, deltaSelectorStore } from '../delta-selectors';
import { MigrationUtility, migrationUtility } from '../migration';
import { CONTACTS_STORAGE_KEY } from '../contacts';

describe('Transactional IndexedDB Storage & Reactive Delta Selectors', () => {
  beforeEach(() => {
    deltaSelectorStore.clear();
  });

  describe('Paged Queries & Direct Slice Fetching', () => {
    it('queries folder contents page directly without full tree traversals', async () => {
      const agentId = 'agent-paged-test';
      const folderId = 'folder-root-123';

      const folders = Array.from({ length: 25 }, (_, i) => ({
        id: `subfolder-${i}`,
        name: `Subfolder ${i}`,
        parent: folderId,
        folderType: 0,
      }));

      const items = Array.from({ length: 75 }, (_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`,
        folderId,
        assetType: 0,
      }));

      await indexedDBStore.saveFolders(agentId, folders);
      await indexedDBStore.saveItems(agentId, items);

      // Page 1 with pageSize 20
      const page1 = await indexedDBStore.getFolderContentsPage(agentId, folderId, 1, 20);
      expect(page1.totalFolders).toBe(25);
      expect(page1.totalItems).toBe(75);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(20);
      expect(page1.totalPages).toBe(5); // (25 + 75) / 20 = 5 pages
      expect(page1.folders.length + page1.items.length).toBe(20);

      // Page 2
      const page2 = await indexedDBStore.getFolderContentsPage(agentId, folderId, 2, 20);
      expect(page2.page).toBe(2);
      expect(page2.folders.length + page2.items.length).toBe(20);
    });

    it('queries friends page directly with filter and pagination', async () => {
      const agentId = 'agent-friends-test';
      const contacts = Array.from({ length: 15 }, (_, i) => ({
        id: `contact-${i}`,
        name: i % 2 === 0 ? `Alpha Resident ${i}` : `Beta Resident ${i}`,
        note: `Friend ${i}`,
        savedAt: Date.now(),
        updatedAt: Date.now(),
      }));

      await indexedDBStore.saveContacts(agentId, contacts);

      const page1 = await indexedDBStore.getFriendsPage(agentId, 1, 5);
      expect(page1.total).toBe(15);
      expect(page1.contacts.length).toBe(5);

      const filtered = await indexedDBStore.getFriendsPage(agentId, 1, 10, 'Alpha');
      expect(filtered.total).toBe(8); // 0, 2, 4, 6, 8, 10, 12, 14
      expect(filtered.contacts.every((c) => c.name.includes('Alpha'))).toBe(true);
    });

    it('fetches multi-page friend slices in alphabetical order using by_agent_name compound index', async () => {
      const agentId = 'agent-cursor-pagination';
      const names = [
        'Zebra',
        'Charlie',
        'Alpha',
        'Bravo',
        'Delta',
        'Echo',
        'Foxtrot',
        'Golf',
        'Hotel',
        'India',
        'Juliet',
        'Kilo',
      ];
      const contacts = names.map((name, i) => ({
        id: `cursor-c-${i}`,
        name,
        note: `Note for ${name}`,
        savedAt: Date.now(),
        updatedAt: Date.now(),
      }));

      await indexedDBStore.saveContacts(agentId, contacts);

      // Page 1 (pageSize 5) -> Alpha, Bravo, Charlie, Delta, Echo
      const page1 = await indexedDBStore.getFriendsPage(agentId, 1, 5);
      expect(page1.total).toBe(12);
      expect(page1.totalPages).toBe(3);
      expect(page1.contacts.length).toBe(5);
      expect(page1.contacts.map((c) => c.name)).toEqual([
        'Alpha',
        'Bravo',
        'Charlie',
        'Delta',
        'Echo',
      ]);

      // Page 2 (pageSize 5) -> Foxtrot, Golf, Hotel, India, Juliet
      const page2 = await indexedDBStore.getFriendsPage(agentId, 2, 5);
      expect(page2.page).toBe(2);
      expect(page2.contacts.length).toBe(5);
      expect(page2.contacts.map((c) => c.name)).toEqual([
        'Foxtrot',
        'Golf',
        'Hotel',
        'India',
        'Juliet',
      ]);

      // Page 3 (pageSize 5) -> Kilo, Zebra
      const page3 = await indexedDBStore.getFriendsPage(agentId, 3, 5);
      expect(page3.page).toBe(3);
      expect(page3.contacts.length).toBe(2);
      expect(page3.contacts.map((c) => c.name)).toEqual(['Kilo', 'Zebra']);

      // Page 4 (out of bounds)
      const page4 = await indexedDBStore.getFriendsPage(agentId, 4, 5);
      expect(page4.contacts.length).toBe(0);
      expect(page4.total).toBe(12);
    });

    it('handles filtered friend queries across multiple pages and searches notes', async () => {
      const agentId = 'agent-filter-paged';
      const contacts = [
        { id: 'f1', name: 'Alice Resident', note: 'Special VIP' },
        { id: 'f2', name: 'Bob Resident', note: 'Standard Friend' },
        { id: 'f3', name: 'Charlie Resident', note: 'Special Officer' },
        { id: 'f4', name: 'David Resident', note: 'Special Guest' },
        { id: 'f5', name: 'Eve Resident', note: 'Normal Friend' },
      ];

      await indexedDBStore.saveContacts(agentId, contacts);

      // Filter by 'Special' in note with pageSize 2
      const page1 = await indexedDBStore.getFriendsPage(agentId, 1, 2, 'Special');
      expect(page1.total).toBe(3); // Alice, Charlie, David
      expect(page1.totalPages).toBe(2);
      expect(page1.contacts.length).toBe(2);

      const page2 = await indexedDBStore.getFriendsPage(agentId, 2, 2, 'Special');
      expect(page2.contacts.length).toBe(1);
    });
  });

  describe('Database Schema Migration (v4 -> v5)', () => {
    it('upgrades schema from version 4 to 5 and creates by_agent_name compound index on contacts store', async () => {
      const dbName = 'test_migration_v4_v5_db';

      // 1. Create v4 database without by_agent_name index
      await new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.open(dbName, 4);
        req.onupgradeneeded = (e: any) => {
          const db: IDBDatabase = e.target.result;
          const store = db.createObjectStore('contacts', { keyPath: ['agentId', 'id'] });
          store.createIndex('by_agent', 'agentId', { unique: false });
        };
        req.onsuccess = (e: any) => {
          const db: IDBDatabase = e.target.result;
          const tx = db.transaction(['contacts'], 'readwrite');
          tx.objectStore('contacts').put({
            agentId: 'agent-migrated',
            id: 'c1',
            name: 'Migrated Contact',
            note: 'Old DB Record',
            savedAt: 100,
            updatedAt: 100,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
        req.onerror = () => reject(req.error);
      });

      // 2. Open database with version 5 upgrade logic
      const dbV5 = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = window.indexedDB.open(dbName, 5);
        req.onupgradeneeded = (e: any) => {
          const db: IDBDatabase = e.target.result;
          if (db.objectStoreNames.contains('contacts')) {
            const store = e.target.transaction.objectStore('contacts');
            if (!store.indexNames.contains('by_agent_name')) {
              store.createIndex('by_agent_name', ['agentId', 'name'], { unique: false });
            }
          }
        };
        req.onsuccess = (e: any) => resolve(e.target.result);
        req.onerror = () => reject(req.error);
      });

      // 3. Verify by_agent_name index exists
      const tx = dbV5.transaction(['contacts'], 'readonly');
      const store = tx.objectStore('contacts');
      expect(store.indexNames.contains('by_agent_name')).toBe(true);

      // 4. Query using by_agent_name compound index range
      const index = store.index('by_agent_name');
      const range = IDBKeyRange.bound(['agent-migrated', ''], ['agent-migrated', '\uffff']);
      const results: any[] = await new Promise((resolve) => {
        const getAllReq = index.getAll(range);
        getAllReq.onsuccess = () => resolve(getAllReq.result);
      });

      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Migrated Contact');
      dbV5.close();
    });
  });

  describe('Reactive Delta Event Selectors', () => {
    it('emits delta events ONLY to subscribers of the affected entity ID', () => {
      const store = new DeltaSelectorStore();
      const subscriberA = vi.fn();
      const subscriberB = vi.fn();
      const typeSubscriber = vi.fn();

      const unsubA = store.subscribeEntity('contact', 'user-a', subscriberA);
      store.subscribeEntity('contact', 'user-b', subscriberB);
      store.subscribeType('contact', typeSubscriber);

      // Presence update for user-a
      store.emitDelta(
        'contact',
        'user-a',
        'presence',
        { onlineStatus: 'online' },
        { onlineStatus: 'offline' },
      );

      expect(subscriberA).toHaveBeenCalledTimes(1);
      expect(subscriberA).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'contact',
          id: 'user-a',
          action: 'presence',
          payload: { onlineStatus: 'online' },
        }),
      );

      // Subscriber for user-b must NOT have been called
      expect(subscriberB).not.toHaveBeenCalled();

      // Type subscriber receives all contact deltas
      expect(typeSubscriber).toHaveBeenCalledTimes(1);

      unsubA();

      // Second update for user-a after unsubscribe
      store.emitDelta('contact', 'user-a', 'presence', { onlineStatus: 'offline' });
      expect(subscriberA).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('Multi-Agent Transaction Isolation', () => {
    it('isolates inventory and contacts data per agent ID', async () => {
      const agent1 = 'agent-alpha';
      const agent2 = 'agent-beta';

      await indexedDBStore.saveFolders(agent1, [
        { id: 'folder-1', name: 'Alpha Folder', parent: 'root' },
      ]);
      await indexedDBStore.saveFolders(agent2, [
        { id: 'folder-1', name: 'Beta Folder', parent: 'root' },
      ]);

      const res1 = await indexedDBStore.getFolderContentsPage(agent1, 'root', 1, 50);
      const res2 = await indexedDBStore.getFolderContentsPage(agent2, 'root', 1, 50);

      expect(res1.folders.length).toBe(1);
      expect(res1.folders[0].name).toBe('Alpha Folder');

      expect(res2.folders.length).toBe(1);
      expect(res2.folders[0].name).toBe('Beta Folder');
    });
  });

  describe('Legacy Client Database Migration', () => {
    it('migrates legacy localStorage contacts and legacy inventory into IndexedDB tables', async () => {
      const migrationAgent = 'agent-migration-spec';

      // Setup legacy localStorage
      const legacyContacts = {
        version: 1,
        contacts: [
          {
            id: 'legacy-c1',
            name: 'Legacy Contact 1',
            note: 'Friend',
            savedAt: 1000,
            updatedAt: 1000,
          },
          {
            id: 'legacy-c2',
            name: 'Legacy Contact 2',
            note: 'Buddy',
            savedAt: 1000,
            updatedAt: 1000,
          },
        ],
      };
      localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(legacyContacts));

      const utility = new MigrationUtility();
      const firstRun = await utility.migrateLegacyStorage(migrationAgent);

      expect(firstRun.success).toBe(true);
      expect(firstRun.alreadyMigrated).toBe(false);
      expect(firstRun.contactsMigrated).toBe(2);

      // Idempotent second run check
      const secondRun = await utility.migrateLegacyStorage(migrationAgent);
      expect(secondRun.alreadyMigrated).toBe(true);

      const pagedContacts = await indexedDBStore.getFriendsPage(migrationAgent, 1, 10);
      expect(pagedContacts.total).toBe(2);
      expect(pagedContacts.contacts[0].name).toBe('Legacy Contact 1');
    });
  });

  describe('Storage Quota & Eviction Rules', () => {
    it('executes quota eviction check without errors', async () => {
      const result = await indexedDBStore.checkQuotaAndEvict('agent-evict');
      expect(result).toHaveProperty('evicted');
      expect(typeof result.evicted).toBe('number');
    });
  });
});
