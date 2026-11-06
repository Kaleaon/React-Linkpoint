import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app.ts';
import Icon from '../components/Icon.jsx';
import TouchTarget from '../components/TouchTarget.tsx';
import SyncActionButton from '../components/SyncActionButton.tsx';
import SkeletonLoader from '../components/SkeletonLoader.jsx';
import AssetContainer from '../components/AssetContainer.jsx';

/** Inventory rows come directly from InventoryManager capability responses. */
export default function Inventory() {
  const { V, t } = useTheme();
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(() => app.inventory.isLoading);

  // Notecard inspector tab & dirty state
  const [activeTab, setActiveTab] = useState('content'); // 'content' | 'details'
  const [isDirty, setIsDirty] = useState(false);
  const [showDirtyModal, setShowDirtyModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const handleDirtyChange = useCallback((dirty) => {
    setIsDirty(dirty);
  }, []);

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

  const doSelect = (entry) => {
    setSelected(entry);
    setActiveTab('content');
    setIsDirty(false);
    if (entry?.folder) void app.inventory.fetchFolderContents(entry.id);
  };

  const handleSelect = (entry) => {
    if (isDirty && selected && selected.id !== entry.id) {
      setPendingAction(() => () => doSelect(entry));
      setShowDirtyModal(true);
      return;
    }
    doSelect(entry);
  };

  const handleClose = () => {
    if (isDirty && selected) {
      setPendingAction(() => () => {
        setSelected(null);
        setIsDirty(false);
      });
      setShowDirtyModal(true);
      return;
    }
    setSelected(null);
    setIsDirty(false);
  };

  const isNotecard = Boolean(selected && !selected.folder && Number(selected.assetType) === 7);
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
      <div className="live-list">
        {showSkeletons ? (
          <SkeletonLoader type="row" count={6} />
        ) : rows.length ? (
          rows.map((entry) => (
            <button
              className="inventory-row inventory-button"
              key={entry.id}
              style={{ borderColor: V.outv }}
              onClick={() => handleSelect(entry)}
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

      {showDirtyModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="dirty-dialog-title"
          aria-describedby="dirty-dialog-desc"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: V.surf,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs || '6px',
              padding: 20,
              maxWidth: 380,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}
          >
            <h3 id="dirty-dialog-title" style={{ margin: 0, fontSize: '15px', color: V.ink }}>
              Unsaved Changes
            </h3>
            <p
              id="dirty-dialog-desc"
              style={{ margin: 0, fontSize: '13px', color: V.ink2 || '#aaa' }}
            >
              You have unsaved changes in &ldquo;{selected?.name || 'this notecard'}&rdquo;. Would
              you like to save or discard your changes before continuing?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <TouchTarget
                minSize={24}
                onClick={() => {
                  setShowDirtyModal(false);
                  setPendingAction(null);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'transparent',
                  color: V.ink2 || '#aaa',
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs || '4px',
                  cursor: 'pointer',
                }}
              >
                CANCEL
              </TouchTarget>
              <TouchTarget
                minSize={24}
                onClick={() => {
                  setShowDirtyModal(false);
                  setIsDirty(false);
                  if (pendingAction) {
                    const action = pendingAction;
                    setPendingAction(null);
                    action();
                  }
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: 'transparent',
                  color: V.err || '#ff4d4d',
                  border: `1px solid ${V.err || '#ff4d4d'}`,
                  borderRadius: V.rs || '4px',
                  cursor: 'pointer',
                }}
              >
                DISCARD
              </TouchTarget>
              <TouchTarget
                minSize={24}
                onClick={async () => {
                  if (app?.assets && selected) {
                    const currentText = app.assets.getCached(selected.id) || selected.data || '';
                    try {
                      await app.assets.saveNotecard({
                        itemId: selected.id,
                        name: selected.name,
                        text: currentText,
                      });
                    } catch (err) {
                      console.warn('Failed to save dirty notecard on switch:', err);
                    }
                  }
                  setShowDirtyModal(false);
                  setIsDirty(false);
                  if (pendingAction) {
                    const action = pendingAction;
                    setPendingAction(null);
                    action();
                  }
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: V.pri || '#6CFF9A',
                  color: '#000',
                  border: 'none',
                  borderRadius: V.rs || '4px',
                  cursor: 'pointer',
                }}
              >
                SAVE &amp; CONTINUE
              </TouchTarget>
            </div>
          </div>
        </div>
      )}

      {selected ? (
        <aside className="record-detail" style={{ background: V.surf, borderColor: V.outv }}>
          <TouchTarget
            minSize={24}
            className="detail-close"
            onClick={handleClose}
            aria-label="Close inventory details"
          >
            ×
          </TouchTarget>

          {isNotecard ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                role="tablist"
                aria-label="Notecard inspector tabs"
                style={{
                  display: 'flex',
                  gap: '6px',
                  borderBottom: `1px solid ${V.outv}`,
                  paddingBottom: '8px',
                }}
              >
                <TouchTarget
                  role="tab"
                  aria-selected={activeTab === 'content'}
                  aria-controls="inspector-content-tab"
                  minSize={24}
                  onClick={() => setActiveTab('content')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: V.rs || '4px',
                    border: `1px solid ${activeTab === 'content' ? V.pri || '#6CFF9A' : V.outv}`,
                    background:
                      activeTab === 'content' ? V.surf2 || 'rgba(255,255,255,0.08)' : 'transparent',
                    color: activeTab === 'content' ? V.pri || '#6CFF9A' : V.ink2 || '#aaa',
                    cursor: 'pointer',
                  }}
                >
                  Content
                </TouchTarget>
                <TouchTarget
                  role="tab"
                  aria-selected={activeTab === 'details'}
                  aria-controls="inspector-details-tab"
                  minSize={24}
                  onClick={() => setActiveTab('details')}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: V.rs || '4px',
                    border: `1px solid ${activeTab === 'details' ? V.pri || '#6CFF9A' : V.outv}`,
                    background:
                      activeTab === 'details' ? V.surf2 || 'rgba(255,255,255,0.08)' : 'transparent',
                    color: activeTab === 'details' ? V.pri || '#6CFF9A' : V.ink2 || '#aaa',
                    cursor: 'pointer',
                  }}
                >
                  Details
                </TouchTarget>
              </div>

              {activeTab === 'content' ? (
                <div id="inspector-content-tab" role="tabpanel">
                  <AssetContainer
                    asset={selected}
                    title={selected.name || 'Unnamed notecard'}
                    editable={true}
                    onDirtyChange={handleDirtyChange}
                  />
                </div>
              ) : (
                <div id="inspector-details-tab" role="tabpanel">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '8px',
                    }}
                  >
                    <Icon name="file-text" size={22} />
                    <h2 style={{ margin: 0, fontSize: '16px' }}>
                      {selected.name || 'Unnamed item'}
                    </h2>
                  </div>
                  <dl style={{ margin: 0 }}>
                    <dt style={{ fontWeight: 700, fontSize: '11px', opacity: 0.7 }}>UUID</dt>
                    <dd style={{ margin: '0 0 6px 0', fontSize: '12px' }}>{selected.id}</dd>
                    <dt style={{ fontWeight: 700, fontSize: '11px', opacity: 0.7 }}>Type</dt>
                    <dd style={{ margin: '0 0 6px 0', fontSize: '12px' }}>Notecard (7)</dd>
                    {selected.description ? (
                      <>
                        <dt style={{ fontWeight: 700, fontSize: '11px', opacity: 0.7 }}>
                          Description
                        </dt>
                        <dd style={{ margin: '0', fontSize: '12px' }}>{selected.description}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              )}
            </div>
          ) : (
            <AssetContainer asset={selected} title={selected.name || 'Unnamed item'}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '8px',
                }}
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
          )}
        </aside>
      ) : null}
    </section>
  );
}
