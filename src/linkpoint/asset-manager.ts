/**
 * Linkpoint - Client Asset Manager
 *
 * Dispatches asset fetch requests through client and capabilities,
 * caches decoded strings in memory, and coordinates notecard authoring updates.
 */

import { Utils } from './utils';
import { decodeLindenText } from './notecard';
import { slBridge } from './sl-bridge';
import {
  NotecardCapabilityService,
  type UploadNotecardResult,
} from './services/notecard-capability-service';
import type { CapabilitiesManager } from './phase2/capabilities';
import type { InventoryManager } from './inventory';

export class AssetManager extends Utils.EventEmitter {
  private cache = new Map<string, string>();
  private inFlight = new Map<string, Promise<string>>();
  public notecardService: NotecardCapabilityService;

  constructor(capabilitiesManager?: CapabilitiesManager, inventoryManager?: InventoryManager) {
    super();
    this.notecardService = new NotecardCapabilityService(capabilitiesManager, inventoryManager);
  }

  setCapabilitiesManager(capabilitiesManager: CapabilitiesManager): void {
    this.notecardService.setCapabilitiesManager(capabilitiesManager);
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.notecardService.setInventoryManager(inventoryManager);
  }

  getCached(id: string): string | undefined {
    return this.cache.get(id);
  }

  hasCached(id: string): boolean {
    return this.cache.has(id);
  }

  setCached(id: string, text: string): void {
    this.cache.set(id, text);
  }

  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Dispatches asset fetch request for notecards and caches decoded strings in memory.
   */
  async fetchNotecard(
    asset: {
      id: string;
      assetId?: string;
      assetType?: number;
      data?: any;
      description?: string;
      name?: string;
    },
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<string> {
    if (!asset || (!asset.id && !asset.assetId)) {
      throw new Error('Valid asset reference is required for fetchNotecard');
    }

    const key = asset.assetId || asset.id;

    // 1. Check in-memory cache first
    if (this.cache.has(key)) {
      if (onProgress) onProgress(100, 100);
      return this.cache.get(key)!;
    }

    // Also check item id if assetId was queried
    if (asset.id && this.cache.has(asset.id)) {
      if (onProgress) onProgress(100, 100);
      return this.cache.get(asset.id)!;
    }

    // 2. Check if asset already has loaded data
    if (asset.data !== undefined && asset.data !== null && asset.data !== '') {
      const decoded = decodeLindenText(asset.data);
      this.cache.set(key, decoded);
      if (asset.id) this.cache.set(asset.id, decoded);
      if (onProgress) onProgress(100, 100);
      return decoded;
    }

    // 3. Deduplicate in-flight requests
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key)!;
    }

    const requestPromise = (async () => {
      try {
        if (onProgress) onProgress(10, 100);

        if (slBridge?.connected) {
          // Fetch via bridge RPC
          if (onProgress) onProgress(40, 100);
          const response = await slBridge.call<{ id: string; data?: any }>('fetchNotecard', {
            id: key,
            itemId: asset.id,
          });
          if (onProgress) onProgress(90, 100);
          const rawData = response?.data ?? '';
          const decoded = decodeLindenText(rawData);
          this.cache.set(key, decoded);
          if (asset.id) this.cache.set(asset.id, decoded);
          if (onProgress) onProgress(100, 100);
          return decoded;
        }

        // Offline / fallback path: simulate progress
        if (onProgress) {
          onProgress(50, 100);
          await new Promise((resolve) => setTimeout(resolve, 60));
          onProgress(100, 100);
        }

        const fallbackContent = asset.data ? decodeLindenText(asset.data) : asset.description || '';
        this.cache.set(key, fallbackContent);
        if (asset.id) this.cache.set(asset.id, fallbackContent);
        return fallbackContent;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, requestPromise);
    return requestPromise;
  }

  /**
   * Saves and uploads notecard text, updating memory cache and inventory metadata.
   */
  async saveNotecard(params: {
    itemId: string;
    name?: string;
    description?: string;
    text: string;
  }): Promise<UploadNotecardResult> {
    const result = await this.notecardService.uploadNotecard(params);
    this.cache.set(params.itemId, params.text);
    if (result.newAssetId) {
      this.cache.set(result.newAssetId, params.text);
    }
    this.emit('notecard_saved', { itemId: params.itemId, text: params.text, result });
    return result;
  }
}

export const assetManager = new AssetManager();
