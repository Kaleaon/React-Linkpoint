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
import {
  assertValidBatchSize,
  chunkUpdatesForUdp,
  isPlaceholderAvatarName,
  normalizeItemPermissions,
  ZERO_UUID,
  type BatchUpdateProgress,
  type InventoryItemUpdatePayload,
} from './services/inventory-properties-service';

export enum LLAssetType {
  Texture = 0,
  Sound = 1,
  CallingCard = 2,
  Landmark = 3,
  Script = 4,
  Clothing = 5,
  Object = 6,
  Notecard = 7,
  Category = 8,
  Root = 9,
  LSLText = 10,
  LSLBytecode = 11,
  Bodypart = 13,
  Trash = 14,
  Snapshot = 15,
  LostAndFound = 16,
  SoundWAV = 17,
  ImageTGA = 18,
  ImageJPEG = 19,
  Animation = 20,
  Gesture = 21,
  SimState = 22,
  Favorite = 23,
  Link = 24,
  LinkFolder = 25,
  Settings = 26,
  Mesh = 49,
  Material = 56,
  Unknown = -1,
}

export enum LLFolderType {
  None = -1,
  Texture = 0,
  Sound = 1,
  CallingCard = 2,
  Landmark = 3,
  Clothing = 5,
  Object = 6,
  Notecard = 7,
  Root = 8,
  LSLText = 10,
  Bodypart = 12,
  Trash = 13,
  Snapshot = 14,
  LostAndFound = 15,
  Animation = 19,
  Gesture = 20,
  Favorite = 22,
  Inbox = 23,
  Outfit = 24,
  Settings = 25,
  Environment = 26,
  Suitcase = 46,
  Material = 56,
}

export function parseLLFolderType(val: any): LLFolderType {
  if (typeof val === 'number' && Number.isInteger(val)) {
    return Object.values(LLFolderType).includes(val) ? (val as LLFolderType) : LLFolderType.None;
  }
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && Object.values(LLFolderType).includes(num)) {
      return num as LLFolderType;
    }
    const key = val.trim();
    if (key in LLFolderType) {
      return (LLFolderType as any)[key];
    }
  }
  return LLFolderType.None;
}

export function parseLLAssetType(val: any): LLAssetType {
  if (typeof val === 'number' && Number.isInteger(val)) {
    return Object.values(LLAssetType).includes(val) ? (val as LLAssetType) : LLAssetType.Unknown;
  }
  if (typeof val === 'string') {
    const num = Number(val);
    if (!isNaN(num) && Object.values(LLAssetType).includes(num)) {
      return num as LLAssetType;
    }
    const key = val.trim();
    const strMap: Record<string, LLAssetType> = {
      texture: LLAssetType.Texture,
      sound: LLAssetType.Sound,
      callcard: LLAssetType.CallingCard,
      callingcard: LLAssetType.CallingCard,
      landmark: LLAssetType.Landmark,
      script: LLAssetType.Script,
      clothing: LLAssetType.Clothing,
      object: LLAssetType.Object,
      notecard: LLAssetType.Notecard,
      category: LLAssetType.Category,
      lsltext: LLAssetType.LSLText,
      lslbyte: LLAssetType.LSLBytecode,
      bodypart: LLAssetType.Bodypart,
      trash: LLAssetType.Trash,
      snapshot: LLAssetType.Snapshot,
      animatn: LLAssetType.Animation,
      animation: LLAssetType.Animation,
      gesture: LLAssetType.Gesture,
      link: LLAssetType.Link,
      link_f: LLAssetType.LinkFolder,
      mesh: LLAssetType.Mesh,
      material: LLAssetType.Material,
      settings: LLAssetType.Settings,
    };
    if (key.toLowerCase() in strMap) {
      return strMap[key.toLowerCase()];
    }
    if (key in LLAssetType) {
      return (LLAssetType as any)[key];
    }
  }
  return LLAssetType.Unknown;
}

export class InventoryManager extends Utils.EventEmitter {
  public protocol: SLConnectionFull;
  public auth: AuthManager;
  public rootFolder: any = null;
  public items: Map<string, any> = new Map();
  public folders: Map<string, any> = new Map();
  public loadedFromCache: boolean = false;
  public isLoading: boolean = false;
  public avatarNameCache: Map<string, string> = new Map();
  private folderBuffers: Map<
    string,
    { categories: any[]; items: any[]; expectedDescendents: number | null }
  > = new Map();

  constructor(protocolManager: SLConnectionFull, authManager: AuthManager) {
    super();
    this.protocol = protocolManager;
    this.auth = authManager;
  }

  public async persistToCache(): Promise<void> {
    const agentId = this.auth?.user?.id || this.protocol?.agentId || 'current';
    const rootId = this.rootFolder?.id || this.protocol?.inventoryRoot || 'root';
    const rootName = this.rootFolder?.name || 'My Inventory';
    try {
      await localCache.saveInventory(agentId, {
        folders: Array.from(this.folders.values()),
        items: Array.from(this.items.values()),
        rootId,
        rootName,
      });
    } catch (err) {
      console.warn('[Inventory] Cache persistence error:', err);
    }
  }

