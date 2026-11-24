/**
 * Linkpoint PWA - Inventory Management
 */

import { Utils } from './utils';
import { LLSD, LLSDUUID } from './llsd';
import { SLConnectionFull } from './sl-connection-full';
import { AuthManager } from './auth';
import { corsHandler } from './cors-handler';
import { slBridge, type CreateLandmarkParams, type CreateLandmarkResult } from './sl-bridge';
import { localCache } from './local-cache';
import { truncateUtf8Bytes, MAX_LANDMARK_DESC_BYTES, MAX_LANDMARK_NAME_BYTES } from './landmark';

export interface InventoryFolderOption {
  id: string;
  name: string;
  depth: number;
  pathLabel: string;
  folderType: number;
  parent: string;
}

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
    const rawParent = String(
      rawFolder.parent ||
        rawFolder.parent_id ||
        rawFolder.parentId ||
        (id === defaultParentId ? '' : defaultParentId) ||
        '',
    );
    const parent =
      rawParent === id || rawParent === '00000000-0000-0000-0000-000000000000' ? '' : rawParent;
    const rawFolderType =
      rawFolder.folderType ??
      rawFolder.preferredType ??
      rawFolder.preferred_type ??
      rawFolder.typeDefault ??
      rawFolder.type_default ??
      (rawFolder.type !== 'folder' ? rawFolder.type : undefined) ??
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

  private resolveFolderType(folder: any): number {
    if (!folder || typeof folder !== 'object') return -1;
    if (typeof folder.folderType === 'number' && folder.folderType !== -1) {
      return folder.folderType;
    }
    return parseLLFolderType(
      folder.preferredType ??
        folder.preferred_type ??
        folder.typeDefault ??
        folder.type_default ??
        (typeof folder.type === 'number' ? folder.type : (folder.folderType ?? -1)),
    );
  }

  private resolveFolderParent(folder: any): string {
    if (!folder || typeof folder !== 'object') return '';
    const raw = folder.parent ?? folder.parentId ?? folder.parent_id ?? '';
    const str = String(raw || '');
    return str === '00000000-0000-0000-0000-000000000000' ? '' : str;
  }

  getTrashFolder(): any | null {
    for (const folder of this.folders.values()) {
      const name = String(folder.name || '')
        .trim()
        .toLowerCase();
      if (name === 'snapshots' || name === 'photo album') {
        continue;
      }
      const folderType = this.resolveFolderType(folder);
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

  getLandmarksFolder(): any | null {
    const trashId = this.getTrashFolder()?.id;
    let nameFallback: any = null;
    for (const folder of this.folders.values()) {
      if (!folder || folder.id === trashId || this.isItemInTrash(folder.id)) continue;
      const folderType = this.resolveFolderType(folder);
      if (folderType === LLFolderType.Landmark || folderType === 3) {
        return folder;
      }
      const name = String(folder.name || '')
        .trim()
        .toLowerCase();
      if (!nameFallback && name === 'landmarks') {
        nameFallback = folder;
      }
    }
    return nameFallback || this.rootFolder || null;
  }

  isSelectableDestinationFolder(folder: any): boolean {
    if (!folder || typeof folder !== 'object') return false;
    if (folder.type === 'item' || folder.folder === false) return false;
    const trashFolder = this.getTrashFolder();
    if (trashFolder && (folder.id === trashFolder.id || this.isItemInTrash(folder.id))) {
      return false;
    }
    const folderType = this.resolveFolderType(folder);
    const lowerName = String(folder.name || '')
      .trim()
      .toLowerCase();
    if (
      folderType === LLFolderType.Trash ||
      folderType === 13 ||
      (lowerName === 'trash' && folderType !== LLFolderType.None) ||
      lowerName === 'trash'
    ) {
      return false;
    }
    return true;
  }

  /**
   * Builds a flat, depth-indented list of all valid inventory folders from the skeleton
   * without blocking the main UI thread when traversing large folder trees.
   */
  async getFolderHierarchyOptions(options?: { chunkSize?: number; signal?: AbortSignal }): Promise<{
    options: InventoryFolderOption[];
    defaultFolderId: string;
  }> {
    const chunkSize = Math.max(25, options?.chunkSize ?? 150);
    const signal = options?.signal;
    const allFolders = Array.from(this.folders.values()).filter((f) =>
      this.isSelectableDestinationFolder(f),
    );

    if (allFolders.length === 0) {
      return { options: [], defaultFolderId: '' };
    }

    const byId = new Map<string, any>();
    const childrenByParent = new Map<string, any[]>();
    for (let i = 0; i < allFolders.length; i++) {
      if (signal?.aborted) return { options: [], defaultFolderId: '' };
      if (i > 0 && i % chunkSize === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      const f = allFolders[i];
      byId.set(f.id, f);
    }

    const roots: any[] = [];
    for (let i = 0; i < allFolders.length; i++) {
      if (signal?.aborted) return { options: [], defaultFolderId: '' };
      if (i > 0 && i % chunkSize === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      const f = allFolders[i];
      const rawParent = this.resolveFolderParent(f);
      const parentId = rawParent && rawParent !== f.id && byId.has(rawParent) ? rawParent : '';
      if (!parentId) {
        roots.push(f);
      } else {
        const list = childrenByParent.get(parentId) || [];
        list.push(f);
        childrenByParent.set(parentId, list);
      }
    }

    const sortFolders = (list: any[]) =>
      list.sort((a, b) => {
        if (this.rootFolder?.id) {
          if (a.id === this.rootFolder.id) return -1;
          if (b.id === this.rootFolder.id) return 1;
        }
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    sortFolders(roots);
    for (const list of childrenByParent.values()) {
      sortFolders(list);
    }

    const result: InventoryFolderOption[] = [];
    const visited = new Set<string>();
    const stack: Array<{ folder: any; depth: number; ancestors: string[] }> = [];
    for (let i = roots.length - 1; i >= 0; i--) {
      stack.push({ folder: roots[i], depth: 0, ancestors: [] });
    }

    let processed = 0;
    while (stack.length > 0) {
      if (signal?.aborted) return { options: [], defaultFolderId: '' };
      if (processed > 0 && processed % chunkSize === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      processed += 1;

      const { folder, depth, ancestors } = stack.pop()!;
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);

      const displayName = String(folder.name || 'Unnamed Folder');
      const nextAncestors = [...ancestors, displayName];
      const indent = depth > 0 ? `${'\u00A0\u00A0'.repeat(depth)}└ ` : '';
      result.push({
        id: folder.id,
        name: displayName,
        depth,
        pathLabel: `${indent}${displayName}`,
        folderType: this.resolveFolderType(folder),
        parent: this.resolveFolderParent(folder),
      });

      const kids = childrenByParent.get(folder.id) || [];
      for (let i = kids.length - 1; i >= 0; i--) {
        if (!visited.has(kids[i].id)) {
          stack.push({ folder: kids[i], depth: depth + 1, ancestors: nextAncestors });
        }
      }
    }

    // Include any orphaned folders (if cycle/missing root) so all valid folders remain selectable
    for (const f of allFolders) {
      if (!visited.has(f.id)) {
        result.push({
          id: f.id,
          name: String(f.name || 'Unnamed Folder'),
          depth: 0,
          pathLabel: String(f.name || 'Unnamed Folder'),
          folderType: f.folderType ?? f.typeDefault ?? -1,
          parent: f.parent || '',
        });
      }
    }

    const landmarksFolder = this.getLandmarksFolder();
    const defaultFolderId =
      (landmarksFolder && byId.has(landmarksFolder.id) ? landmarksFolder.id : '') ||
      (this.rootFolder && byId.has(this.rootFolder.id) ? this.rootFolder.id : '') ||
      result[0]?.id ||
      '';

    return { options: result, defaultFolderId };
  }

  /**
   * Creates a landmark via the viewer session (capability or UDP fallback) and immediately
   * inserts the confirmed landmark item into the client inventory cache.
   */
  async createLandmark(
    params: CreateLandmarkParams,
  ): Promise<CreateLandmarkResult & { item: any }> {
    const defaultFolder = this.getLandmarksFolder();
    const requestedFolderId = params.folderId || defaultFolder?.id || this.rootFolder?.id || '';
    const cleanName =
      truncateUtf8Bytes(params.name || 'Landmark', MAX_LANDMARK_NAME_BYTES) || 'Landmark';
    const cleanDescription = truncateUtf8Bytes(params.description || '', MAX_LANDMARK_DESC_BYTES);

    const requestPayload: CreateLandmarkParams = {
      ...params,
      name: cleanName,
      description: cleanDescription,
      folderId: requestedFolderId,
    };

    let response: CreateLandmarkResult;
    if (
      this.protocol &&
      typeof (this.protocol as any).createLandmark === 'function' &&
      this.protocol.connected
    ) {
      response = await (this.protocol as any).createLandmark(requestPayload);
    } else {
      response = await slBridge.createLandmark(requestPayload);
    }

    const finalFolderId = response.folderId || requestedFolderId || this.rootFolder?.id || '';
    const finalItemId = response.itemId || response.item?.id || Utils.generateUUID();
    const rawConfirmedItem = {
      ...(response.item || {}),
      id: finalItemId,
      name: response.item?.name || cleanName,
      description: response.item?.description ?? cleanDescription,
      parent: finalFolderId,
      folderId: finalFolderId,
      assetType: LLAssetType.Landmark,
      invType: 3,
      assetId: response.assetId || response.item?.assetId || '',
      creationDate: response.item?.creationDate || Math.floor(Date.now() / 1000),
    };

    if (finalFolderId && !this.folders.has(finalFolderId)) {
      this._addNormalizedFolder(
        {
          id: finalFolderId,
          name: finalFolderId === defaultFolder?.id ? 'Landmarks' : 'Folder',
          parent: this.rootFolder?.id || '',
          folderType: LLFolderType.Landmark,
        },
        this.rootFolder?.id || '',
      );
    }

    const insertedItem = this._addNormalizedItem(rawConfirmedItem, finalFolderId);
    await this.persistToCache();
    this.emit('inventory_updated', { items: [insertedItem] });
    this.emit('inventory_loaded');

    return {
      ...response,
      itemId: finalItemId,
      folderId: finalFolderId,
      item: insertedItem,
    };
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

  canCreateFolderIn(idOrFolder: string | any): boolean {
    const folder = typeof idOrFolder === 'string' ? this.folders.get(idOrFolder) : idOrFolder;
    if (!folder) return false;

    if (folder.type !== 'folder' && folder.folder !== true && !this.folders.has(folder.id)) {
      return false;
    }

    const trashFolder = this.getTrashFolder();
    if (trashFolder && (folder.id === trashFolder.id || this.isItemInTrash(folder.id))) {
      return false;
    }

    const visited = new Set<string>();
    let curr: any = folder;
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      const name = String(curr.name || '')
        .trim()
        .toLowerCase();
      const folderType = curr.folderType ?? -1;
      const typeDefault = curr.typeDefault ?? -1;

      if (
        name === 'trash' ||
        name === 'library' ||
        name === 'second life library' ||
        name === 'current outfit'
      ) {
        return false;
      }

      if (
        folderType === LLFolderType.Trash ||
        (typeDefault === 14 && name !== 'snapshots') ||
        folderType === 46 ||
        typeDefault === 46 ||
        curr.library === 1 ||
        curr.isLibrary === true
      ) {
        return false;
      }

      curr = curr.parent ? this.folders.get(curr.parent) : null;
    }

    return true;
  }

  isItemInTrash(id: string): boolean {
    const trashFolder = this.getTrashFolder();
    if (!trashFolder || trashFolder.id === id) return false;

    const visited = new Set<string>();
    let curr = this.items.get(id) || this.folders.get(id);
    while (curr && curr.parent && !visited.has(curr.id)) {
      visited.add(curr.id);
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

  async createInventoryFolder(params: {
    parentId?: string;
    name: string;
    folderType?: number;
    onOptimisticCreate?: (folder: any) => void;
  }): Promise<any> {
    const trimmedName = String(params?.name ?? '')
      .replace(/[\x00-\x1F\x7F|]/g, '')
      .trim();
    if (!trimmedName) {
      throw new Error('Folder name is required');
    }
    if (trimmedName.length > 63) {
      throw new Error('Folder name must not exceed 63 characters');
    }

    const targetParentId = String(params?.parentId || this.rootFolder?.id || '').trim();
    if (!targetParentId || !this.folders.has(targetParentId)) {
      throw new Error('Destination folder not found');
    }

    if (!this.canCreateFolderIn(targetParentId)) {
      throw new Error('Cannot create folders inside protected system folders');
    }

    const parentFolder = this.folders.get(targetParentId);
    const optimisticId =
      typeof Utils.generateUUID === 'function'
        ? Utils.generateUUID()
        : '00000000-0000-4000-8000-000000000001';
    const resolvedType = params?.folderType ?? LLFolderType.None;

    const optimisticFolder = this.createFolder(optimisticId, {
      name: trimmedName,
      parentId: targetParentId,
      folderType: resolvedType,
      version: 1,
      children: [],
      optimistic: true,
    });
    this.emit('inventory_updated');

    if (typeof params?.onOptimisticCreate === 'function' && optimisticFolder) {
      params.onOptimisticCreate(optimisticFolder);
    }

    const shouldDispatchRpc =
      slBridge.connected || Boolean((slBridge.createInventoryFolder as any)?.mock);

    if (shouldDispatchRpc) {
      try {
        const res = await slBridge.createInventoryFolder({
          parentId: targetParentId,
          name: trimmedName,
          folderType: resolvedType,
          folderId: optimisticId,
        });
        if (!res || res.success === false) {
          throw new Error('Simulator rejected folder creation');
        }

        const serverFolderId = String(res.folderId || res.folder?.id || optimisticId);
        let finalFolder = optimisticFolder;

        if (serverFolderId !== optimisticId) {
          this.folders.delete(optimisticId);
          if (parentFolder && Array.isArray(parentFolder.children)) {
            const idx = parentFolder.children.indexOf(optimisticId);
            if (idx !== -1) {
              parentFolder.children[idx] = serverFolderId;
            } else if (!parentFolder.children.includes(serverFolderId)) {
              parentFolder.children.push(serverFolderId);
            }
          }
          finalFolder = this._addNormalizedFolder(
            {
              ...(res.folder || {}),
              id: serverFolderId,
              name: res.name || trimmedName,
              parent: res.parentId || targetParentId,
              folderType: res.folderType ?? resolvedType,
              version: 1,
              children: [],
            },
            targetParentId,
            true,
          );
        } else if (finalFolder) {
          delete finalFolder.optimistic;
          if (res.name) finalFolder.name = res.name;
        }

        await this.persistToCache();
        this.emit('inventory_updated');
        return finalFolder;
      } catch (err) {
        this.folders.delete(optimisticId);
        if (parentFolder && Array.isArray(parentFolder.children)) {
          parentFolder.children = parentFolder.children.filter(
            (childId: string) => childId !== optimisticId,
          );
        }
        this.emit('inventory_updated');
        throw err;
      }
    }

    if (optimisticFolder) {
      delete optimisticFolder.optimistic;
    }
    await this.persistToCache();
    this.emit('inventory_updated');
    return optimisticFolder;
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
}
