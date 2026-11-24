/**
 * Teleport History Manager
 *
 * Captures destination metadata from successful teleports (sl-connection-full.ts),
 * accepted teleport lures (interactions.ts), and simulator crossings (world.ts),
 * persisting records asynchronously per avatar in IndexedDBStore without blocking
 * animation frames or leaking history across avatars.
 */

import { Utils } from './utils';
import {
  buildSecondLifeSlurl,
  indexedDBStore,
  IndexedDBStore,
  MAX_TELEPORT_HISTORY_ENTRIES,
  TeleportHistoryInput,
  TeleportHistoryRecord,
} from './indexeddb-store';
import { LLAssetType, LLFolderType } from './inventory';

export interface ParsedTeleportDestination {
  regionName: string;
  position: [number, number, number] | null;
}

const RESERVED_TARGETS = new Set(['home', 'last']);

/**
 * Parses a SLURL ("secondlife://Region/x/y/z", "https://maps.secondlife.com/secondlife/Region/x/y/z"),
 * coordinate path ("Region/x/y/z"), or canonical location string ("Region (x, y, z)").
 * Returns null position when coordinates are omitted rather than inventing defaults.
 */
export function parseTeleportDestination(rawInput: string): ParsedTeleportDestination | null {
  const raw = String(rawInput || '').trim();
  if (!raw) return null;

  let path = raw;
  const urlMatch = raw.match(
    /^(?:secondlife:\/\/(?:\/app\/teleport\/)?|https?:\/\/maps\.secondlife\.com\/secondlife\/)(.+)$/i,
  );
  if (urlMatch) {
    path = urlMatch[1];
  }

  // Handle "Region Name (x, y, z)" format from location bar
  const parenMatch = !urlMatch
    ? path.match(
        /^(.+?)\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/,
      )
    : null;
  if (parenMatch) {
    const regionName = parenMatch[1].trim();
    const x = Number(parenMatch[2]);
    const y = Number(parenMatch[3]);
    const z = Number(parenMatch[4]);
    if (!regionName || RESERVED_TARGETS.has(regionName.toLowerCase())) return null;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return { regionName, position: [x, y, z] };
    }
    return { regionName, position: null };
  }

  const parts = path
    .split('/')
    .map((part) => {
      try {
        return decodeURIComponent(part.trim());
      } catch {
        return part.trim();
      }
    })
    .filter((part, idx) => part || idx > 0);

  const regionName = (parts[0] || '').trim();
  if (!regionName || RESERVED_TARGETS.has(regionName.toLowerCase())) {
    return null;
  }

  if (parts.length >= 4 && parts[1] !== '' && parts[2] !== '' && parts[3] !== '') {
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      return { regionName, position: [x, y, z] };
    }
  } else if (parts.length === 3 && parts[1] !== '' && parts[2] !== '') {
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { regionName, position: [x, y, 0] };
    }
  }

  return { regionName, position: null };
}

function extractParcelName(regionOrParcel: any): string | null {
  if (!regionOrParcel || typeof regionOrParcel !== 'object') return null;
  const candidate =
    regionOrParcel.parcelName ??
    regionOrParcel.Name ??
    regionOrParcel.name ??
    regionOrParcel.parcel?.Name ??
    regionOrParcel.parcel?.name ??
    null;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed ? trimmed : null;
}

export interface TeleportHistoryDependencies {
  protocol: any;
  world: any;
  auth?: any;
  interactions?: any;
  inventory?: any;
  store?: IndexedDBStore;
}

const MERGE_WINDOW_MS = 3500;

export class TeleportHistoryManager extends Utils.EventEmitter {
  private protocol: any;
  private world: any;
  private auth: any;
  private interactions: any;
  private inventory: any;
  private store: IndexedDBStore;

  private explicitAgentId: string | null = null;
  private cachedEntries: TeleportHistoryRecord[] = [];
  private cachedAgentId: string = '';
  private initialized = false;
  private writeQueue: Promise<any> = Promise.resolve();

  private lastRegionIdentity: string | null = null;
  private pendingLureMeta: {
    regionId: string | null;
    position: [number, number, number] | null;
    gridX: number | null;
    gridY: number | null;
    receivedAt: number;
  } | null = null;

  // Navigation stack for Back / Forward traversal in DesktopChrome
  private navStack: TeleportHistoryRecord[] = [];
  private navIndex: number = -1;
  private isNavigatingStack = false;

