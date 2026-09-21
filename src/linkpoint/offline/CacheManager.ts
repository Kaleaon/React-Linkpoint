import { Utils } from '../utils';

export interface CacheSettings {
  maxSizeBytes: number;
  autoClearOnLimit: boolean;
}

export const CACHE_SETTINGS_STORAGE_KEY = 'linkpoint_cache_settings';

export const CACHE_SIZE_MIN_BYTES = 256 * 1024 * 1024;
export const CACHE_SIZE_MAX_BYTES = 1024 * 1024 * 1024 * 1024;
export const CACHE_SIZE_DEFAULT_BYTES = 1024 * 1024 * 1024;

export class CacheManager extends Utils.EventEmitter {
  private settings: CacheSettings;

  constructor() {
    super();
    this.settings = this.loadSettings();
  }

  private loadSettings(): CacheSettings {
    const saved = Utils.storage.get(CACHE_SETTINGS_STORAGE_KEY, null);
    if (saved && saved.maxSizeBytes) {
      return saved;
    }
    return {
      maxSizeBytes: CACHE_SIZE_DEFAULT_BYTES,
      autoClearOnLimit: false
    };
  }

  public setMaxSizeBytes(bytes: number): CacheSettings {
    const clampedBytes = Utils.clamp(bytes, CACHE_SIZE_MIN_BYTES, CACHE_SIZE_MAX_BYTES);
    this.settings.maxSizeBytes = clampedBytes;
    Utils.storage.set(CACHE_SETTINGS_STORAGE_KEY, this.settings);
    this.emit('cacheSettingsUpdated', this.settings);
    return this.settings;
  }

  public setMaxSizeMB(megabytes: number): CacheSettings {
    return this.setMaxSizeBytes(megabytes * 1024 * 1024);
  }

  public setMaxSizeGB(gigabytes: number): CacheSettings {
    return this.setMaxSizeBytes(gigabytes * 1024 * 1024 * 1024);
  }

  public getSettings(): CacheSettings {
    return { ...this.settings };
  }

  public getEstimatedUsageBytes(): number {
    let totalChars = 0;
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const value = localStorage.getItem(key) || '';
            totalChars += key.length + value.length;
          }
        }
      }
    } catch (e) {
      // Ignore
    }
    return totalChars * 2;
  }

  public getUsagePercentage(): number {
    const usage = this.getEstimatedUsageBytes();
    if (this.settings.maxSizeBytes <= 0) return 0;
    return Math.min(100, Math.round((usage / this.settings.maxSizeBytes) * 10000) / 100);
  }

  public clearCache(): number {
    const usageBefore = this.getEstimatedUsageBytes();
    try {
      if (typeof localStorage !== 'undefined') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('linkpoint_local_asset_') || key.startsWith('linkpoint_cache_'))) {
            keysToRemove.push(key);
          }
        }
        for (const key of keysToRemove) {
          localStorage.removeItem(key);
        }
      }
      this.emit('cacheCleared', { freedBytes: usageBefore });
    } catch (e) {
      console.error('Error clearing cache:', e);
    }
    return usageBefore;
  }
}
