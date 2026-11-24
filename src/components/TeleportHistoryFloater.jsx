import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import { buildSecondLifeSlurl } from '../linkpoint/indexeddb-store';
import Icon from './Icon.jsx';
import FocusRing from './FocusRing.tsx';
import FocusTrap from './FocusTrap.jsx';
import { deskKind, deskGeometry, floaterStyle } from '../theme/deskStyle.js';

const FLOATER_ID = 'Teleport History';

function formatCoordinates(position) {
  if (
    !Array.isArray(position) ||
    position.length < 3 ||
    !Number.isFinite(Number(position[0])) ||
    !Number.isFinite(Number(position[1])) ||
    !Number.isFinite(Number(position[2]))
  ) {
    return '—';
  }
  return `${Math.round(Number(position[0]))}, ${Math.round(Number(position[1]))}, ${Math.round(Number(position[2]))}`;
}

function formatVisitTimestamp(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '—';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function defaultLandmarkName(entry) {
  if (!entry) return '';
  const base = entry.parcelName ? `${entry.parcelName}, ${entry.regionName}` : entry.regionName;
  const coords = formatCoordinates(entry.position);
  return coords !== '—' ? `${base} (${coords})` : base;
}

/**
 * Dedicated Teleport History Floater modeled after Firestorm Viewer's
 * `floater_fs_teleporthistory.xml` & `llteleporthistory.cpp`.
 *
 * Supports both standalone desktop window mode (`embedded = false`) and
 * screen-embedded mode (`embedded = true`) while adhering to WCAG 2.2 AA
 * keyboard navigation, focus management, and strict cross-avatar isolation.
 *
 * @param {{
 *   embedded?: boolean,
 *   onClose?: (() => void) | null,
 *   onOpenLayoutDialog?: ((floaterId: string, section?: string, triggerEl?: HTMLElement | null) => void) | null,
 * }} props
 */
export default function TeleportHistoryFloater({
  embedded = false,
  onClose: customClose = null,
  onOpenLayoutDialog = null,
}) {
  const { state, actions } = useApp();
  const { V, t, ink, isFloat } = useTheme();

  const kind = deskKind(t);
  const G = deskGeometry(kind);
  const DESKTOP_TOP = G.top;
  const DESKTOP_RAIL = G.rail;
  const btnRadius = kind === 'default' ? V.rs : 0;
  const btnSize = kind === 'metro' ? 24 : kind === 'sweep' ? 18 : 17;
  const btnFont = kind === 'metro' ? '700 13px/1 ' + t.dfont : '700 11px/1 ' + t.dfont;

  const r = actions.flR ? actions.flR(FLOATER_ID) : { x: 350, y: 110, w: 520, h: 440 };
  const isMaximized = Boolean(state.flMax?.[FLOATER_ID]);
  const act = state.screen === FLOATER_ID;
  const fs = floaterStyle(kind, { V, t, act, ink });

  const totalW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1440;
  const availW = Math.max(216, totalW - G.rail);

  const [entries, setEntries] = useState(() => [...(app.teleportHistory?.entries || [])]);
  const [activeAgentId, setActiveAgentId] = useState(
    () => app.teleportHistory?.getActiveAgentId?.() || '',
  );
  const [filterText, setFilterText] = useState('');
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);
  const [focusedTimestamp, setFocusedTimestamp] = useState(null);
  const [statusNotice, setStatusNotice] = useState(null); // { type: 'info' | 'error', text: string }
  const [landmarkModalEntry, setLandmarkModalEntry] = useState(null);
  const [landmarkName, setLandmarkName] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const rowRefs = useRef(new Map());

  const loadHistory = useCallback(async () => {
    const currentAgent = app.teleportHistory?.getActiveAgentId?.() || '';
    setActiveAgentId(currentAgent);
    if (!currentAgent || !app.teleportHistory?.getHistory) {
      setEntries([]);
      return;
    }
    try {
      const records = await app.teleportHistory.getHistory();
      setEntries(records);
    } catch (err) {
      console.warn('[TeleportHistoryFloater] Failed to load teleport history:', err);
    }
  }, []);

  useEffect(() => {
    void loadHistory();

    const handleHistoryUpdated = (updatedList) => {
      setActiveAgentId(app.teleportHistory?.getActiveAgentId?.() || '');
      if (Array.isArray(updatedList)) {
        setEntries([...updatedList]);
      } else {
        void loadHistory();
      }
    };

    const handleAuthChange = () => {
      setStatusNotice(null);
      void loadHistory();
    };

    app.teleportHistory?.on?.('history_updated', handleHistoryUpdated);
    app.auth?.on?.('login_success', handleAuthChange);
    app.auth?.on?.('logout', handleAuthChange);

    return () => {
      app.teleportHistory?.off?.('history_updated', handleHistoryUpdated);
      app.auth?.off?.('login_success', handleAuthChange);
      app.auth?.off?.('logout', handleAuthChange);
    };
  }, [loadHistory]);

  // Ensure descending order by visit timestamp and apply real-time region/parcel filter
  const sortedEntries = useMemo(() => {
    if (entries.length <= 1) return entries;
    const copy = [...entries];
    copy.sort((a, b) => b.timestamp - a.timestamp);
    return copy;
  }, [entries]);

  const normalizedFilter = filterText.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    if (!normalizedFilter) return sortedEntries;
    return sortedEntries.filter((entry) => {
      const regionMatch = String(entry.regionName || '')
        .toLowerCase()
        .includes(normalizedFilter);
      const parcelMatch = entry.parcelName
        ? String(entry.parcelName).toLowerCase().includes(normalizedFilter)
        : false;
      return regionMatch || parcelMatch;
    });
  }, [sortedEntries, normalizedFilter]);

  // Keep a valid active selection whenever the filtered list changes
  const activeEntry = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    if (selectedTimestamp !== null) {
      const found = filteredEntries.find((e) => e.timestamp === selectedTimestamp);
      if (found) return found;
    }
    return filteredEntries[0];
  }, [filteredEntries, selectedTimestamp]);

  const handleClose = useCallback(() => {
    if (customClose) {
      customClose();
    } else if (actions.flClose) {
      actions.flClose(FLOATER_ID);
    }
  }, [customClose, actions]);

  const announce = useCallback(
    (type, text) => {
      setStatusNotice({ type, text });
      actions.notify?.(text);
    },
    [actions],
  );

  const handleTeleport = useCallback(
    async (entry) => {
      if (!entry || isBusy) return;
      setSelectedTimestamp(entry.timestamp);
      setIsBusy(true);
      try {
        await app.teleportHistory.teleportToEntry(entry);
        const coords = formatCoordinates(entry.position);
        const targetLabel = coords !== '—' ? `${entry.regionName} (${coords})` : entry.regionName;
        announce('info', `Teleporting to ${targetLabel}…`);
      } catch (err) {
        const msg = err?.message || 'Teleport failed.';
        announce('error', msg);
      } finally {
        setIsBusy(false);
      }
    },
    [announce, isBusy],
  );

  const handleShowOnMap = useCallback(
    (entry) => {
      if (!entry) return;
      setSelectedTimestamp(entry.timestamp);
      app.world?.focusMapLocation?.({
        regionName: entry.regionName,
        gridX: entry.gridX,
        gridY: entry.gridY,
        position: entry.position,
      });
      if (isFloat && actions.flFocus) {
        actions.flFocus('Map');
      } else if (actions.setScreen) {
        actions.setScreen('Map');
      }
      announce('info', `Centered World Map on ${entry.regionName}.`);
    },
    [actions, announce, isFloat],
  );

  const handleCopySlurl = useCallback(
    async (entry) => {
      if (!entry) return;
      setSelectedTimestamp(entry.timestamp);
      const slurl = entry.slurl || buildSecondLifeSlurl(entry.regionName, entry.position);
      if (!slurl) {
        announce('error', 'SLURL unavailable for this entry.');
        return;
      }
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(slurl);
        } else {
          throw new Error('Clipboard API unavailable in this browser context.');
        }
        announce('info', `Copied SLURL: ${slurl}`);
      } catch (err) {
        announce('error', err?.message || 'Could not copy SLURL to clipboard.');
      }
    },
    [announce],
  );

  const openLandmarkDialog = useCallback((entry) => {
    if (!entry) return;
    setSelectedTimestamp(entry.timestamp);
    setLandmarkModalEntry(entry);
    setLandmarkName(defaultLandmarkName(entry));
  }, []);

  const closeLandmarkDialog = useCallback(() => {
    setLandmarkModalEntry(null);
    setLandmarkName('');
  }, []);

  const handleConfirmCreateLandmark = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!landmarkModalEntry || isBusy) return;
      setIsBusy(true);
      try {
        const created = await app.teleportHistory.createLandmark(landmarkModalEntry, landmarkName);
        closeLandmarkDialog();
        announce(
          'info',
          `Landmark created: ${created?.name || landmarkName || landmarkModalEntry.regionName}`,
        );
      } catch (err) {
        announce('error', err?.message || 'Failed to create landmark.');
      } finally {
        setIsBusy(false);
      }
    },
    [announce, closeLandmarkDialog, isBusy, landmarkModalEntry, landmarkName],
  );

  const handleDeleteEntry = useCallback(
    async (entry) => {
      if (!entry || isBusy) return;
      const currentIdx = filteredEntries.findIndex((item) => item.timestamp === entry.timestamp);
      const fallbackNeighbor =
        filteredEntries[currentIdx + 1] || filteredEntries[currentIdx - 1] || null;
      setIsBusy(true);
      try {
        const removed = await app.teleportHistory.deleteEntry(entry.timestamp);
        if (removed) {
          const nextTs = fallbackNeighbor?.timestamp ?? null;
          setSelectedTimestamp(nextTs);
          announce('info', `Removed ${entry.regionName} from teleport history.`);
          if (nextTs !== null) {
            queueMicrotask(() => {
              rowRefs.current.get(nextTs)?.focus?.();
            });
          }
        }
      } catch (err) {
        announce('error', err?.message || 'Failed to delete history entry.');
      } finally {
        setIsBusy(false);
      }
    },
    [announce, filteredEntries, isBusy],
  );

  const handleClearHistory = useCallback(async () => {
    if (!entries.length || isBusy) return;
    setIsBusy(true);
    try {
      await app.teleportHistory.clearHistory();
      setSelectedTimestamp(null);
      announce('info', 'Teleport history cleared for current avatar.');
    } catch (err) {
      announce('error', err?.message || 'Failed to clear teleport history.');
    } finally {
      setIsBusy(false);
    }
  }, [announce, entries.length, isBusy]);

  const handleRowKeyDown = (e, entry, index) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = filteredEntries[Math.min(filteredEntries.length - 1, index + 1)];
      if (next) {
        setSelectedTimestamp(next.timestamp);
        rowRefs.current.get(next.timestamp)?.focus?.();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = filteredEntries[Math.max(0, index - 1)];
      if (prev) {
        setSelectedTimestamp(prev.timestamp);
        rowRefs.current.get(prev.timestamp)?.focus?.();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      const first = filteredEntries[0];
      if (first) {
        setSelectedTimestamp(first.timestamp);
        rowRefs.current.get(first.timestamp)?.focus?.();
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = filteredEntries[filteredEntries.length - 1];
      if (last) {
        setSelectedTimestamp(last.timestamp);
        rowRefs.current.get(last.timestamp)?.focus?.();
      }
    } else if (e.key === 'Enter') {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        void handleTeleport(entry);
      }
    } else if (e.key === 'Delete') {
      if (e.target === e.currentTarget) {
        e.preventDefault();
        void handleDeleteEntry(entry);
      }
    }
  };

  const actionBtnStyle = (primary = false, danger = false, disabled = false) => ({
    height: '28px',
    padding: '0 10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    background: primary ? V.pri : danger ? 'transparent' : V.surf2,
    color: primary ? ink(V.pri, [V.bg, V.onpri, V.ink]) : danger ? V.err || '#ef4444' : V.ink,
    border: primary
      ? `1px solid ${V.pri}`
      : danger
        ? `1px solid ${V.err || '#ef4444'}`
        : `1px solid ${V.outv}`,
    borderRadius: btnRadius,
    font: `600 11px/1 ${t.font}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    whiteSpace: 'nowrap',
  });

  const bodyContent = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: V.bg,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top Filter & Clear History Bar */}
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 10px',
          background: V.surf,
          borderBottom: `1px solid ${V.outv}`,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Icon
            name="search"
            size={13}
            style={{
              position: 'absolute',
              left: '8px',
              color: V.ink2,
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          />
          <FocusRing ringColor={V.pri} borderRadius={btnRadius} style={{ width: '100%' }}>
            <input
              type="search"
              aria-label="Filter teleport history by region or parcel"
              placeholder="Filter by region or parcel…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{
                width: '100%',
                height: '28px',
                padding: filterText ? '0 26px 0 28px' : '0 8px 0 28px',
                background: V.bg,
                color: V.ink,
                border: `1px solid ${V.outv}`,
                borderRadius: btnRadius,
                font: `400 12px/1 ${t.font}`,
                boxSizing: 'border-box',
              }}
            />
          </FocusRing>
          {filterText ? (
            <button
              type="button"
              aria-label="Clear filter"
              title="Clear filter"
              onClick={() => setFilterText('')}
              style={{
                position: 'absolute',
                right: '2px',
                minWidth: '24px',
                minHeight: '24px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color: V.ink2,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              &times;
            </button>
          ) : null}
        </div>

        <span
          aria-live="polite"
          style={{
            flex: 'none',
            font: `500 11px/1 ${t.font}`,
            color: V.ink2,
            whiteSpace: 'nowrap',
          }}
        >
          {normalizedFilter
            ? `${filteredEntries.length} / ${sortedEntries.length}`
            : `${sortedEntries.length}`}
        </span>

        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            onClick={() => void handleClearHistory()}
            disabled={!sortedEntries.length || isBusy}
            style={actionBtnStyle(false, true, !sortedEntries.length || isBusy)}
          >
            <Icon name="trash-2" size={12} />
            <span>Clear History</span>
          </button>
        </FocusRing>
      </div>

      {/* Status / Confirmation Banner */}
      {statusNotice ? (
        <div
          role={statusNotice.type === 'error' ? 'alert' : 'status'}
          aria-live={statusNotice.type === 'error' ? 'assertive' : 'polite'}
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '6px 10px',
            background: statusNotice.type === 'error' ? 'rgba(239, 68, 68, 0.12)' : V.surf2,
            borderBottom: `1px solid ${
              statusNotice.type === 'error' ? V.err || '#ef4444' : V.outv
            }`,
            color: statusNotice.type === 'error' ? V.err || '#ef4444' : V.ink,
            font: `500 11.5px/1.3 ${t.font}`,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
            {statusNotice.text}
          </span>
          <button
            type="button"
            aria-label="Dismiss status message"
            onClick={() => setStatusNotice(null)}
            style={{
              minWidth: '24px',
              minHeight: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
              padding: 0,
            }}
          >
            &times;
          </button>
        </div>
      ) : null}

      {/* Destination Grid / Empty State */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!activeAgentId ? (
          <div
            className="honest-empty"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '24px',
              color: V.ink2,
              textAlign: 'center',
            }}
          >
            <Icon name="history" size={30} />
            <p style={{ margin: 0, font: `400 12.5px/1.4 ${t.font}` }}>
              Connect to a grid to view and record teleport history for your avatar.
            </p>
          </div>
        ) : sortedEntries.length === 0 ? (
          <div
            className="honest-empty"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '24px',
              color: V.ink2,
              textAlign: 'center',
            }}
          >
            <Icon name="history" size={30} />
            <p style={{ margin: 0, font: `400 12.5px/1.4 ${t.font}` }}>
              No teleport history recorded for this avatar yet.
            </p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div
            className="honest-empty"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '24px',
              color: V.ink2,
              textAlign: 'center',
            }}
          >
            <Icon name="search" size={28} />
            <p style={{ margin: 0, font: `400 12.5px/1.4 ${t.font}` }}>
              No visited destinations match &ldquo;{filterText.trim()}&rdquo;.
            </p>
          </div>
        ) : (
          <div
            role="grid"
            aria-label="Visited destinations"
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            <div
              role="row"
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                display: 'grid',
                gridTemplateColumns: 'minmax(120px, 1.5fr) minmax(90px, 1fr) 118px auto',
                gap: '8px',
                padding: '5px 10px',
                background: V.surf2,
                borderBottom: `1px solid ${V.outv}`,
                font: `700 9.5px/1 ${t.dfont}`,
                letterSpacing: '.06em',
                color: V.ink2,
                textTransform: 'uppercase',
              }}
            >
              <span role="columnheader">Region / Parcel</span>
              <span role="columnheader">Coordinates</span>
              <span role="columnheader">Visited</span>
              <span role="columnheader" style={{ textAlign: 'right' }}>
                Action
              </span>
            </div>

            {filteredEntries.map((entry, idx) => {
              const isSelected = activeEntry?.timestamp === entry.timestamp;
              const isRowFocused = focusedTimestamp === entry.timestamp;
              const coordLabel = formatCoordinates(entry.position);
              const timeLabel = formatVisitTimestamp(entry.timestamp);
              const parcelLabel = entry.parcelName || '—';

              return (
                <div
                  key={entry.id || `${entry.agentId}:${entry.timestamp}`}
                  ref={(el) => {
                    if (el) {
                      rowRefs.current.set(entry.timestamp, el);
                    } else {
                      rowRefs.current.delete(entry.timestamp);
                    }
                  }}
                  role="row"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  data-testid={`teleport-history-row-${entry.timestamp}`}
                  onClick={() => setSelectedTimestamp(entry.timestamp)}
                  onDoubleClick={() => void handleTeleport(entry)}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) {
                      setFocusedTimestamp(entry.timestamp);
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target === e.currentTarget) {
                      setFocusedTimestamp((prev) => (prev === entry.timestamp ? null : prev));
                    }
                  }}
                  onKeyDown={(e) => handleRowKeyDown(e, entry, idx)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(120px, 1.5fr) minmax(90px, 1fr) 118px auto',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    background: isSelected ? V.surf2 : V.bg,
                    borderBottom: `1px solid ${V.outv}`,
                    borderLeft: isSelected ? `3px solid ${V.pri}` : '3px solid transparent',
                    boxShadow: isRowFocused ? `inset 0 0 0 2px ${V.pri}` : 'none',
                    cursor: 'pointer',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <div role="gridcell" style={{ minWidth: 0 }}>
                    <div
                      style={{
                        font: `600 12px/1.25 ${t.font}`,
                        color: V.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.regionName}
                    </div>
                    <div
                      style={{
                        font: `400 11px/1.25 ${t.font}`,
                        color: V.ink2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {parcelLabel}
                    </div>
                  </div>

                  <div
                    role="gridcell"
                    style={{
                      font: `500 11px/1.2 ${t.font}`,
                      color: V.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {coordLabel}
                  </div>

                  <div
                    role="gridcell"
                    style={{
                      font: `400 10.5px/1.2 ${t.font}`,
                      color: V.ink2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {timeLabel}
                  </div>

                  <div role="gridcell" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
                      <button
                        type="button"
                        aria-label={`Teleport to ${entry.regionName}${
                          coordLabel !== '—' ? ` (${coordLabel})` : ''
                        }`}
                        title={`Teleport to ${entry.regionName}`}
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleTeleport(entry);
                        }}
                        style={{
                          minWidth: '24px',
                          minHeight: '24px',
                          height: '24px',
                          padding: '0 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          background: isSelected ? V.pri : V.surf,
                          color: isSelected ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink,
                          border: `1px solid ${isSelected ? V.pri : V.outv}`,
                          borderRadius: btnRadius,
                          font: `600 10.5px/1 ${t.font}`,
                          cursor: isBusy ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Icon name="zap" size={11} />
                        <span>TP</span>
                      </button>
                    </FocusRing>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Firestorm Bottom Action Toolbar */}
      <div
        role="toolbar"
        aria-label="Destination actions"
        style={{
          flex: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 10px',
          background: V.surf,
          borderTop: `1px solid ${V.outv}`,
        }}
      >
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            disabled={!activeEntry || isBusy}
            onClick={() => activeEntry && void handleTeleport(activeEntry)}
            style={actionBtnStyle(true, false, !activeEntry || isBusy)}
          >
            <Icon name="zap" size={12} />
            <span>Teleport</span>
          </button>
        </FocusRing>

        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            disabled={!activeEntry}
            onClick={() => activeEntry && handleShowOnMap(activeEntry)}
            style={actionBtnStyle(false, false, !activeEntry)}
          >
            <Icon name="map" size={12} />
            <span>Show on Map</span>
          </button>
        </FocusRing>

        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            disabled={!activeEntry}
            onClick={() => activeEntry && void handleCopySlurl(activeEntry)}
            style={actionBtnStyle(false, false, !activeEntry)}
          >
            <Icon name="copy" size={12} />
            <span>Copy SLURL</span>
          </button>
        </FocusRing>

        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            disabled={!activeEntry || isBusy}
            onClick={() => activeEntry && openLandmarkDialog(activeEntry)}
            style={actionBtnStyle(false, false, !activeEntry || isBusy)}
          >
            <Icon name="bookmark" size={12} />
            <span>Create Landmark</span>
          </button>
        </FocusRing>

        <div style={{ flex: 1 }} />

        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            disabled={!activeEntry || isBusy}
            onClick={() => activeEntry && void handleDeleteEntry(activeEntry)}
            style={actionBtnStyle(false, true, !activeEntry || isBusy)}
          >
            <Icon name="trash-2" size={12} />
            <span>Delete</span>
          </button>
        </FocusRing>
      </div>

      {/* Create Landmark Confirmation Dialog (Zero manual coordinate entry required) */}
      {landmarkModalEntry ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 95,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeLandmarkDialog();
          }}
        >
          <FocusTrap
            active
            onEscape={closeLandmarkDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="th-landmark-dialog-title"
            style={{
              width: 'min(100%, 380px)',
              background: V.surf,
              border: `1px solid ${V.pri}`,
              borderRadius: kind === 'default' ? V.rp : 0,
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.55)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <h3
                id="th-landmark-dialog-title"
                style={{
                  margin: 0,
                  font: `700 13px/1.2 ${t.dfont}`,
                  color: V.ink,
                }}
              >
                Create Landmark
              </h3>
              <button
                type="button"
                aria-label="Close landmark dialog"
                onClick={closeLandmarkDialog}
                style={{
                  minWidth: '24px',
                  minHeight: '24px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  color: V.ink2,
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={handleConfirmCreateLandmark}
              style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label
                  htmlFor="th-landmark-name-input"
                  style={{ font: `600 11px/1.2 ${t.font}`, color: V.ink2 }}
                >
                  Landmark Name
                </label>
                <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
                  <input
                    id="th-landmark-name-input"
                    type="text"
                    value={landmarkName}
                    onChange={(e) => setLandmarkName(e.target.value)}
                    style={{
                      width: '100%',
                      height: '30px',
                      padding: '0 8px',
                      background: V.bg,
                      color: V.ink,
                      border: `1px solid ${V.outv}`,
                      borderRadius: btnRadius,
                      font: `400 12px/1 ${t.font}`,
                      boxSizing: 'border-box',
                    }}
                  />
                </FocusRing>
              </div>

              <dl
                style={{
                  margin: 0,
                  padding: '8px 10px',
                  background: V.bg,
                  border: `1px solid ${V.outv}`,
                  borderRadius: btnRadius,
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '4px 10px',
                  font: `400 11px/1.35 ${t.font}`,
                }}
              >
                <dt style={{ color: V.ink2, fontWeight: 600 }}>Region</dt>
                <dd style={{ margin: 0, color: V.ink }}>{landmarkModalEntry.regionName}</dd>
                <dt style={{ color: V.ink2, fontWeight: 600 }}>Parcel</dt>
                <dd style={{ margin: 0, color: V.ink }}>{landmarkModalEntry.parcelName || '—'}</dd>
                <dt style={{ color: V.ink2, fontWeight: 600 }}>Coordinates</dt>
                <dd style={{ margin: 0, color: V.ink }}>
                  {formatCoordinates(landmarkModalEntry.position)}
                </dd>
                <dt style={{ color: V.ink2, fontWeight: 600 }}>SLURL</dt>
                <dd
                  style={{
                    margin: 0,
                    color: V.ink2,
                    overflowWrap: 'anywhere',
                    fontSize: '10.5px',
                  }}
                >
                  {landmarkModalEntry.slurl}
                </dd>
              </dl>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
                  <button
                    type="button"
                    onClick={closeLandmarkDialog}
                    style={actionBtnStyle(false, false, false)}
                  >
                    Cancel
                  </button>
                </FocusRing>
                <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
                  <button
                    type="submit"
                    disabled={isBusy}
                    style={actionBtnStyle(true, false, isBusy)}
                  >
                    Save Landmark
                  </button>
                </FocusRing>
              </div>
            </form>
          </FocusTrap>
        </div>
      ) : null}
    </div>
  );

  if (embedded) {
    return (
      <div
        role="region"
        aria-label="Teleport History"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {bodyContent}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Teleport History"
      onMouseDown={() => actions.flFocus && actions.flFocus(FLOATER_ID)}
      style={{
        position: 'absolute',
        left: `${r.x + DESKTOP_RAIL}px`,
        top: `${r.y + DESKTOP_TOP}px`,
        width: `${r.w}px`,
        height: `${r.h}px`,
        zIndex: act ? 65 : 10 + Math.max(0, (state.flZ || []).indexOf(FLOATER_ID)),
        display: 'flex',
        flexDirection: 'column',
        background: V.surf,
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...fs.frame,
      }}
    >
      {/* Window Title Bar */}
      <div
        onMouseDown={(e) => actions.flDrag && actions.flDrag(FLOATER_ID, e, 'move')}
        style={{
          flex: 'none',
          height: `${G.bar}px`,
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          cursor: 'move',
          userSelect: 'none',
          ...fs.bar,
        }}
      >
        {kind === 'sweep' && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '100%',
              padding: '0 8px',
              background: act ? V.sec : V.sec2,
              color: act ? V.bg : V.onsec,
              borderRadius: 0,
              font: '700 9.5px/1 ' + t.dfont,
              letterSpacing: '.1em',
              flex: 'none',
              marginRight: '4px',
            }}
          >
            {act ? 'LCARS' : 'SYS'}
          </span>
        )}
        {kind !== 'metro' && <Icon name="history" size={13} />}

        {/* Keyboard Accessible Window Move Handle */}
        <span
          role="separator"
          tabIndex={0}
          aria-roledescription="window move handle"
          aria-label="Teleport History move handle"
          aria-valuenow={r.x}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, availW - r.w)}
          aria-orientation="horizontal"
          onFocus={() => {
            if (!act && actions.flFocus) actions.flFocus(FLOATER_ID);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 50 : 10;
            let handled = false;
            if (e.key === 'ArrowLeft') {
              actions.flMove?.(FLOATER_ID, -step, 0);
              handled = true;
            } else if (e.key === 'ArrowRight') {
              actions.flMove?.(FLOATER_ID, step, 0);
              handled = true;
            } else if (e.key === 'ArrowUp') {
              actions.flMove?.(FLOATER_ID, 0, -step);
              handled = true;
            } else if (e.key === 'ArrowDown') {
              actions.flMove?.(FLOATER_ID, 0, step);
              handled = true;
            }
            if (handled) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            outline: 'none',
          }}
        >
          Teleport History
        </span>

        {/* Snap Left */}
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            aria-label="Snap Left"
            title="Snap Left"
            onClick={(e) => {
              e.stopPropagation();
              actions.flSnap?.(FLOATER_ID, 'left');
            }}
            style={{
              width: `${btnSize}px`,
              height: `${btnSize}px`,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              margin: 0,
              ...fs.control,
              font: btnFont,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            &#x25E7;
          </button>
        </FocusRing>

        {/* Snap Right */}
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            aria-label="Snap Right"
            title="Snap Right"
            onClick={(e) => {
              e.stopPropagation();
              actions.flSnap?.(FLOATER_ID, 'right');
            }}
            style={{
              width: `${btnSize}px`,
              height: `${btnSize}px`,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              margin: 0,
              ...fs.control,
              font: btnFont,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            &#x25E8;
          </button>
        </FocusRing>

        {/* Maximize / Restore */}
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
            title={isMaximized ? 'Restore' : 'Maximize'}
            onClick={(e) => {
              e.stopPropagation();
              actions.flSnap?.(FLOATER_ID, isMaximized ? 'restore' : 'maximize');
            }}
            style={{
              width: `${btnSize}px`,
              height: `${btnSize}px`,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              margin: 0,
              ...fs.control,
              font: btnFont,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            {isMaximized ? '\u274F' : '\u25A1'}
          </button>
        </FocusRing>

        {/* Layout & Position */}
        {onOpenLayoutDialog ? (
          <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label="Layout & Position"
              title="Layout & Position"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLayoutDialog(FLOATER_ID, 'all', e.currentTarget);
              }}
              style={{
                width: `${btnSize}px`,
                height: `${btnSize}px`,
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                ...fs.control,
                font: btnFont,
                cursor: 'pointer',
                opacity: 0.85,
              }}
            >
              <Icon name="move" size={11} />
            </button>
          </FocusRing>
        ) : null}

        {/* Minimize */}
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            aria-label="Minimize"
            title="Minimize"
            onClick={(e) => {
              e.stopPropagation();
              actions.flToggle?.(FLOATER_ID);
            }}
            style={{
              width: `${btnSize}px`,
              height: `${btnSize}px`,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              margin: 0,
              ...fs.control,
              font: btnFont,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            &minus;
          </button>
        </FocusRing>

        {/* Close */}
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            aria-label="Close"
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
              margin: 0,
              ...fs.control,
              font: btnFont,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            &times;
          </button>
        </FocusRing>
      </div>

      {bodyContent}

      {/* Bottom-Right Resize Grip */}
      <div
        role="separator"
        tabIndex={0}
        aria-roledescription="window resize grip"
        aria-label="Teleport History resize grip"
        aria-valuenow={r.w}
        aria-valuemin={216}
        aria-valuemax={availW}
        aria-orientation="horizontal"
        onMouseDown={(e) => actions.flDrag && actions.flDrag(FLOATER_ID, e, 'size')}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 50 : 10;
          let handled = false;
          if (e.key === 'ArrowRight') {
            actions.flResize?.(FLOATER_ID, step, 0);
            handled = true;
          } else if (e.key === 'ArrowLeft') {
            actions.flResize?.(FLOATER_ID, -step, 0);
            handled = true;
          } else if (e.key === 'ArrowDown') {
            actions.flResize?.(FLOATER_ID, 0, step);
            handled = true;
          } else if (e.key === 'ArrowUp') {
            actions.flResize?.(FLOATER_ID, 0, -step);
            handled = true;
          }
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          } else if ((e.key === 'Enter' || e.key === ' ') && onOpenLayoutDialog) {
            e.preventDefault();
            e.stopPropagation();
            onOpenLayoutDialog(FLOATER_ID, 'dimensions', e.currentTarget);
          }
        }}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: '15px',
          height: '15px',
          zIndex: 80,
          cursor: 'nwse-resize',
          background: 'linear-gradient(135deg,transparent 0 52%,' + fs.grip + ' 52% 100%)',
          outline: 'none',
        }}
      />
    </div>
  );
}
