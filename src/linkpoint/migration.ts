/**
 * Client Database Migration Utility
 * Converts legacy monolithic JSON files and localStorage objects into isolated IndexedDB tables upon startup.
 */

import { indexedDBStore, STORE_INVENTORY } from './indexeddb-store';
import { idbWorkerBridge } from './idb-worker';
import { CONTACTS_STORAGE_KEY } from './contacts';

export interface MigrationResult {
  success: boolean;
  alreadyMigrated: boolean;
  foldersMigrated: number;
  itemsMigrated: number;
  contactsMigrated: number;
  error?: string;
}

export class MigrationUtility {
  /**
   * Run migration for specified agent ID if not already migrated.
   */
  public async migrateLegacyStorage(agentId: string = 'current'): Promise<MigrationResult> {
    try {
      const isAlreadyMigrated = await indexedDBStore.isMigrated(agentId);
      if (isAlreadyMigrated) {
        return {
          success: true,
          alreadyMigrated: true,
          foldersMigrated: 0,
          itemsMigrated: 0,
          contactsMigrated: 0,
        };
      }

      let foldersMigrated = 0;
      let itemsMigrated = 0;
      let contactsMigrated = 0;

      // 1. Migrate legacy monolithic inventory JSON from IndexedDB or localStorage
      const db = await indexedDBStore.getDB();
      if (db && db.objectStoreNames.contains(STORE_INVENTORY)) {
        const legacyRecord: any = await new Promise((resolve) => {
          try {
            const tx = db.transaction([STORE_INVENTORY], 'readonly');
            const req = tx.objectStore(STORE_INVENTORY).get(`inv_${agentId}`);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });

        if (legacyRecord?.data) {
          const folders = Array.isArray(legacyRecord.data.folders) ? legacyRecord.data.folders : [];
          const items = Array.isArray(legacyRecord.data.items) ? legacyRecord.data.items : [];

          if (folders.length > 0) {
            await idbWorkerBridge.saveFolders(agentId, folders);
            foldersMigrated = folders.length;
          }
          if (items.length > 0) {
            await idbWorkerBridge.saveItems(agentId, items);
            itemsMigrated = items.length;
          }
        }
      }

      // 2. Migrate legacy contacts from localStorage
      if (typeof localStorage !== 'undefined') {
        try {
          const text = localStorage.getItem(CONTACTS_STORAGE_KEY);
          if (text) {
            const parsed = JSON.parse(text);
            const contactsList = Array.isArray(parsed?.contacts) ? parsed.contacts : [];
            if (contactsList.length > 0) {
              await idbWorkerBridge.saveContacts(agentId, contactsList);
              contactsMigrated = contactsList.length;
            }
          }
        } catch (lsErr) {
          console.warn('[MigrationUtility] Error reading legacy contacts localStorage:', lsErr);
        }
      }

      // Mark migration complete
      await indexedDBStore.setMigrated(agentId, {
        foldersCount: foldersMigrated,
        itemsCount: itemsMigrated,
        contactsCount: contactsMigrated,
      });

      return {
        success: true,
        alreadyMigrated: false,
        foldersMigrated,
        itemsMigrated,
        contactsMigrated,
      };
    } catch (err: any) {
      return {
        success: false,
        alreadyMigrated: false,
        foldersMigrated: 0,
        itemsMigrated: 0,
        contactsMigrated: 0,
        error: err?.message || String(err),
      };
    }
  }
}

export const migrationUtility = new MigrationUtility();
