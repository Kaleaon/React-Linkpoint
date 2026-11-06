import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app.ts';
import Icon from '../components/Icon.jsx';
import TouchTarget from '../components/TouchTarget.tsx';
import SyncActionButton from '../components/SyncActionButton.tsx';
import SkeletonLoader from '../components/SkeletonLoader.jsx';
import AssetContainer from '../components/AssetContainer.jsx';
import InventoryTree from '../components/InventoryTree.tsx';
import { liveRegionAnnouncer } from '../services/LiveRegionAnnouncer.ts';

const INVENTORY_VIEW_MODE_KEY = 'linkpoint_inventory_view_mode';

/** Inventory rows come directly from InventoryManager capability responses. */
export default function Inventory() {
  const { V, t } = useTheme();
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(() => app.inventory.isLoading);
  const [announcement, setAnnouncement] = useState('');
  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem(INVENTORY_VIEW_MODE_KEY);
      if (saved === 'flat' || saved === 'tree') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'tree';
  });

  const treeBtnRef = useRef(null);
  const flatBtnRef = useRef(null);

  const handleViewModeChange = (mode) => {
    if (mode !== 'tree' && mode !== 'flat') return;
    setViewMode(mode);
    try {
      localStorage.setItem(INVENTORY_VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
    const message = mode === 'tree' ? 'Tree view mode active' : 'Flat view mode active';
    setAnnouncement(message);
    try {
      liveRegionAnnouncer.announce(message, 'polite', 'status');
    } catch {
      // ignore
    }
  };

  const handleSwitcherKeyDown = (event, currentMode) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextMode = currentMode === 'tree' ? 'flat' : 'tree';
      handleViewModeChange(nextMode);
      if (nextMode === 'flat') {
        flatBtnRef.current?.focus();
      } else {
        treeBtnRef.current?.focus();
      }
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextMode = currentMode === 'flat' ? 'tree' : 'flat';
      handleViewModeChange(nextMode);
      if (nextMode === 'tree') {
        treeBtnRef.current?.focus();
      } else {
        flatBtnRef.current?.focus();
      }
    }
  };

  const handleSelectItem = (entry) => {
    if (!entry) {
      setSelected(null);
      return;
    }
    const isFolder = entry.folder !== undefined ? Boolean(entry.folder) : entry.type === 'folder';
    const normalized = { ...entry, folder: isFolder };
    setSelected(normalized);
    if (isFolder) {
      void app.inventory.fetchFolderContents(entry.id);
    }
  };

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

  const rows = useMemo(() => {
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

  const [refreshing, setRefreshing] = useState(false);

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

  const showSkeletons = (isLoading || refreshing) && rows.length === 0;

  return (
    <section className="live-screen">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
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
          aria-label="Inventory view mode"
          className="inventory-view-switcher"
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
          <button
            ref={treeBtnRef}
            type="button"
            role="button"
            aria-label="Tree view"
            aria-pressed={viewMode === 'tree'}
            tabIndex={viewMode === 'tree' ? 0 : -1}
            onClick={() => handleViewModeChange('tree')}
            onKeyDown={(e) => handleSwitcherKeyDown(e, 'tree')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: '100%',
              padding: '0 10px',
              border: 0,
              borderRadius: V.rs ? `calc(${V.rs} - 2px)` : '4px',
              background: viewMode === 'tree' ? V.pri : 'transparent',
              color: viewMode === 'tree' ? V.onpri : V.ink2 || V.ink,
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
            title="Hierarchical folder tree view"
          >
            <Icon name="folder-tree" size={14} />
            <span>Tree</span>
          </button>
          <button
            ref={flatBtnRef}
            type="button"
            role="button"
            aria-label="Flat view"
            aria-pressed={viewMode === 'flat'}
            tabIndex={viewMode === 'flat' ? 0 : -1}
            onClick={() => handleViewModeChange('flat')}
            onKeyDown={(e) => handleSwitcherKeyDown(e, 'flat')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: '100%',
              padding: '0 10px',
              border: 0,
              borderRadius: V.rs ? `calc(${V.rs} - 2px)` : '4px',
              background: viewMode === 'flat' ? V.pri : 'transparent',
              color: viewMode === 'flat' ? V.onpri : V.ink2 || V.ink,
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
            title="Flat search list view"
          >
            <Icon name="list" size={14} />
            <span>Flat</span>
          </button>
        </div>
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
      <div
        className="live-list"
        style={
          viewMode === 'tree' && !showSkeletons ? { padding: 0, overflow: 'hidden' } : undefined
        }
      >
        {showSkeletons ? (
          <SkeletonLoader type="row" count={6} />
        ) : viewMode === 'tree' ? (
          <InventoryTree filter={filter} selectedId={selected?.id} onSelect={handleSelectItem} />
        ) : rows.length ? (
          rows.map((entry) => (
            <button
              className="inventory-row inventory-button"
              key={entry.id}
              style={{
                borderColor: V.outv,
                backgroundColor:
                  selected?.id === entry.id ? V.priC || 'rgba(52, 118, 255, 0.15)' : undefined,
              }}
              onClick={() => handleSelectItem(entry)}
            >
              <Icon
                name={entry.folder ? 'folder' : 'file'}
                size={17}
                style={{ color: entry.folder ? V.pri : V.sec2 }}
              />
              <span style={{ font: `400 13px/1.3 ${t.font}` }}>{entry.name || 'Unnamed item'}</span>
            </button>
          ))
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
          </AssetContainer>
        </aside>
      ) : null}
    </section>
  );
}