  constructor(deps: TeleportHistoryDependencies) {
    super();
    this.protocol = deps.protocol;
    this.world = deps.world;
    this.auth = deps.auth || null;
    this.interactions = deps.interactions || null;
    this.inventory = deps.inventory || null;
    this.store = deps.store || indexedDBStore;
  }

  public getActiveAgentId(): string {
    if (this.explicitAgentId !== null) {
      return this.explicitAgentId;
    }
    const authUser = this.auth?.user;
    const candidate =
      authUser?.id || authUser?.agent_id || authUser?.agentId || this.protocol?.agentId || '';
    return String(candidate || '').trim();
  }

  public setAgentId(agentId: string | null): void {
    const clean = agentId !== null ? String(agentId).trim() : null;
    this.explicitAgentId = clean;
    this.navStack = [];
    this.navIndex = -1;
    this.lastRegionIdentity = null;
    if (clean) {
      void this.refreshCache(clean);
    } else {
      this.cachedAgentId = '';
      this.cachedEntries = [];
      this.emit('history_updated', []);
    }
  }

  public get entries(): readonly TeleportHistoryRecord[] {
    const activeAgent = this.getActiveAgentId();
    if (!activeAgent || activeAgent !== this.cachedAgentId) {
      return [];
    }
    return this.cachedEntries;
  }

  public init(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (this.protocol?.on) {
      this.protocol.on('teleport_completed', (data: any) => {
        this.scheduleAsync(() => this.handleTeleportCompleted(data));
      });
      this.protocol.on('disconnected', () => {
        this.lastRegionIdentity = null;
        this.pendingLureMeta = null;
      });
    }

    if (this.interactions?.on) {
      this.interactions.on('lure_accepted', (data: any) => {
        this.scheduleAsync(() => this.handleLureAccepted(data));
      });
    }

    if (this.world?.on) {
      this.world.on('region_changed', (region: any) => {
        this.scheduleAsync(() => this.handleRegionChanged(region));
      });
      this.world.on('parcel_changed', (parcel: any) => {
        this.scheduleAsync(() => this.handleParcelChanged(parcel));
      });
    }

    if (this.auth?.on) {
      this.auth.on('login_success', (user: any) => {
        const agentId = user?.id || user?.agent_id || user?.agentId || this.protocol?.agentId || '';
        this.navStack = [];
        this.navIndex = -1;
        if (agentId) {
          void this.refreshCache(String(agentId).trim());
        }
      });
      this.auth.on('logout', () => {
        this.cachedAgentId = '';
        this.cachedEntries = [];
        this.navStack = [];
        this.navIndex = -1;
        this.lastRegionIdentity = null;
        this.pendingLureMeta = null;
        this.emit('history_updated', []);
      });
    }

    const currentAgent = this.getActiveAgentId();
    if (currentAgent) {
      void this.refreshCache(currentAgent);
    }
  }

  /**
   * Queues history mutations asynchronously off the synchronous call stack so frame budgets are preserved.
   */
  private scheduleAsync(task: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(
      () =>
        new Promise<void>((resolve) => {
          queueMicrotask(() => {
            task()
              .catch((err) => {
                console.warn('[TeleportHistory] Async write error:', err);
              })
              .finally(resolve);
          });
        }),
    );
    this.writeQueue = next;
    return next;
  }

  public async flush(): Promise<void> {
    await this.writeQueue;
  }

  private async refreshCache(agentId?: string): Promise<TeleportHistoryRecord[]> {
    const targetAgent = String(agentId ?? this.getActiveAgentId()).trim();
    if (!targetAgent) {
      this.cachedAgentId = '';
      this.cachedEntries = [];
      this.emit('history_updated', []);
      return [];
    }
    const list = await this.store.getTeleportHistory(targetAgent);
    if (targetAgent === this.getActiveAgentId()) {
      this.cachedAgentId = targetAgent;
      this.cachedEntries = list;
      this.emit('history_updated', list);
    }
    return list;
  }

