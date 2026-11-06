import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app.ts';
import { localCache } from '../linkpoint/local-cache.ts';
import Icon from '../components/Icon.jsx';
import TouchTarget from '../components/TouchTarget.tsx';
import SyncActionButton from '../components/SyncActionButton.tsx';
import SkeletonLoader from '../components/SkeletonLoader.jsx';
import AssetContainer from '../components/AssetContainer.jsx';
import FocusTrap from '../components/FocusTrap.jsx';
import { InventoryTree } from '../components/InventoryTree.tsx';

export const INVENTORY_VIEW_MODE_KEY = 'linkpoint_inventory_view_mode';
const FLAT_ROW_HEIGHT = 40;
const FLAT_OVERSCAN = 5;

function getStoredViewMode() {
  try {
    const saved = localStorage.getItem(INVENTORY_VIEW_MODE_KEY);
    if (saved === 'tree' || saved === 'flat') {
      return saved;
    }
  } catch {
    // Storage may be unavailable
  }
  return 'tree';
}

/** Dual-mode composite inventory view supporting hierarchical tree navigation and flat table search. */
export default function Inventory() {
  const { V, t } = useTheme();
  const [viewMode, setViewMode] = useState(getStoredViewMode);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(() => app.inventory.isLoading);
  const [refreshing, setRefreshing] = useState(false);
  const [showEmptyTrashModal, setShowEmptyTrashModal] = useState(false);
  const [purgingTrash, setPurgingTrash] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deletingItem, setDeletingItem] = useState(false);

  // Virtualized flat table container measurements
  const flatContainerRef = useRef(null);
  const [flatScrollTop, setFlatScrollTop] = useState(0);
  const [flatViewportHeight, setFlatViewportHeight] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const startLoading = () => setIsLoading(true);
    const stopLoading = () => setIsLoading(false);

    app.inventory.on('inventory_loaded', refresh);
    app.inventory.on('inventory_updated', refresh);
    app.inventory.on('inventory_loading_start', startLoading);
    app.inventory.on('inventory_loading_end', stopLoading);
    if (typeof localCache?.on === 'function') {
      localCache.on('cache_updated', refresh);
      localCache.on('cache_cleared', refresh);
    }

    return () => {
      app.inventory.off('inventory_loaded', refresh);
      app.inventory.off('inventory_updated', refresh);
      app.inventory.off('inventory_loading_start', startLoading);
      app.inventory.off('inventory_loading_end', stopLoading);
      if (typeof localCache?.off === 'function') {
        localCache.off('cache_updated', refresh);
        localCache.off('cache_cleared', refresh);
      }
    };
  }, []);

  const trashCount = useMemo(() => {
    return app.inventory.getTrashItemCount();
  }, [revision]);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(INVENTORY_VIEW_MODE_KEY, mode);
    } catch {
      // Storage may be disabled
    }
  };

  const handleSelect = (entry) => {
    if (!entry) {
      setSelected(null);
      return;
    }
    const isFolder = Boolean(
      entry.folder ||
      entry.type === 'folder' ||
      entry.isFolder ||
      app.inventory.folders.has(entry.id),
    );
    setSelected({
      ...entry,
      folder: isFolder,
    });
    if (isFolder) {
      void app.inventory.fetchFolderContents(entry.id);
    }
  };

  const rows = useMemo(() => {
    void revision;
    const query = filter.trim().toLocaleLowerCase();
    const folders = Array.from(app.inventory.folders.values()).map((entry) => ({
      ...entry,
      folder: true,
    }));
    const items = Array.from(app.inventory.items.values()).map((entry) => ({
      ...entry,
      folder: false,
    }));
    return [...folders, ...items]
      .filter(
        (entry) =>
          !query ||
          String(entry.name || '')
            .toLocaleLowerCase()
            .includes(query),
      )
      .sort(
        (a, b) =>
          Number(b.folder) - Number(a.folder) || String(a.name).localeCompare(String(b.name)),
      );
  }, [filter, revision]);

  // Measure flat list viewport height for virtualization
  useEffect(() => {
    if (viewMode !== 'flat') return;
    const el = flatContainerRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setFlatViewportHeight(el.clientHeight);
      }
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [viewMode]);

  const handleFlatScroll = (e) => {
    setFlatScrollTop(e.currentTarget.scrollTop);
  };

  const effectiveViewportHeight =
    flatViewportHeight || (flatContainerRef.current?.clientHeight ?? 0) || 800;
  const totalCount = rows.length;
  const totalHeight = totalCount * FLAT_ROW_HEIGHT;
  const visibleCount = Math.ceil(effectiveViewportHeight / FLAT_ROW_HEIGHT);
  const rawStartIndex = Math.floor(flatScrollTop / FLAT_ROW_HEIGHT);
  const startIndex = Math.max(
    0,
    Math.min(rawStartIndex - FLAT_OVERSCAN, Math.max(0, totalCount - visibleCount)),
  );
  const endIndex = Math.min(
    totalCount,
    Math.max(
      startIndex + visibleCount + FLAT_OVERSCAN * 2,
      rawStartIndex + visibleCount + FLAT_OVERSCAN,
    ),
  );
  const visibleRows = useMemo(() => rows.slice(startIndex, endIndex), [rows, startIndex, endIndex]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setIsLoading(true);
    try {
      await app.inventory.load();
    } finally {
      setRefreshing(false);
      setIsLoading(false);
    }
  };

  const handleConfirmEmptyTrash = async () => {
    setPurgingTrash(true);
    try {
      await app.inventory.purgeTrash();
    } finally {
      setPurgingTrash(false);
      setShowEmptyTrashModal(false);
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete) return;
    setDeletingItem(true);
    const target = itemToDelete;
    try {
      if (target.folder) {
        await app.inventory.deleteFolder(target.id);
      } else {
        await app.inventory.deleteItem(target.id);
      }
      if (selected?.id === target.id) {
        setSelected(null);
      }
    } finally {
      setDeletingItem(false);
      setItemToDelete(null);
    }
  };

  const showSkeletons = (isLoading || refreshing) && rows.length === 0;

  return (
    <section className="live-screen">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label
          className="filter-field"
          style={{ borderColor: V.outv, background: V.surf, flex: 1, margin: 0 }}
        >
          <Icon name="search" size={16} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter Second Life inventory"
            aria-label="Filter inventory"
          />
        </label>
        <div
          role="group"
          aria-label="View mode"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px',
            background: V.surf,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            gap: '2px',
            height: '40px',
            boxSizing: 'border-box',
            flex: 'none',
          }}
        >
          <TouchTarget
            type="button"
            minSize={24}
            aria-label="Tree View"
            aria-pressed={viewMode === 'tree'}
            onClick={() => handleViewModeChange('tree')}
            title="Tree View"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              height: '34px',
              padding: '0 10px',
              border: 0,
              borderRadius: V.rs,
              background: viewMode === 'tree' ? V.pri : 'transparent',
              color: viewMode === 'tree' ? V.onpri || '#ffffff' : V.ink2 || '#94a3b8',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Icon name="folder-tree" size={15} />
            <span>Tree View</span>
          </TouchTarget>
          <TouchTarget
            type="button"
            minSize={24}
            aria-label="Flat Table"
            aria-pressed={viewMode === 'flat'}
            onClick={() => handleViewModeChange('flat')}
            title="Flat Table"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              height: '34px',
              padding: '0 10px',
              border: 0,
              borderRadius: V.rs,
              background: viewMode === 'flat' ? V.pri : 'transparent',
              color: viewMode === 'flat' ? V.onpri || '#ffffff' : V.ink2 || '#94a3b8',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Icon name="list" size={15} />
            <span>Flat Table</span>
          </TouchTarget>
        </div>
        <button
          type="button"
          onClick={() => setShowEmptyTrashModal(true)}
          disabled={trashCount === 0 || purgingTrash}
          title={trashCount === 0 ? 'Trash is empty' : `Empty Trash (${trashCount} items)`}
          aria-label={`Empty Trash (${trashCount} items)`}
          style={{
            height: '40px',
            padding: '0 12px',
            background: V.surf,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            color: trashCount === 0 ? V.ink2 || '#94a3b8' : V.err || '#ef4444',
            fontSize: '11px',
            fontWeight: 700,
            cursor: trashCount === 0 || purgingTrash ? 'not-allowed' : 'pointer',
            opacity: trashCount === 0 ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: 'none',
          }}
        >
          <Icon name="trash-2" size={14} />
          <span>EMPTY TRASH</span>
          <span
            className="trash-count-badge"
            style={{
              background: trashCount > 0 ? V.err || '#ef4444' : V.bdg || '#334155',
              color: '#ffffff',
              borderRadius: '9999px',
              padding: '1px 6px',
              fontSize: '10px',
              fontWeight: 700,
              minWidth: '16px',
              textAlign: 'center',
            }}
          >
            {trashCount}
          </span>
        </button>
        <SyncActionButton
          type="button"
          onClick={handleRefresh}
          loading={refreshing || isLoading}
          disabled={!app.auth.isLoggedIn()}
          iconName="rotate-cw"
          size={14}
          idleText="REFRESH"
          loadingText="FETCHING…"
          title="Reload Second Life inventory"
          style={{
            height: '40px',
            padding: '0 12px',
            background: V.surf,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            color: V.pri,
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            flex: 'none',
          }}
        />
      </div>
      {showSkeletons ? (
        <div className="live-list">
          <SkeletonLoader type="row" count={6} />
        </div>
      ) : viewMode === 'tree' ? (
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <InventoryTree
            filter={filter}
            selectedId={selected?.id}
            onSelect={handleSelect}
            className="inventory-tree-mode"
          />
        </div>
      ) : (
        <div
          className="live-list"
          ref={flatContainerRef}
          onScroll={handleFlatScroll}
          style={{ overflowY: 'auto', position: 'relative' }}
        >
          {rows.length ? (
            <div
              style={{
                height: `${totalHeight}px`,
                position: 'relative',
                width: '100%',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${startIndex * FLAT_ROW_HEIGHT}px)`,
                }}
              >
                {visibleRows.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      width: '100%',
                      height: `${FLAT_ROW_HEIGHT}px`,
                      boxSizing: 'border-box',
                    }}
                  >
                    <button
                      className="inventory-row inventory-button"
                      style={{
                        borderColor: V.outv,
                        height: '100%',
                        flex: 1,
                        backgroundColor:
                          selected?.id === entry.id
                            ? V.priC || 'rgba(52, 118, 255, 0.15)'
                            : 'transparent',
                      }}
                      onClick={() => handleSelect(entry)}
                    >
                      <Icon
                        name={entry.folder ? 'folder' : 'file'}
                        size={17}
                        style={{ color: entry.folder ? V.pri : V.sec2 }}
                      />
                      <span style={{ font: `400 13px/1.3 ${t.font}` }}>
                        {entry.name || 'Unnamed item'}
                      </span>
                    </button>
                    {!app.inventory.isSystemFolder(entry) && (
                      <button
                        type="button"
                        aria-label={`Delete ${entry.name || 'item'}`}
                        title={`Delete ${entry.name || 'item'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setItemToDelete(entry);
                        }}
                        style={{
                          background: 'none',
                          border: `1px solid ${V.outv}`,
                          borderRadius: V.rs,
                          color: V.err || '#ef4444',
                          cursor: 'pointer',
                          padding: '0 10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '34px',
                          flex: 'none',
                        }}
                      >
                        <Icon name="trash-2" size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="honest-empty">
              <Icon name="folder-open" size={28} />
              <p>
                {app.auth.isLoggedIn()
                  ? 'No inventory data has been loaded by the grid.'
                  : 'Connect to a grid to load inventory.'}
              </p>
            </div>
          )}
        </div>
      )}
      {selected ? (
        <aside className="record-detail" style={{ background: V.surf, borderColor: V.outv }}>
          <TouchTarget
            minSize={24}
            className="detail-close"
            onClick={() => setSelected(null)}
            aria-label="Close inventory details"
          >
            ×
          </TouchTarget>
          <AssetContainer asset={selected} title={selected.name || 'Unnamed item'}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}
            >
              <Icon name={selected.folder ? 'folder' : 'file'} size={22} />
              <h2 style={{ margin: 0, fontSize: '16px' }}>{selected.name || 'Unnamed item'}</h2>
            </div>
            <dl style={{ margin: 0 }}>
              <dt style={{ fontWeight: 700, fontSize: '11px', opacity: 0.7 }}>UUID</dt>
              <dd style={{ margin: '0 0 6px 0', fontSize: '12px' }}>{selected.id}</dd>
              <dt style={{ fontWeight: 700, fontSize: '11px', opacity: 0.7 }}>Type</dt>
              <dd style={{ margin: '0 0 6px 0', fontSize: '12px' }}>
                {selected.folder ? 'Folder' : (selected.assetType ?? 'Unknown')}
              </dd>
              {selected.description ? (
                <>
                  <dt style={{ fontWeight: 700, fontSize: '11px', opacity: 0.7 }}>Description</dt>
                  <dd style={{ margin: '0', fontSize: '12px' }}>{selected.description}</dd>
                </>
              ) : null}
            </dl>
            {!app.inventory.isSystemFolder(selected) && (
              <button
                type="button"
                onClick={() => setItemToDelete(selected)}
                style={{
                  marginTop: '16px',
                  width: '100%',
                  padding: '8px 12px',
                  background: V.err || '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: V.rs,
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Icon name="trash-2" size={14} />
                <span>Delete {selected.folder ? 'Folder' : 'Item'}</span>
              </button>
            )}
          </AssetContainer>
        </aside>
      ) : null}

      {/* Empty Trash Confirmation Modal */}
      {showEmptyTrashModal && (
        <FocusTrap
          active={showEmptyTrashModal}
          onEscape={() => !purgingTrash && setShowEmptyTrashModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="empty-trash-modal-title"
            style={{
              backgroundColor: V.surf || '#1e293b',
              border: `1px solid ${V.outv || '#334155'}`,
              borderRadius: '8px',
              padding: '1.25rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              color: V.pri || '#f8fafc',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3
                id="empty-trash-modal-title"
                style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}
              >
                Empty Trash
              </h3>
              <TouchTarget
                minSize={24}
                onClick={() => !purgingTrash && setShowEmptyTrashModal(false)}
                aria-label="Close dialog"
                style={{
                  background: 'none',
                  border: 'none',
                  color: V.sec2 || '#94a3b8',
                  cursor: purgingTrash ? 'not-allowed' : 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                }}
              >
                ×
              </TouchTarget>
            </div>

            <p style={{ fontSize: '0.875rem', color: V.pri || '#cbd5e1', marginBottom: '0.75rem' }}>
              Are you sure you want to empty the Trash folder containing{' '}
              <strong>
                {trashCount} item{trashCount === 1 ? '' : 's'}
              </strong>
              ?
            </p>

            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${V.err || '#ef4444'}`,
                borderRadius: '6px',
                padding: '0.75rem',
                fontSize: '0.8125rem',
                color: V.err || '#ef4444',
                marginBottom: '1.25rem',
              }}
            >
              Warning: All contents in the Trash folder will be permanently destroyed. This action
              is irreversible.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={purgingTrash}
                onClick={() => setShowEmptyTrashModal(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.surf || '#334155',
                  border: `1px solid ${V.outv || '#475569'}`,
                  borderRadius: V.rs,
                  color: V.pri || '#f8fafc',
                  fontSize: '0.875rem',
                  cursor: purgingTrash ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purgingTrash}
                onClick={handleConfirmEmptyTrash}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.err || '#ef4444',
                  border: 'none',
                  borderRadius: V.rs,
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: purgingTrash ? 'not-allowed' : 'pointer',
                }}
              >
                {purgingTrash ? 'Emptying…' : 'Empty Trash'}
              </button>
            </div>
          </div>
        </FocusTrap>
      )}

      {/* Direct Item Deletion Confirmation Modal */}
      {itemToDelete && (
        <FocusTrap
          active={!!itemToDelete}
          onEscape={() => !deletingItem && setItemToDelete(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-item-modal-title"
            style={{
              backgroundColor: V.surf || '#1e293b',
              border: `1px solid ${V.outv || '#334155'}`,
              borderRadius: '8px',
              padding: '1.25rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              color: V.pri || '#f8fafc',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3
                id="delete-item-modal-title"
                style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}
              >
                Confirm Deletion
              </h3>
              <TouchTarget
                minSize={24}
                onClick={() => !deletingItem && setItemToDelete(null)}
                aria-label="Close dialog"
                style={{
                  background: 'none',
                  border: 'none',
                  color: V.sec2 || '#94a3b8',
                  cursor: deletingItem ? 'not-allowed' : 'pointer',
                  fontSize: '18px',
                  lineHeight: 1,
                }}
              >
                ×
              </TouchTarget>
            </div>

            <p style={{ fontSize: '0.875rem', color: V.pri || '#cbd5e1', marginBottom: '0.75rem' }}>
              Are you sure you want to permanently delete{' '}
              <strong>{itemToDelete.name || 'this item'}</strong>?
            </p>

            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${V.err || '#ef4444'}`,
                borderRadius: '6px',
                padding: '0.75rem',
                fontSize: '0.8125rem',
                color: V.err || '#ef4444',
                marginBottom: '1.25rem',
              }}
            >
              Warning: Permanent asset deletion is irreversible. This item will be permanently
              destroyed.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={deletingItem}
                onClick={() => setItemToDelete(null)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.surf || '#334155',
                  border: `1px solid ${V.outv || '#475569'}`,
                  borderRadius: V.rs,
                  color: V.pri || '#f8fafc',
                  fontSize: '0.875rem',
                  cursor: deletingItem ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingItem}
                onClick={handleConfirmDeleteItem}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.err || '#ef4444',
                  border: 'none',
                  borderRadius: V.rs,
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: deletingItem ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingItem ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </FocusTrap>
      )}
    </section>
  );
}
