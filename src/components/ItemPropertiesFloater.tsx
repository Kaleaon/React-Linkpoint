import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { deskGeometry, deskKind, floaterStyle } from '../theme/deskStyle.js';
import { app } from '../linkpoint/app';
import Icon from './Icon.jsx';
import CrystalProgressBar from './CrystalProgressBar.jsx';
import {
  buildItemPermissionUpdate,
  computeBatchPermissionStates,
  formatAcquisitionTimestamp,
  formatAvatarIdentity,
  formatPermissionMaskSummary,
  MAX_BATCH_UPDATE_ITEMS,
  normalizeItemPermissions,
  UNRESOLVED_AVATAR_PLACEHOLDER,
  type BatchUpdateProgress,
  type InspectableInventoryItem,
  type PermissionFieldKey,
  type PermissionTriState,
} from '../linkpoint/services/inventory-properties-service';

export interface ItemPropertiesFloaterProps {
  windowId?: string;
  items?: InspectableInventoryItem[];
  inline?: boolean;
  onClose?: () => void;
  onOpenLayoutDialog?: (
    floaterId: string,
    section?: string,
    triggerEl?: HTMLElement | null,
  ) => void;
}

interface TriStateCheckboxProps {
  id: string;
  label: string;
  hint?: string;
  state: PermissionTriState;
  disabled?: boolean;
  onChange: (next: PermissionTriState) => void;
  accentColor: string;
  inkColor: string;
  mutedColor: string;
  borderColor: string;
  fontFamily: string;
}

