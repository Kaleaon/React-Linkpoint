import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import Icon from './Icon.jsx';
import FocusRing from './FocusRing.tsx';
import { deskKind, deskGeometry, floaterStyle } from '../theme/deskStyle.js';
import {
  MAX_LANDMARK_DESC_BYTES,
  MAX_LANDMARK_NAME_BYTES,
  getUtf8ByteLength,
  truncateUtf8Bytes,
  formatMaturityRating,
} from '../linkpoint/landmark';

/**
 * Dedicated Firestorm-parity Create Landmark floater (`floater_create_landmark`).
 *
 * @param {{
 *   embedded?: boolean,
 *   onClose?: (() => void) | null,
 *   onCreate?: ((params: any) => Promise<any>) | null,
 * }} props
 */
export default function LandmarkFloater({
  embedded = false,
  onClose: customClose = null,
  onCreate: customCreate = null,
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

  const r = actions?.flR ? actions.flR('CreateLandmark') : { x: 340, y: 96, w: 420, h: 420 };
  const isMaximized = Boolean(state?.flMax?.CreateLandmark);
  const act = state?.screen === 'CreateLandmark';
  const fs = floaterStyle(kind, { V, t, act, ink });

  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 900,
  }));
  const availW = Math.max(216, viewport.w - G.rail);
  const availH = Math.max(180, viewport.h - G.top - G.dock);
  const frameW = Math.max(216, Math.min(availW, r.w));
  const frameH = Math.max(180, Math.min(availH, r.h));
  const frameX = Math.max(0, Math.min(Math.max(0, availW - frameW), r.x));
  const frameY = Math.max(0, Math.min(Math.max(0, availH - frameH), r.y));

  const [, setWorldRev] = useState(0);
  const [folderOptions, setFolderOptions] = useState([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const userChangedFolderRef = useRef(false);

  const [name, setName] = useState('');
  const userEditedNameRef = useRef(false);
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Read live world / parcel context without fabricating values
  const region = app.world?.region || null;
  const parcel = region?.parcel || null;
  const parcelName =
    (typeof parcel?.name === 'string' && parcel.name.trim()) ||
    (typeof parcel?.Name === 'string' && parcel.Name.trim()) ||
    '';
  const regionName =
    (typeof region?.name === 'string' && region.name.trim()) ||
    (typeof app.world?.regionName === 'string' && app.world.regionName.trim()) ||
    (typeof app.protocol?.authReply?.sim_name === 'string' &&
      app.protocol.authReply.sim_name.trim()) ||
    '';
  const maturityRating = formatMaturityRating(region);
  const avatarPosition = Array.isArray(app.world?.avatarPosition) ? app.world.avatarPosition : null;
  const coordsText =
    avatarPosition &&
    avatarPosition.length >= 3 &&
    avatarPosition.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n))
      ? `${Math.round(avatarPosition[0])}, ${Math.round(avatarPosition[1])}, ${Math.round(avatarPosition[2])}`
      : '—';

  // Subscribe to live parcel / region / position and viewport updates
  useEffect(() => {
    const bump = () => setWorldRev((v) => v + 1);
    const events = ['region_changed', 'parcel_changed', 'avatar_moved'];
    events.forEach((ev) => app.world?.on?.(ev, bump));
    const onResize = () => {
      if (typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
        setViewport({ w: window.innerWidth, h: window.innerHeight });
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onResize);
    }
    return () => {
      events.forEach((ev) => app.world?.off?.(ev, bump));
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onResize);
      }
    };
  }, []);

  // Pre-populate landmark name from live parcel/region when user hasn't typed a custom name
  useEffect(() => {
    if (userEditedNameRef.current) return;
    const suggested = parcelName || regionName;
    if (suggested) {
      setName(truncateUtf8Bytes(suggested, MAX_LANDMARK_NAME_BYTES));
    }
  }, [parcelName, regionName]);

  // Populate hierarchical folder selector asynchronously without blocking UI thread
  const refreshFolders = useCallback(() => {
    const controller = new AbortController();
    setFoldersLoading(true);

    void (async () => {
      try {
        if (typeof app.inventory?.getFolderHierarchyOptions === 'function') {
          const { options, defaultFolderId } = await app.inventory.getFolderHierarchyOptions({
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setFolderOptions(options);
          setSelectedFolderId((prev) => {
            if (userChangedFolderRef.current && prev && options.some((o) => o.id === prev)) {
              return prev;
            }
            if (prev && options.some((o) => o.id === prev) && !defaultFolderId) {
              return prev;
            }
            return defaultFolderId || options[0]?.id || '';
          });
        }
      } finally {
        if (!controller.signal.aborted) {
          setFoldersLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const abortInitial = refreshFolders();

    if (
      app.inventory &&
      app.inventory.folders?.size === 0 &&
      !app.inventory.isLoading &&
      app.auth?.isLoggedIn?.()
    ) {
      void app.inventory.load();
    }

    const onInventoryChange = () => {
      refreshFolders();
    };
    app.inventory?.on?.('inventory_loaded', onInventoryChange);
    app.inventory?.on?.('inventory_updated', onInventoryChange);

    return () => {
      abortInitial();
      app.inventory?.off?.('inventory_loaded', onInventoryChange);
      app.inventory?.off?.('inventory_updated', onInventoryChange);
    };
  }, [refreshFolders]);

  const descByteLength = useMemo(() => getUtf8ByteLength(description), [description]);

  const handleNameChange = (e) => {
    userEditedNameRef.current = true;
    setName(truncateUtf8Bytes(e.target.value, MAX_LANDMARK_NAME_BYTES));
  };

  const handleDescriptionChange = (e) => {
    setDescription(truncateUtf8Bytes(e.target.value, MAX_LANDMARK_DESC_BYTES));
  };

  const handleFolderChange = (e) => {
    userChangedFolderRef.current = true;
    setSelectedFolderId(e.target.value);
  };

  const handleClose = useCallback(() => {
    if (customClose) {
      customClose();
    } else if (actions?.closeLandmarkFloater) {
      actions.closeLandmarkFloater();
    } else if (actions?.flClose) {
      actions.flClose('CreateLandmark');
    }
  }, [customClose, actions]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isSaving) return;

    const trimmedName = truncateUtf8Bytes(
      name.trim() || parcelName || regionName || 'Landmark',
      MAX_LANDMARK_NAME_BYTES,
    );
    const trimmedDesc = truncateUtf8Bytes(description, MAX_LANDMARK_DESC_BYTES);
    const targetFolderId = selectedFolderId || app.inventory?.getLandmarksFolder?.()?.id || '';

    setIsSaving(true);
    setErrorMessage('');

    try {
      const payload = {
        name: trimmedName,
        description: trimmedDesc,
        folderId: targetFolderId,
        ...(avatarPosition && avatarPosition.length >= 3
          ? {
              position: [
                Number(avatarPosition[0]),
                Number(avatarPosition[1]),
                Number(avatarPosition[2]),
              ],
            }
          : {}),
        ...(region?.id ? { regionId: String(region.id) } : {}),
        ...(regionName ? { regionName } : {}),
        ...(parcelName ? { parcelName } : {}),
        ...(typeof parcel?.id === 'number'
          ? { parcelLocalId: parcel.id }
          : typeof parcel?.LocalID === 'number'
            ? { parcelLocalId: parcel.LocalID }
            : {}),
      };

      if (customCreate) {
        await customCreate(payload);
      } else if (typeof app.inventory?.createLandmark === 'function') {
        await app.inventory.createLandmark(payload);
      } else {
        throw new Error('Landmark creation is unavailable');
      }

      actions?.notify?.(`Landmark "${trimmedName}" saved.`);
      handleClose();
    } catch (err) {
      const msg = err?.message || 'Failed to create landmark.';
      setErrorMessage(msg);
      actions?.notify?.(`Could not create landmark: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const maturityColor =
    maturityRating === 'Adult'
      ? V.err
      : maturityRating === 'Moderate'
        ? V.pri
        : maturityRating === 'General'
          ? V.ok
          : V.ink2;

  const bodyContent = (
    <form
      onSubmit={handleSubmit}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '11px',
        background: V.surf,
        color: V.ink,
        fontFamily: t.font,
      }}
    >
      {/* Current Parcel & Region Information */}
      <section
        aria-label="Current parcel information"
        style={{
          padding: '9px 11px',
          background: V.surf2,
          border: `1px solid ${V.outv}`,
          borderRadius: kind === 'default' ? V.rs : 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
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
          <span
            style={{
              font: '600 10px/1 ' + t.dfont,
              color: V.ink2,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            Current Location
          </span>
          <span
            data-testid="landmark-maturity-badge"
            style={{
              padding: '2px 7px',
              font: '700 9.5px/1.2 ' + t.dfont,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              borderRadius: kind === 'default' ? V.rs : 0,
              border: `1px solid ${maturityColor}`,
              color: maturityColor,
              background: V.surf,
            }}
          >
            {maturityRating}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '88px 1fr',
            rowGap: '4px',
            columnGap: '8px',
            fontSize: '11.5px',
            lineHeight: 1.35,
          }}
        >
          <span style={{ color: V.ink2 }}>Parcel:</span>
          <span
            data-testid="landmark-parcel-name"
            style={{
              color: V.ink,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {parcelName || '—'}
          </span>

          <span style={{ color: V.ink2 }}>Region:</span>
          <span
            data-testid="landmark-region-name"
            style={{
              color: V.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {regionName || '—'}
          </span>

          <span style={{ color: V.ink2 }}>Maturity:</span>
          <span data-testid="landmark-maturity-text" style={{ color: V.ink }}>
            {maturityRating}
          </span>

          <span style={{ color: V.ink2 }}>Position:</span>
          <span
            data-testid="landmark-coordinates"
            style={{ color: V.ink2, fontFamily: t.mfont || t.font }}
          >
            {coordsText}
          </span>
        </div>
      </section>

      {/* Landmark Name */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label
          htmlFor="landmark-name-input"
          style={{
            font: '600 10.5px/1.2 ' + t.dfont,
            color: V.ink2,
            letterSpacing: '.05em',
          }}
        >
          Name
        </label>
        <input
          id="landmark-name-input"
          type="text"
          value={name}
          onChange={handleNameChange}
          placeholder="Landmark name"
          disabled={isSaving}
          style={{
            height: '30px',
            padding: '0 9px',
            background: V.bg,
            color: V.ink,
            border: `1px solid ${V.outv}`,
            borderRadius: kind === 'default' ? V.rs : 0,
            font: '400 12px/1 ' + t.font,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Hierarchical Folder Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label
            htmlFor="landmark-folder-select"
            style={{
              font: '600 10.5px/1.2 ' + t.dfont,
              color: V.ink2,
              letterSpacing: '.05em',
            }}
          >
            Save in Folder
          </label>
          {foldersLoading && (
            <span style={{ font: '400 10px/1 ' + t.font, color: V.ink2 }}>Loading folders…</span>
          )}
        </div>
        <select
          id="landmark-folder-select"
          aria-label="Save in Folder"
          value={selectedFolderId}
          onChange={handleFolderChange}
          disabled={isSaving}
          style={{
            height: '30px',
            padding: '0 8px',
            background: V.bg,
            color: V.ink,
            border: `1px solid ${V.outv}`,
            borderRadius: kind === 'default' ? V.rs : 0,
            font: '400 12px/1 ' + t.font,
            boxSizing: 'border-box',
          }}
        >
          {folderOptions.length === 0 ? (
            <option value="">Landmarks (Default)</option>
          ) : (
            folderOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.pathLabel}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Description / Notes (127-byte UTF-8 limit) */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minHeight: '68px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label
            htmlFor="landmark-description-input"
            style={{
              font: '600 10.5px/1.2 ' + t.dfont,
              color: V.ink2,
              letterSpacing: '.05em',
            }}
          >
            Notes
          </label>
          <span
            data-testid="landmark-desc-bytes"
            style={{
              font: '400 10px/1 ' + t.font,
              color: descByteLength >= MAX_LANDMARK_DESC_BYTES ? V.pri : V.ink2,
            }}
          >
            {descByteLength} / {MAX_LANDMARK_DESC_BYTES} bytes
          </span>
        </div>
        <textarea
          id="landmark-description-input"
          value={description}
          onChange={handleDescriptionChange}
          placeholder="Optional notes (up to 127 bytes)"
          disabled={isSaving}
          rows={3}
          style={{
            flex: 1,
            minHeight: '56px',
            padding: '7px 9px',
            background: V.bg,
            color: V.ink,
            border: `1px solid ${V.outv}`,
            borderRadius: kind === 'default' ? V.rs : 0,
            font: '400 12px/1.35 ' + t.font,
            resize: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '6px 9px',
            background: V.surf2,
            borderLeft: `3px solid ${V.err}`,
            color: V.err,
            font: '500 11px/1.3 ' + t.font,
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '8px',
          paddingTop: '4px',
        }}
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={isSaving}
          style={{
            height: '30px',
            padding: '0 12px',
            background: V.surf2,
            color: V.ink,
            border: `1px solid ${V.outv}`,
            borderRadius: kind === 'default' ? V.rs : 0,
            font: '600 11px/1 ' + t.dfont,
            cursor: isSaving ? 'default' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          style={{
            height: '30px',
            padding: '0 14px',
            background: V.pri,
            color: ink(V.pri, [V.bg, V.onpri, V.ink]),
            border: `1px solid ${V.pri}`,
            borderRadius: kind === 'default' ? V.rs : 0,
            font: '700 11px/1 ' + t.dfont,
            letterSpacing: '.04em',
            cursor: isSaving ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Icon name="map-pin" size={12} />
          {isSaving ? 'Saving…' : 'Create Landmark'}
        </button>
      </div>
    </form>
  );

  if (embedded) {
    return (
      <div
        role="region"
        aria-label="Create Landmark"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {bodyContent}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Create Landmark"
      data-testid="landmark-floater"
      onMouseDown={() => actions?.flFocus?.('CreateLandmark')}
      style={{
        position: 'absolute',
        left: `${frameX + DESKTOP_RAIL}px`,
        top: `${frameY + DESKTOP_TOP}px`,
        width: `${frameW}px`,
        height: `${frameH}px`,
        zIndex: act ? 70 : 10 + Math.max(0, (state?.flZ || []).indexOf('CreateLandmark')),
        display: 'flex',
        flexDirection: 'column',
        background: V.surf,
        overflow: 'hidden',
        boxSizing: 'border-box',
        ...fs.frame,
      }}
    >
      {/* Window Chrome Title Bar with Drag Handle */}
      <div
        data-testid="landmark-floater-drag-handle"
        onMouseDown={(e) => actions?.flDrag?.('CreateLandmark', e, 'move')}
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
            {act ? 'MARK' : 'SYS'}
          </span>
        )}
        {kind !== 'metro' && <Icon name="map-pin" size={13} />}

        {/* Keyboard-accessible Move Handle */}
        <span
          role="separator"
          tabIndex={0}
          aria-roledescription="window move handle"
          aria-label="Create Landmark move handle"
          aria-valuenow={frameX}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, availW - frameW)}
          aria-orientation="horizontal"
          onFocus={() => {
            if (!act && actions?.flFocus) actions.flFocus('CreateLandmark');
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 50 : 10;
            let handled = false;
            if (e.key === 'ArrowLeft') {
              actions?.flMove?.('CreateLandmark', -step, 0);
              handled = true;
            } else if (e.key === 'ArrowRight') {
              actions?.flMove?.('CreateLandmark', step, 0);
              handled = true;
            } else if (e.key === 'ArrowUp') {
              actions?.flMove?.('CreateLandmark', 0, -step);
              handled = true;
            } else if (e.key === 'ArrowDown') {
              actions?.flMove?.('CreateLandmark', 0, step);
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
          Create Landmark
        </span>

        {/* Snap Left */}
        <FocusRing ringColor={V.pri} borderRadius={btnRadius}>
          <button
            type="button"
            aria-label="Snap Left"
            title="Snap Left"
            onClick={(e) => {
              e.stopPropagation();
              actions?.flSnap?.('CreateLandmark', 'left');
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
              actions?.flSnap?.('CreateLandmark', 'right');
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
              actions?.flSnap?.('CreateLandmark', isMaximized ? 'restore' : 'maximize');
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
              actions?.flToggle?.('CreateLandmark');
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
            &ndash;
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

      {/* Resize Grip */}
      <div
        role="separator"
        tabIndex={0}
        aria-roledescription="window resize grip"
        aria-label="Create Landmark resize grip"
        aria-valuenow={frameW}
        aria-valuemin={216}
        aria-valuemax={availW}
        aria-orientation="horizontal"
        onMouseDown={(e) => actions?.flDrag?.('CreateLandmark', e, 'size')}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 50 : 10;
          let handled = false;
          if (e.key === 'ArrowRight') {
            actions?.flResize?.('CreateLandmark', step, 0);
            handled = true;
          } else if (e.key === 'ArrowLeft') {
            actions?.flResize?.('CreateLandmark', -step, 0);
            handled = true;
          } else if (e.key === 'ArrowDown') {
            actions?.flResize?.('CreateLandmark', 0, step);
            handled = true;
          } else if (e.key === 'ArrowUp') {
            actions?.flResize?.('CreateLandmark', 0, -step);
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
          cursor: 'nwse-resize',
          background: `linear-gradient(135deg, transparent 50%, ${V.outv} 50%)`,
          opacity: 0.7,
        }}
      />
    </div>
  );
}
