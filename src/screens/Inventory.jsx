import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { app } from '../linkpoint/app.ts';
import Icon from '../components/Icon.jsx';
import TouchTarget from '../components/TouchTarget.tsx';
import SyncActionButton from '../components/SyncActionButton.tsx';
import SkeletonLoader from '../components/SkeletonLoader.jsx';
import AssetContainer from '../components/AssetContainer.jsx';
import { InventoryTree } from '../components/InventoryTree.tsx';
import CreateFolderModal from '../components/CreateFolderModal.tsx';

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
  const { actions } = useApp();
  const [viewMode, setViewMode] = useState(getStoredViewMode);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(() => app.inventory.isLoading);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createInitialParentId, setCreateInitialParentId] = useState('');
  const [expandRequest, setExpandRequest] = useState(null);
  const [folderErrorAlert, setFolderErrorAlert] = useState('');

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

    return () => {
      app.inventory.off('inventory_loaded', refresh);
      app.inventory.off('inventory_updated', refresh);
      app.inventory.off('inventory_loading_start', startLoading);
      app.inventory.off('inventory_loading_end', stopLoading);
    };
  }, []);

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

  const resolveInitialDestinationId = useCallback(
    (explicitParentId) => {
      if (explicitParentId && app.inventory.canCreateFolderIn(explicitParentId)) {
        return explicitParentId;
      }
      if (selected?.folder && app.inventory.canCreateFolderIn(selected.id)) {
        return selected.id;
      }
      if (selected && !selected.folder && selected.parent) {
        if (app.inventory.canCreateFolderIn(selected.parent)) {
          return selected.parent;
        }
      }
      if (
        app.inventory.rootFolder?.id &&
        app.inventory.canCreateFolderIn(app.inventory.rootFolder.id)
      ) {
        return app.inventory.rootFolder.id;
      }
      for (const folder of app.inventory.folders.values()) {
        if (app.inventory.canCreateFolderIn(folder)) {
          return folder.id;
        }
      }
      return '';
    },
    [selected],
  );

  const handleOpenCreateFolder = useCallback(
    (explicitParentId) => {
      setFolderErrorAlert('');
      setCreateInitialParentId(resolveInitialDestinationId(explicitParentId));
      setCreateModalOpen(true);
    },
    [resolveInitialDestinationId],
  );

  const handleCreateFolderSubmit = async ({ parentId, name }) => {
    const previousSelection = selected;
    setCreateModalOpen(false);
    setFolderErrorAlert('');
    setExpandRequest((prev) => ({ folderId: parentId, seq: (prev?.seq ?? 0) + 1 }));

    try {
      const created = await app.inventory.createInventoryFolder({
        parentId,
        name,
        onOptimisticCreate: (optFolder) => {
          setSelected({ ...optFolder, folder: true });
        },
      });
      if (created) {
        setSelected({ ...created, folder: true });
      }
    } catch (err) {
      setSelected(previousSelection);
      const reason = err instanceof Error ? err.message : 'Simulator network error';
      const alertMsg = `Failed to create folder: ${reason}`;
      setFolderErrorAlert(alertMsg);
      actions?.notify?.(alertMsg);
    }
  };

  const hasWritableFolder = useMemo(() => {
    void revision;
    for (const folder of app.inventory.folders.values()) {
      if (app.inventory.canCreateFolderIn(folder)) {
        return true;
      }
    }
    return false;
  }, [revision]);

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
        <TouchTarget
          type="button"
          minSize={44}
          enhanced
          aria-label="New Folder"
          title="Create new inventory folder"
          disabled={!hasWritableFolder}
          onClick={() => handleOpenCreateFolder()}
          style={{
            height: '44px',
            padding: '0 12px',
            background: V.surf,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            color: V.pri,
            fontSize: '11px',
            fontWeight: 700,
            gap: 6,
            flex: 'none',
          }}
        >
          <Icon name="folder-plus" size={15} />
          <span>New Folder</span>
        </TouchTarget>
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
      {folderErrorAlert ? (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '8px 12px',
            marginTop: 8,
            borderRadius: V.rs,
            background: 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${V.err || '#ef4444'}`,
            color: V.ink || '#fecaca',
            fontSize: '12px',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="alert-circle" size={16} style={{ color: V.err || '#ef4444' }} />
            <span>{folderErrorAlert}</span>
          </span>
          <TouchTarget
            type="button"
            minSize={44}
            enhanced
            aria-label="Dismiss error alert"
            onClick={() => setFolderErrorAlert('')}
            style={{
              background: 'none',
              border: 'none',
              color: V.ink || '#fecaca',
              borderRadius: V.rs,
            }}
          >
            <Icon name="x" size={15} />
          </TouchTarget>
        </div>
      ) : null}
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
            expandRequest={expandRequest}
            onRequestCreateFolder={handleOpenCreateFolder}
            onItemActivate={(entry) => {
              if (Number(entry.assetType) === 7) {
                actions.openNotecard?.(entry);
              }
            }}
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
                  <button
                    className="inventory-row inventory-button"
                    key={entry.id}
                    style={{
                      borderColor: V.outv,
                      height: `${FLAT_ROW_HEIGHT}px`,
                      boxSizing: 'border-box',
                      backgroundColor:
                        selected?.id === entry.id
                          ? V.priC || 'rgba(52, 118, 255, 0.15)'
                          : 'transparent',
                    }}
                    onClick={() => handleSelect(entry)}
                    onDoubleClick={() => {
                      if (Number(entry.assetType) === 7) {
                        actions.openNotecard?.(entry);
                      }
                    }}
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
            {Number(selected.assetType) === 7 && (
              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="sync-action-btn"
                  onClick={() => actions.openNotecard?.(selected)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: V.pri,
                    color: V.onpri || V.bg,
                    border: 'none',
                    borderRadius: V.rs,
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <Icon name="file-text" size={14} />
                  <span>Open Notecard</span>
                </button>
              </div>
            )}
          </AssetContainer>
        </aside>
      ) : null}
      {createModalOpen ? (
        <CreateFolderModal
          isOpen={createModalOpen}
          initialParentId={createInitialParentId}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={handleCreateFolderSubmit}
        />
      ) : null}
    </section>
  );
}
