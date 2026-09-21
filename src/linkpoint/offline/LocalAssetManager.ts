import { Utils } from '../utils';

export type AssetType = 'texture' | 'sound' | 'script' | 'mesh' | 'animation' | 'bodypart' | 'clothing';

export interface LocalAsset {
  id: string;
  name: string;
  description: string;
  assetType: AssetType;
  creatorId: string;
  ownerId: string;
  data: string | Uint8Array;
  sizeBytes: number;
  uploadedAt: number;
  isUploadedToSL: boolean;
}

export const ASSET_STORAGE_PREFIX = 'linkpoint_local_asset_';

export class LocalAssetManager extends Utils.EventEmitter {
  private assets: Map<string, LocalAsset> = new Map();

  constructor() {
    super();
    this.loadPersistedAssets();
  }

  private loadPersistedAssets() {
    try {
      if (typeof localStorage !== 'undefined') {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(ASSET_STORAGE_PREFIX));
        for (const key of keys) {
          const item = Utils.storage.get(key, null);
          if (item && item.id) {
            this.assets.set(item.id, item);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load local assets from storage:', e);
    }
  }

  public uploadAsset(
    name: string,
    assetType: AssetType,
    data: string | Uint8Array,
    description: string = '',
    ownerId: string = 'local_user'
  ): LocalAsset {
    const assetId = Utils.generateUUID();
    const sizeBytes = typeof data === 'string' ? data.length : data.byteLength;

    const asset: LocalAsset = {
      id: assetId,
      name,
      description,
      assetType,
      creatorId: ownerId,
      ownerId,
      data,
      sizeBytes,
      uploadedAt: Date.now(),
      isUploadedToSL: false
    };

    this.assets.set(assetId, asset);
    Utils.storage.set(`${ASSET_STORAGE_PREFIX}${assetId}`, asset);
    this.emit('assetUploaded', asset);
    return asset;
  }

  public getAsset(assetId: string): LocalAsset | undefined {
    return this.assets.get(assetId);
  }

  public getAllAssets(): LocalAsset[] {
    return Array.from(this.assets.values());
  }

  public deleteAsset(assetId: string): boolean {
    const existed = this.assets.delete(assetId);
    if (existed) {
      Utils.storage.remove(`${ASSET_STORAGE_PREFIX}${assetId}`);
      this.emit('assetDeleted', assetId);
    }
    return existed;
  }

  public getTotalAssetsSizeBytes(): number {
    let total = 0;
    for (const asset of this.assets.values()) {
      total += asset.sizeBytes;
    }
    return total;
  }
}
