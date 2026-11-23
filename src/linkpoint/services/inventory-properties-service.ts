/**
 * Second Life Inventory Item Properties & Batch Permission Service
 *
 * Implements permission bitmask normalization, tri-state aggregation for multi-item
 * selections, deterministic UDP packet chunking under the 1200-byte SL MTU,
 * 100-item batch guardrails, and FAKE_DATA_POLICY-compliant identity formatting.
 */

export const PERMISSION_BITS = {
  NONE: 0x00000000,
  TRANSFER: 0x00002000, // 8192
  MODIFY: 0x00004000, // 16384
  COPY: 0x00008000, // 32768
  EXPORT: 0x00010000, // 65536
  MOVE: 0x00080000, // 524288
  DAMAGE: 0x00100000, // 1048576
  ALL: 0x0008e000, // TRANSFER | MODIFY | COPY | MOVE (581632)
} as const;

export const MAX_BATCH_UPDATE_ITEMS = 100;
export const MAX_UDP_UPDATE_PACKET_BYTES = 1100;
export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
export const UNRESOLVED_AVATAR_PLACEHOLDER = '―';

export type PermissionTriState = 'checked' | 'unchecked' | 'indeterminate';

export type PermissionFieldKey =
  'groupShare' | 'everyoneCopy' | 'nextOwnerModify' | 'nextOwnerCopy' | 'nextOwnerTransfer';

export interface ItemPermissionMasks {
  baseMask: number;
  ownerMask: number;
  groupMask: number;
  everyoneMask: number;
  nextOwnerMask: number;
  groupOwned: boolean;
  copy: boolean;
  modify: boolean;
  transfer: boolean;
}

export interface InspectableInventoryItem {
  id: string;
  name: string;
  description?: string;
  parent?: string;
  parentId?: string;
  assetId?: string;
  assetType?: number | string;
  type?: number | string;
  inventoryType?: number;
  creatorId?: string;
  creatorName?: string;
  ownerId?: string;
  ownerName?: string;
  lastOwnerId?: string;
  groupId?: string;
  groupOwned?: boolean;
  creationDate?: number | string;
  flags?: number;
  saleType?: number;
  salePrice?: number;
  permissions?: Partial<ItemPermissionMasks> & {
    creatorId?: string;
    ownerId?: string;
    groupId?: string;
  };
  folder?: boolean;
}

export interface BatchPermissionStateSummary {
  states: Record<PermissionFieldKey, PermissionTriState>;
  editable: Record<PermissionFieldKey, boolean>;
  hasConflicts: boolean;
}

export interface PermissionDraftChanges {
  name?: string;
  description?: string;
  states: Partial<Record<PermissionFieldKey, PermissionTriState>>;
}

export interface InventoryItemUpdatePayload {
  itemId: string;
  parentId?: string;
  name: string;
  description: string;
  assetId?: string;
  assetType?: number;
  inventoryType?: number;
  creatorId?: string;
  ownerId?: string;
  groupId?: string;
  groupOwned: boolean;
  creationDate?: number;
  flags?: number;
  saleType?: number;
  salePrice?: number;
  permissions: {
    baseMask: number;
    ownerMask: number;
    groupMask: number;
    everyoneMask: number;
    nextOwnerMask: number;
    groupOwned: boolean;
  };
}

export interface BatchUpdateProgress {
  completed: number;
  total: number;
  percent: number;
  phase: 'preparing' | 'updating' | 'persisting' | 'completed' | 'rolled_back';
  statusText: string;
}

function buildMaskFromBooleans(
  perms: Partial<ItemPermissionMasks> | undefined,
  fallbackMask: number,
): number {
  if (!perms) return fallbackMask >>> 0;
  const hasExplicitBooleans =
    typeof perms.copy === 'boolean' ||
    typeof perms.modify === 'boolean' ||
    typeof perms.transfer === 'boolean';
  if (!hasExplicitBooleans) {
    return fallbackMask >>> 0;
  }
  let mask = PERMISSION_BITS.MOVE;
  if (perms.copy !== false) mask |= PERMISSION_BITS.COPY;
  if (perms.modify) mask |= PERMISSION_BITS.MODIFY;
  if (perms.transfer !== false) mask |= PERMISSION_BITS.TRANSFER;
  return mask >>> 0;
}

/**
 * Normalizes raw permission fields into full 32-bit unsigned Second Life masks.
 */
