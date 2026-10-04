/**
 * Linkpoint PWA - Inventory Management
 */

import { Utils } from './utils';
import { LLSD, LLSDUUID } from './llsd';
import { SLConnectionFull } from './sl-connection-full';
import { AuthManager } from './auth';
import { corsHandler } from './cors-handler';
import { slBridge } from './sl-bridge';
import { localCache } from './local-cache';

export class InventoryManager extends Utils.EventEmitter {
  public protocol: SLConnectionFull;
  public auth: AuthManager;
  public rootFolder: any = null;
  public items: Map<string, any> = new Map();
  public folders: Map<string, any> = new Map();
  public loadedFromCache: boolean = false;
  public isLoading: boolean = false;

  constructor(protocolManager: SLConnectionFull, authManager: AuthManager) {
    super();
    this.protocol = protocolManager;
    this.auth = authManager;
  }

  normalizeFolder(rawFolder: any, defaultParentId: string = ''): any {
    if (!rawFolder || typeof rawFolder !== 'object') return null;
    const id = String(rawFolder.id || rawFolder.folder_id || rawFolder.category_id || Utils.generateUUID());
    const name = String(rawFolder.name || rawFolder.folder_name || 'New Folder');
    const parent = String(rawFolder.parent || rawFolder.parent_id || defaultParentId || '');
    const folderType = rawFolder.folderType ?? rawFolder.preferred_type ?? rawFolder.type_default ?? rawFolder.type ?? -1;
    const version = Number(rawFolder.version ?? 0);
    const children = Array.isArray(rawFolder.children) ? [...rawFolder.children] : [];

    return {
      ...rawFolder,
      id,
      name,
      type: 'folder',
      folderType,
      parent,
      children,
      version,
    };
  }

  normalizeItem(rawItem: any, defaultParentId: string = ''): any {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const id = String(rawItem.id || rawItem.item_id || Utils.generateUUID());
    const name = String(rawItem.name || rawItem.item_name || 'New Item');
    const parent = String(rawItem.parent || rawItem.parent_id || defaultParentId || '');
    const assetType = rawItem.assetType ?? rawItem.asset_type ?? rawItem.type_default ?? rawItem.type ?? 0;
    const assetId = String(rawItem.assetId || rawItem.asset_id || rawItem.asset_uuid || '');
    const description = String(rawItem.description || rawItem.desc || '');
    const invType = Number(rawItem.invType ?? rawItem.inv_type ?? 0);
    const flags = Number(rawItem.flags ?? 0);
    const creationDate = rawItem.creationDate || rawItem.creation_date || 0;
    const ownerId = String(rawItem.ownerId || rawItem.owner_id || '');
    const groupId = String(rawItem.groupId || rawItem.group_id || '');
    const permissions = rawItem.permissions || rawItem.permissions_base || {};
    const data = rawItem.data || null;

    return {
      ...rawItem,
      id,
      name,
      type: 'item',
      assetType,
      assetId,
      parent,
      description,
      invType,
      flags,
      creationDate,
      ownerId,
      groupId,
      permissions,
      data,
    };
  }

  private _addNormalizedFolder(rawFolder: any, defaultParentId: string = '') {
    const folder = this.normalizeFolder(rawFolder, defaultParentId);
    if (!folder) return null;
    const existing = this.folders.get(folder.id);
    if (existing && Array.isArray(existing.children)) {
      folder.children = Array.from(new Set([...folder.children, ...existing.children]));
    }
    this.folders.set(folder.id, folder);
    if (folder.parent) {
      const parentFolder = this.folders.get(folder.parent);
      if (parentFolder && Array.isArray(parentFolder.children) && !parentFolder.children.includes(folder.id)) {
        parentFolder.children.push(folder.id);
      }
    }
    return folder;
  }

  private _addNormalizedItem(rawItem: any, defaultParentId: string = '') {
    const item = this.normalizeItem(rawItem, defaultParentId);
    if (!item) return null;
    this.items.set(item.id, item);
    if (item.parent) {
      const parentFolder = this.folders.get(item.parent);
      if (parentFolder && Array.isArray(parentFolder.children) && !parentFolder.children.includes(item.id)) {
        parentFolder.children.push(item.id);
      }
    }
    return item;
  }

