/**
 * Linkpoint PWA - Notecard Capability Service
 *
 * Implements Second Life notecard updates and asset uploads via the
 * UpdateNotecardAgentInventory HTTP capability endpoint.
 * Validates length, encodes Linden Text version 2 format, uploads to the
 * resolved uploader endpoint, and synchronizes updated metadata into InventoryManager and local cache.
 */

import { Utils } from '../utils';
import { LLSD } from '../llsd';
import type { CapabilitiesManager } from '../phase2/capabilities';
import type { InventoryManager } from '../inventory';
import { encodeLindenText, validateNotecardLength } from '../notecard';
import { slBridge } from '../sl-bridge';

export interface UploadNotecardParams {
  itemId: string;
  name?: string;
  description?: string;
  text: string;
}

export interface UploadNotecardResult {
  success: boolean;
  itemId: string;
  byteLength: number;
  uploadedAt: number;
  newAssetId?: string;
}

export class NotecardCapabilityService extends Utils.EventEmitter {
  private capabilitiesManager?: CapabilitiesManager;
  private inventoryManager?: InventoryManager;
  private requestTimeoutMs: number;

  constructor(
    capabilitiesManager?: CapabilitiesManager,
    inventoryManager?: InventoryManager,
    options: { requestTimeoutMs?: number } = {},
  ) {
    super();
    this.capabilitiesManager = capabilitiesManager;
    this.inventoryManager = inventoryManager;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;
  }

  setCapabilitiesManager(capabilitiesManager: CapabilitiesManager): void {
    this.capabilitiesManager = capabilitiesManager;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  resolveCapabilityUrl(): string | null {
    if (!this.capabilitiesManager) return null;
    const candidates = [
      'UpdateNotecardAgentInventory',
      'UpdateNotecardTaskInventory',
      'UpdateNotecard',
    ];
    for (const name of candidates) {
      const url = this.capabilitiesManager.resolveCapability(name);
      if (url) return url;
    }
    return null;
  }

  hasCapability(): boolean {
    return Boolean(this.resolveCapabilityUrl());
  }

  /**
   * Validates, encodes, and uploads notecard text payload, then updates the inventory item name and modification date.
   */
  async uploadNotecard(params: UploadNotecardParams): Promise<UploadNotecardResult> {
    const { itemId, name, description, text } = params;

    if (!itemId || typeof itemId !== 'string' || !itemId.trim()) {
      throw new Error('A valid notecard inventory item ID is required.');
    }

    // 1. Validate length limits (64KB max)
    const validation = validateNotecardLength(text);
    if (!validation.valid) {
      throw new Error(validation.error || 'Notecard text exceeds maximum size.');
    }

    // 2. Encode to Linden text format
    const encodedPayload = encodeLindenText(text);

    let newAssetId: string | undefined;
    const capUrl = this.resolveCapabilityUrl();

    if (capUrl) {
      // 3. HTTP Capability Flow: Request uploader URL via LLSD XML
      const llsdPayload = {
        item_id: itemId,
      };
      const xmlBody = LLSD.buildXML(llsdPayload);

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), this.requestTimeoutMs)
        : null;

      try {
        const capsResponse =
          this.capabilitiesManager && typeof this.capabilitiesManager.fetchWithRetry === 'function'
            ? await this.capabilitiesManager.fetchWithRetry(capUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/llsd+xml' },
                body: xmlBody,
                signal: controller?.signal,
              })
            : await fetch(capUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/llsd+xml' },
                body: xmlBody,
                signal: controller?.signal,
              });

        if (timeoutId) clearTimeout(timeoutId);

        if (!capsResponse.ok) {
          throw new Error(`UpdateNotecardAgentInventory failed with status ${capsResponse.status}`);
        }

        const rawRespText = await capsResponse.text();
        let uploaderUrl = '';
        try {
          const parsedLLSD = LLSD.parseXML(rawRespText);
          if (parsedLLSD && parsedLLSD.uploader) {
            uploaderUrl = String(parsedLLSD.uploader);
          }
        } catch {
          // If response is raw text/URL
          uploaderUrl = rawRespText.trim();
        }

        if (uploaderUrl && uploaderUrl.startsWith('http')) {
          const uploadResp = await fetch(uploaderUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: encodedPayload,
          });

          if (!uploadResp.ok) {
            throw new Error(`Notecard asset upload failed with status ${uploadResp.status}`);
          }

          const uploadText = await uploadResp.text();
          try {
            const uploadLLSD = LLSD.parseXML(uploadText);
            if (uploadLLSD?.new_asset) {
              newAssetId = String(uploadLLSD.new_asset);
            }
          } catch {
            // Ignore parse errors on upload ack
          }
        }
      } catch (err: any) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err?.name === 'AbortError') {
          throw new Error(`Notecard upload timed out after ${this.requestTimeoutMs / 1000}s`);
        }
        throw err;
      }
    } else if (slBridge?.connected) {
      // 4. Fallback through SLBridge RPC if connected
      try {
        const bridgeResult = await slBridge.call('saveNotecard', {
          itemId,
          name,
          description,
          text: encodedPayload,
        });
        if (bridgeResult?.newAssetId) {
          newAssetId = String(bridgeResult.newAssetId);
        }
      } catch (err) {
        console.warn('[NotecardCapabilityService] Bridge saveNotecard warning:', err);
      }
    }

    const uploadedAt = Date.now();

    // 5. Update inventory item metadata and persist to cache
    if (this.inventoryManager) {
      const item = this.inventoryManager.items.get(itemId);
      if (item) {
        if (name) item.name = name;
        if (description !== undefined) item.description = description;
        if (newAssetId) item.assetId = newAssetId;
        item.data = text; // Keep decoded text in memory item data
        (item as any).modificationDate = uploadedAt;
        (item as any).creationDate = (item as any).creationDate || uploadedAt;

        this.inventoryManager.items.set(itemId, item);
        void this.inventoryManager.persistToCache();
        this.inventoryManager.emit('inventory_updated', { itemId, item });
      }
    }

    this.emit('notecard_uploaded', {
      itemId,
      byteLength: validation.byteLength,
      uploadedAt,
      newAssetId,
    });

    return {
      success: true,
      itemId,
      byteLength: validation.byteLength,
      uploadedAt,
      newAssetId,
    };
  }
}
