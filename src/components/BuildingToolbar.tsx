import React, { useState, useEffect, useId } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import Icon from './Icon.jsx';
import TouchTarget from './TouchTarget';

export const PRIM_SHAPES = [
  { id: 'box', label: 'Box', icon: 'box' },
  { id: 'cylinder', label: 'Cylinder', icon: 'cylinder' },
  { id: 'prism', label: 'Prism', icon: 'pyramid' },
  { id: 'sphere', label: 'Sphere', icon: 'circle' },
  { id: 'torus', label: 'Torus', icon: 'circle-dot' },
  { id: 'tube', label: 'Tube', icon: 'square' },
  { id: 'ring', label: 'Ring', icon: 'disc' },
] as const;

export type PrimShapeType = (typeof PRIM_SHAPES)[number]['id'];

export interface BuildingToolbarProps {
  selectedObject?: any;
  selectedObjects?: any[];
  onRez?: (shape: PrimShapeType, pos?: number[]) => void | Promise<any>;
  onLink?: (objectLocalIds: number[]) => void | Promise<any>;
  onDelink?: (objectLocalIds: number[]) => void | Promise<any>;
  onDerez?: (objectLocalIds: number[]) => void | Promise<any>;
  onUpdateShape?: (params: any) => void | Promise<any>;
  compact?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const BuildingToolbar: React.FC<BuildingToolbarProps> = ({
  selectedObject: propSelectedObject,
  selectedObjects: propSelectedObjects,
  onRez,
  onLink,
  onDelink,
  onDerez,
  onUpdateShape,
  compact = false,
  style,
  className,
}) => {
  const { V, t } = useTheme();
  const shapeSelectId = useId();
  const [selectedShape, setSelectedShape] = useState<PrimShapeType>('box');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<'create' | 'edit' | 'linkset'>('create');

  // Local object selection tracking if not supplied via props
  const [currentObject, setCurrentObject] = useState<any>(
    () => propSelectedObject || app.world.selectedObject,
  );
  const [selectedList, setSelectedList] = useState<any[]>(() => {
    if (propSelectedObjects && propSelectedObjects.length > 0) return propSelectedObjects;
    const selectedSet = app.objects?.getSelectedObjects?.();
    if (selectedSet && selectedSet.size > 0) {
      return Array.from(selectedSet).map((id) => ({
        id,
        localId: Number(id) || app.world.objects.find((o) => o.id === id)?.localId,
      }));
    }
    return propSelectedObject || app.world.selectedObject
      ? [propSelectedObject || app.world.selectedObject]
      : [];
  });

  // Shape editor parameter state
  const [scaleX, setScaleX] = useState<number>(0.5);
  const [scaleY, setScaleY] = useState<number>(0.5);
  const [scaleZ, setScaleZ] = useState<number>(0.5);
  const [pathBegin, setPathBegin] = useState<number>(0);
  const [pathEnd, setPathEnd] = useState<number>(1);
  const [profileHollow, setProfileHollow] = useState<number>(0);
  const [pathTwist, setPathTwist] = useState<number>(0);

  useEffect(() => {
    if (propSelectedObject !== undefined) {
      setCurrentObject(propSelectedObject);
    }
  }, [propSelectedObject]);

  useEffect(() => {
    if (propSelectedObjects !== undefined) {
      setSelectedList(propSelectedObjects);
    }
  }, [propSelectedObjects]);

  useEffect(() => {
    const handleSelectionChange = (obj: any) => {
      if (propSelectedObject === undefined) {
        setCurrentObject(obj);
      }
    };
    app.world.on('selection_changed', handleSelectionChange);
    return () => {
      app.world.off('selection_changed', handleSelectionChange);
    };
  }, [propSelectedObject]);

  // Synchronize shape editor state with selected object parameters
  useEffect(() => {
    if (currentObject) {
      const scale = currentObject.scale || [0.5, 0.5, 0.5];
      setScaleX(scale[0] ?? 0.5);
      setScaleY(scale[1] ?? 0.5);
      setScaleZ(scale[2] ?? 0.5);

      const shapeParams = currentObject.shapeParams || {};
      setPathBegin(shapeParams.pathBegin ?? 0);
      setPathEnd(shapeParams.pathEnd ?? 1);
      setProfileHollow(shapeParams.profileHollow ?? 0);
      setPathTwist(shapeParams.pathTwist ?? 0);

      if (shapeParams.shape) {
        const found = PRIM_SHAPES.find((s) => s.id === String(shapeParams.shape).toLowerCase());
        if (found) setSelectedShape(found.id);
      }
    }
  }, [currentObject]);

  const showStatus = (text: string, isError = false) => {
    setStatusMessage({ text, isError });
    setTimeout(() => {
      setStatusMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const handleRez = async () => {
    try {
      setStatusMessage(null);
      // Determine rez location in front of camera or avatar
      let position = [128, 128, 25];
      if (app.world?.camera3d?.position) {
        const camPos = app.world.camera3d.position;
        position = [
          Math.round((camPos[0] + 1.5) * 100) / 100,
          Math.round((camPos[1] + 1.5) * 100) / 100,
          Math.round((camPos[2] ?? 25) * 100) / 100,
        ];
      } else if (currentObject?.position) {
        position = [
          currentObject.position[0] + 0.5,
          currentObject.position[1] + 0.5,
          currentObject.position[2],
        ];
      }

      if (onRez) {
        await onRez(selectedShape, position);
      } else {
        await app.objects.addObject({
          shape: selectedShape,
          position,
          scale: [scaleX, scaleY, scaleZ],
        });
      }
      showStatus(`Instantiated new ${selectedShape} primitive in world.`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to instantiate primitive', true);
    }
  };

  const handleLink = async () => {
    try {
      setStatusMessage(null);
      // Collect selected objects
      const targets =
        selectedList.length >= 2
          ? selectedList
          : app.objects?.getSelectedObjects?.().size >= 2
            ? Array.from(app.objects.getSelectedObjects()).map((id) => ({
                id,
                localId: Number(id) || app.world.objects.find((o) => o.id === id)?.localId,
              }))
            : [];

      if (targets.length < 2) {
        showStatus(
          'Selection Safety: Linking requires two or more selected primitives. The last selected object acts as the root parent.',
          true,
        );
        return;
      }

      const localIds = targets
        .map((o) => o.localId || Number(o.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (localIds.length < 2) {
        showStatus('Two or more valid primitive local IDs are required for linking.', true);
        return;
      }

      if (onLink) {
        await onLink(localIds);
      } else {
        await app.objects.linkObjects({ objectLocalIds: localIds });
      }
      showStatus(
        `Linked ${localIds.length} objects into linkset (Root: ${localIds[localIds.length - 1]}).`,
      );
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Linking failed', true);
    }
  };

  const handleDelink = async () => {
    try {
      setStatusMessage(null);
      const targets =
        selectedList.length > 0
          ? selectedList
          : currentObject
            ? [currentObject]
            : Array.from(app.objects?.getSelectedObjects?.() || []).map((id) => ({ id }));

      const localIds = targets
        .map((o) => o.localId || Number(o.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (localIds.length === 0) {
        showStatus('Select at least one object to delink.', true);
        return;
      }

      if (onDelink) {
        await onDelink(localIds);
      } else {
        await app.objects.delinkObjects({ objectLocalIds: localIds });
      }
      showStatus(`Delinked ${localIds.length} object(s).`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Delinking failed', true);
    }
  };

  const handleDerez = async () => {
    try {
      setStatusMessage(null);
      const localId = currentObject?.localId || Number(currentObject?.id);
      if (!localId || !Number.isInteger(localId)) {
        showStatus('Select an object to derez / delete.', true);
        return;
      }

      if (onDerez) {
        await onDerez([localId]);
      } else {
        await app.objects.deleteObject({ localId });
      }
      showStatus(`Derezzed object ${localId}.`);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Derez failed', true);
    }
  };

  const handleApplyShape = async () => {
    try {
      setStatusMessage(null);
      const localId = currentObject?.localId || Number(currentObject?.id);
      if (!localId || !Number.isInteger(localId)) {
        showStatus('Select an object to update shape parameters.', true);
        return;
      }

      const params = {
        localId,
        shape: selectedShape,
        scale: [scaleX, scaleY, scaleZ],
        pathBegin,
        pathEnd,
        profileHollow,
        pathTwist,
      };

      if (onUpdateShape) {
        await onUpdateShape(params);
      } else {
        await app.objects.updatePrimParams(params);
      }
      showStatus('Primitive shape parameters updated.');
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Failed to update prim params', true);
    }
  };

  const toolbarStyle: React.CSSProperties = {
    background: V.bg,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs,
    padding: compact ? '8px' : '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    color: V.ink,
    fontFamily: t.font,
    fontSize: '11px',
    boxSizing: 'border-box',
    ...style,
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minHeight: '26px',
    padding: '3px 8px',
    background: active ? V.pri : V.surf2 || V.surf,
    color: active ? V.onpri : V.ink,
    border: `1px solid ${active ? V.pri : V.outv}`,
    borderRadius: V.rs,
    fontSize: '10px',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s ease',
  });

  const actionBtnStyle = (color?: string, bg?: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    minHeight: '30px',
    padding: '4px 10px',
    background: bg || V.surf2 || V.surf,
    color: color || V.ink,
    border: `1px solid ${bg || V.outv}`,
    borderRadius: V.rs,
    fontSize: '10px',
    fontWeight: 700,
    cursor: 'pointer',
    flex: 1,
  });

  return (
    <div
      role="toolbar"
      aria-label="Building Controls Toolbar"
      className={className}
      style={toolbarStyle}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${V.outv}`,
          paddingBottom: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon name="hammer" size={14} color={V.pri} />
          <strong
            style={{
              fontSize: '11px',
              color: V.pri,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Building Controls
          </strong>
        </div>
        {currentObject && (
          <span
            style={{
              fontSize: '9px',
              color: V.ink2,
              fontFamily: 'monospace',
              background: V.surf,
              padding: '2px 5px',
              borderRadius: '3px',
              border: `1px solid ${V.outv}`,
            }}
          >
            ID: {currentObject.localId || currentObject.id?.slice?.(0, 8) || 'Selected'}
          </span>
        )}
      </div>

      {statusMessage && (
        <div
          role="status"
          style={{
            padding: '6px 8px',
            borderRadius: V.rs,
            fontSize: '10px',
            background: statusMessage.isError ? '#ef444420' : '#22c55e20',
            border: `1px solid ${statusMessage.isError ? '#ef4444' : '#22c55e'}`,
            color: statusMessage.isError ? '#f87171' : '#4ade80',
            fontWeight: 600,
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Mode navigation */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          style={tabBtnStyle(activeTab === 'create')}
          aria-pressed={activeTab === 'create'}
        >
          REZ PRIM
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('edit')}
          style={tabBtnStyle(activeTab === 'edit')}
          aria-pressed={activeTab === 'edit'}
        >
          SHAPE PARAMS
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('linkset')}
          style={tabBtnStyle(activeTab === 'linkset')}
          aria-pressed={activeTab === 'linkset'}
        >
          LINKSET & DEREZ
        </button>
      </div>

      {/* Tab: Rez Primitive Shape */}
      {activeTab === 'create' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div>
            <div
              style={{
                fontSize: '10px',
                color: V.ink2,
                fontWeight: 600,
                marginBottom: '4px',
                textTransform: 'uppercase',
              }}
            >
              Select Primitive Shape:
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '4px',
              }}
            >
              {PRIM_SHAPES.map((shape) => {
                const isSelected = selectedShape === shape.id;
                return (
                  <button
                    key={shape.id}
                    type="button"
                    onClick={() => setSelectedShape(shape.id)}
                    aria-label={`Select ${shape.label} shape`}
                    aria-pressed={isSelected}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '6px 4px',
                      background: isSelected ? V.pri : V.surf,
                      color: isSelected ? V.onpri : V.ink,
                      border: `1px solid ${isSelected ? V.pri : V.outv}`,
                      borderRadius: V.rs,
                      fontSize: '9px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      gap: '3px',
                    }}
                  >
                    <Icon name={shape.icon} size={13} />
                    <span>{shape.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <TouchTarget
            onClick={handleRez}
            aria-label={`Rez ${selectedShape} in world`}
            style={{
              ...actionBtnStyle(V.onpri, V.pri),
              width: '100%',
              minHeight: '34px',
            }}
          >
            <Icon name="plus" size={14} />
            <span>REZ {selectedShape.toUpperCase()} IN WORLD</span>
          </TouchTarget>
        </div>
      )}

      {/* Tab: Primitive Shape Geometry Editor */}
      {activeTab === 'edit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label
              htmlFor={shapeSelectId}
              style={{ fontSize: '10px', color: V.ink2, fontWeight: 600 }}
            >
              Shape Type:
            </label>
            <select
              id={shapeSelectId}
              value={selectedShape}
              onChange={(e) => setSelectedShape(e.target.value as PrimShapeType)}
              style={{
                background: V.surf,
                color: V.ink,
                border: `1px solid ${V.outv}`,
                borderRadius: V.rs,
                fontSize: '10px',
                padding: '3px 6px',
              }}
            >
              {PRIM_SHAPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Scale Sliders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '10px', color: V.ink2, fontWeight: 600 }}>
              Scale (X, Y, Z):
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
              <div>
                <span style={{ fontSize: '9px', color: V.ink2 }}>X: {scaleX.toFixed(2)}</span>
                <input
                  type="range"
                  min="0.05"
                  max="10.0"
                  step="0.05"
                  value={scaleX}
                  aria-label="Scale X"
                  onChange={(e) => setScaleX(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '9px', color: V.ink2 }}>Y: {scaleY.toFixed(2)}</span>
                <input
                  type="range"
                  min="0.05"
                  max="10.0"
                  step="0.05"
                  value={scaleY}
                  aria-label="Scale Y"
                  onChange={(e) => setScaleY(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <span style={{ fontSize: '9px', color: V.ink2 }}>Z: {scaleZ.toFixed(2)}</span>
                <input
                  type="range"
                  min="0.05"
                  max="10.0"
                  step="0.05"
                  value={scaleZ}
                  aria-label="Scale Z"
                  onChange={(e) => setScaleZ(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* Cut and Hollow */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <div>
              <span style={{ fontSize: '9px', color: V.ink2 }}>
                Cut End: {(pathEnd * 100).toFixed(0)}%
              </span>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={pathEnd}
                aria-label="Path Cut End"
                onChange={(e) => setPathEnd(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <span style={{ fontSize: '9px', color: V.ink2 }}>
                Hollow: {(profileHollow * 100).toFixed(0)}%
              </span>
              <input
                type="range"
                min="0.0"
                max="0.95"
                step="0.05"
                value={profileHollow}
                aria-label="Profile Hollow"
                onChange={(e) => setProfileHollow(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <TouchTarget
            onClick={handleApplyShape}
            aria-label="Apply primitive shape parameters"
            style={{
              ...actionBtnStyle(V.onpri, V.pri),
              width: '100%',
              minHeight: '32px',
            }}
          >
            <Icon name="check" size={12} />
            <span>APPLY SHAPE PARAMETERS</span>
          </TouchTarget>
        </div>
      )}

      {/* Tab: Linksets & Derez */}
      {activeTab === 'linkset' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '10px', color: V.ink2, lineHeight: '1.3' }}>
            Select primitives to link into a linkset. Standard SL semantics make the last selected
            object the root parent.
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <TouchTarget
              onClick={handleLink}
              aria-label="Link selected primitives into linkset"
              style={{
                ...actionBtnStyle(V.onpri, '#0284c7'),
              }}
            >
              <Icon name="link" size={12} />
              <span>LINK PRIMITIVES</span>
            </TouchTarget>

            <TouchTarget
              onClick={handleDelink}
              aria-label="Delink selected primitives"
              style={{
                ...actionBtnStyle(V.ink, V.surf2 || V.surf),
              }}
            >
              <Icon name="unlink" size={12} />
              <span>DELINK</span>
            </TouchTarget>
          </div>

          <div style={{ borderTop: `1px solid ${V.outv}`, paddingTop: '6px', marginTop: '2px' }}>
            <TouchTarget
              onClick={handleDerez}
              aria-label="Derez selected object"
              style={{
                ...actionBtnStyle('#ffffff', '#dc2626'),
                width: '100%',
                minHeight: '32px',
              }}
            >
              <Icon name="trash-2" size={12} />
              <span>DEREZ SELECTED OBJECT</span>
            </TouchTarget>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuildingToolbar;