export function normalizeItemPermissions(
  item?: Partial<InspectableInventoryItem> | null,
): ItemPermissionMasks {
  const raw = item?.permissions;
  const fallbackOwner = buildMaskFromBooleans(raw, PERMISSION_BITS.ALL);
  const baseMask = typeof raw?.baseMask === 'number' ? raw.baseMask >>> 0 : fallbackOwner;
  const ownerMask = typeof raw?.ownerMask === 'number' ? raw.ownerMask >>> 0 : baseMask;
  const groupMask = typeof raw?.groupMask === 'number' ? raw.groupMask >>> 0 : 0;
  const everyoneMask = typeof raw?.everyoneMask === 'number' ? raw.everyoneMask >>> 0 : 0;

  let nextOwnerMask: number;
  if (typeof raw?.nextOwnerMask === 'number') {
    nextOwnerMask = raw.nextOwnerMask >>> 0;
  } else {
    nextOwnerMask =
      buildMaskFromBooleans(
        raw,
        PERMISSION_BITS.COPY | PERMISSION_BITS.TRANSFER | PERMISSION_BITS.MOVE,
      ) & ownerMask;
  }

  const groupOwned = Boolean(raw?.groupOwned ?? item?.groupOwned ?? false);

  return {
    baseMask,
    ownerMask,
    groupMask,
    everyoneMask,
    nextOwnerMask,
    groupOwned,
    copy: (ownerMask & PERMISSION_BITS.COPY) !== 0,
    modify: (ownerMask & PERMISSION_BITS.MODIFY) !== 0,
    transfer: (ownerMask & PERMISSION_BITS.TRANSFER) !== 0,
  };
}

function aggregateTriState(values: boolean[]): PermissionTriState {
  if (values.length === 0) return 'unchecked';
  const first = values[0];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] !== first) {
      return 'indeterminate';
    }
  }
  return first ? 'checked' : 'unchecked';
}

const GROUP_SHARE_BITS = PERMISSION_BITS.MODIFY | PERMISSION_BITS.COPY | PERMISSION_BITS.MOVE;

/**
 * Computes tri-state checkbox states and editability across one or more selected items.
 */
export function computeBatchPermissionStates(
  items: InspectableInventoryItem[],
): BatchPermissionStateSummary {
  const normalized = items.map((item) => normalizeItemPermissions(item));

  const states: Record<PermissionFieldKey, PermissionTriState> = {
    groupShare: aggregateTriState(normalized.map((p) => (p.groupMask & GROUP_SHARE_BITS) !== 0)),
    everyoneCopy: aggregateTriState(
      normalized.map((p) => (p.everyoneMask & PERMISSION_BITS.COPY) !== 0),
    ),
    nextOwnerModify: aggregateTriState(
      normalized.map((p) => (p.nextOwnerMask & PERMISSION_BITS.MODIFY) !== 0),
    ),
    nextOwnerCopy: aggregateTriState(
      normalized.map((p) => (p.nextOwnerMask & PERMISSION_BITS.COPY) !== 0),
    ),
    nextOwnerTransfer: aggregateTriState(
      normalized.map((p) => (p.nextOwnerMask & PERMISSION_BITS.TRANSFER) !== 0),
    ),
  };

  const canGrantBit = (p: ItemPermissionMasks, bit: number) => {
    const ceiling = (p.baseMask & p.ownerMask) >>> 0;
    return (ceiling & bit) !== 0;
  };

  const editable: Record<PermissionFieldKey, boolean> = {
    groupShare:
      normalized.length > 0 &&
      normalized.some((p) => (p.baseMask & p.ownerMask & GROUP_SHARE_BITS) !== 0),
    everyoneCopy:
      normalized.length > 0 &&
      normalized.some(
        (p) => canGrantBit(p, PERMISSION_BITS.COPY) && canGrantBit(p, PERMISSION_BITS.TRANSFER),
      ),
    nextOwnerModify:
      normalized.length > 0 && normalized.some((p) => canGrantBit(p, PERMISSION_BITS.MODIFY)),
    nextOwnerCopy:
      normalized.length > 0 && normalized.some((p) => canGrantBit(p, PERMISSION_BITS.COPY)),
    nextOwnerTransfer:
      normalized.length > 0 && normalized.some((p) => canGrantBit(p, PERMISSION_BITS.TRANSFER)),
  };

  const hasConflicts = Object.values(states).some((s) => s === 'indeterminate');

  return { states, editable, hasConflicts };
}

