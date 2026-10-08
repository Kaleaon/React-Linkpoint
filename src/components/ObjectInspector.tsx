import React, { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import Icon from './Icon.jsx';
import TouchTarget from './TouchTarget';

export interface ObjectInspectorProps {
  style?: React.CSSProperties;
  className?: string;
}

export const ObjectInspector: React.FC<ObjectInspectorProps> = ({ style, className }) => {
  const { V, t } = useTheme();
  const [selection, setSelection] = useState<any>(() => app.world.selectedObject);
  const [objects, setObjects] = useState<any[]>(() => app.world.objects || []);
  const [nearbyUsers, setNearbyUsers] = useState<any[]>(() => app.world.nearbyUsers || []);

  useEffect(() => {
    let active = true;

    const handleSelection = (obj: any) => {
      if (active) setSelection(obj);
    };

    const handleObjects = (objs: any[]) => {
      if (active) setObjects([...objs]);
    };

    const handleNearby = (users: any[]) => {
      if (active) setNearbyUsers([...users]);
    };

    app.world.on('selection_changed', handleSelection);
    app.world.on('objects_changed', handleObjects);
    app.world.on('nearby_changed', handleNearby);

    return () => {
      active = false;
      app.world.off('selection_changed', handleSelection);
      app.world.off('objects_changed', handleObjects);
      app.world.off('nearby_changed', handleNearby);
    };
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

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
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
            Click an object or avatar in the 3D viewport canvas or pick one from the list below to inspect properties.
          </p>
        </div>

        <div style={{ fontWeight: 700, fontSize: '10px', color: V.ink2, letterSpacing: '0.08em', marginBottom: '6px', textTransform: 'uppercase' }}>
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
                onClick={() => handleSelectObject(item)}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                  <Icon name={item.isAvatar ? 'user' : 'box'} size={12} color={V.pri} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
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

  const name = selection.name || selection.id || 'Simulator object';
  const typeStr = selection.shape || (selection.avatar || selection.isAvatar ? 'Avatar' : 'Primitive');
  const posStr = Array.isArray(selection.position)
    ? selection.position.map((n: number) => Number(n).toFixed(1)).join(', ')
    : selection.x != null
    ? `${Number(selection.x).toFixed(1)}, ${Number(selection.y).toFixed(1)}, ${Number(selection.z).toFixed(1)}`
    : '—';
  const scaleStr = Array.isArray(selection.scale)
    ? selection.scale.map((n: number) => Number(n).toFixed(2)).join(', ')
    : '—';
  const distStr = selection.distance != null ? `${Number(selection.distance).toFixed(1)} m` : '—';
  const uuidStr = selection.id || selection.uuid || 'N/A';

  return (
    <div className={className} style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon name="box" size={14} color={V.pri} />
          <strong style={{ fontSize: '12px', color: V.pri, letterSpacing: '0.05em' }}>
            OBJECT INSPECTOR
          </strong>
        </div>
        <button
          type="button"
          onClick={handleDeselect}
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

      <div style={cardStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: V.ink, marginBottom: '2px' }}>
          {name}
        </div>
        <div style={{ color: V.pri, fontSize: '10px', fontWeight: 600, marginBottom: '8px' }}>
          {typeStr} · Distance: {distStr}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px', fontSize: '10px', color: V.ink2 }}>
          <span>UUID:</span>
          <span style={{ color: V.ink, wordBreak: 'break-all', fontFamily: 'monospace' }}>{uuidStr}</span>

          <span>Position:</span>
          <span style={{ color: V.ink, fontFamily: 'monospace' }}>{posStr}</span>

          <span>Scale:</span>
          <span style={{ color: V.ink, fontFamily: 'monospace' }}>{scaleStr}</span>

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
      </div>

      <div style={{ fontWeight: 700, fontSize: '10px', color: V.ink2, letterSpacing: '0.08em', marginBottom: '6px', textTransform: 'uppercase' }}>
        Object Actions & Properties
      </div>

      <div style={{ ...cardStyle, fontSize: '10px', color: V.ink2 }}>
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
    </div>
  );
};

export default ObjectInspector;