  private pushNavStack(record: TeleportHistoryRecord): void {
    if (this.isNavigatingStack) return;
    if (this.navIndex < this.navStack.length - 1) {
      this.navStack = this.navStack.slice(0, this.navIndex + 1);
    }
    const top = this.navStack[this.navStack.length - 1];
    if (!top || top.slurl !== record.slurl) {
      this.navStack.push(record);
      if (this.navStack.length > MAX_TELEPORT_HISTORY_ENTRIES) {
        this.navStack.shift();
      }
      this.navIndex = this.navStack.length - 1;
    }
  }

  private async handleTeleportCompleted(data: any): Promise<void> {
    if (data?.guard === 'acceptLure') {
      return;
    }

    const agentId = this.getActiveAgentId();
    if (!agentId) return;

    const requested = data?.result?.requested;
    const rawDest = String(data?.destination || data?.regionName || '').trim();
    const parsed = parseTeleportDestination(rawDest);

    let regionName = String(
      requested?.region || data?.regionName || parsed?.regionName || '',
    ).trim();

    if (!regionName || RESERVED_TARGETS.has(regionName.toLowerCase())) {
      return;
    }

    // Extract clean region name if data.regionName was still a SLURL
    const parsedFromRegion = parseTeleportDestination(regionName);
    if (parsedFromRegion) {
      regionName = parsedFromRegion.regionName;
    }

    let position: [number, number, number] | null = null;
    if (
      Array.isArray(data?.position) &&
      data.position.length >= 3 &&
      Number.isFinite(Number(data.position[0]))
    ) {
      position = [Number(data.position[0]), Number(data.position[1]), Number(data.position[2])];
    } else if (
      requested &&
      Number.isFinite(Number(requested.x)) &&
      Number.isFinite(Number(requested.y)) &&
      Number.isFinite(Number(requested.z))
    ) {
      position = [Number(requested.x), Number(requested.y), Number(requested.z)];
    } else if (parsed?.position) {
      position = parsed.position;
    } else if (parsedFromRegion?.position) {
      position = parsedFromRegion.position;
    } else if (
      this.world?.region?.name &&
      String(this.world.region.name).trim().toLowerCase() === regionName.toLowerCase() &&
      Array.isArray(this.world?.avatarPosition)
    ) {
      position = [
        Number(this.world.avatarPosition[0]),
        Number(this.world.avatarPosition[1]),
        Number(this.world.avatarPosition[2]),
      ];
    }

    const sameWorldRegion =
      this.world?.region?.name &&
      String(this.world.region.name).trim().toLowerCase() === regionName.toLowerCase();

    const gridX =
      typeof data?.gridX === 'number' && Number.isFinite(data.gridX)
        ? data.gridX
        : sameWorldRegion && Number.isFinite(Number(this.world.region.x))
          ? Number(this.world.region.x)
          : null;
    const gridY =
      typeof data?.gridY === 'number' && Number.isFinite(data.gridY)
        ? data.gridY
        : sameWorldRegion && Number.isFinite(Number(this.world.region.y))
          ? Number(this.world.region.y)
          : null;
    const parcelName = sameWorldRegion ? extractParcelName(this.world.region?.parcel) : null;
    const regionId = sameWorldRegion && this.world.region?.id ? String(this.world.region.id) : null;

    const record = await this.store.recordTeleportHistory(agentId, {
      regionName,
      parcelName,
      position,
      gridX,
      gridY,
      regionId,
      source: 'teleport',
    });

    if (record) {
      this.pushNavStack(record);
      await this.refreshCache(agentId);
      this.emit('entry_recorded', record);
    }
  }

  private async handleLureAccepted(data: any): Promise<void> {
    const agentId = this.getActiveAgentId();
    if (!agentId) return;

    const lure = data?.lure;
    const result = data?.result;
    const position: [number, number, number] | null =
      Array.isArray(lure?.position) && lure.position.length >= 3
        ? [Number(lure.position[0]), Number(lure.position[1]), Number(lure.position[2])]
        : null;
    const gridX =
      typeof lure?.gridX === 'number' && Number.isFinite(lure.gridX) ? lure.gridX : null;
    const gridY =
      typeof lure?.gridY === 'number' && Number.isFinite(lure.gridY) ? lure.gridY : null;
    const regionId = lure?.regionId ? String(lure.regionId) : null;

    const explicitRegionName = String(
      result?.requested?.region || result?.regionName || result?.region || lure?.regionName || '',
    ).trim();

    if (explicitRegionName) {
      const record = await this.store.recordTeleportHistory(agentId, {
        regionName: explicitRegionName,
        parcelName: null,
        position,
        gridX,
        gridY,
        regionId,
        source: 'lure',
      });
      if (record) {
        this.pushNavStack(record);
        await this.refreshCache(agentId);
        this.emit('entry_recorded', record);
      }
      this.pendingLureMeta = null;
      return;
    }

    // Retain lure coordinates so the impending RegionHandshake crossing captures them.
    this.pendingLureMeta = {
      regionId,
      position,
      gridX,
      gridY,
      receivedAt: Date.now(),
    };
  }

