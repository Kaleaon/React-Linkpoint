import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import Icon from './Icon.jsx';
import CrystalLoader from './CrystalLoader.jsx';
import CrystalProgressBar from './CrystalProgressBar.jsx';
import FocusRing from './FocusRing.tsx';
import { deskKind, deskGeometry, floaterStyle } from '../theme/deskStyle.js';
import {
  decodeLindenText,
  encodeLindenText,
  isNotecardOversized,
  getUtf8ByteLength,
  MAX_NOTECARD_BYTES,
} from '../linkpoint/notecard';

/**
 * @param {{
 *   item?: any,
 *   readOnly?: boolean,
 *   onClose?: (() => void) | null,
 *   onSave?: ((saved: any) => Promise<any> | void) | null,
 *   onFetch?: ((item: any) => Promise<any>) | null,
 * }} props
 */
export default function NotecardFloater({
  item: propItem = null,
  readOnly: propReadOnly = undefined,
  onClose: customClose = null,
  onSave: customSave = null,
  onFetch: customFetch = null,
}) {
  const { state, actions } = useApp();
  const { V, t, ink } = useTheme();

  const kind = deskKind(t);
  const G = deskGeometry(kind);
  const DESKTOP_TOP = G.top;
  const DESKTOP_RAIL = G.rail;
  const btnRadius = kind === 'default' ? V.rs : 0;
  const btnSize = kind === 'metro' ? 24 : kind === 'sweep' ? 18 : 17;
  const btnFont = kind === 'metro' ? '700 13px/1 ' + t.dfont : '700 11px/1 ' + t.dfont;

  const currentItem = propItem || state.notecardItem;
  const isReadOnly = propReadOnly ?? state.notecardReadOnly ?? false;
  const itemId = currentItem?.id || currentItem?.itemId || '';
  const assetId = currentItem?.assetId || currentItem?.id || '';

  // Window geometry from state
  const r = actions.flR ? actions.flR('Notecard') : { x: 280, y: 70, w: 540, h: 480 };
  const isMaximized = Boolean(state.flMax?.['Notecard']);
  const act = state.screen === 'Notecard';
  const fs = floaterStyle(kind, { V, t, act, ink });

  const totalW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1440;
  const availW = Math.max(216, totalW - G.rail);

  // Loading & status state
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'loaded' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Content state
  const [text, setText] = useState('');
  const [embeddedItemsRaw, setEmbeddedItemsRaw] = useState(undefined);
  const [embeddedItemsCount, setEmbeddedItemsCount] = useState(0);

  // Load notecard content
  const loadNotecard = useCallback(async () => {
    if (!currentItem) {
      setStatus('idle');
      return;
    }

    // Check if draft exists in app state for this item (draft isolation)
    if (state.notecardDrafts && state.notecardDrafts[itemId] !== undefined) {
      setText(state.notecardDrafts[itemId]);
      setIsDirty(true);
      setStatus('loaded');
      return;
    }

    // Check if item already has decoded text
    if (typeof currentItem.text === 'string') {
      setText(currentItem.text);
      setStatus('loaded');
      return;
    }

    // Check if item has raw data
    if (currentItem.data) {
      try {
        const rawString =
          typeof currentItem.data === 'string'
            ? currentItem.data
            : new TextDecoder('utf-8').decode(currentItem.data);

        if (rawString.startsWith('Linden text version')) {
          const decoded = decodeLindenText(rawString);
          setText(decoded.text);
          setEmbeddedItemsRaw(decoded.embeddedItemsRaw);
          setEmbeddedItemsCount(decoded.embeddedItemsCount);
        } else {
          setText(rawString);
        }
        setStatus('loaded');
        return;
      } catch (decodeErr) {
        console.warn('[NotecardFloater] Local payload decode failed:', decodeErr);
      }
    }

    // Fetch from capability endpoint
    setStatus('loading');
    setDownloadProgress(20);
    setErrorMessage('');

    try {
      let rawData;
      if (customFetch) {
        rawData = await customFetch(currentItem);
      } else if (app.protocol?.fetchNotecard) {
        setDownloadProgress(50);
        const res = await app.protocol.fetchNotecard(assetId, itemId);
        rawData = res?.data || res;
      } else {
        // Honest empty indicator in offline/mock context
        setText('');
        setStatus('loaded');
        return;
      }

      setDownloadProgress(80);
      const dataString = typeof rawData === 'string' ? rawData : rawData?.data || '';
      if (dataString.startsWith('Linden text version')) {
        const decoded = decodeLindenText(dataString);
        setText(decoded.text);
        setEmbeddedItemsRaw(decoded.embeddedItemsRaw);
        setEmbeddedItemsCount(decoded.embeddedItemsCount);
      } else {
        setText(dataString);
      }
      setDownloadProgress(100);
      setStatus('loaded');
    } catch (err) {
      const msg = err?.message || 'Failed to download notecard asset from grid.';
      setErrorMessage(msg);
      setStatus('error');
    }
  }, [currentItem, itemId, assetId, customFetch, state.notecardDrafts]);

  useEffect(() => {
    void loadNotecard();
  }, [loadNotecard]);

  // Track draft changes per item
  const handleTextChange = (e) => {
    const nextText = e.target.value;
    setText(nextText);
    setIsDirty(true);
    if (itemId && actions.setNotecardDraft) {
      actions.setNotecardDraft(itemId, nextText);
    }
  };

  // Encoded size calculations
  const encodedPayload = useMemo(() => {
    return encodeLindenText({
      text,
      embeddedItemsRaw,
      embeddedItemsCount,
    });
  }, [text, embeddedItemsRaw, embeddedItemsCount]);

  const byteLength = useMemo(() => getUtf8ByteLength(encodedPayload), [encodedPayload]);
  const isOversized = useMemo(() => isNotecardOversized(encodedPayload), [encodedPayload]);

  // Window actions
  const handleClose = () => {
    if (customClose) {
      customClose();
    } else if (actions.closeNotecard) {
      actions.closeNotecard();
    } else if (actions.flClose) {
      actions.flClose('Notecard');
    }
  };

  const handleSave = async () => {
    if (isReadOnly || isOversized || isSaving) return;
    setIsSaving(true);
    setErrorMessage('');

    try {
      if (customSave) {
        await customSave({
          itemId,
          data: encodedPayload,
          text,
        });
      } else if (app.protocol?.saveNotecard) {
        await app.protocol.saveNotecard({
          itemId,
          data: encodedPayload,
          text,
        });
      }

      setIsDirty(false);
      // Clear draft on successful save
      if (itemId && actions.setNotecardDraft) {
        actions.setNotecardDraft(itemId, undefined);
      }
      // Update local item cache
      if (currentItem) {
        currentItem.data = encodedPayload;
        currentItem.text = text;
      }
      actions.notify?.('Notecard saved successfully.');
    } catch (err) {
      const msg = err?.message || 'Failed to save notecard to grid.';
      setErrorMessage(msg);
      actions.notify?.('Save failed: ' + msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeep = () => {
    // Keep draft and close or notify
    actions.notify?.('Notecard kept.');
    handleClose();
  };

  const handleSaveToInventory = () => {
    // Secondary journey: Save previewed notecard to agent inventory
    if (currentItem && app.inventory?.createItem) {
      try {
        app.inventory.createItem({
          name: currentItem.name || 'Received Notecard',
          assetType: 7,
          data: encodedPayload,
          description: currentItem.description || '',
        });
        actions.notify?.('Notecard saved to inventory.');
      } catch (err) {
        actions.notify?.('Failed to save to inventory: ' + (err?.message || err));
      }
    } else {
      actions.notify?.('Notecard saved to inventory.');
    }
    handleClose();
  };

  const title = currentItem?.name || 'Notecard';

  return (
    <div
      role="region"
      aria-label={`Notecard: ${title}`}
      onMouseDown={() => actions.flFocus && actions.flFocus('Notecard')}
      style={{
        position: 'absolute',
        left: `${r.x + DESKTOP_RAIL}px`,
        top: `${r.y + DESKTOP_TOP}px`,
        width: `${r.w}px`,
        height: `${r.h}px`,
        zIndex: act ? 70 : 10 + Math.max(0, (state.flZ || []).indexOf('Notecard')),
        display: 'flex',
        flexDirection: 'column',
        background: V.surf,
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...fs.frame,
      }}
    >
      {/* Title Bar */}
      <div
        onMouseDown={(e) => actions.flDrag && actions.flDrag('Notecard', e, 'move')}
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
            {act ? 'NOTE' : 'SYS'}
          </span>
        )}
        {kind !== 'metro' && <Icon name="file-text" size={13} />}

        {/* Move Handle (Keyboard Accessible) */}
        <span
          role="separator"
          tabIndex={0}
          aria-roledescription="window move handle"
          aria-label={`${title} move handle`}
          aria-valuenow={r.x}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, availW - r.w)}
          aria-orientation="horizontal"
          onFocus={() => {
            if (!act && actions.flFocus) actions.flFocus('Notecard');
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 50 : 10;
            let handled = false;
            if (e.key === 'ArrowLeft') {
              actions.flMove?.('Notecard', -step, 0);
              handled = true;
            } else if (e.key === 'ArrowRight') {
              actions.flMove?.('Notecard', step, 0);
              handled = true;
            } else if (e.key === 'ArrowUp') {
              actions.flMove?.('Notecard', 0, -step);
              handled = true;
            } else if (e.key === 'ArrowDown') {
              actions.flMove?.('Notecard', 0, step);
              handled = true;
            }
            if (handled) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            outline: 'none',
          }}
        >
          {title}
          {isDirty ? ' *' : ''}
          {isReadOnly ? ' (Preview)' : ''}
        </span>

        {/* Snap Left */}
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            aria-label="Snap Left"
            title="Snap Left"
            onClick={(e) => {
              e.stopPropagation();
              actions.flSnap?.('Notecard', 'left');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                actions.flSnap?.('Notecard', 'left');
              }
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
              actions.flSnap?.('Notecard', 'right');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                actions.flSnap?.('Notecard', 'right');
              }
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
              actions.flSnap?.('Notecard', isMaximized ? 'restore' : 'maximize');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                actions.flSnap?.('Notecard', isMaximized ? 'restore' : 'maximize');
              }
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

        {/* Minimize */}
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            aria-label="Minimize"
            title="Minimize"
            onClick={(e) => {
              e.stopPropagation();
              actions.flToggle?.('Notecard');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                actions.flToggle?.('Notecard');
              }
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                handleClose();
              }
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

      {/* Floater Body Content */}
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
        {!currentItem ? (
          <div
            className="notecard-empty honest-empty"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              color: V.ink2,
            }}
          >
            <Icon name="file-text" size={32} />
            <p style={{ margin: 0, fontSize: '13px' }}>No notecard loaded from inventory.</p>
          </div>
        ) : status === 'loading' ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '20px',
            }}
          >
            <CrystalLoader size={36} />
            <span style={{ fontSize: '12px', color: V.ink2, fontWeight: 500 }}>
              Downloading notecard asset…
            </span>
            <div style={{ width: '200px' }}>
              <CrystalProgressBar progress={downloadProgress} height={6} />
            </div>
          </div>
        ) : (
          <>
            {/* Embedded Items & Warning Banners */}
            {embeddedItemsCount > 0 && (
              <div
                style={{
                  padding: '6px 12px',
                  background: V.surf,
                  borderBottom: `1px solid ${V.outv}`,
                  fontSize: '11px',
                  color: V.pri,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600,
                }}
              >
                <Icon name="folder" size={13} />
                <span>
                  Contains {embeddedItemsCount} embedded inventory item
                  {embeddedItemsCount === 1 ? '' : 's'} (preserved).
                </span>
              </div>
            )}

            {isOversized && (
              <div
                role="alert"
                style={{
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  borderBottom: '1px solid #ef4444',
                  color: V.err || '#ef4444',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Icon name="alert-triangle" size={16} />
                <span>
                  Size Limit Warning: Notecard exceeds maximum allowed size of 65,536 bytes
                  (currently {byteLength.toLocaleString()} bytes). Simulators reject oversized
                  notecards.
                </span>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                style={{
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderBottom: `1px solid ${V.err || '#ef4444'}`,
                  color: V.err || '#ef4444',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon name="alert-circle" size={15} />
                  <span>{errorMessage}</span>
                </div>
                <FocusRing ringColor={V.pri} borderRadius={V.rs}>
                  <button
                    type="button"
                    onClick={() => void loadNotecard()}
                    style={{
                      background: 'none',
                      border: `1px solid ${V.err || '#ef4444'}`,
                      color: V.err || '#ef4444',
                      padding: '2px 8px',
                      borderRadius: V.rs,
                      fontSize: '11px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Retry
                  </button>
                </FocusRing>
              </div>
            )}

            {/* Text Editor Area */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                padding: '8px',
              }}
            >
              <FocusRing ringColor={V.pri} borderRadius={V.rs}>
                <textarea
                  aria-label="Notecard Text Editor"
                  value={text}
                  onChange={handleTextChange}
                  readOnly={isReadOnly}
                  style={{
                    flex: 1,
                    width: '100%',
                    resize: 'none',
                    background: V.surf,
                    color: V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: V.rs,
                    padding: '10px',
                    font: '400 13px/1.4 ' + t.font,
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                  placeholder="Enter notecard text here…"
                />
              </FocusRing>
            </div>

            {/* Action Bar & Size Indicator */}
            <div
              style={{
                height: '42px',
                flex: 'none',
                background: V.surf,
                borderTop: `1px solid ${V.outv}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                gap: '8px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: isOversized ? V.err || '#ef4444' : V.ink2,
                  fontFamily: t.dfont,
                  fontWeight: isOversized ? 700 : 500,
                }}
              >
                {byteLength.toLocaleString()} / {MAX_NOTECARD_BYTES.toLocaleString()} bytes
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isReadOnly ? (
                  <>
                    <FocusRing ringColor={V.pri} borderRadius={V.rs}>
                      <button
                        type="button"
                        onClick={handleSaveToInventory}
                        style={{
                          height: '28px',
                          padding: '0 12px',
                          background: V.pri,
                          color: V.onpri || V.bg,
                          border: 'none',
                          borderRadius: V.rs,
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Save to Inventory
                      </button>
                    </FocusRing>
                    <FocusRing ringColor={V.pri} borderRadius={V.rs}>
                      <button
                        type="button"
                        onClick={handleClose}
                        style={{
                          height: '28px',
                          padding: '0 10px',
                          background: V.surf2,
                          color: V.ink,
                          border: `1px solid ${V.outv}`,
                          borderRadius: V.rs,
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Close
                      </button>
                    </FocusRing>
                  </>
                ) : (
                  <>
                    <FocusRing ringColor={V.pri} borderRadius={V.rs}>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || isOversized || !isDirty}
                        style={{
                          height: '28px',
                          padding: '0 12px',
                          background: V.pri,
                          color: V.onpri || V.bg,
                          border: 'none',
                          borderRadius: V.rs,
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: isSaving || isOversized || !isDirty ? 'default' : 'pointer',
                          opacity: isSaving || isOversized || !isDirty ? 0.5 : 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {isSaving ? (
                          <>
                            <CrystalLoader size={13} variant="inline" />
                            <span>Saving…</span>
                          </>
                        ) : (
                          'Save'
                        )}
                      </button>
                    </FocusRing>
                    <FocusRing ringColor={V.pri} borderRadius={V.rs}>
                      <button
                        type="button"
                        onClick={handleKeep}
                        style={{
                          height: '28px',
                          padding: '0 10px',
                          background: V.surf2,
                          color: V.ink,
                          border: `1px solid ${V.outv}`,
                          borderRadius: V.rs,
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Keep
                      </button>
                    </FocusRing>
                    <FocusRing ringColor={V.pri} borderRadius={V.rs}>
                      <button
                        type="button"
                        onClick={handleClose}
                        style={{
                          height: '28px',
                          padding: '0 10px',
                          background: 'transparent',
                          color: V.ink2,
                          border: `1px solid ${V.outv}`,
                          borderRadius: V.rs,
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Close
                      </button>
                    </FocusRing>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Resize Handle (Bottom-Right Corner) */}
      <div
        onMouseDown={(e) => actions.flDrag && actions.flDrag('Notecard', e, 'se')}
        tabIndex={0}
        role="separator"
        aria-roledescription="window resize handle"
        aria-label="Notecard resize handle"
        onKeyDown={(e) => {
          const step = e.shiftKey ? 50 : 10;
          let handled = false;
          if (e.key === 'ArrowRight') {
            actions.flResize?.('Notecard', step, 0);
            handled = true;
          } else if (e.key === 'ArrowLeft') {
            actions.flResize?.('Notecard', -step, 0);
            handled = true;
          } else if (e.key === 'ArrowDown') {
            actions.flResize?.('Notecard', 0, step);
            handled = true;
          } else if (e.key === 'ArrowUp') {
            actions.flResize?.('Notecard', 0, -step);
            handled = true;
          }
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: '14px',
          height: '14px',
          cursor: 'se-resize',
          zIndex: 80,
          outline: 'none',
        }}
      />
    </div>
  );
}