  async init() {
    this.protocol.on('inventory_update', (data: any) => this.handleInventoryUpdate(data));
  }

  async load(forceRebuild = false) {
    if (!this.auth.isLoggedIn()) return;
    this.isLoading = true;
    this.emit('inventory_loading_start');
    const agentId = this.auth.user?.id || this.protocol.agentId || 'current';

    try {
      // 1. Check local/flashdrive cache first to avoid slow rebuild
      if (!forceRebuild) {
        try {
          const cached = await localCache.loadInventory(agentId);
          if (cached && Array.isArray(cached.folders) && cached.folders.length > 0) {
            const rootId = cached.rootId || this.protocol.inventoryRoot || 'root';
            this.rootFolder = this._addNormalizedFolder({ id: rootId, name: cached.rootName || 'My Inventory', parent: '' });

            for (const f of cached.folders) {
              this._addNormalizedFolder(f, rootId);
            }

            if (Array.isArray(cached.items)) {
              for (const item of cached.items) {
                this._addNormalizedItem(item, rootId);
              }
            }

            this.loadedFromCache = true;
            this.isLoading = false;
            this.emit('inventory_loaded');
            this.emit('inventory_updated');
            this.emit('inventory_loading_end');
            if (cached.folders.length > 50) {
              return;
            }
          }
        } catch (cacheErr) {
          console.warn('[Inventory] Cache read error:', cacheErr);
        }
      }

      if (slBridge.connected) {
        try {
          const inv = await slBridge.fetchInventory();
          if (inv) {
            const rootId = inv.folderId || this.protocol.inventoryRoot || 'root';
            this.rootFolder = this._addNormalizedFolder({ id: rootId, name: inv.folderName || 'My Inventory', parent: '' });
            if (Array.isArray(inv.folders)) {
              for (const f of inv.folders) {
                this._addNormalizedFolder(f, rootId);
              }
            }
            if (Array.isArray(inv.items)) {
              for (const item of inv.items) {
                this._addNormalizedItem(item, rootId);
              }
            }

            this.loadedFromCache = false;
            await localCache.saveInventory(agentId, {
              folders: Array.from(this.folders.values()),
              items: Array.from(this.items.values()),
              rootId,
              rootName: inv.folderName || 'My Inventory',
            });

            this.isLoading = false;
            this.emit('inventory_loaded');
            this.emit('inventory_updated');
            this.emit('inventory_loading_end');
            return;
          }
        } catch (err) {
          console.warn('[Inventory] slBridge inventory load error:', err);
        }
      }

      const inventoryRoot = this.protocol.inventoryRoot;
      if (!inventoryRoot) {
        this.isLoading = false;
        this.emit('inventory_loading_end');
        return;
      }

      this.rootFolder = this._addNormalizedFolder({ id: inventoryRoot, name: 'My Inventory', parent: '' });
      await this.fetchFolderContents(inventoryRoot);
      this.isLoading = false;
      this.emit('inventory_loaded');
      this.emit('inventory_loading_end');
    } catch (error) {
      this.isLoading = false;
      this.emit('inventory_loading_end');
      console.error('Failed to load inventory:', error);
    }
  }

  async fetchFolderContents(folderId: string) {
    if (slBridge.connected) {
      try {
        const inv = await slBridge.fetchInventory(folderId);
        if (inv) {
          if (Array.isArray(inv.folders)) {
            for (const f of inv.folders) {
              this._addNormalizedFolder(f, folderId);
            }
          }
          if (Array.isArray(inv.items)) {
            for (const item of inv.items) {
              this._addNormalizedItem(item, folderId);
            }
          }
          this.emit('inventory_updated');
          this.emit('inventory_loaded');
          return;
        }
      } catch (err) {
        console.warn('[Inventory] slBridge fetchFolderContents error:', err);
      }
    }

    const url = this.protocol.getCapability('FetchInventoryDescendents2');
    if (!url) return;

    try {
      const ownerId = this.auth.user?.id || this.protocol.agentId || '00000000-0000-0000-0000-000000000000';
      const requestData = {
        folders: [{
          folder_id: new LLSDUUID(folderId),
          owner_id: new LLSDUUID(ownerId),
          fetch_folders: true,
          fetch_items: true,
          sort_order: 1
        }]
      };

      const response = await corsHandler.makeRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/llsd+xml' },
        body: LLSD.buildXML(requestData)
      });