  private async handleRegionChanged(region: any): Promise<void> {
    if (!region || typeof region !== 'object') {
      this.lastRegionIdentity = null;
      return;
    }

    const agentId = this.getActiveAgentId();
    if (!agentId) return;

    const regionName = String(region.name || region.regionName || '').trim();
    if (!regionName || regionName.toLowerCase() === 'unknown region') {
      return;
    }

    const regionId = region.id ? String(region.id).trim() : null;
    const gridX =
      region.x !== undefined && region.x !== null && Number.isFinite(Number(region.x))
        ? Number(region.x)
        : null;
    const gridY =
      region.y !== undefined && region.y !== null && Number.isFinite(Number(region.y))
        ? Number(region.y)
        : null;
    const parcelName = region.parcel
      ? extractParcelName(region.parcel)
      : typeof region.parcelName === 'string' && region.parcelName.trim()
        ? region.parcelName.trim()
        : null;

    const identity = `${regionId || ''}::${regionName.toLowerCase()}::${gridX ?? ''}::${gridY ?? ''}`;
    const latest = this.cachedAgentId === agentId ? this.cachedEntries[0] : null;

    // If this region_changed is a ParcelProperties / metadata refresh for the current region,
    // or arrives right after an explicit teleport to the same region, enrich the latest entry
    // instead of creating a duplicate history row.
    const sameAsLastRegion =
      this.lastRegionIdentity !== null &&
      (this.lastRegionIdentity === identity ||
        (latest &&
          latest.regionName.toLowerCase() === regionName.toLowerCase() &&
          (!regionId || !latest.regionId || latest.regionId === regionId) &&
          this.lastRegionIdentity.includes(`::${regionName.toLowerCase()}::`)));

    const recentlyTeleportedHere =
      latest &&
      latest.source === 'teleport' &&
      latest.regionName.toLowerCase() === regionName.toLowerCase() &&
      Date.now() - latest.timestamp <= MERGE_WINDOW_MS;

    this.lastRegionIdentity = identity;

    if ((sameAsLastRegion || recentlyTeleportedHere) && latest) {
      const needsEnrich =
        (Boolean(parcelName) && latest.parcelName !== parcelName) ||
        (latest.gridX === null && gridX !== null) ||
        (latest.gridY === null && gridY !== null) ||
        (!latest.regionId && regionId) ||
        (!latest.position && Array.isArray(this.world?.avatarPosition));

      if (needsEnrich) {
        const updated = await this.store.updateTeleportHistoryEntry(agentId, latest.timestamp, {
          parcelName: parcelName || latest.parcelName,
          gridX: latest.gridX ?? gridX,
          gridY: latest.gridY ?? gridY,
          regionId: latest.regionId || regionId,
          position:
            latest.position ||
            (Array.isArray(this.world?.avatarPosition)
              ? [
                  Number(this.world.avatarPosition[0]),
                  Number(this.world.avatarPosition[1]),
                  Number(this.world.avatarPosition[2]),
                ]
              : null),
        });
        if (updated) {
          await this.refreshCache(agentId);
        }
      }
      return;
    }

    // Consume pending lure metadata if it arrived shortly before this region handshake
    let lureMeta = this.pendingLureMeta;
    if (lureMeta && Date.now() - lureMeta.receivedAt > 15000) {
      lureMeta = null;
      this.pendingLureMeta = null;
    }
    if (lureMeta && (!lureMeta.regionId || !regionId || lureMeta.regionId === regionId)) {
      this.pendingLureMeta = null;
    } else {
      lureMeta = null;
    }

    const avatarPos = Array.isArray(this.world?.avatarPosition)
      ? ([
          Number(this.world.avatarPosition[0]),
          Number(this.world.avatarPosition[1]),
          Number(this.world.avatarPosition[2]),
        ] as [number, number, number])
      : null;

    const position = lureMeta?.position ?? avatarPos;

    const record = await this.store.recordTeleportHistory(agentId, {
      regionName,
      parcelName,
      position,
      gridX: gridX ?? lureMeta?.gridX ?? null,
      gridY: gridY ?? lureMeta?.gridY ?? null,
      regionId: regionId ?? lureMeta?.regionId ?? null,
      source: lureMeta ? 'lure' : 'region_crossing',
    });

    if (record) {
      this.pushNavStack(record);
      await this.refreshCache(agentId);
      this.emit('entry_recorded', record);
    }
  }

