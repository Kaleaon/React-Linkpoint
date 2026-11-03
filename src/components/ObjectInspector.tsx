import React, { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import Icon from './Icon.jsx';
import TouchTarget from './TouchTarget';
import PayDialog from './PayDialog.jsx';
import CollapsibleSystemDetails from './CollapsibleSystemDetails';

export interface ObjectInspectorProps {
  style?: React.CSSProperties;
  className?: string;
}

function quatToEulerDegrees(
  [x = 0, y = 0, z = 0, w = 1]: number[] = [0, 0, 0, 1],
): [number, number, number] {
  const sinX = 2 * (w * x + y * z);
  const cosX = 1 - 2 * (x * x + y * y);
  const sinY = Math.max(-1, Math.min(1, 2 * (w * y - z * x)));
  const sinZ = 2 * (w * z + x * y);
  const cosZ = 1 - 2 * (y * y + z * z);
  const radX = Math.atan2(sinX, cosX);
  const radY = Math.asin(sinY);
  const radZ = Math.atan2(sinZ, cosZ);
  return [
    Math.round(((radX * 180) / Math.PI) * 10) / 10,
    Math.round(((radY * 180) / Math.PI) * 10) / 10,
    Math.round(((radZ * 180) / Math.PI) * 10) / 10,
  ];
}

function eulerDegreesToQuat([degX, degY, degZ]: number[]): number[] {
  const radX = (degX * Math.PI) / 180;
  const radY = (degY * Math.PI) / 180;
  const radZ = (degZ * Math.PI) / 180;
  const c1 = Math.cos(radX / 2),
    s1 = Math.sin(radX / 2);
  const c2 = Math.cos(radY / 2),
    s2 = Math.sin(radY / 2);
  const c3 = Math.cos(radZ / 2),
    s3 = Math.sin(radZ / 2);
  return [
    s1 * c2 * c3 - c1 * s2 * s3,
    c1 * s2 * c3 + s1 * c2 * s3,
    c1 * c2 * s3 - s1 * s2 * c3,
    c1 * c2 * c3 + s1 * s2 * s3,
  ];
}

export const ObjectInspector: React.FC<ObjectInspectorProps> = ({ style, className }) => {
  const { V, t } = useTheme();
  const [selection, setSelection] = useState<any>(() => app.world.selectedObject);
  const [objects, setObjects] = useState<any[]>(() => app.world.objects || []);
  const [nearbyUsers, setNearbyUsers] = useState<any[]>(() => app.world.nearbyUsers || []);
  const [payDialogOpen, setPayDialogOpen] = useState(false);

  // Edit pipeline transactional state
  const [isDirty, setIsDirty] = useState<boolean>(() => app.objectEditPipeline?.isDirty || false);
  const [canUndo, setCanUndo] = useState<boolean>(() => app.objectEditPipeline?.canUndo() || false);
  const [canRedo, setCanRedo] = useState<boolean>(() => app.objectEditPipeline?.canRedo() || false);
  const [currentSnapshot, setCurrentSnapshot] = useState<any>(() =>
    selection?.id ? app.objectEditPipeline?.getSnapshot(selection.id) || selection : null,
  );

  // Confirmation dialog on deselecting with unsaved changes
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    nextAction: (() => void) | null;
  }>({
    open: false,
    nextAction: null,
  });

  useEffect(() => {
    let active = true;

    const handleSelection = (obj: any) => {
      if (!active) return;
      setSelection(obj);
      if (obj?.id) {
        app.objectEditPipeline.beginSession(obj);
        const snap = app.objectEditPipeline.getSnapshot(obj.id) || obj;
        setCurrentSnapshot(snap);
      } else {
        setCurrentSnapshot(null);
      }
      setIsDirty(app.objectEditPipeline.isDirty);
      setCanUndo(app.objectEditPipeline.canUndo());
      setCanRedo(app.objectEditPipeline.canRedo());
    };

    const handleObjects = (objs: any[]) => {
      if (active) setObjects([...objs]);
    };

    const handleNearby = (users: any[]) => {
      if (active) setNearbyUsers([...users]);
    };

    const handlePipelineChange = () => {
      if (!active) return;
      setIsDirty(app.objectEditPipeline.isDirty);
      setCanUndo(app.objectEditPipeline.canUndo());
      setCanRedo(app.objectEditPipeline.canRedo());
      if (selection?.id) {
        const snap = app.objectEditPipeline.getSnapshot(selection.id);
        if (snap) {
          setCurrentSnapshot(snap);
        }
      }
    };

    app.world.on('selection_changed', handleSelection);
    app.world.on('objects_changed', handleObjects);
    app.world.on('nearby_changed', handleNearby);

    app.objectEditPipeline.on('change', handlePipelineChange);
    app.objectEditPipeline.on('session_started', handlePipelineChange);
    app.objectEditPipeline.on('committed', handlePipelineChange);
    app.objectEditPipeline.on('discarded', handlePipelineChange);
    app.objectEditPipeline.on('session_cancelled', handlePipelineChange);

    if (app.world.selectedObject?.id) {
      handleSelection(app.world.selectedObject);
    }

    return () => {
      active = false;
      app.world.off('selection_changed', handleSelection);
      app.world.off('objects_changed', handleObjects);
      app.world.off('nearby_changed', handleNearby);

      app.objectEditPipeline.off('change', handlePipelineChange);
      app.objectEditPipeline.off('session_started', handlePipelineChange);
      app.objectEditPipeline.off('committed', handlePipelineChange);
      app.objectEditPipeline.off('discarded', handlePipelineChange);
      app.objectEditPipeline.off('session_cancelled', handlePipelineChange);
    };
  }, [selection?.id]);

  // Keyboard shortcut listeners (Ctrl+Z, Ctrl+Y, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac =
        typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (app.objectEditPipeline.canUndo()) {
          e.preventDefault();
          app.objectEditPipeline.undo();
        }
      } else if (
        mod &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))
      ) {
        if (app.objectEditPipeline.canRedo()) {
          e.preventDefault();
          app.objectEditPipeline.redo();
        }
      } else if (e.key === 'Escape') {
        if (app.objectEditPipeline.isDirty) {
          e.preventDefault();
          setConfirmDialog({
            open: true,
            nextAction: () => {
              handleDeselect();
            },
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectObject = (obj: any) => {
    app.world.selectedObject = obj;
    app.world.emit('selection_changed', obj);
    setSelection(obj);
  };

  const handleDeselect = () => {
    app.world.selectedObject = null;
    app.world.emit('selection_changed', null);
    setSelection(null);
    setCurrentSnapshot(null);
  };

  const requestDeselect = () => {
    if (app.objectEditPipeline.isDirty) {
      setConfirmDialog({
        open: true,
        nextAction: () => {
          handleDeselect();
        },
      });
    } else {
      handleDeselect();
    }
  };

  const requestSelectObject = (obj: any) => {
    if (app.objectEditPipeline.isDirty) {
      setConfirmDialog({
        open: true,
        nextAction: () => {
          handleSelectObject(obj);
        },
      });
    } else {
      handleSelectObject(obj);
    }
  };

  const handleConfirmSave = async () => {
    const next = confirmDialog.nextAction;
    try {
      await app.objectEditPipeline.commit();
    } catch (err) {
      console.error('Failed to commit pending edits on save confirmation:', err);
    }
    setConfirmDialog({ open: false, nextAction: null });
    if (next) next();
  };

  const handleConfirmDiscard = () => {
    const next = confirmDialog.nextAction;
    app.objectEditPipeline.discard();
    setConfirmDialog({ open: false, nextAction: null });
    if (next) next();
  };

  const handleConfirmCancel = () => {
    setConfirmDialog({ open: false, nextAction: null });
  };

  const handleApply = async () => {
    try {
      await app.objectEditPipeline.commit();
    } catch (error) {
      console.error('Failed to commit object edits:', error);
    }
  };

  const handleDiscard = () => {
    app.objectEditPipeline.discard();
  };

  const handleUndo = () => {
    app.objectEditPipeline.undo();
  };

  const handleRedo = () => {
    app.objectEditPipeline.redo();
  };

  const handleFocus = () => {
    app.world.focusSelectedObject();
  };

  const handleTouch = () => {
    void app.world.touchSelected();
  };

  const handleSit = () => {
    if (!selection) return;
    void app.protocol.sit(selection.id).catch((error) => {
      app.world.emit('action_failed', {
        action: 'sit',
        message: error instanceof Error ? error.message : 'Sit failed',
      });
    });
  };

  const handleNumericChange = (
    field: 'position' | 'rotation' | 'scale',
    index: number,
    value: number,
  ) => {
    if (!selection?.id || Number.isNaN(value)) return;
    const snap = app.objectEditPipeline.getSnapshot(selection.id) || currentSnapshot || selection;

    if (field === 'position') {
      const next = [...(snap.position || [0, 0, 0])];
      next[index] = value;
      app.objectEditPipeline.modifyObject(selection.id, { position: next });
    } else if (field === 'rotation') {
      const currentEuler = quatToEulerDegrees(snap.rotation);
      currentEuler[index] = value;
      const nextQuat = eulerDegreesToQuat(currentEuler);
      app.objectEditPipeline.modifyObject(selection.id, { rotation: nextQuat });
    } else if (field === 'scale') {
      const next = [...(snap.scale || [1, 1, 1])];
      next[index] = Math.max(0.01, value);
      app.objectEditPipeline.modifyObject(selection.id, { scale: next });
    }
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    position: 'relative',
    background: V.surf,
    color: V.ink,
    fontFamily: t.font,
    fontSize: '11px',
    lineHeight: '1.4',
    overflowY: 'auto',
    boxSizing: 'border-box',
    padding: '12px',
    ...style,
  };

  const cardStyle: React.CSSProperties = {
    background: V.bg,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs,
    padding: '10px',
    marginBottom: '10px',
  };

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    minHeight: '32px',
    padding: '4px 10px',
    background: V.surf2 || V.surf,
    color: V.ink,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs,
    fontSize: '10px',
    fontWeight: 700,
    cursor: 'pointer',
    flex: 1,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '3px 4px',
    background: V.surf,
    color: V.ink,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs,
    fontSize: '10px',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  };

  if (!selection) {
    const combinedList = [
      ...nearbyUsers.map((u) => ({ ...u, isAvatar: true })),
      ...objects.map((o) => ({ ...o, isAvatar: false })),
    ];

    return (
      <div className={className} style={containerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <Icon name="search" size={14} color={V.pri} />
          <strong style={{ fontSize: '12px', color: V.pri, letterSpacing: '0.05em' }}>
            OBJECT INSPECTOR
          </strong>
        </div>

        <div style={{ ...cardStyle, textAlign: 'center', padding: '16px 12px' }}>
          <Icon name="info" size={24} color={V.ink2} style={{ marginBottom: '6px' }} />
          <div style={{ fontWeight: 600, color: V.ink, marginBottom: '4px' }}>
            No object selected
          </div>
          <p style={{ margin: 0, color: V.ink2, fontSize: '10px' }}>
            Click an object or avatar in the 3D viewport canvas or pick one from the list below to
            inspect properties.
          </p>
        </div>

        <div
          style={{
            fontWeight: 700,
            fontSize: '10px',
            color: V.ink2,
            letterSpacing: '0.08em',
            marginBottom: '6px',
            textTransform: 'uppercase',
          }}
        >
          Nearby Scene Entities ({combinedList.length})
        </div>

        {combinedList.length === 0 ? (
          <div style={{ color: V.ink2, fontStyle: 'italic', padding: '8px 0' }}>
            No entities currently loaded in region.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
            {combinedList.slice(0, 30).map((item, idx) => (
              <button
                key={item.id || item.uuid || idx}
                type="button"
                onClick={() => requestSelectObject(item)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  background: V.bg,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  color: V.ink,
                  fontSize: '11px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <Icon name={item.isAvatar ? 'user' : 'box'} size={12} color={V.pri} />
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontWeight: 600,
                    }}
                  >
                    {item.name || item.id || (item.isAvatar ? 'Avatar' : 'Prim Object')}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: V.ink2, marginLeft: '8px', flexShrink: 0 }}>
                  {item.distance != null ? `${Number(item.distance).toFixed(1)}m` : '—'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const activeData = currentSnapshot || selection;
  const name = activeData.name || selection.name || selection.id || 'Simulator object';
  const typeStr =
    selection.shape || (selection.avatar || selection.isAvatar ? 'Avatar' : 'Primitive');

  const positionValues = Array.isArray(activeData.position)
    ? activeData.position
    : activeData.x != null
      ? [Number(activeData.x), Number(activeData.y), Number(activeData.z)]
      : [0, 0, 0];

  const rotationEuler = quatToEulerDegrees(activeData.rotation);
  const scaleValues = Array.isArray(activeData.scale) ? activeData.scale : [1, 1, 1];

  const distStr = selection.distance != null ? `${Number(selection.distance).toFixed(1)} m` : '—';
  const uuidStr = selection.id || selection.uuid || 'N/A';

  return (
    <div className={className} style={containerStyle}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon name="box" size={14} color={V.pri} />
          <strong style={{ fontSize: '12px', color: V.pri, letterSpacing: '0.05em' }}>
            OBJECT INSPECTOR
          </strong>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isDirty && (
            <span
              data-testid="unsaved-status-pill"
              style={{
                background: '#f59e0b',
                color: '#111827',
                fontSize: '9px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Unsaved Modifications
            </span>
          )}

          <button
            type="button"
            onClick={requestDeselect}
            aria-label="Deselect object"
            title="Deselect object"
            style={{
              background: 'transparent',
              border: 0,
              color: V.ink2,
              cursor: 'pointer',
              padding: '2px 4px',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Transactional Action Bar: Apply, Discard, Undo, Redo */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        <TouchTarget
          onClick={handleApply}
          disabled={!isDirty}
          aria-label="Apply Changes"
          style={{
            ...btnStyle,
            background: isDirty ? '#10b981' : V.surf2 || V.surf,
            color: isDirty ? '#ffffff' : V.ink2,
            opacity: isDirty ? 1 : 0.5,
            minHeight: '28px',
          }}
        >
          <Icon name="check" size={11} />
          <span>APPLY</span>
        </TouchTarget>
        <TouchTarget
          onClick={handleDiscard}
          disabled={!isDirty}
          aria-label="Discard Changes"
          style={{
            ...btnStyle,
            background: isDirty ? '#ef4444' : V.surf2 || V.surf,
            color: isDirty ? '#ffffff' : V.ink2,
            opacity: isDirty ? 1 : 0.5,
            minHeight: '28px',
          }}
        >
          <Icon name="x" size={11} />
          <span>DISCARD</span>
        </TouchTarget>
        <TouchTarget
          onClick={handleUndo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          style={{
            ...btnStyle,
            opacity: canUndo ? 1 : 0.5,
            minHeight: '28px',
          }}
        >
          <Icon name="rotate-ccw" size={11} />
          <span>UNDO</span>
        </TouchTarget>
        <TouchTarget
          onClick={handleRedo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          style={{
            ...btnStyle,
            opacity: canRedo ? 1 : 0.5,
            minHeight: '28px',
          }}
        >
          <Icon name="rotate-cw" size={11} />
          <span>REDO</span>
        </TouchTarget>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: V.ink, marginBottom: '2px' }}>
          {name}
        </div>
        <div style={{ color: V.pri, fontSize: '10px', fontWeight: 600, marginBottom: '8px' }}>
          {typeStr} · Distance: {distStr}
        </div>

        {/* Dual Control Surface: Interactive Numerical Inputs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60px 1fr',
            gap: '6px',
            fontSize: '10px',
            color: V.ink2,
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <span>Position:</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['X', 'Y', 'Z'].map((axis, i) => (
              <div
                key={axis}
                style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '2px' }}
              >
                <span style={{ fontSize: '9px', color: V.ink2, fontWeight: 700 }}>{axis}</span>
                <input
                  type="number"
                  step="0.1"
                  aria-label={`Position ${axis}`}
                  value={
                    Number.isFinite(positionValues[i])
                      ? Math.round(positionValues[i] * 100) / 100
                      : 0
                  }
                  onChange={(e) => handleNumericChange('position', i, parseFloat(e.target.value))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          <span>Rotation:</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['X', 'Y', 'Z'].map((axis, i) => (
              <div
                key={axis}
                style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '2px' }}
              >
                <span style={{ fontSize: '9px', color: V.ink2, fontWeight: 700 }}>{axis}</span>
                <input
                  type="number"
                  step="1"
                  aria-label={`Rotation ${axis}`}
                  value={
                    Number.isFinite(rotationEuler[i]) ? Math.round(rotationEuler[i] * 10) / 10 : 0
                  }
                  onChange={(e) => handleNumericChange('rotation', i, parseFloat(e.target.value))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          <span>Scale:</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['X', 'Y', 'Z'].map((axis, i) => (
              <div
                key={axis}
                style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '2px' }}
              >
                <span style={{ fontSize: '9px', color: V.ink2, fontWeight: 700 }}>{axis}</span>
                <input
                  type="number"
                  step="0.05"
                  min="0.01"
                  aria-label={`Scale ${axis}`}
                  value={
                    Number.isFinite(scaleValues[i]) ? Math.round(scaleValues[i] * 100) / 100 : 1
                  }
                  onChange={(e) => handleNumericChange('scale', i, parseFloat(e.target.value))}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          <span>Owner:</span>
          <span style={{ color: V.ink }}>{selection.owner || 'Region / Public'}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        <TouchTarget
          onClick={handleFocus}
          style={{ ...btnStyle, background: V.pri, color: V.onpri, border: `1px solid ${V.pri}` }}
        >
          <Icon name="eye" size={12} />
          <span>FOCUS CAMERA</span>
        </TouchTarget>

        <div style={{ display: 'flex', gap: '6px' }}>
          <TouchTarget onClick={handleTouch} style={btnStyle}>
            <Icon name="hand" size={12} />
            <span>TOUCH</span>
          </TouchTarget>
          <TouchTarget onClick={handleSit} style={btnStyle}>
            <Icon name="user" size={12} />
            <span>SIT ON OBJECT</span>
          </TouchTarget>
        </div>

        <TouchTarget
          onClick={() => setPayDialogOpen(true)}
          style={{
            ...btnStyle,
            background: '#0284c7',
            color: '#ffffff',
            border: '1px solid #0284c7',
          }}
        >
          <Icon name="banknote" size={12} />
          <span>PAY OBJECT</span>
        </TouchTarget>
      </div>

      <CollapsibleSystemDetails summary="Developer Details" ariaLabel="Developer Details">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '100px 1fr',
            gap: '4px',
            fontSize: '10px',
            color: V.ink2,
            marginBottom: '8px',
          }}
        >
          <span>UUID:</span>
          <span style={{ color: V.ink, wordBreak: 'break-all', fontFamily: 'monospace' }}>
            {uuidStr}
          </span>
        </div>

        <div
          style={{
            fontWeight: 700,
            fontSize: '10px',
            color: V.ink2,
            letterSpacing: '0.08em',
            marginBottom: '6px',
            textTransform: 'uppercase',
          }}
        >
          Object Actions & Properties
        </div>

        <div style={{ fontSize: '10px', color: V.ink2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Raycast Pickable:</span>
            <span style={{ color: V.ok, fontWeight: 700 }}>YES</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Material Type:</span>
            <span style={{ color: V.ink }}>{selection.material || 'Default Wood/Stone'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Physics Shape:</span>
            <span style={{ color: V.ink }}>{selection.physics || 'Convex Hull'}</span>
          </div>
        </div>
      </CollapsibleSystemDetails>

      {/* Confirmation Dialog when Closing or Deselecting with Unsaved Changes */}
      {confirmDialog.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              background: V.bg,
              border: `1px solid ${V.pri}`,
              borderRadius: V.rs,
              padding: '14px',
              width: '100%',
              maxWidth: '260px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            }}
          >
            <h3
              id="confirm-dialog-title"
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: V.ink,
                marginTop: 0,
                marginBottom: '6px',
              }}
            >
              Save or Discard changes?
            </h3>
            <p style={{ fontSize: '10px', color: V.ink2, margin: '0 0 12px 0', lineHeight: 1.4 }}>
              You have uncommitted modifications. Would you like to save or discard them before
              deselecting?
            </p>
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleConfirmSave}
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  border: 0,
                  borderRadius: V.rs,
                  padding: '4px 10px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 0,
                  borderRadius: V.rs,
                  padding: '4px 10px',
                  fontSize: '10px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                style={{
                  background: 'transparent',
                  color: V.ink2,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  padding: '4px 8px',
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <PayDialog
        isOpen={payDialogOpen}
        onClose={() => setPayDialogOpen(false)}
        target={{
          id: selection.id || selection.uuid || '',
          name: selection.name || selection.id || 'Simulator object',
          type: 'object',
          sellerName: selection.owner || selection.seller || selection.ownerName || null,
          price:
            typeof selection.price === 'number'
              ? selection.price
              : typeof selection.itemPrice === 'number'
                ? selection.itemPrice
                : null,
        }}
      />
    </div>
  );
};

export default ObjectInspector;
