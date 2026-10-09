import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { DIALOGS } from '../theme/dialogs.js';
import { app } from '../linkpoint/app';
import Icon from './Icon.jsx';
import FocusTrap from './FocusTrap.jsx';

// Ported from the `dialog` computation + its <sc-if> block — the 6 SL
// "system moment" sheets (llDialog, Permissions, Inventory offer, Teleport
// lure, Pay L$, Region restart), extended with teleport session phase state machine.
export default function SystemDialog() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();
  const [teleport, setTeleport] = useState(() => app.interactions.teleportSession);

  useEffect(() => {
    const onUpdate = () => {
      setTeleport(app.interactions.teleportSession);
    };
    app.interactions.on('interactions_changed', onUpdate);
    app.interactions.on('interaction_changed', onUpdate);
    setTeleport(app.interactions.teleportSession);
    return () => {
      app.interactions.off('interactions_changed', onUpdate);
      app.interactions.off('interaction_changed', onUpdate);
    };
  }, []);

  const dlg = state.dialog && DIALOGS[state.dialog];

  const btnBase = {
    flex: '1 1 40%',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: V.outv,
    borderRadius: V.rs,
    font: '700 11px/1 ' + t.font,
    letterSpacing: '.12em',
    color: V.ink,
    textAlign: 'center',
    padding: '0 12px',
    cursor: 'pointer',
    background: 'transparent',
  };

  // 1. Teleport Session Modal Sheet (High Priority System Moment)
  if (teleport) {
    const isFailed = teleport.phase === 'failed';
    const percent = teleport.stepPercent ?? 0;
    const stages = [
      { key: 'initiating', label: 'Resolve', minPercent: 15, icon: 'map-pin' },
      { key: 'contacting', label: 'Contact', minPercent: 40, icon: 'radio' },
      { key: 'preparing', label: 'Prepare', minPercent: 65, icon: 'file-text' },
      { key: 'arriving', label: 'Arrive', minPercent: 90, icon: 'compass' },
    ];

    const retryDestination = () => {
      if (teleport.destination) {
        void app.protocol.teleportTo(teleport.destination);
      }
    };

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 90,
          background: 'rgba(0,0,0,.68)',
          display: 'flex',
          alignItems: 'flex-end',
        }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="teleport-sheet-title"
          style={{
            width: '100%',
            background: V.surf,
            borderTop: '2px solid ' + (isFailed ? V.err : V.pri),
            borderRadius: V.rl + ' ' + V.rl + ' 0 0',
            padding: '18px 16px 22px',
            maxHeight: '86%',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
            <Icon
              name={isFailed ? 'alert-triangle' : 'compass'}
              size={18}
              style={{ color: isFailed ? V.err : V.pri }}
            />
            <span
              style={{
                flex: 1,
                font: '600 12px/1 ' + t.font,
                letterSpacing: '.2em',
                color: isFailed ? V.err : V.pri,
              }}
            >
              {isFailed ? 'TELEPORT FAILED' : 'TELEPORTING'}
            </span>
            <span
              onClick={() => app.interactions.cancelTeleportSession()}
              style={{ font: '400 11px/1 ' + t.font, color: V.ink2, cursor: 'pointer' }}
            >
              CANCEL
            </span>
          </div>

          <div id="teleport-sheet-title" style={{ font: '600 15px/1.35 ' + t.font, color: V.ink }}>
            {teleport.regionName || teleport.destination || 'Destination'}
          </div>

          {/* Progress Bar & Percentage */}
          <div style={{ marginTop: '12px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <span style={{ font: '500 12px/1 ' + t.font, color: V.ink2 }}>
                {teleport.statusText || 'Teleport in progress...'}
              </span>
              <span style={{ font: '700 12px/1 ' + t.font, color: isFailed ? V.err : V.pri }}>
                {percent}%
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: V.bg,
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid ' + V.outv,
              }}
            >
              <div
                style={{
                  width: `${percent}%`,
                  height: '100%',
                  background: isFailed ? V.err : V.pri,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Phase Milestones */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
              marginTop: '14px',
              textAlign: 'center',
            }}
          >
            {stages.map((st) => {
              const reached = percent >= st.minPercent;
              return (
                <div
                  key={st.key}
                  style={{
                    padding: '6px 2px',
                    borderRadius: V.rs,
                    border: '1px solid ' + (reached ? V.pri : V.outv),
                    background: reached ? V.surf : V.bg,
                    opacity: reached ? 1 : 0.5,
                  }}
                >
                  <Icon
                    name={st.icon}
                    size={14}
                    style={{ color: reached ? V.pri : V.ink2, margin: '0 auto 4px' }}
                  />
                  <div style={{ font: '600 10px/1 ' + t.font, color: reached ? V.ink : V.ink2 }}>
                    {st.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error Details */}
          {isFailed && teleport.error ? (
            <div
              role="alert"
              style={{
                marginTop: '12px',
                padding: '10px',
                borderRadius: V.rs,
                border: '1px solid ' + V.err,
                background: 'rgba(239, 68, 68, 0.1)',
                color: V.err,
                font: '500 12px/1.4 ' + t.font,
              }}
            >
              {teleport.error}
            </div>
          ) : null}

          {/* Action Controls */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
            {isFailed ? (
              <button
                type="button"
                onClick={retryDestination}
                style={{ ...btnBase, background: V.pri, color: V.onpri, borderColor: V.pri }}
              >
                RETRY
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => app.interactions.retryHomeTeleport()}
              style={{ ...btnBase, color: V.ink }}
            >
              RETRY HOME
            </button>
            <button
              type="button"
              onClick={() => app.interactions.cancelTeleportSession()}
              style={{ ...btnBase, color: V.ink2 }}
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Standard System Moment Sheet
  if (!dlg) return null;

  return (
    <FocusTrap
      active={true}
      onEscape={() => actions.setDialog(null)}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9,
        background: 'rgba(0,0,0,.62)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-dialog-title"
        aria-describedby="system-dialog-body"
        style={{
          width: '100%',
          background: V.surf,
          borderTop: '1px solid ' + V.pri,
          borderRadius: V.rl + ' ' + V.rl + ' 0 0',
          padding: '18px 16px 22px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
          <Icon name={dlg.icon} size={18} style={{ color: V.pri }} />
          <span
            style={{ flex: 1, font: '600 12px/1 ' + t.font, letterSpacing: '.2em', color: V.pri }}
          >
            {dlg.kind}
          </span>
          <button
            type="button"
            onClick={() => actions.setDialog(null)}
            aria-label="Close dialog"
            style={{
              font: '400 11px/1 ' + t.font,
              color: V.ink2,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            CLOSE
          </button>
        </div>
        <div id="system-dialog-title" style={{ font: '600 15px/1.35 ' + t.font, color: V.ink }}>
          {dlg.title}
        </div>
        <div
          id="system-dialog-body"
          style={{ font: '400 12.5px/1.65 ' + t.font, color: V.ink2, marginTop: '8px' }}
        >
          {dlg.body}
        </div>
        {dlg.meta ? (
          <div
            style={{
              marginTop: '10px',
              border: '1px dashed ' + V.outv,
              borderRadius: V.rs,
              padding: '9px',
              font: '400 11px/1.6 ' + t.font,
              color: V.ink2,
            }}
          >
            {dlg.meta}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
          {/* Every button closes the sheet and posts a toast — matches the
              source's current dialog.buttons mapping (index.html), not the
              older "decorative, CLOSE-only" behavior this port originally
              matched. */}
          {dlg.buttons.map((b, i) => (
            <button
              type="button"
              key={i}
              onClick={() => {
                actions.setDialog(null);
                actions.notify(dlg.title.split(' ').slice(0, 4).join(' ') + ' — ' + b.label);
              }}
              style={{
                ...btnBase,
                ...(b.primary
                  ? { background: V.pri, color: V.onpri, borderColor: V.pri }
                  : b.dim
                    ? { color: V.ink2 }
                    : null),
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </FocusTrap>
  );
}