  private async handleParcelChanged(parcel: any): Promise<void> {
    const agentId = this.getActiveAgentId();
    if (!agentId) return;
    const parcelName = extractParcelName(parcel);
    if (!parcelName) return;

    const latest = this.cachedAgentId === agentId ? this.cachedEntries[0] : null;
    const currentRegionName = String(this.world?.region?.name || '').trim();
    if (
      latest &&
      currentRegionName &&
      latest.regionName.toLowerCase() === currentRegionName.toLowerCase() &&
      latest.parcelName !== parcelName
    ) {
      const updated = await this.store.updateTeleportHistoryEntry(agentId, latest.timestamp, {
        parcelName,
      });
      if (updated) {
        await this.refreshCache(agentId);
      }
    }
  }

  // --- Public Query & Mutation API ---

  public async recordEntry(
    input: TeleportHistoryInput,
    agentIdOverride?: string,
  ): Promise<TeleportHistoryRecord | null> {
    const agentId = String(agentIdOverride ?? this.getActiveAgentId()).trim();
    if (!agentId) return null;
    const record = await this.store.recordTeleportHistory(agentId, input);
    if (record && agentId === this.getActiveAgentId()) {
      this.pushNavStack(record);
      await this.refreshCache(agentId);
      this.emit('entry_recorded', record);
    }
    return record;
  }

  public async getHistory(options?: {
    search?: string;
    limit?: number;
    agentId?: string;
  }): Promise<TeleportHistoryRecord[]> {
    const agentId = String(options?.agentId ?? this.getActiveAgentId()).trim();
    if (!agentId) return [];
    const results = await this.store.getTeleportHistory(agentId, {
      search: options?.search,
      limit: options?.limit,
    });
    if (!options?.search && !options?.limit && agentId === this.getActiveAgentId()) {
      this.cachedAgentId = agentId;
      this.cachedEntries = results;
    }
    return results;
  }

  public async deleteEntry(timestampOrId: number | string): Promise<boolean> {
    const agentId = this.getActiveAgentId();
    if (!agentId) return false;
    const removed = await this.store.deleteTeleportHistoryEntry(agentId, timestampOrId);
    if (removed) {
      this.navStack = this.navStack.filter(
        (entry) => entry.timestamp !== timestampOrId && entry.id !== timestampOrId,
      );
      this.navIndex = Math.min(this.navIndex, this.navStack.length - 1);
      if (this.cachedAgentId === agentId) {
        this.cachedEntries = this.cachedEntries.filter(
          (entry) => entry.timestamp !== timestampOrId && entry.id !== timestampOrId,
        );
        this.emit('history_updated', this.cachedEntries);
      } else {
        await this.refreshCache(agentId);
      }
    }
    return removed;
  }

  public async clearHistory(): Promise<number> {
    const agentId = this.getActiveAgentId();
    if (!agentId) return 0;
    const count = await this.store.clearTeleportHistory(agentId);
    this.navStack = [];
    this.navIndex = -1;
    if (this.cachedAgentId === agentId) {
      this.cachedEntries = [];
      this.emit('history_updated', []);
    } else {
      await this.refreshCache(agentId);
    }
    return count;
  }

  public async teleportToEntry(entry: TeleportHistoryRecord): Promise<any> {
    if (!entry) throw new Error('Select a destination entry to teleport.');
    const target =
      entry.slurl || buildSecondLifeSlurl(entry.regionName, entry.position) || entry.regionName;
    return this.protocol.teleportTo(target);
  }

  public canGoBack(): boolean {
    if (this.navStack.length > 1 && this.navIndex > 0) return true;
    return this.cachedEntries.length > 1 && this.navStack.length === 0;
  }