function applyBitChoice(
  currentMask: number,
  bit: number,
  choice: PermissionTriState | undefined,
  grantableCeiling: number,
): number {
  if (!choice || choice === 'indeterminate') {
    return currentMask >>> 0;
  }
  if (choice === 'checked') {
    const allowedBit = bit & grantableCeiling;
    return (currentMask | allowedBit) >>> 0;
  }
  return (currentMask & ~bit) >>> 0;
}

/**
 * Applies user-selected tri-state permission changes to a single item while preserving
 * any untouched `'indeterminate'` permission bits on that item.
 */
export function buildItemPermissionUpdate(
  item: InspectableInventoryItem,
  draft: PermissionDraftChanges,
  isSingleItem: boolean,
): InventoryItemUpdatePayload {
  const perms = normalizeItemPermissions(item);
  const ceiling = (perms.baseMask & perms.ownerMask) >>> 0;

  let groupMask = perms.groupMask;
  if (draft.states.groupShare === 'checked') {
    groupMask = (groupMask | (GROUP_SHARE_BITS & ceiling)) >>> 0;
  } else if (draft.states.groupShare === 'unchecked') {
    groupMask = (groupMask & ~GROUP_SHARE_BITS) >>> 0;
  }

  let everyoneMask = perms.everyoneMask;
  if (draft.states.everyoneCopy === 'checked') {
    const canAllowEveryoneCopy =
      (ceiling & PERMISSION_BITS.COPY) !== 0 && (ceiling & PERMISSION_BITS.TRANSFER) !== 0;
    if (canAllowEveryoneCopy) {
      everyoneMask = (everyoneMask | PERMISSION_BITS.COPY) >>> 0;
    }
  } else if (draft.states.everyoneCopy === 'unchecked') {
    everyoneMask = (everyoneMask & ~PERMISSION_BITS.COPY) >>> 0;
  }

  let nextOwnerMask = perms.nextOwnerMask;
  nextOwnerMask = applyBitChoice(
    nextOwnerMask,
    PERMISSION_BITS.MODIFY,
    draft.states.nextOwnerModify,
    ceiling,
  );
  nextOwnerMask = applyBitChoice(
    nextOwnerMask,
    PERMISSION_BITS.COPY,
    draft.states.nextOwnerCopy,
    ceiling,
  );
  nextOwnerMask = applyBitChoice(
    nextOwnerMask,
    PERMISSION_BITS.TRANSFER,
    draft.states.nextOwnerTransfer,
    ceiling,
  );

  const nextName =
    isSingleItem && typeof draft.name === 'string' && draft.name.trim().length > 0
      ? draft.name.trim()
      : item.name;
  const nextDescription =
    isSingleItem && typeof draft.description === 'string'
      ? draft.description
      : (item.description ?? '');

  const numericAssetType =
    typeof item.assetType === 'number'
      ? item.assetType
      : typeof item.type === 'number'
        ? item.type
        : undefined;

  const numericCreationDate =
    typeof item.creationDate === 'number'
      ? item.creationDate
      : typeof item.creationDate === 'string' && /^\d+$/.test(item.creationDate)
        ? Number(item.creationDate)
        : undefined;

  return {
    itemId: item.id,
    parentId: item.parentId ?? item.parent,
    name: nextName,
    description: nextDescription,
    assetId: item.assetId,
    assetType: numericAssetType,
    inventoryType: item.inventoryType,
    creatorId: item.creatorId ?? item.permissions?.creatorId,
    ownerId: item.ownerId ?? item.permissions?.ownerId,
    groupId: item.groupId ?? item.permissions?.groupId,
    groupOwned: perms.groupOwned,
    creationDate: numericCreationDate,
    flags: item.flags,
    saleType: item.saleType,
    salePrice: item.salePrice,
    permissions: {
      baseMask: perms.baseMask,
      ownerMask: perms.ownerMask,
      groupMask,
      everyoneMask,
      nextOwnerMask,
      groupOwned: perms.groupOwned,
    },
  };
}

const textEncoder = new TextEncoder();

export function estimateInventoryBlockByteSize(
  update: Pick<InventoryItemUpdatePayload, 'name' | 'description'>,
): number {
  const nameBytes = Math.min(textEncoder.encode(update.name || '').length, 254) + 1;
  const descBytes = Math.min(textEncoder.encode(update.description || '').length, 254) + 1;
  // 140 fixed bytes + 1 byte Name length + Name + 1 byte Description length + Description
  return 140 + 1 + nameBytes + 1 + descBytes;
}