  normalizeFolder(rawFolder: any, defaultParentId: string = ''): any {
    if (!rawFolder || typeof rawFolder !== 'object') return null;
    const id = String(
      rawFolder.id || rawFolder.folder_id || rawFolder.category_id || Utils.generateUUID(),
    );
    const name = String(rawFolder.name || rawFolder.folder_name || 'New Folder');
    const parent = String(rawFolder.parent || rawFolder.parent_id || defaultParentId || '');
    const rawFolderType =
      rawFolder.folderType ??
      rawFolder.preferred_type ??
      rawFolder.type_default ??
      rawFolder.type ??
      -1;
    const folderType = parseLLFolderType(rawFolderType);
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
    const rawAssetType =
      rawItem.assetType ?? rawItem.asset_type ?? rawItem.type_default ?? rawItem.type ?? 0;
    const assetType = parseLLAssetType(rawAssetType);
    const assetId = String(rawItem.assetId || rawItem.asset_id || rawItem.asset_uuid || '');
    const description = String(rawItem.description || rawItem.desc || '');
    const invType = Number(rawItem.invType ?? rawItem.inv_type ?? 0);
    const flags = Number(rawItem.flags ?? 0);
    const creationDate = rawItem.creationDate || rawItem.creation_date || 0;
    const rawPerms = rawItem.permissions || rawItem.permissions_base || {};
    const creatorId = String(
      rawItem.creatorId || rawItem.creator_id || rawPerms.creatorId || rawPerms.creator_id || '',
    );
    const ownerId = String(
      rawItem.ownerId || rawItem.owner_id || rawPerms.ownerId || rawPerms.owner_id || '',
    );
    const lastOwnerId = String(
      rawItem.lastOwnerId ||
        rawItem.last_owner_id ||
        rawPerms.lastOwnerId ||
        rawPerms.last_owner_id ||
        '',
    );
    const groupId = String(
      rawItem.groupId || rawItem.group_id || rawPerms.groupId || rawPerms.group_id || '',
    );
    const groupOwned = Boolean(
      rawItem.groupOwned ??
      rawItem.group_owned ??
      rawPerms.groupOwned ??
      rawPerms.is_owner_group ??
      false,
    );
    const saleType = Number(rawItem.saleType ?? rawItem.sale_type ?? 0);
    const salePrice = Number(rawItem.salePrice ?? rawItem.sale_price ?? 0);
    const normalizedPerms = normalizeItemPermissions({
      groupOwned,
      permissions: {
        baseMask: rawPerms.baseMask ?? rawPerms.base_mask,
        ownerMask: rawPerms.ownerMask ?? rawPerms.owner_mask,
        groupMask: rawPerms.groupMask ?? rawPerms.group_mask,
        everyoneMask: rawPerms.everyoneMask ?? rawPerms.everyone_mask,
        nextOwnerMask: rawPerms.nextOwnerMask ?? rawPerms.next_owner_mask,
        groupOwned,
        copy: rawPerms.copy,
        modify: rawPerms.modify,
        transfer: rawPerms.transfer,
      },
    });
    const permissions = {
      ...rawPerms,
      ...normalizedPerms,
    };
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
      creatorId,
      ownerId,
      lastOwnerId,
      groupId,
      groupOwned,
      saleType,
      salePrice,
      permissions,
      data,
    };
  }

  private _addNormalizedFolder(
    rawFolder: any,
    defaultParentId: string = '',
    mergeChildren: boolean = true,
  ) {
    const folder = this.normalizeFolder(rawFolder, defaultParentId);
    if (!folder) return null;
    const existing = this.folders.get(folder.id);
    if (existing && existing.parent && existing.parent !== folder.parent) {
      const oldParent = this.folders.get(existing.parent);
      if (oldParent && Array.isArray(oldParent.children)) {
        oldParent.children = oldParent.children.filter((childId: string) => childId !== folder.id);
      }
    }
    if (mergeChildren && existing && Array.isArray(existing.children)) {
      folder.children = Array.from(new Set([...folder.children, ...existing.children]));
    } else {
      folder.children = Array.from(new Set(folder.children || []));
    }
    this.folders.set(folder.id, folder);
    if (folder.parent) {
      const parentFolder = this.folders.get(folder.parent);
      if (parentFolder) {
        if (!Array.isArray(parentFolder.children)) {
          parentFolder.children = [];
        }
        if (!parentFolder.children.includes(folder.id)) {
          parentFolder.children.push(folder.id);
        }
      }
    }
    return folder;
  }

  private _addNormalizedItem(rawItem: any, defaultParentId: string = '') {
    const item = this.normalizeItem(rawItem, defaultParentId);
    if (!item) return null;
    const existing = this.items.get(item.id);
    if (existing && existing.parent && existing.parent !== item.parent) {
      const oldParent = this.folders.get(existing.parent);
      if (oldParent && Array.isArray(oldParent.children)) {
        oldParent.children = oldParent.children.filter((childId: string) => childId !== item.id);
      }
    }
    this.items.set(item.id, item);
    if (item.parent) {
      const parentFolder = this.folders.get(item.parent);
      if (parentFolder) {
        if (!Array.isArray(parentFolder.children)) {
          parentFolder.children = [];
        }
        if (!parentFolder.children.includes(item.id)) {
          parentFolder.children.push(item.id);
        }
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
            this.rootFolder = this._addNormalizedFolder({
              id: rootId,
              name: cached.rootName || 'My Inventory',
              parent: '',
            });

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
            const itemCount = this.items.size + this.folders.size;
            const status = itemCount > 0 ? 'ready' : 'empty';
            this.emit('inventory_loaded');
            this.emit('inventory_updated');
            this.emit('inventory_loading_end', { itemCount, status });
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
            this.rootFolder = this._addNormalizedFolder({
              id: rootId,
              name: inv.folderName || 'My Inventory',
              parent: '',
            });
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
            const itemCount = this.items.size + this.folders.size;
            const status = itemCount > 0 ? 'ready' : 'empty';
            this.emit('inventory_loaded');
            this.emit('inventory_updated');
            this.emit('inventory_loading_end', { itemCount, status });
            return;
          }
        } catch (err) {
          console.warn('[Inventory] slBridge inventory load error:', err);
        }
      }

      const inventoryRoot = this.protocol.inventoryRoot;
      if (!inventoryRoot) {
        this.isLoading = false;
        const itemCount = this.items.size + this.folders.size;
        this.emit('inventory_loading_end', {
          itemCount,
          status: itemCount > 0 ? 'ready' : 'empty',
        });
        return;
      }

      this.rootFolder = this._addNormalizedFolder({
        id: inventoryRoot,
        name: 'My Inventory',
        parent: '',
      });
      await this.fetchFolderContents(inventoryRoot);
      this.isLoading = false;
      const itemCount = this.items.size + this.folders.size;
      this.emit('inventory_loaded');
      this.emit('inventory_loading_end', { itemCount, status: itemCount > 0 ? 'ready' : 'empty' });
    } catch (error) {
      this.isLoading = false;
      const errMsg = error instanceof Error ? error.message : String(error);
      this.emit('inventory_loading_error', { error: errMsg });
      this.emit('inventory_loading_end', { itemCount: 0, status: 'error', error: errMsg });
      console.error('Failed to load inventory:', error);
    }
  }

  async fetchFolderContents(folderId: string) {
    if (slBridge.connected) {
      try {
        const inv = await slBridge.fetchInventory(folderId);
        if (inv) {
          this.reconcileFolder(folderId, inv.folders || [], inv.items || []);
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
      const ownerId =
        this.auth.user?.id || this.protocol.agentId || '00000000-0000-0000-0000-000000000000';
      const requestData = {
        folders: [
          {
            folder_id: new LLSDUUID(folderId),
            owner_id: new LLSDUUID(ownerId),
            fetch_folders: true,
            fetch_items: true,
            sort_order: 1,
          },
        ],
      };

      const response = await corsHandler.makeRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/llsd+xml' },
        body: LLSD.buildXML(requestData),
      });

      if (response && response.ok) {
        const text = await response.text();
        const data = LLSD.parseXML(text);
        this.handleInventoryResponse(data, folderId);
      }
    } catch (error) {
      console.error(`Error fetching folder ${folderId}:`, error);
    }
  }

  public reconcileFolder(
    folderId: string,
    incomingFolders: any[] = [],
    incomingItems: any[] = [],
  ): void {
    if (!folderId) return;

    let parentFolder = this.folders.get(folderId);
    if (!parentFolder) {
      const rootId = this.rootFolder?.id || this.protocol?.inventoryRoot || 'root';
      parentFolder = { id: folderId, name: 'Folder', type: 'folder', parent: rootId, children: [] };
      this.folders.set(folderId, parentFolder);
    }
    if (!Array.isArray(parentFolder.children)) {
      parentFolder.children = [];
    }

    const safeFolders = Array.isArray(incomingFolders) ? incomingFolders : [];
    const safeItems = Array.isArray(incomingItems) ? incomingItems : [];

    const normalizedFolders = safeFolders
      .map((f: any) => this.normalizeFolder(f, folderId))
      .filter(Boolean);
    const normalizedItems = safeItems
      .map((i: any) => this.normalizeItem(i, folderId))
      .filter(Boolean);

    const incomingFolderIds = new Set(normalizedFolders.map((f: any) => f.id));
    const incomingItemIds = new Set(normalizedItems.map((i: any) => i.id));
    const allIncomingIds = new Set([...incomingFolderIds, ...incomingItemIds]);

    const existingChildIds = new Set<string>(parentFolder.children);
    for (const [id, f] of this.folders.entries()) {
      if (f.parent === folderId && id !== folderId) existingChildIds.add(id);
    }
    for (const [id, i] of this.items.entries()) {
      if (i.parent === folderId) existingChildIds.add(id);
    }

    const staleChildIds = Array.from(existingChildIds).filter((id) => !allIncomingIds.has(id));

    const purgeSubtree = (fid: string) => {
      const folderToPurge = this.folders.get(fid);
      if (folderToPurge) {
        const childIds = new Set<string>();
        if (Array.isArray(folderToPurge.children)) {
          folderToPurge.children.forEach((cId: string) => childIds.add(cId));
        }
        for (const [id, f] of this.folders.entries()) {
          if (f.parent === fid && id !== fid) childIds.add(id);
        }
        for (const [id, i] of this.items.entries()) {
          if (i.parent === fid) childIds.add(id);
        }
        for (const childId of childIds) {
          purgeSubtree(childId);
        }
        this.folders.delete(fid);
      }
      this.items.delete(fid);
    };

    for (const staleId of staleChildIds) {
      purgeSubtree(staleId);
    }

    for (const f of normalizedFolders) {
      this._addNormalizedFolder(f, folderId, false);
    }

    for (const i of normalizedItems) {
      this._addNormalizedItem(i, folderId);
    }

    parentFolder.children = Array.from(allIncomingIds);

    this.persistToCache().catch(() => {});
  }

  handleInventoryResponse(data: any, targetFolderId?: string) {
    if (!data) return;

    const foldersList = Array.isArray(data.folders)
      ? data.folders
      : data.categories || data.items
        ? [data]
        : [];

    foldersList.forEach((folderData: any) => {
      const defaultParent =
        folderData.folder_id || folderData.category_id || folderData.id || targetFolderId || '';
      const categories = Array.isArray(folderData.categories)
        ? folderData.categories
        : Array.isArray(folderData.folders)
          ? folderData.folders
          : [];
      const items = Array.isArray(folderData.items) ? folderData.items : [];
      const expectedDescendents =
        typeof folderData.descendents === 'number' ? folderData.descendents : null;

      if (defaultParent) {
        if (expectedDescendents !== null) {
          const buffer = this.folderBuffers.get(defaultParent) || {
            categories: [],
            items: [],
            expectedDescendents,
          };

          const catMap = new Map<string, any>();
          buffer.categories.forEach((cat: any) => {
            const id = cat.id || cat.category_id || cat.folder_id;
            if (id) catMap.set(id, cat);
          });
          categories.forEach((cat: any) => {
            const id = cat.id || cat.category_id || cat.folder_id;
            if (id) catMap.set(id, cat);
          });
          buffer.categories = Array.from(catMap.values());

          const itemMap = new Map<string, any>();
          buffer.items.forEach((item: any) => {
            const id = item.id || item.item_id;
            if (id) itemMap.set(id, item);
          });
          items.forEach((item: any) => {
            const id = item.id || item.item_id;
            if (id) itemMap.set(id, item);
          });
          buffer.items = Array.from(itemMap.values());

          buffer.expectedDescendents = expectedDescendents;

          if (buffer.categories.length + buffer.items.length >= expectedDescendents) {
            this.reconcileFolder(defaultParent, buffer.categories, buffer.items);
            this.folderBuffers.delete(defaultParent);
          } else {
            this.folderBuffers.set(defaultParent, buffer);
          }
        } else {
          this.reconcileFolder(defaultParent, categories, items);
        }
      } else {
        if (categories.length > 0) {
          categories.forEach((cat: any) => this._addNormalizedFolder(cat));
        }
        if (items.length > 0) {
          items.forEach((itemData: any) => this._addNormalizedItem(itemData));
        }
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

  getTrashFolder(): any | null {
    for (const folder of this.folders.values()) {
      const folderType = folder.folderType ?? folder.typeDefault ?? -1;
      const name = String(folder.name || '')
        .trim()
        .toLowerCase();
      if (
        folderType === LLFolderType.Trash ||
        folderType === 13 ||
        folderType === 14 ||
        name === 'trash'
      ) {
        return folder;
      }
    }
    return null;
  }

  isProtectedFolder(idOrFolder: string | any): boolean {
    const folder = typeof idOrFolder === 'string' ? this.folders.get(idOrFolder) : idOrFolder;
    if (!folder) return false;

    // Items are not protected folders
    if (folder.type !== 'folder' && folder.folder !== true) {
      return false;
    }

    const name = String(folder.name || '')
      .trim()
      .toLowerCase();
    if (
      name === 'my inventory' ||
      name === 'root' ||
      name === 'trash' ||
      name === 'library' ||
      name === 'current outfit'
    ) {
      return true;
    }

    const folderType = folder.folderType ?? folder.typeDefault ?? -1;
    if (
      folderType === LLFolderType.Root ||
      folderType === LLFolderType.Trash ||
      folderType === 14 ||
      folderType === LLFolderType.Outfit ||
      folderType === 46 ||
      folderType === 48
    ) {
      return true;
    }

    if (!folder.parent || folder.parent === 'root' || folder.id === this.rootFolder?.id) {
      return true;
    }

    return false;
  }

  isItemInTrash(id: string): boolean {
    const trashFolder = this.getTrashFolder();
    if (!trashFolder || trashFolder.id === id) return false;

    let curr = this.items.get(id) || this.folders.get(id);
    while (curr && curr.parent) {
      if (curr.parent === trashFolder.id) return true;
      curr = this.folders.get(curr.parent);
    }
    return false;
  }

  getFolderDescendantIds(folderId: string): { folderIds: string[]; itemIds: string[] } {
    const folderIds: string[] = [];
    const itemIds: string[] = [];
    const queue = [folderId];

    while (queue.length > 0) {
      const currentFolderId = queue.shift()!;
      for (const [id, f] of this.folders.entries()) {
        if (f.parent === currentFolderId && id !== folderId && !folderIds.includes(id)) {
          folderIds.push(id);
          queue.push(id);
        }
      }
      const currentFolder = this.folders.get(currentFolderId);
      if (currentFolder && Array.isArray(currentFolder.children)) {
        for (const childId of currentFolder.children) {
          if (this.folders.has(childId) && childId !== folderId && !folderIds.includes(childId)) {
            folderIds.push(childId);
            queue.push(childId);
          } else if (this.items.has(childId) && !itemIds.includes(childId)) {
            itemIds.push(childId);
          }
        }
      }
      for (const [id, item] of this.items.entries()) {
        if (item.parent === currentFolderId && !itemIds.includes(id)) {
          itemIds.push(id);
        }
      }
    }

    return { folderIds, itemIds };
  }

  purgeFolderDescendants(folderId: string): void {
    const folder = this.folders.get(folderId);
    if (!folder) return;

    const { folderIds, itemIds } = this.getFolderDescendantIds(folderId);

    for (const id of itemIds) {
      this.items.delete(id);
    }
    for (const id of folderIds) {
      this.folders.delete(id);
    }

    folder.children = [];
  }

  moveToTrash(id: string): boolean {
    const entry = this.items.get(id) || this.folders.get(id);
    if (!entry) return false;
    if (this.isProtectedFolder(id)) return false;

    let trashFolder = this.getTrashFolder();
    if (!trashFolder) {
      const rootId = this.rootFolder?.id || '';
      trashFolder = this._addNormalizedFolder(
        {
          id: typeof Utils.generateUUID === 'function' ? Utils.generateUUID() : 'trash-folder',
          name: 'Trash',
          parent: rootId,
          folderType: LLFolderType.Trash,
          typeDefault: 13,
          children: [],
        },
        rootId,
      );
    }

    if (!trashFolder) return false;
    if (entry.parent === trashFolder.id) return true;

    const moved = this.moveItemToFolder(id, trashFolder.id);
    if (moved) {
      void this.persistToCache();
    }
    return moved;
  }

  async permanentlyDeleteItem(id: string): Promise<boolean> {
    const entry = this.items.get(id) || this.folders.get(id);
    if (!entry) return false;
    if (this.isProtectedFolder(id)) return false;

    const isFolder = entry.type === 'folder' || this.folders.has(id);

    // If connected to simulator, dispatch network removal first.
    // If request fails, do not store mock deletion state.
    if (slBridge.connected) {
      try {
        if (isFolder) {
          await slBridge.removeInventoryFolder(id);
        } else {
          await slBridge.removeInventoryItem(id);
        }
      } catch (err) {
        console.error('[Inventory] Simulator item deletion failed:', err);
        throw err;
      }
    }

    // Remove from parent's children
    if (entry.parent) {
      const parentFolder = this.folders.get(entry.parent);
      if (parentFolder && Array.isArray(parentFolder.children)) {
        parentFolder.children = parentFolder.children.filter((childId: string) => childId !== id);
      }
    }

    if (isFolder) {
      this.purgeFolderDescendants(id);
      this.folders.delete(id);
    } else {
      this.items.delete(id);
    }

    await this.persistToCache();
    this.emit('inventory_updated');
    return true;
  }

  async emptyTrash(): Promise<boolean> {
    const trashFolder = this.getTrashFolder();
    if (!trashFolder) return false;

    // If connected to simulator, dispatch network purge request first.
    // If request fails, do not store mock deletion state.
    if (slBridge.connected) {
      try {
        await slBridge.purgeInventoryTrash(trashFolder.id);
      } catch (err) {
        console.error('[Inventory] Simulator purge request failed:', err);
        throw err;
      }
    }

    // Clear all descendants locally
    this.purgeFolderDescendants(trashFolder.id);

    // Persist updated inventory to cache
    await this.persistToCache();

    // Emit update event
    this.emit('inventory_updated');
    return true;
  }

  createFolder(folderId: string, folderData: any) {
    if (!folderId || typeof folderId !== 'string') {
      throw new Error('Valid folder ID required');
    }
    if (!folderData || typeof folderData !== 'object') {
      throw new Error('Valid folder data required');
    }

    const parentId = folderData.parentId || folderData.parent || this.rootFolder?.id || '';
    const rawFolder = {
      id: folderId,
      name: folderData.name || 'New Folder',
      parent: parentId,
      type: folderData.type || 'folder',
      folderType: folderData.folderType ?? folderData.type ?? -1,
      version: folderData.version || 1,
      children: folderData.children || [],
    };

    return this._addNormalizedFolder(rawFolder, parentId, true);
  }

  getFolder(folderId: string) {
    return this.folders.get(folderId) || null;
  }

  updateFolderAtomically(folderId: string, newFoldersData: any[], newItemsData: any[]) {
    this.reconcileFolder(folderId, newFoldersData, newItemsData);
    return this.listFolderContents(folderId);
  }

  listFolderContents(folderId: string) {
    const folder = this.folders.get(folderId);
    if (!folder) {
      return { folders: [], items: [] };
    }

    const childFolders: any[] = [];
    const childItems: any[] = [];

    if (Array.isArray(folder.children)) {
      for (const childId of folder.children) {
        if (this.folders.has(childId)) {
          childFolders.push(this.folders.get(childId));
        } else if (this.items.has(childId)) {
          childItems.push(this.items.get(childId));
        }
      }
    }

    for (const [id, f] of this.folders.entries()) {
      if (f.parent === folderId && id !== folderId && !childFolders.some((cf) => cf.id === id)) {
        childFolders.push(f);
      }
    }
    for (const [id, i] of this.items.entries()) {
      if (i.parent === folderId && !childItems.some((ci) => ci.id === id)) {
        childItems.push(i);
      }
    }

    return { folders: childFolders, items: childItems };
  }

  addItem(itemId: string, itemData: any) {
    if (!itemId || typeof itemId !== 'string') {
      throw new Error('Valid item ID required');
    }
    if (!itemData || typeof itemData !== 'object') {
      throw new Error('Valid item data required');
    }

    const parentId = itemData.folderId || itemData.parent || '';
    const rawItem = {
      id: itemId,
      name: itemData.name || 'New Item',
      parent: parentId,
      assetType: itemData.assetType || 'unknown',
      invType: itemData.inventoryType ?? itemData.invType ?? 0,
      description: itemData.description || '',
      permissions: itemData.permissions || {},
    };

    return this._addNormalizedItem(rawItem, parentId);
  }

  getItem(itemId: string) {
    return this.items.get(itemId) || null;
  }

  sortFolder(folderId: string, sortBy: string = 'name') {
    const contents = this.listFolderContents(folderId);

    const sorter = (a: any, b: any) => {
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      } else if (sortBy === 'date') {
        return (a.created || a.creationDate || 0) - (b.created || b.creationDate || 0);
      } else if (sortBy === 'type') {
        return String(a.type || a.assetType || '').localeCompare(
          String(b.type || b.assetType || ''),
        );
      }
      return 0;
    };

    contents.folders.sort(sorter);
    contents.items.sort(sorter);

    return contents;
  }

  moveItem(itemId: string, targetFolderId: string) {
    if (!itemId || !targetFolderId) {
      throw new Error('Valid item ID and target folder ID required');
    }
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }
    const target = this.folders.get(targetFolderId);
    if (!target) {
      throw new Error(`Target folder not found: ${targetFolderId}`);
    }

    this.moveItemToFolder(itemId, targetFolderId);
    item.folderId = targetFolderId;
  }

  setRootFolder(folderId: string) {
    const folder = this.folders.get(folderId) || {
      id: folderId,
      name: 'My Inventory',
      type: 'folder',
      parent: '',
    };
    if (!this.folders.has(folderId)) {
      this.folders.set(folderId, folder);
    }
    this.rootFolder = folder;
  }

  getStats() {
    return {
      totalFolders: this.folders.size,
      totalItems: this.items.size,
      rootFolder: this.rootFolder?.id || null,
    };
  }

  /**
   * Paged folder contents query directly from IndexedDB without full tree traversals.
   */
  async getFolderContentsPage(folderId: string, page = 1, pageSize = 50) {
    const agentId = this.auth?.user?.id || this.protocol?.agentId || 'current';
    return localCache.getFolderContentsPage(agentId, folderId, page, pageSize);
  }

  private resolveDirectCapabilityUrl(name: string): string | null {
    const proto = this.protocol as unknown as {
      getCapability?: (cap: string) => string | undefined | null;
      capabilities?: Record<string, string | undefined>;
    };
    if (typeof proto?.getCapability === 'function') {
      const url = proto.getCapability(name);
      if (url) return String(url);
    }
    const fromMap = proto?.capabilities?.[name];
    return fromMap ? String(fromMap) : null;
  }

  /**
   * Resolves creator/owner avatar UUIDs into human-readable names without fabricating placeholders.
   */
  async resolveAvatarNames(
    ids: string[],
    knownLookup?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return resolved;
    }

    const selfUser = this.auth?.user as
      { id?: string; name?: string; displayName?: string; username?: string } | undefined;
    const selfId = selfUser?.id || this.protocol?.agentId || '';
    const selfLabel = selfUser?.displayName || selfUser?.name || selfUser?.username || '';
    if (selfId && !isPlaceholderAvatarName(selfLabel)) {
      this.avatarNameCache.set(selfId, selfLabel.trim());
    }

    if (knownLookup) {
      for (const [k, v] of Object.entries(knownLookup)) {
        if (k && k !== ZERO_UUID && !isPlaceholderAvatarName(v)) {
          this.avatarNameCache.set(k, v.trim());
        }
      }
    }

    const unresolved: string[] = [];
    const deduped = Array.from(
      new Set(ids.map((id) => String(id || '').trim()).filter((id) => id && id !== ZERO_UUID)),
    );

    for (const id of deduped) {
      const cached = this.avatarNameCache.get(id);
      if (cached && !isPlaceholderAvatarName(cached)) {
        resolved[id] = cached;
      } else {
        unresolved.push(id);
      }
    }

    if (unresolved.length === 0) {
      return resolved;
    }

    // 1. Direct GetDisplayNames capability when available in browser capability table
    const displayNamesCap = this.resolveDirectCapabilityUrl('GetDisplayNames');
    if (displayNamesCap) {
      try {
        const sep = displayNamesCap.includes('?') ? '&' : '?';
        const query = unresolved.map((id) => `ids=${encodeURIComponent(id)}`).join('&');
        const response = await corsHandler.makeRequest(`${displayNamesCap}${sep}${query}`, {
          method: 'GET',
          headers: { Accept: 'application/llsd+xml, application/json' },
        });
        if (response && response.ok) {
          const text = await response.text();
          const parsed = LLSD.parseXML(text) as {
            agents?: Array<{
              id?: string;
              display_name?: string;
              username?: string;
              legacy_first_name?: string;
              legacy_last_name?: string;
            }>;
          } | null;
          const agents = Array.isArray(parsed?.agents) ? parsed.agents : [];
          for (const agent of agents) {
            const id = String(agent?.id || '');
            const legacy =
              agent?.legacy_first_name && agent?.legacy_last_name
                ? `${agent.legacy_first_name} ${agent.legacy_last_name}`.trim()
                : '';
            const label = agent?.display_name || legacy || agent?.username || '';
            if (id && !isPlaceholderAvatarName(label)) {
              this.avatarNameCache.set(id, label.trim());
              resolved[id] = label.trim();
            }
          }
        }
      } catch {
        // Proceed to bridge fallback
      }
    }

    // 2. SLBridge session resolution (GetDisplayNames + UUIDNameRequest)
    const stillUnresolved = unresolved.filter((id) => !resolved[id]);
    if (stillUnresolved.length > 0 && slBridge.connected) {
      const bridgeResult = await slBridge.resolveAvatarNames(stillUnresolved);
      if (bridgeResult?.names) {
        for (const [id, name] of Object.entries(bridgeResult.names)) {
          if (id && !isPlaceholderAvatarName(name)) {
            this.avatarNameCache.set(id, name.trim());
            resolved[id] = name.trim();
          }
        }
      }
    }

    return resolved;
  }

  /**
   * Executes single or batch inventory item property & permission updates (max 100 items).
   * Routes to region `UpdateInventoryItem` capability when supported, falling back to
   * chunked reliable UDP `UpdateInventoryItemMessage` batches. Updates local caches
   * immediately upon confirmation and rolls back modified items on error.
   */
  async batchUpdateItemProperties(
    updates: InventoryItemUpdatePayload[],
    options?: {
      onProgress?: (progress: BatchUpdateProgress) => void;
    },
  ): Promise<{
    success: boolean;
    transport: 'capability' | 'udp';
    chunkCount: number;
    updatedIds: string[];
  }> {
    assertValidBatchSize(Array.isArray(updates) ? updates.length : 0);

    const total = updates.length;
    const report = (completed: number, phase: BatchUpdateProgress['phase'], statusText: string) => {
      const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
      options?.onProgress?.({ completed, total, percent, phase, statusText });
    };

    // Snapshot pre-batch items for atomic rollback if transport fails
    const snapshots = new Map<string, Record<string, unknown> | undefined>();
    for (const u of updates) {
      const existing = this.items.get(u.itemId);
      snapshots.set(u.itemId, existing ? JSON.parse(JSON.stringify(existing)) : undefined);
    }

    report(0, 'preparing', `Preparing ${total} item${total === 1 ? '' : 's'}…`);

    // Stage optimistic state in memory so rollback restores exact prior state on failure
    for (const u of updates) {
      const existing = this.items.get(u.itemId) || { id: u.itemId };
      const normalizedPerms = normalizeItemPermissions({
        groupOwned: u.groupOwned,
        permissions: u.permissions,
      });
      this.items.set(u.itemId, {
        ...existing,
        id: u.itemId,
        name: u.name,
        description: u.description,
        groupOwned: u.groupOwned,
        permissions: {
          ...(existing.permissions || {}),
          ...normalizedPerms,
        },
      });
    }

    try {
      let transport: 'capability' | 'udp' = 'capability';
      let chunkCount = 1;

      const directCapUrl = this.resolveDirectCapabilityUrl('UpdateInventoryItem');
      const protoWithUdp = this.protocol as unknown as {
        sendPacket?: (
          name: string,
          payload: Record<string, unknown>,
          reliable?: boolean,
        ) => Promise<unknown> | unknown;
      };

      if (directCapUrl) {
        report(
          Math.max(1, Math.floor(total * 0.25)),
          'updating',
          `Dispatching UpdateInventoryItem capability (${total} item${total === 1 ? '' : 's'})…`,
        );

        const llsdBody = LLSD.buildXML({
          updates: updates.map((u) => ({
            item_id: new LLSDUUID(u.itemId || ZERO_UUID),
            parent_id: new LLSDUUID(u.parentId || ZERO_UUID),
            name: u.name,
            desc: u.description,
            group_owned: u.groupOwned,
            base_mask: u.permissions.baseMask,
            owner_mask: u.permissions.ownerMask,
            group_mask: u.permissions.groupMask,
            everyone_mask: u.permissions.everyoneMask,
            next_owner_mask: u.permissions.nextOwnerMask,
          })),
        });

        const response = await corsHandler.makeRequest(directCapUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/llsd+xml' },
          body: llsdBody,
        });

        if (!response || !response.ok) {
          throw new Error(
            `UpdateInventoryItem capability failed (HTTP ${response?.status ?? 'unavailable'})`,
          );
        }
        transport = 'capability';
        chunkCount = 1;
        report(total, 'persisting', 'Capability confirmed. Updating inventory cache…');
      } else if (slBridge.connected) {
        report(
          Math.max(1, Math.floor(total * 0.3)),
          'updating',
          `Applying permissions to ${total} item${total === 1 ? '' : 's'}…`,
        );
        const bridgeRes = await slBridge.updateInventoryItems(updates);
        if (!bridgeRes?.success) {
          throw new Error('Simulator rejected inventory item update');
        }
        transport = bridgeRes.transport || 'udp';
        chunkCount = bridgeRes.chunkCount || 1;
        report(total, 'persisting', 'Batch confirmed. Updating inventory cache…');
      } else if (typeof protoWithUdp?.sendPacket === 'function') {
        const chunks = chunkUpdatesForUdp(updates);
        transport = 'udp';
        chunkCount = chunks.length;
        let sentCount = 0;

        for (let idx = 0; idx < chunks.length; idx += 1) {
          const chunk = chunks[idx];
          report(
            sentCount,
            'updating',
            `Sending reliable UDP batch ${idx + 1} of ${chunks.length}…`,
          );
          await protoWithUdp.sendPacket(
            'UpdateInventoryItem',
            {
              AgentData: {
                AgentID: this.protocol?.agentId || ZERO_UUID,
                SessionID: this.protocol?.sessionId || ZERO_UUID,
                TransactionID: Utils.generateUUID(),
              },
              InventoryData: chunk.map((u, blockIdx) => ({
                ItemID: u.itemId,
                FolderID: u.parentId || ZERO_UUID,
                CallbackID: blockIdx + 1,
                CreatorID: u.creatorId || ZERO_UUID,
                OwnerID: u.ownerId || ZERO_UUID,
                GroupID: u.groupId || ZERO_UUID,
                BaseMask: u.permissions.baseMask,
                OwnerMask: u.permissions.ownerMask,
                GroupMask: u.permissions.groupMask,
                EveryoneMask: u.permissions.everyoneMask,
                NextOwnerMask: u.permissions.nextOwnerMask,
                GroupOwned: u.groupOwned,
                TransactionID: ZERO_UUID,
                Type: u.assetType ?? 0,
                InvType: u.inventoryType ?? 0,
                Flags: u.flags ?? 0,
                SaleType: u.saleType ?? 0,
                SalePrice: u.salePrice ?? 0,
                Name: u.name,
                Description: u.description,
                CreationDate: u.creationDate ?? 0,
              })),
            },
            true,
          );
          sentCount += chunk.length;
          report(sentCount, 'updating', `Confirmed UDP batch ${idx + 1} of ${chunks.length}`);
        }
        report(total, 'persisting', 'Updating inventory cache…');
      } else {
        throw new Error('Not connected to Second Life simulator');
      }

      const updatedIds = updates.map((u) => u.itemId);
      await this.persistToCache();
      report(total, 'completed', `Updated ${total} item${total === 1 ? '' : 's'}`);
      this.emit('inventory_updated', { updatedIds, transport, chunkCount });

      return {
        success: true,
        transport,
        chunkCount,
        updatedIds,
      };
    } catch (error) {
      // Roll back modified items in memory and cache (Acceptance Criterion 4)
      for (const [itemId, snapshot] of snapshots.entries()) {
        if (snapshot === undefined) {
          this.items.delete(itemId);
        } else {
          this.items.set(itemId, snapshot);
        }
      }
      await this.persistToCache();
      const rolledBackIds = Array.from(snapshots.keys());
      report(0, 'rolled_back', 'Update failed — changes rolled back');
      this.emit('inventory_updated', { rolledBackIds, error });
      throw error;
    }
  }
}