  public canGoForward(): boolean {
    return (
      this.navStack.length > 1 && this.navIndex >= 0 && this.navIndex < this.navStack.length - 1
    );
  }

  public async goBack(): Promise<TeleportHistoryRecord | null> {
    if (this.navStack.length === 0 && this.cachedEntries.length > 1) {
      // Seed stack from persisted history (oldest -> newest)
      this.navStack = [...this.cachedEntries].reverse();
      this.navIndex = this.navStack.length - 1;
    }
    if (this.navIndex <= 0 || this.navStack.length < 2) {
      return null;
    }
    const prevIndex = this.navIndex - 1;
    const target = this.navStack[prevIndex];
    if (!target) return null;

    this.isNavigatingStack = true;
    try {
      await this.teleportToEntry(target);
      this.navIndex = prevIndex;
      return target;
    } finally {
      this.isNavigatingStack = false;
    }
  }

  public async goForward(): Promise<TeleportHistoryRecord | null> {
    if (this.navIndex < 0 || this.navIndex >= this.navStack.length - 1) {
      return null;
    }
    const nextIndex = this.navIndex + 1;
    const target = this.navStack[nextIndex];
    if (!target) return null;

    this.isNavigatingStack = true;
    try {
      await this.teleportToEntry(target);
      this.navIndex = nextIndex;
      return target;
    } finally {
      this.isNavigatingStack = false;
    }
  }

  /**
   * Creates a Landmark inventory item from a teleport history record without re-entering coordinates.
   */
  public async createLandmark(entry: TeleportHistoryRecord, customName?: string): Promise<any> {
    if (!entry || !entry.regionName) {
      throw new Error('Valid teleport history entry required to create a landmark.');
    }
    if (!this.inventory) {
      throw new Error('Inventory manager is unavailable.');
    }

    const defaultTitle = entry.parcelName
      ? `${entry.parcelName}, ${entry.regionName}`
      : entry.regionName;
    const coordSuffix = entry.position
      ? ` (${Math.round(entry.position[0])}, ${Math.round(entry.position[1])}, ${Math.round(entry.position[2])})`
      : '';
    const name = String(customName || '').trim() || `${defaultTitle}${coordSuffix}`;

    let landmarksFolder: any = null;
    if (this.inventory.folders instanceof Map) {
      for (const folder of this.inventory.folders.values()) {
        const fType = Number(folder.folderType ?? folder.typeDefault ?? -1);
        const fName = String(folder.name || '')
          .trim()
          .toLowerCase();
        if (fType === LLFolderType.Landmark || fName === 'landmarks') {
          landmarksFolder = folder;
          break;
        }
      }
    }

    if (!landmarksFolder && typeof this.inventory.createFolder === 'function') {
      const rootId = this.inventory.rootFolder?.id || 'root';
      if (!this.inventory.rootFolder && typeof this.inventory.setRootFolder === 'function') {
        this.inventory.setRootFolder(rootId);
      }
      landmarksFolder = this.inventory.createFolder(Utils.generateUUID(), {
        name: 'Landmarks',
        parent: rootId,
        folderType: LLFolderType.Landmark,
      });
    }

    const folderId = landmarksFolder?.id || this.inventory.rootFolder?.id || '';
    const itemId = Utils.generateUUID();
    const slurl = entry.slurl || buildSecondLifeSlurl(entry.regionName, entry.position);

    const created = this.inventory.addItem(itemId, {
      name,
      folderId,
      parent: folderId,
      assetType: LLAssetType.Landmark,
      invType: LLAssetType.Landmark,
      description: slurl,
      permissions: {},
    });

    if (created) {
      created.folderId = folderId;
      created.assetType = LLAssetType.Landmark;
      created.invType = LLAssetType.Landmark;
      created.creationDate = Math.floor(Date.now() / 1000);
      created.data = {
        regionName: entry.regionName,
        parcelName: entry.parcelName,
        position: entry.position ? [...entry.position] : null,
        gridX: entry.gridX,
        gridY: entry.gridY,
        slurl,
      };
    }

    if (typeof this.inventory.persistToCache === 'function') {
      void Promise.resolve(this.inventory.persistToCache()).catch(() => {});
    }
    if (typeof this.inventory.emit === 'function') {
      this.inventory.emit('inventory_updated');
    }
    this.emit('landmark_created', created);
    return created;
  }
}