/**
 * Chunks inventory item updates so each serialized `UpdateInventoryItem` UDP packet stays
 * strictly below `maxPacketBytes` (default 1100 bytes, safely under the 1200-byte SL MTU).
 */
export function chunkUpdatesForUdp<
  T extends Pick<InventoryItemUpdatePayload, 'name' | 'description'>,
>(updates: T[], maxPacketBytes: number = MAX_UDP_UPDATE_PACKET_BYTES): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 49; // AgentData (48 bytes) + 1-byte InventoryData block count

  for (const update of updates) {
    const itemBytes = estimateInventoryBlockByteSize(update);
    if (
      current.length > 0 &&
      (currentBytes + itemBytes > maxPacketBytes || current.length >= 255)
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 49;
    }
    current.push(update);
    currentBytes += itemBytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

/**
 * Validates batch size against the 100-item circuit safety limit.
 */
export function assertValidBatchSize(count: number): void {
  if (count <= 0) {
    throw new Error('Select at least one inventory item to update.');
  }
  if (count > MAX_BATCH_UPDATE_ITEMS) {
    throw new Error(`Batch operations are limited to ${MAX_BATCH_UPDATE_ITEMS} items per request.`);
  }
}

export function isPlaceholderAvatarName(name?: string | null): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === 'unknown' ||
    lower === 'unknown avatar' ||
    lower === 'unknown resident' ||
    lower === 'loading...' ||
    lower === '(loading)' ||
    lower === 'n/a' ||
    trimmed === ZERO_UUID
  );
}

/**
 * Formats an avatar identity in strict compliance with FAKE_DATA_POLICY.md:
 * returns the resolved avatar name when known, or `"―"` when unresolvable.
 */
export function formatAvatarIdentity(
  avatarId: string | undefined | null,
  resolvedNames: Record<string, string>,
  inlineName?: string | null,
): string {
  if (inlineName && !isPlaceholderAvatarName(inlineName)) {
    return inlineName.trim();
  }
  if (!avatarId || avatarId === ZERO_UUID) {
    return UNRESOLVED_AVATAR_PLACEHOLDER;
  }
  const resolved = resolvedNames[avatarId];
  if (resolved && !isPlaceholderAvatarName(resolved)) {
    return resolved.trim();
  }
  return UNRESOLVED_AVATAR_PLACEHOLDER;
}

/**
 * Formats an item's acquisition timestamp (`creationDate` in Unix seconds, ms, or ISO string),
 * returning `"―"` when missing or zero.
 */
export function formatAcquisitionTimestamp(creationDate?: number | string | Date | null): string {
  if (creationDate === null || creationDate === undefined || creationDate === '') {
    return UNRESOLVED_AVATAR_PLACEHOLDER;
  }
  let ms = 0;
  if (creationDate instanceof Date) {
    ms = creationDate.getTime();
  } else if (typeof creationDate === 'number') {
    if (creationDate <= 0 || !Number.isFinite(creationDate)) {
      return UNRESOLVED_AVATAR_PLACEHOLDER;
    }
    // Distinguish Unix seconds (< 1e11) from Unix milliseconds
    ms = creationDate < 100_000_000_000 ? creationDate * 1000 : creationDate;
  } else if (typeof creationDate === 'string') {
    const trimmed = creationDate.trim();
    if (!trimmed || trimmed === '0') return UNRESOLVED_AVATAR_PLACEHOLDER;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (num <= 0) return UNRESOLVED_AVATAR_PLACEHOLDER;
      ms = num < 100_000_000_000 ? num * 1000 : num;
    } else {
      ms = Date.parse(trimmed);
    }
  }

  if (!Number.isFinite(ms) || ms <= 0) {
    return UNRESOLVED_AVATAR_PLACEHOLDER;
  }

  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return UNRESOLVED_AVATAR_PLACEHOLDER;
  }

  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/**
 * Formats Modify / Copy / Transfer bits of a Second Life permission mask into a concise summary string.
 */
export function formatPermissionMaskSummary(mask: number): string {
  const parts: string[] = [];
  parts.push((mask & PERMISSION_BITS.MODIFY) !== 0 ? 'Modify' : 'No Modify');
  parts.push((mask & PERMISSION_BITS.COPY) !== 0 ? 'Copy' : 'No Copy');
  parts.push((mask & PERMISSION_BITS.TRANSFER) !== 0 ? 'Transfer' : 'No Transfer');
  return parts.join(' · ');
}