function TriStateCheckbox({
  id,
  label,
  hint,
  state,
  disabled = false,
  onChange,
  accentColor,
  inkColor,
  mutedColor,
  borderColor,
  fontFamily,
}: TriStateCheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = state === 'indeterminate';
    }
  }, [state]);

  const handleToggle = () => {
    if (disabled) return;
    if (state === 'indeterminate') {
      onChange('checked');
    } else if (state === 'checked') {
      onChange('unchecked');
    } else {
      onChange('checked');
    }
  };

  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '5px 8px',
        borderRadius: '4px',
        border: `1px solid ${borderColor}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        userSelect: 'none',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          checked={state === 'checked'}
          aria-checked={state === 'indeterminate' ? 'mixed' : state === 'checked'}
          disabled={disabled}
          onChange={handleToggle}
          style={{
            width: '15px',
            height: '15px',
            margin: 0,
            accentColor,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ font: `500 11.5px/1.25 ${fontFamily}`, color: inkColor }}>{label}</span>
          {hint ? (
            <span style={{ font: `400 10px/1.2 ${fontFamily}`, color: mutedColor }}>{hint}</span>
          ) : null}
        </span>
      </span>
      {state === 'indeterminate' ? (
        <span
          data-testid={`${id}-mixed-badge`}
          style={{
            flex: 'none',
            padding: '1px 5px',
            borderRadius: '3px',
            border: `1px solid ${accentColor}`,
            font: `700 9px/1.2 ${fontFamily}`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: accentColor,
          }}
        >
          Mixed
        </span>
      ) : null}
    </label>
  );
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  '0': 'Texture',
  '1': 'Sound',
  '2': 'Calling Card',
  '3': 'Landmark',
  '4': 'Script',
  '5': 'Clothing',
  '6': 'Object',
  '7': 'Notecard',
  '8': 'Folder',
  '10': 'LSL Script',
  '13': 'Body Part',
  '15': 'Snapshot',
  '20': 'Animation',
  '21': 'Gesture',
  '49': 'Mesh',
  '56': 'Material',
};

function formatAssetTypeLabel(item: InspectableInventoryItem): string {
  const raw = item.assetType ?? item.type;
  if (raw === undefined || raw === null || raw === '') return 'Item';
  const key = String(raw);
  if (ASSET_TYPE_LABELS[key]) return ASSET_TYPE_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function mergeNameMaps(
  prev: Record<string, string>,
  ...additions: Array<Record<string, string>>
): Record<string, string> {
  let changed = false;
  const next = { ...prev };
  for (const map of additions) {
    for (const [k, v] of Object.entries(map)) {
      if (v && next[k] !== v) {
        next[k] = v;
        changed = true;
      }
    }
  }
  return changed ? next : prev;
}

export default function ItemPropertiesFloater({
  windowId = 'ItemPropertiesFloater',
  items: itemsProp,
  inline = false,
  onClose,
  onOpenLayoutDialog,
}: ItemPropertiesFloaterProps) {
  const { state, actions } = useApp();
  const { V, t, ink } = useTheme();
  const kind = deskKind(t);
  const G = deskGeometry(kind);
  const [inventoryRev, setInventoryRev] = useState(0);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  // Subscribe to live inventory updates & rollbacks
  useEffect(() => {
    const bump = () => setInventoryRev((n) => n + 1);
    app.inventory?.on?.('inventory_updated', bump);
    app.inventory?.on?.('inventory_loaded', bump);
    return () => {
      app.inventory?.off?.('inventory_updated', bump);
      app.inventory?.off?.('inventory_loaded', bump);
    };
  }, []);

  const windowRecord = state.itemPropertiesWindows?.[windowId] as
    | {
        windowId: string;
        itemIds: string[];
        fallbackItems?: Record<string, InspectableInventoryItem>;
        title?: string;
      }
    | undefined;

  const selectedItems: InspectableInventoryItem[] = useMemo(() => {
    // Reference inventoryRev so updates/rollbacks recompute live items
    void inventoryRev;
    if (Array.isArray(itemsProp)) {
      return itemsProp
        .filter((it) => it && !it.folder && it.type !== 'folder')
        .map((it) => {
          const live = app.inventory?.items?.get?.(it.id) as InspectableInventoryItem | undefined;
          return live ? { ...it, ...live } : it;
        });
    }
    const ids = windowRecord?.itemIds || [];
    const fallbacks = windowRecord?.fallbackItems || {};
    const list: InspectableInventoryItem[] = [];
    for (const id of ids) {
      const live = app.inventory?.items?.get?.(id) as InspectableInventoryItem | undefined;
      const fallback = fallbacks[id];
      const merged = live ? (fallback ? { ...fallback, ...live } : live) : fallback;
      if (merged && !merged.folder && merged.type !== 'folder') {
        list.push(merged);
      }
    }
    return list;
  }, [itemsProp, windowRecord, inventoryRev]);

  const selectionSignature = useMemo(
    () => selectedItems.map((it) => it.id).join('|'),
    [selectedItems],
  );

  const initialSummary = useMemo(
    () => computeBatchPermissionStates(selectedItems),
    [selectedItems],
  );

  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftStates, setDraftStates] = useState<Record<PermissionFieldKey, PermissionTriState>>(
    initialSummary.states,
  );
  const [isApplying, setIsApplying] = useState(false);
  const [progress, setProgress] = useState<BatchUpdateProgress | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Sync form state when target item selection changes (or when inventory updates while idle)
  useEffect(() => {
    if (isApplying) return;
    const summary = computeBatchPermissionStates(selectedItems);
    setDraftStates(summary.states);
    if (selectedItems.length === 1) {
      setDraftName(selectedItems[0].name || '');
      setDraftDescription(selectedItems[0].description || '');
    } else {
      setDraftName('');
      setDraftDescription('');
    }
  }, [selectionSignature, inventoryRev, isApplying, selectedItems]);

  // Clear transient banners only when switching to a different selection
  useEffect(() => {
    setStatusBanner(null);
    setErrorBanner(null);
    setProgress(null);
  }, [selectionSignature]);

  // Resolve creator & owner avatar names
  useEffect(() => {
    let cancelled = false;
    const idsToResolve: string[] = [];
    for (const item of selectedItems) {
      const creatorId = item.creatorId || item.permissions?.creatorId;
      const ownerId = item.ownerId || item.permissions?.ownerId;
      if (creatorId) idsToResolve.push(creatorId);
      if (ownerId) idsToResolve.push(ownerId);
    }

    const knownLookup: Record<string, string> = {};
    const friends = (app.friends?.getFriends?.() || []) as Array<{
      id?: string;
      name?: string;
    }>;
    for (const f of friends) {
      if (f?.id && f?.name) knownLookup[f.id] = f.name;
    }
    const nearby = (app.world?.nearbyUsers || []) as Array<{
      id?: string;
      name?: string;
    }>;
    for (const u of nearby) {
      if (u?.id && u?.name) knownLookup[u.id] = u.name;
    }
    const authUser = app.auth?.user as
      { id?: string; fullName?: string; name?: string } | undefined;
    if (authUser?.id && (authUser.fullName || authUser.name)) {
      knownLookup[authUser.id] = authUser.fullName || authUser.name || '';
    }

    if (idsToResolve.length === 0) {
      setResolvedNames((prev) => mergeNameMaps(prev, knownLookup));
      return () => {
        cancelled = true;
      };
    }

    setResolvedNames((prev) => mergeNameMaps(prev, knownLookup));

    if (typeof app.inventory?.resolveAvatarNames === 'function') {
      void app.inventory
        .resolveAvatarNames(idsToResolve, knownLookup)
        .then((res) => {
          if (!cancelled && res) {
            setResolvedNames((prev) => mergeNameMaps(prev, knownLookup, res));
          }
        })
        .catch(() => {
          // Leave unresolvable names absent so formatAvatarIdentity returns "―"
        });
    }

    return () => {
      cancelled = true;
    };
  }, [selectedItems]);

  const isSingle = selectedItems.length === 1;
  const isMulti = selectedItems.length > 1;
  const exceedsBatchLimit = selectedItems.length > MAX_BATCH_UPDATE_ITEMS;
  const singleItem = isSingle ? selectedItems[0] : null;
  const singlePerms = useMemo(
    () => (singleItem ? normalizeItemPermissions(singleItem) : null),
    [singleItem],
  );

  const creatorDisplay = useMemo(() => {
    if (selectedItems.length === 0) return UNRESOLVED_AVATAR_PLACEHOLDER;
    if (selectedItems.length === 1) {
      const it = selectedItems[0];
      return formatAvatarIdentity(
        it.creatorId || it.permissions?.creatorId,
        resolvedNames,
        it.creatorName,
      );
    }
    const formatted = Array.from(
      new Set(
        selectedItems.map((it) =>
          formatAvatarIdentity(
            it.creatorId || it.permissions?.creatorId,
            resolvedNames,
            it.creatorName,
          ),
        ),
      ),
    );
    return formatted.length === 1 ? formatted[0] : `Multiple (${formatted.length})`;
  }, [selectedItems, resolvedNames]);

  const ownerDisplay = useMemo(() => {
    if (selectedItems.length === 0) return UNRESOLVED_AVATAR_PLACEHOLDER;
    if (selectedItems.length === 1) {
      const it = selectedItems[0];
      return formatAvatarIdentity(
        it.ownerId || it.permissions?.ownerId,
        resolvedNames,
        it.ownerName,
      );
    }
    const formatted = Array.from(
      new Set(
        selectedItems.map((it) =>
          formatAvatarIdentity(it.ownerId || it.permissions?.ownerId, resolvedNames, it.ownerName),
        ),
      ),
    );
    return formatted.length === 1 ? formatted[0] : `Multiple (${formatted.length})`;
  }, [selectedItems, resolvedNames]);

  const acquiredDisplay = useMemo(() => {
    if (selectedItems.length === 0) return UNRESOLVED_AVATAR_PLACEHOLDER;
    if (selectedItems.length === 1) {
      return formatAcquisitionTimestamp(selectedItems[0].creationDate);
    }
    const dates = selectedItems
      .map((it) => formatAcquisitionTimestamp(it.creationDate))
      .filter((d) => d !== UNRESOLVED_AVATAR_PLACEHOLDER);
    if (dates.length === 0) return UNRESOLVED_AVATAR_PLACEHOLDER;
    const unique = Array.from(new Set(dates));
    return unique.length === 1 ? unique[0] : `${unique.length} timestamps`;
  }, [selectedItems]);

  const hasChanges = useMemo(() => {
    if (selectedItems.length === 0) return false;
    const keys: PermissionFieldKey[] = [
      'groupShare',
      'everyoneCopy',
      'nextOwnerModify',
      'nextOwnerCopy',
      'nextOwnerTransfer',
    ];
    for (const k of keys) {
      if (draftStates[k] !== initialSummary.states[k]) {
        return true;
      }
    }
    if (isSingle && singleItem) {
      if (draftName.trim() !== (singleItem.name || '').trim()) return true;
      if (draftDescription !== (singleItem.description || '')) return true;
    }
    return false;
  }, [
    selectedItems.length,
    draftStates,
    initialSummary.states,
    isSingle,
    singleItem,
    draftName,
    draftDescription,
  ]);

  const updateDraftField = useCallback((field: PermissionFieldKey, value: PermissionTriState) => {
    setDraftStates((prev) => ({ ...prev, [field]: value }));
    setStatusBanner(null);
    setErrorBanner(null);
  }, []);

  const applyNextOwnerPreset = useCallback(
    (modify: boolean, copy: boolean, transfer: boolean) => {
      setDraftStates((prev) => ({
        ...prev,
        nextOwnerModify: initialSummary.editable.nextOwnerModify
          ? modify
            ? 'checked'
            : 'unchecked'
          : prev.nextOwnerModify,
        nextOwnerCopy: initialSummary.editable.nextOwnerCopy
          ? copy
            ? 'checked'
            : 'unchecked'
          : prev.nextOwnerCopy,
        nextOwnerTransfer: initialSummary.editable.nextOwnerTransfer
          ? transfer
            ? 'checked'
            : 'unchecked'
          : prev.nextOwnerTransfer,
      }));
      setStatusBanner(null);
      setErrorBanner(null);
    },
    [initialSummary.editable],
  );

  const handleReset = useCallback(() => {
    const summary = computeBatchPermissionStates(selectedItems);
    setDraftStates(summary.states);
    if (selectedItems.length === 1) {
      setDraftName(selectedItems[0].name || '');
      setDraftDescription(selectedItems[0].description || '');
    }
    setErrorBanner(null);
    setStatusBanner(null);
    setProgress(null);
  }, [selectedItems]);

  const handleApply = useCallback(async () => {
    if (selectedItems.length === 0 || isApplying) return;
    if (selectedItems.length > MAX_BATCH_UPDATE_ITEMS) {
      setErrorBanner(
        `Batch operations are limited to ${MAX_BATCH_UPDATE_ITEMS} items per request.`,
      );
      return;
    }

    setIsApplying(true);
    setErrorBanner(null);
    setStatusBanner(null);

    const payloads = selectedItems.map((item) =>
      buildItemPermissionUpdate(
        item,
        {
          name: isSingle ? draftName : undefined,
          description: isSingle ? draftDescription : undefined,
          states: draftStates,
        },
        isSingle,
      ),
    );

    setProgress({
      completed: 0,
      total: payloads.length,
      percent: 5,
      phase: 'preparing',
      statusText: `Preparing ${payloads.length} item${payloads.length === 1 ? '' : 's'}…`,
    });

    try {
      const result = await app.inventory.batchUpdateItemProperties(payloads, {
        onProgress: (p) => {
          setProgress(p);
        },
      });

      const transportLabel =
        result.transport === 'capability'
          ? 'UpdateInventoryItem capability'
          : `${result.chunkCount} reliable UDP batch${result.chunkCount === 1 ? '' : 'es'}`;

      const msg = `Updated ${result.updatedIds.length} item${result.updatedIds.length === 1 ? '' : 's'} via ${transportLabel}.`;
      setStatusBanner(msg);
      setInventoryRev((n) => n + 1);
      actions.notify?.(msg);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setErrorBanner(`Update failed — changes rolled back: ${reason}`);
      // Re-sync draft checkboxes to rolled-back inventory items
      setInventoryRev((n) => n + 1);
      const restoredItems = selectedItems.map((it) => {
        const live = app.inventory?.items?.get?.(it.id) as InspectableInventoryItem | undefined;
        return live || it;
      });
      const restoredSummary = computeBatchPermissionStates(restoredItems);
      setDraftStates(restoredSummary.states);
      if (restoredItems.length === 1) {
        setDraftName(restoredItems[0].name || '');
        setDraftDescription(restoredItems[0].description || '');
      }
    } finally {
      setIsApplying(false);
    }
  }, [selectedItems, isApplying, isSingle, draftName, draftDescription, draftStates, actions]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    if (typeof actions.closeItemProperties === 'function') {
      actions.closeItemProperties(windowId);
    } else {
      actions.flClose?.(windowId);
    }
  }, [onClose, actions, windowId]);

  const windowTitle = useMemo(() => {
    if (selectedItems.length > 1) {
      return `Item Properties (${selectedItems.length} items)`;
    }
    if (selectedItems.length === 1) {
      return `Item Properties: ${selectedItems[0].name}`;
    }
    return windowRecord?.title || 'Item Properties';
  }, [selectedItems, windowRecord?.title]);

  const sectionCardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '9px 10px',
    background: V.surf2,
    border: `1px solid ${V.outv}`,
    borderRadius: kind === 'default' ? V.rs : 0,
  };

  const metaRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
    font: `400 11px/1.35 ${t.font}`,
  };

  const bodyContent = (
    <div
      data-testid={`item-properties-body-${windowId}`}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        background: V.surf,
        color: V.ink,
      }}
    >
      {selectedItems.length === 0 ? (
        <div
          style={{
            ...sectionCardStyle,
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 12px',
            textAlign: 'center',
          }}
        >
          <Icon name="sliders-horizontal" size={20} color={V.ink2} />
          <div style={{ font: `600 12px/1.3 ${t.dfont}`, color: V.ink }}>
            No Inventory Item Selected
          </div>
          <div style={{ font: `400 11px/1.4 ${t.font}`, color: V.ink2 }}>
            Select one or more items in Inventory and choose Properties to inspect metadata or
            batch-update permissions.
          </div>
        </div>
      ) : (
        <>
          {/* Single Item Name/Description OR Multi-Selection Summary */}
          {isSingle && singleItem ? (
            <div style={sectionCardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor={`${windowId}-item-name`}
                  style={{
                    font: `700 9.5px/1.2 ${t.dfont}`,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: V.ink2,
                  }}
                >
                  Name
                </label>
                <input
                  id={`${windowId}-item-name`}
                  type="text"
                  value={draftName}
                  disabled={isApplying}
                  onChange={(e) => {
                    setDraftName(e.target.value);
                    setStatusBanner(null);
                  }}
                  style={{
                    width: '100%',
                    height: '28px',
                    padding: '0 8px',
                    boxSizing: 'border-box',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: kind === 'default' ? V.rs : 0,
                    font: `500 11.5px/1 ${t.font}`,
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor={`${windowId}-item-desc`}
                  style={{
                    font: `700 9.5px/1.2 ${t.dfont}`,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: V.ink2,
                  }}
                >
                  Description
                </label>
                <input
                  id={`${windowId}-item-desc`}
                  type="text"
                  value={draftDescription}
                  disabled={isApplying}
                  onChange={(e) => {
                    setDraftDescription(e.target.value);
                    setStatusBanner(null);
                  }}
                  style={{
                    width: '100%',
                    height: '28px',
                    padding: '0 8px',
                    boxSizing: 'border-box',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: kind === 'default' ? V.rs : 0,
                    font: `400 11px/1 ${t.font}`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div data-testid={`${windowId}-multi-selection-banner`} style={sectionCardStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span style={{ font: `700 11.5px/1.2 ${t.dfont}`, color: V.ink }}>
                  {selectedItems.length} items selected
                </span>
                {initialSummary.hasConflicts ? (
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      background: V.bg,
                      border: `1px solid ${V.pri}`,
                      font: `700 9px/1.2 ${t.dfont}`,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: V.pri,
                    }}
                  >
                    Conflicting Bits
                  </span>
                ) : null}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  maxHeight: '52px',
                  overflowY: 'auto',
                }}
              >
                {selectedItems.slice(0, 8).map((item) => (
                  <span
                    key={item.id}
                    style={{
                      padding: '2px 6px',
                      background: V.bg,
                      border: `1px solid ${V.outv}`,
                      borderRadius: '3px',
                      font: `400 10px/1.2 ${t.font}`,
                      color: V.ink2,
                      maxWidth: '160px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </span>
                ))}
                {selectedItems.length > 8 ? (
                  <span
                    style={{
                      padding: '2px 6px',
                      font: `500 10px/1.2 ${t.font}`,
                      color: V.ink2,
                    }}
                  >
                    +{selectedItems.length - 8} more
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {/* Attribution & Acquisition Metadata */}
          <div style={sectionCardStyle} aria-label="Asset Attribution">
            <div
              style={{
                font: `700 9.5px/1.2 ${t.dfont}`,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: V.ink2,
              }}
            >
              Attribution &amp; Metadata
            </div>
            <div style={metaRowStyle}>
              <span style={{ color: V.ink2 }}>Creator</span>
              <span
                data-testid={`${windowId}-creator-name`}
                style={{ fontWeight: 500, color: V.ink, textAlign: 'right' }}
              >
                {creatorDisplay}
              </span>
            </div>
            <div style={metaRowStyle}>
              <span style={{ color: V.ink2 }}>Owner</span>
              <span
                data-testid={`${windowId}-owner-name`}
                style={{ fontWeight: 500, color: V.ink, textAlign: 'right' }}
              >
                {ownerDisplay}
              </span>
            </div>
            <div style={metaRowStyle}>
              <span style={{ color: V.ink2 }}>Acquired</span>
              <span
                data-testid={`${windowId}-acquired-date`}
                style={{ fontFamily: t.dfont || t.font, color: V.ink, textAlign: 'right' }}
              >
                {acquiredDisplay}
              </span>
            </div>
            {isSingle && singleItem ? (
              <>
                <div style={metaRowStyle}>
                  <span style={{ color: V.ink2 }}>Type</span>
                  <span style={{ color: V.ink }}>{formatAssetTypeLabel(singleItem)}</span>
                </div>
                <div style={metaRowStyle}>
                  <span style={{ color: V.ink2 }}>Item UUID</span>
                  <span
                    style={{
                      fontFamily: t.dfont || t.font,
                      fontSize: '10px',
                      color: V.ink2,
                      wordBreak: 'break-all',
                      textAlign: 'right',
                    }}
                  >
                    {singleItem.id}
                  </span>
                </div>
                {singlePerms ? (
                  <div style={metaRowStyle}>
                    <span style={{ color: V.ink2 }}>Owner Mask</span>
                    <span style={{ color: V.ink, fontSize: '10.5px' }}>
                      {formatPermissionMaskSummary(singlePerms.ownerMask)}
                    </span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {/* Permissions Controls */}
          <div style={sectionCardStyle} role="group" aria-label="Permissions">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <span
                style={{
                  font: `700 9.5px/1.2 ${t.dfont}`,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: V.ink2,
                }}
              >
                Group &amp; Public Permissions
              </span>
            </div>

            <TriStateCheckbox
              id={`${windowId}-perm-group-share`}
              label="Share with group"
              hint="Allow active group members to modify/move"
              state={draftStates.groupShare}
              disabled={isApplying || !initialSummary.editable.groupShare}
              onChange={(next) => updateDraftField('groupShare', next)}
              accentColor={V.pri}
              inkColor={V.ink}
              mutedColor={V.ink2}
              borderColor={V.outv}
              fontFamily={t.font}
            />

            <TriStateCheckbox
              id={`${windowId}-perm-everyone-copy`}
              label="Allow anyone to copy"
              hint="Requires both Copy and Transfer rights"
              state={draftStates.everyoneCopy}
              disabled={isApplying || !initialSummary.editable.everyoneCopy}
              onChange={(next) => updateDraftField('everyoneCopy', next)}
              accentColor={V.pri}
              inkColor={V.ink}
              mutedColor={V.ink2}
              borderColor={V.outv}
              fontFamily={t.font}
            />
          </div>

          <div style={sectionCardStyle} role="group" aria-label="Next owner permissions">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '4px',
              }}
            >
              <span
                style={{
                  font: `700 9.5px/1.2 ${t.dfont}`,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: V.ink2,
                }}
              >
                Next Owner Can
              </span>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={() => applyNextOwnerPreset(false, true, false)}
                  style={{
                    padding: '2px 6px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '3px',
                    font: `600 9.5px/1.2 ${t.dfont}`,
                    cursor: isApplying ? 'not-allowed' : 'pointer',
                  }}
                >
                  Copy-Only
                </button>
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={() => applyNextOwnerPreset(true, true, false)}
                  style={{
                    padding: '2px 6px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '3px',
                    font: `600 9.5px/1.2 ${t.dfont}`,
                    cursor: isApplying ? 'not-allowed' : 'pointer',
                  }}
                >
                  Copy + Mod
                </button>
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={() => applyNextOwnerPreset(false, false, true)}
                  style={{
                    padding: '2px 6px',
                    background: V.bg,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: '3px',
                    font: `600 9.5px/1.2 ${t.dfont}`,
                    cursor: isApplying ? 'not-allowed' : 'pointer',
                  }}
                >
                  Transfer-Only
                </button>
              </div>
            </div>

            <TriStateCheckbox
              id={`${windowId}-perm-next-modify`}
              label="Modify"
              state={draftStates.nextOwnerModify}
              disabled={isApplying || !initialSummary.editable.nextOwnerModify}
              onChange={(next) => updateDraftField('nextOwnerModify', next)}
              accentColor={V.pri}
              inkColor={V.ink}
              mutedColor={V.ink2}
              borderColor={V.outv}
              fontFamily={t.font}
            />

            <TriStateCheckbox
              id={`${windowId}-perm-next-copy`}
              label="Copy"
              state={draftStates.nextOwnerCopy}
              disabled={isApplying || !initialSummary.editable.nextOwnerCopy}
              onChange={(next) => updateDraftField('nextOwnerCopy', next)}
              accentColor={V.pri}
              inkColor={V.ink}
              mutedColor={V.ink2}
              borderColor={V.outv}
              fontFamily={t.font}
            />

            <TriStateCheckbox
              id={`${windowId}-perm-next-transfer`}
              label="Transfer (Resell / Give away)"
              state={draftStates.nextOwnerTransfer}
              disabled={isApplying || !initialSummary.editable.nextOwnerTransfer}
              onChange={(next) => updateDraftField('nextOwnerTransfer', next)}
              accentColor={V.pri}
              inkColor={V.ink}
              mutedColor={V.ink2}
              borderColor={V.outv}
              fontFamily={t.font}
            />
          </div>

          {/* 100-Item Batch Guardrail Alert */}
          {exceedsBatchLimit ? (
            <div
              role="alert"
              data-testid={`${windowId}-batch-limit-alert`}
              style={{
                padding: '8px 10px',
                background: V.bg,
                border: `1px solid ${V.err || '#e05252'}`,
                borderRadius: kind === 'default' ? V.rs : 0,
                color: V.err || '#e05252',
                font: `500 11px/1.35 ${t.font}`,
              }}
            >
              Batch operations are limited to {MAX_BATCH_UPDATE_ITEMS} items per request (
              {selectedItems.length} currently selected). Reduce your selection to{' '}
              {MAX_BATCH_UPDATE_ITEMS} or fewer items.
            </div>
          ) : null}

          {/* Progress Bar during / after Batch Execution */}
          {isApplying || progress ? (
            <div
              data-testid={`${windowId}-batch-progress`}
              style={{
                padding: '8px 10px',
                background: V.surf2,
                border: `1px solid ${V.outv}`,
                borderRadius: kind === 'default' ? V.rs : 0,
              }}
            >
              <CrystalProgressBar
                progress={progress?.percent ?? 0}
                showLabel
                label={progress?.statusText || 'Updating item permissions…'}
                ariaLabel="Inventory batch permission update progress"
                error={Boolean(errorBanner)}
              />
            </div>
          ) : null}

          {/* Completion or Rollback Banners */}
          {statusBanner ? (
            <div
              role="status"
              data-testid={`${windowId}-completion-status`}
              style={{
                padding: '7px 10px',
                background: V.surf2,
                border: `1px solid ${V.pri}`,
                borderRadius: kind === 'default' ? V.rs : 0,
                color: V.ink,
                font: `500 11px/1.35 ${t.font}`,
              }}
            >
              {statusBanner}
            </div>
          ) : null}

          {errorBanner ? (
            <div
              role="alert"
              data-testid={`${windowId}-error-alert`}
              style={{
                padding: '7px 10px',
                background: V.bg,
                border: `1px solid ${V.err || '#e05252'}`,
                borderRadius: kind === 'default' ? V.rs : 0,
                color: V.err || '#e05252',
                font: `500 11px/1.35 ${t.font}`,
              }}
            >
              {errorBanner}
            </div>
          ) : null}

          {/* Action Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
              marginTop: 'auto',
              paddingTop: '4px',
            }}
          >
            <button
              type="button"
              disabled={isApplying || !hasChanges}
              onClick={handleReset}
              style={{
                height: '30px',
                padding: '0 12px',
                background: V.surf2,
                color: V.ink,
                border: `1px solid ${V.outv}`,
                borderRadius: kind === 'default' ? V.rs : 0,
                font: `600 10.5px/1 ${t.dfont}`,
                cursor: isApplying || !hasChanges ? 'not-allowed' : 'pointer',
                opacity: isApplying || !hasChanges ? 0.55 : 1,
              }}
            >
              Reset
            </button>
            <button
              type="button"
              data-testid={`${windowId}-apply-button`}
              disabled={isApplying || exceedsBatchLimit}
              onClick={() => void handleApply()}
              style={{
                height: '30px',
                padding: '0 14px',
                background: V.pri,
                color: ink(V.pri, [V.bg, V.onpri, V.ink]),
                border: 'none',
                borderRadius: kind === 'default' ? V.rs : 0,
                font: `700 10.5px/1 ${t.dfont}`,
                letterSpacing: '0.06em',
                cursor: isApplying || exceedsBatchLimit ? 'not-allowed' : 'pointer',
                opacity: isApplying || exceedsBatchLimit ? 0.6 : 1,
              }}
            >
              {isApplying ? 'Applying…' : isMulti ? 'Apply to All' : 'Apply'}
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (inline) {
    return (
      <div
        role="region"
        aria-label={windowTitle}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: V.surf,
        }}
      >
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '8px 12px',
            background: V.surf2,
            borderBottom: `1px solid ${V.outv}`,
          }}
        >
          <span style={{ font: `700 12px/1.2 ${t.dfont}`, color: V.ink }}>{windowTitle}</span>
          <button
            type="button"
            onClick={() => {
              if (onClose) {
                onClose();
              } else {
                actions.setScreen?.('Inventory');
              }
            }}
            style={{
              padding: '4px 10px',
              background: V.bg,
              color: V.ink,
              border: `1px solid ${V.outv}`,
              borderRadius: kind === 'default' ? V.rs : 0,
              font: `600 11px/1.2 ${t.dfont}`,
              cursor: 'pointer',
            }}
          >
            Back to Inventory
          </button>
        </div>
        {bodyContent}
      </div>
    );
  }

  const r = actions.flR(windowId);
  const act = state.screen === windowId;
  const fs = floaterStyle(kind, { V, t, act, ink });
  const barStyle = fs.bar as React.CSSProperties;
  const isMaximized = Boolean(state.flMax?.[windowId]);
  const totalW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1440;
  const availW = Math.max(216, totalW - G.rail);
  const btnSize = kind === 'metro' ? 24 : kind === 'sweep' ? 18 : 17;
  const btnFont = kind === 'metro' ? `700 13px/1 ${t.dfont}` : `700 11px/1 ${t.dfont}`;

  const zIdx = act ? 62 : 14 + Math.max(0, (state.flZ || []).indexOf(windowId));

  return (
    <div
      role="dialog"
      aria-label={windowTitle}
      data-floater-id={windowId}
      onMouseDown={() => actions.flFocus(windowId)}
      style={{
        position: 'absolute',
        left: `${r.x + G.rail}px`,
        top: `${r.y + G.top}px`,
        width: `${r.w}px`,
        height: `${r.h}px`,
        minWidth: '216px',
        minHeight: '96px',
        zIndex: zIdx,
        display: 'flex',
        flexDirection: 'column',
        background: V.surf,
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...(fs.frame as React.CSSProperties),
      }}
    >
      {/* Desktop Floater Titlebar */}
      <div
        onMouseDown={(e) => actions.flDrag(windowId, e, 'move')}
        style={{
          flex: 'none',
          height: `${G.bar}px`,
          display: 'flex',
          alignItems: 'center',
          gap: kind === 'sweep' ? '6px' : '7px',
          userSelect: 'none',
          cursor: 'grab',
          ...barStyle,
        }}
      >
        {kind === 'sweep' ? (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '100%',
              padding: '0 8px',
              background: act ? V.sec : V.sec2,
              color: act ? V.bg : V.onsec,
              borderRadius: 0,
              font: `700 9.5px/1 ${t.dfont}`,
              letterSpacing: '0.1em',
              flex: 'none',
              marginRight: '4px',
            }}
          >
            {act ? 'LCARS' : 'SYS'}
          </span>
        ) : null}
        {kind !== 'metro' ? (
          <Icon name="sliders-horizontal" size={12} color={String(barStyle.color || V.ink)} />
        ) : null}

        <div
          role="separator"
          tabIndex={0}
          aria-roledescription="window move handle"
          aria-label={`${windowTitle} move handle`}
          aria-valuenow={r.x}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, availW - r.w)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 50 : 10;
            let handled = false;
            if (e.key === 'ArrowRight') {
              actions.flMove(windowId, step, 0);
              handled = true;
            } else if (e.key === 'ArrowLeft') {
              actions.flMove(windowId, -step, 0);
              handled = true;
            } else if (e.key === 'ArrowDown') {
              actions.flMove(windowId, 0, step);
              handled = true;
            } else if (e.key === 'ArrowUp') {
              actions.flMove(windowId, 0, -step);
              handled = true;
            }
            if (handled) {
              e.preventDefault();
              e.stopPropagation();
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onOpenLayoutDialog?.(windowId, 'position', e.currentTarget);
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            font: barStyle.font,
            letterSpacing: barStyle.letterSpacing,
            textTransform: barStyle.textTransform,
            color: barStyle.color,
            outline: 'none',
          }}
        >
          {windowTitle}
        </div>

        {selectedItems.length > 0 && typeof actions.openItemProperties === 'function' ? (
          <button
            type="button"
            data-testid={`${windowId}-compare-window-button`}
            aria-label={`Open comparison window for ${windowTitle}`}
            title="Pin to New Comparison Window"
            onClick={(e) => {
              e.stopPropagation();
              actions.openItemProperties(selectedItems, { newWindow: true });
            }}
            style={{
              width: `${btnSize}px`,
              height: `${btnSize}px`,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              ...fs.control,
              font: btnFont,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            +
          </button>
        ) : null}

        <button
          type="button"
          aria-label={`Snap ${windowTitle} left`}
          title="Snap Left"
          onClick={(e) => {
            e.stopPropagation();
            actions.flSnap(windowId, 'left');
          }}
          style={{
            width: `${btnSize}px`,
            height: `${btnSize}px`,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            ...fs.control,
            font: btnFont,
            cursor: 'pointer',
            opacity: 0.85,
          }}
        >
          &#x25E7;
        </button>

        <button
          type="button"
          aria-label={`Snap ${windowTitle} right`}
          title="Snap Right"
          onClick={(e) => {
            e.stopPropagation();
            actions.flSnap(windowId, 'right');
          }}
          style={{
            width: `${btnSize}px`,
            height: `${btnSize}px`,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            ...fs.control,
            font: btnFont,
            cursor: 'pointer',
            opacity: 0.85,
          }}
        >
          &#x25E8;
        </button>

        <button
          type="button"
          aria-label={isMaximized ? `Restore ${windowTitle}` : `Maximize ${windowTitle}`}
          title={isMaximized ? 'Restore' : 'Maximize'}
          onClick={(e) => {
            e.stopPropagation();
            actions.flSnap(windowId, isMaximized ? 'restore' : 'maximize');
          }}
          style={{
            width: `${btnSize}px`,
            height: `${btnSize}px`,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            ...fs.control,
            font: btnFont,
            cursor: 'pointer',
            opacity: 0.85,
          }}
        >
          {isMaximized ? '\u2750' : '\u25A1'}
        </button>

        {onOpenLayoutDialog ? (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Layout & Position for ${windowTitle}`}
            title="Layout & Position"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLayoutDialog(windowId, 'all', e.currentTarget);
            }}
            style={{
              width: `${btnSize}px`,
              height: `${btnSize}px`,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              ...fs.control,
              font: btnFont,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            <Icon name="move" size={11} />
          </button>
        ) : null}

        <button
          type="button"
          aria-label={`Minimize ${windowTitle}`}
          title="Minimize"
          onClick={(e) => {
            e.stopPropagation();
            actions.flToggle(windowId);
          }}
          style={{
            width: `${btnSize}px`,
            height: `${btnSize}px`,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            ...fs.control,
            font: btnFont,
            cursor: 'pointer',
            opacity: 0.85,
          }}
        >
          &ndash;
        </button>

        <button
          type="button"
          aria-label={`Close ${windowTitle}`}
          title="Close"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          style={{
            width: `${btnSize}px`,
            height: `${btnSize}px`,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            ...fs.control,
            font: btnFont,
            cursor: 'pointer',
            opacity: 0.85,
          }}
        >
          &times;
        </button>
      </div>

      {/* Interactive Floater Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          marginLeft: kind === 'sweep' ? '10px' : 0,
          marginTop: kind === 'metro' ? '3px' : 0,
          overflow: 'hidden',
        }}
      >
        {bodyContent}
      </div>

      {/* Corner Resize Grip */}
      <div
        role="separator"
        tabIndex={0}
        aria-roledescription="window resize grip"
        aria-label={`${windowTitle} resize grip`}
        aria-valuenow={r.w}
        aria-valuemin={216}
        aria-valuemax={availW}
        aria-orientation="horizontal"
        onMouseDown={(e) => actions.flDrag(windowId, e, 'size')}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 50 : 10;
          let handled = false;
          if (e.key === 'ArrowRight') {
            actions.flResize(windowId, step, 0);
            handled = true;
          } else if (e.key === 'ArrowLeft') {
            actions.flResize(windowId, -step, 0);
            handled = true;
          } else if (e.key === 'ArrowDown') {
            actions.flResize(windowId, 0, step);
            handled = true;
          } else if (e.key === 'ArrowUp') {
            actions.flResize(windowId, 0, -step);
            handled = true;
          }
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onOpenLayoutDialog?.(windowId, 'dimensions', e.currentTarget);
          }
        }}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: '15px',
          height: '15px',
          zIndex: 10,
          cursor: 'nwse-resize',
          background: `linear-gradient(135deg,transparent 0 52%,${fs.grip} 52% 100%)`,
          outline: 'none',
        }}
      />
    </div>
  );
}
