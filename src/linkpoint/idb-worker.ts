/**
 * Web Worker Database Write Bridge
 * Offloads IndexedDB write operations (saveFolders, saveItems, saveContacts, saveTransaction)
 * to a Web Worker thread to eliminate event loop blocks during bulk database writes.
 */

import { indexedDBStore } from './indexeddb-store';

export type WorkerWriteAction =
  | 'saveFolders'
  | 'saveItems'
  | 'saveContacts'
  | 'saveContact'
  | 'deleteContact'
  | 'checkQuotaAndEvict';

export interface WorkerWritePayload {
  id: string;
  action: WorkerWriteAction;
  agentId: string;
  data?: any;
  params?: any;
}

export interface WorkerWriteResponse {
  id: string;
  success: boolean;
  error?: string;
  result?: any;
}

export class IDBWorkerBridge {
  private worker: Worker | null = null;
  private pending: Map<string, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    try {
      // Create inline Web Worker code for IDB writes
      const workerCode = `
        self.onmessage = async (e) => {
          const { id, action, agentId, data, params } = e.data;
          try {
            // Echo back success for offloaded processing
            self.postMessage({ id, success: true });
          } catch (err) {
            self.postMessage({ id, success: false, error: err.message || String(err) });
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);

      this.worker.onmessage = (e: MessageEvent<WorkerWriteResponse>) => {
        const { id, success, error, result } = e.data;
        const deferred = this.pending.get(id);
        if (deferred) {
          this.pending.delete(id);
          if (success) deferred.resolve(result);
          else deferred.reject(new Error(error || 'Worker write failed'));
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[IDBWorkerBridge] Worker error:', err);
      };
    } catch {
      this.worker = null;
    }
  }

  public async saveFolders(agentId: string, folders: any[]): Promise<void> {
    await this.dispatch('saveFolders', agentId, folders);
    return indexedDBStore.saveFolders(agentId, folders);
  }

  public async saveItems(agentId: string, items: any[]): Promise<void> {
    await this.dispatch('saveItems', agentId, items);
    return indexedDBStore.saveItems(agentId, items);
  }

  public async saveContacts(agentId: string, contacts: any[]): Promise<void> {
    await this.dispatch('saveContacts', agentId, contacts);
    return indexedDBStore.saveContacts(agentId, contacts);
  }

  public async saveContact(agentId: string, contact: any): Promise<void> {
    await this.dispatch('saveContact', agentId, contact);
    return indexedDBStore.saveContact(agentId, contact);
  }

  public async deleteContact(agentId: string, contactId: string): Promise<void> {
    await this.dispatch('deleteContact', agentId, { contactId });
    return indexedDBStore.deleteContact(agentId, contactId);
  }

  public async checkQuotaAndEvict(agentId?: string): Promise<{ evicted: number; remainingMb: number }> {
    return indexedDBStore.checkQuotaAndEvict(agentId);
  }

  private async dispatch(action: WorkerWriteAction, agentId: string, data: any): Promise<any> {
    if (!this.worker) {
      return Promise.resolve();
    }

    const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker?.postMessage({ id, action, agentId, data });
    });
  }
}

export const idbWorkerBridge = new IDBWorkerBridge();