      if (response && response.ok) {
        const text = await response.text();
        const data = LLSD.parseXML(text);
        this.handleInventoryResponse(data);
      }
    } catch (error) {
      console.error(`Error fetching folder ${folderId}:`, error);
    }
  }

  handleInventoryResponse(data: any) {
    if (!data) return;

    const foldersList = Array.isArray(data.folders) ? data.folders : (data.categories || data.items ? [data] : []);

    foldersList.forEach((folderData: any) => {
      const defaultParent = folderData.folder_id || folderData.category_id || '';

      if (Array.isArray(folderData.categories)) {
        folderData.categories.forEach((cat: any) => {
          this._addNormalizedFolder(cat, defaultParent);
        });
      }

      if (Array.isArray(folderData.items)) {
        folderData.items.forEach((itemData: any) => {
          this._addNormalizedItem(itemData, defaultParent);
        });
      }
    });

    this.emit('inventory_updated');
    this.emit('inventory_loaded');
  }

  handleInventoryUpdate(data: any) {
    if (data) {
      if (Array.isArray(data.folders)) {
        data.folders.forEach((f: any) => this._addNormalizedFolder(f));
      }
      if (Array.isArray(data.categories)) {
        data.categories.forEach((f: any) => this._addNormalizedFolder(f));
      }
      if (Array.isArray(data.items)) {
        data.items.forEach((i: any) => this._addNormalizedItem(i));
      }
    }
    this.emit('inventory_updated', data);
  }

  moveItemUp(id: string): boolean {
    const entry = this.items.get(id) || this.folders.get(id);
    if (!entry || !entry.parent) return false;
    const parentFolder = this.folders.get(entry.parent);
    if (!parentFolder || !Array.isArray(parentFolder.children)) return false;
    const idx = parentFolder.children.indexOf(id);
    if (idx <= 0) return false;
    const temp = parentFolder.children[idx];
    parentFolder.children[idx] = parentFolder.children[idx - 1];
    parentFolder.children[idx - 1] = temp;
    this.emit('inventory_updated');
    return true;
  }

  moveItemDown(id: string): boolean {
    const entry = this.items.get(id) || this.folders.get(id);
    if (!entry || !entry.parent) return false;
    const parentFolder = this.folders.get(entry.parent);
    if (!parentFolder || !Array.isArray(parentFolder.children)) return false;
    const idx = parentFolder.children.indexOf(id);
    if (idx < 0 || idx >= parentFolder.children.length - 1) return false;
    const temp = parentFolder.children[idx];
    parentFolder.children[idx] = parentFolder.children[idx + 1];
    parentFolder.children[idx + 1] = temp;
    this.emit('inventory_updated');
    return true;
  }

  moveItemToFolder(id: string, targetFolderId: string): boolean {
    const entry = this.items.get(id) || this.folders.get(id);
    if (!entry) return false;
    if (entry.id === targetFolderId) return false;

    if (entry.type === 'folder') {
      let curr: any = this.folders.get(targetFolderId);
      while (curr) {
        if (curr.id === id) return false;
        curr = curr.parent ? this.folders.get(curr.parent) : null;
      }
    }

    const targetFolder = this.folders.get(targetFolderId);
    if (!targetFolder) return false;

    if (entry.parent) {
      const oldParent = this.folders.get(entry.parent);
      if (oldParent && Array.isArray(oldParent.children)) {
        oldParent.children = oldParent.children.filter((childId: string) => childId !== id);
      }
    }

    entry.parent = targetFolderId;
    if (!Array.isArray(targetFolder.children)) {
      targetFolder.children = [];
    }
    if (!targetFolder.children.includes(id)) {
      targetFolder.children.push(id);
    }

    this.emit('inventory_updated');
    return true;
  }
}
