import React, { useCallback, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Hand, Layers, Lock, Video, X } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { icon } from '../ui/icons';
import { merge } from '../ui/styles';
import { useViewer } from '../viewer/ViewerContext';
import { AGENT_POSITION, CURRENT_REGION, DEFAULT_DOCK, DOCK_BUTTONS, HUDS, HUD_DEFAULT, TARGETS } from '../data/slData';
import { positionLabel } from '../data/slTypes';
import { RLV_REDACTED, useRlv } from '../viewer/RlvContext';

/**
 * The in-world view.
 *
 * Touch viewers cannot spare the screen for a desktop control set, so this
 * follows the Lumiya model: drag anywhere to look, a movement cross for
 * translation, a camera-mode button at its centre, a customisable button dock,
 * and worn HUDs the resident can show, hide and drag to a new spot.
 */

type CameraMode = 'ORBIT' | 'MOUSELOOK' | 'FRONT';

const MOVE_PAD: { key: string; icon: typeof ChevronUp | null; label: string }[] = [
  { key: '', icon: null, label: '' },
  { key: 'fwd', icon: ChevronUp, label: 'Forward' },
  { key: '', icon: null, label: '' },
  { key: 'left', icon: ChevronLeft, label: 'Step left' },
  { key: 'cam', icon: Video, label: 'Camera mode' },
  { key: 'right', icon: ChevronRight, label: 'Step right' },
  { key: '', icon: null, label: '' },
  { key: 'back', icon: ChevronDown, label: 'Back' },
  { key: '', icon: null, label: '' },
];

/** The pad's outer cells round off, so the cross reads as one control. */
const PAD_RADIUS: Record<number, string> = { 1: '50% 50% 0 0', 3: '50% 0 0 50%', 5: '0 50% 50% 0', 7: '0 0 50% 50%' };

const HUD_CELLS: Record<string, number> = { row: 6, grid: 9, list: 4, bar: 3, pad: 4 };
const HUD_COLUMNS: Record<string, number> = { row: 6, grid: 3, list: 1, bar: 3, pad: 2 };

const WorldScreen: React.FC = () => {
  const t = useTheme();
  const { drawDistance } = useViewer();
  const rlv = useRlv();
  const hideLoc = rlv.restricted('showloc');
  // A HUD held by @detach=n cannot be closed from its own chrome.
  const detachBlocked = rlv.restricted('detach');

  const [heading, setHeading] = useState(214);
  const [pitch, setPitch] = useState(0);
  const [camera, setCamera] = useState<CameraMode>('ORBIT');
  const [held, setHeld] = useState('');
  const [running, setRunning] = useState(false);
  const [flying, setFlying] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({ ao: true });
  const [notice, setNotice] = useState('');
  const [hudOn, setHudOn] = useState<Record<string, boolean>>({ ...HUD_DEFAULT });
  const [hudPos, setHudPos] = useState<Record<string, { x: number; y: number }>>({});
  const [hudPicker, setHudPicker] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [targetPicker, setTargetPicker] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2200);
  }, []);

  /** Drag anywhere on the scene to look around — heading wraps, pitch clamps. */
  const lookDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-look]')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const h0 = heading;
    const p0 = pitch;
    const move = (ev: PointerEvent) => {
      setHeading((((h0 + (ev.clientX - startX) * 0.4) % 360) + 360) % 360);
      setPitch(Math.max(-60, Math.min(60, p0 - (ev.clientY - startY) * 0.25)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Drag a visible HUD to reposition it, the way Lumiya allows. */
  const hudDrag = (id: string, e: React.PointerEvent) => {
    const hud = HUDS.find((h) => h.id === id);
    const start = hudPos[id] || { x: hud?.x ?? 12, y: hud?.y ?? 90 };
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) =>
      setHudPos((p) => ({ ...p, [id]: { x: start.x + (ev.clientX - sx), y: start.y + (ev.clientY - sy) } }));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
    e.stopPropagation();
  };

  const pressDock = (key: string) => {
    const b = DOCK_BUTTONS[key];
    if (!b) return;
    // A control the region forbids says so, rather than silently doing nothing.
    if (b.blockedReason) {
      flash(`DENIED — ${b.blockedReason}`);
      return;
    }
    if (b.toggle) {
      setToggles((s) => ({ ...s, [key]: !s[key] }));
      if (key === 'fly') setFlying((f) => !f);
      flash(`${b.label} — ${!toggles[key] ? 'ON' : 'OFF'}`);
      return;
    }
    flash(`${b.label} — ACKNOWLEDGED`);
  };

  const selectedTarget = TARGETS.find((x) => x.id === target) || null;

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', background: t.v.bg }} onPointerDown={lookDrag}>
      {/* The scene. The horizon is painted from the palette's sky and ground
          tokens, so every skin gets a world that belongs to it. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(${t.v.sky1} 0%, ${t.v.sky2} ${48 + pitch * 0.3}%, ${t.v.gnd} ${48 + pitch * 0.3}%, ${t.v.gnd2} 100%)`,
        }}
      />

      {/* Ground grid, shifted by heading so dragging to look actually reads. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${48 + pitch * 0.3}%`,
          bottom: 0,
          opacity: 0.32,
          backgroundImage: `linear-gradient(${t.v.outv} 1px, transparent 1px), linear-gradient(90deg, ${t.v.outv} 1px, transparent 1px)`,
          backgroundSize: '48px 28px',
          backgroundPosition: `${-heading * 1.6}px 0`,
        }}
      />

      {/* Location strip: region, position, heading and draw distance — the
          minimum a viewer must keep on screen while in world. */}
      <div
        data-no-look
        style={{
          position: 'absolute',
          left: '12px',
          right: '12px',
          top: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 10px',
          borderRadius: t.v.rs,
          background: t.light ? 'rgba(255,255,255,.76)' : 'rgba(0,0,0,.42)',
          border: `1px solid ${t.v.outv}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 11px/1.2 ${t.dfont}`, letterSpacing: t.v.tls, color: t.v.ink }}>
            {hideLoc ? RLV_REDACTED : CURRENT_REGION.name}
          </div>
          <div style={{ font: `400 9.5px/1.3 ${t.font}`, color: t.v.ink2, marginTop: '2px' }}>
            {hideLoc ? 'location restricted' : positionLabel(AGENT_POSITION.x, AGENT_POSITION.y, AGENT_POSITION.z)} · {Math.round(heading)}° · draw{' '}
            {drawDistance}m
          </div>
        </div>
        <span style={{ font: `600 9px/1 ${t.dfont}`, letterSpacing: '.16em', color: t.v.pri, flex: 'none' }}>{camera}</span>
      </div>

      {/* Worn HUDs paint over the scene and can be dragged anywhere. */}
      {HUDS.filter((h) => hudOn[h.id]).map((h) => {
        const p = hudPos[h.id] || { x: h.x, y: h.y };
        const cells = HUD_CELLS[h.kind] ?? 4;
        return (
          <div
            key={h.id}
            data-no-look
            onPointerDown={(e) => hudDrag(h.id, e)}
            style={{
              position: 'absolute',
              left: `${p.x}px`,
              top: `${p.y}px`,
              width: `${h.w}px`,
              zIndex: 6,
              background: t.light ? 'rgba(255,255,255,.62)' : 'rgba(0,0,0,.34)',
              border: `1px solid ${t.v.pri}`,
              borderRadius: t.v.rs,
              boxShadow: '0 6px 20px rgba(0,0,0,.5)',
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 5px', background: t.v.pri, color: t.v.onpri }}>
              <span style={{ flex: 1, font: `600 8.5px/1 ${t.dfont}`, letterSpacing: '.1em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {h.name}
              </span>
              {detachBlocked ? (
                <Lock size={10} strokeWidth={2.6} style={{ color: t.v.onpri }} />
              ) : (
                <button
                  type="button"
                  aria-label={`Hide ${h.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setHudOn((s) => ({ ...s, [h.id]: false }));
                  }}
                  style={{ border: 'none', background: 'transparent', color: t.v.onpri, cursor: 'pointer', padding: 0, display: 'flex' }}
                >
                  <X size={11} strokeWidth={2.6} />
                </button>
              )}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${HUD_COLUMNS[h.kind] ?? 2},1fr)`,
                gap: '3px',
                padding: '5px',
                height: `${h.h - 26}px`,
              }}
            >
              {Array.from({ length: cells }, (_, i) => (
                <span key={i} style={{ background: i === 0 ? t.v.pri : t.v.surf2, opacity: i === 0 ? 0.95 : 0.75, border: `1px solid ${t.v.outv}` }} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Transient acknowledgement for a dock press. */}
      {notice && (
        <div
          data-no-look
          style={{
            position: 'absolute',
            left: '50%',
            top: '64px',
            transform: 'translateX(-50%)',
            padding: '7px 13px',
            borderRadius: t.v.rs,
            background: t.v.surf,
            border: `1px solid ${notice.startsWith('DENIED') ? t.v.err : t.v.pri}`,
            color: notice.startsWith('DENIED') ? t.v.err : t.v.ink,
            font: `600 10px/1 ${t.dfont}`,
            letterSpacing: '.14em',
            whiteSpace: 'nowrap',
            zIndex: 8,
          }}
        >
          {notice}
        </div>
      )}

      {/* Everything that sits along the bottom lives in one column. These used
          to be positioned independently, which let the movement pad and the
          button dock land on top of each other at phone heights. */}
      <div
        data-no-look
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '0 12px 16px',
          zIndex: 5,
          pointerEvents: 'none',
        }}
      >
      {/* Selected target: what a touch, sit or pay would act on. */}
      {selectedTarget && (
        <div
          style={{
            pointerEvents: 'auto',
            padding: '9px 11px',
            borderRadius: t.v.rs,
            background: t.v.surf,
            border: `1px solid ${t.v.pri}`,
          }}
        >
          <div style={{ font: `500 12.5px/1.2 ${t.font}`, color: t.v.ink }}>{selectedTarget.name}</div>
          <div style={{ font: `400 10px/1.3 ${t.font}`, color: t.v.ink2, marginTop: '3px' }}>{selectedTarget.meta}</div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '9px' }}>
            {(selectedTarget.kind === 'avatar' ? ['PROFILE', 'IM', 'PAY'] : ['TOUCH', 'SIT', 'PAY', 'EDIT']).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => flash(`${a} — ${selectedTarget.name}`)}
                style={{
                  flex: 1,
                  minHeight: '38px',
                  border: `1px solid ${t.v.outv}`,
                  borderRadius: t.v.rs,
                  background: 'transparent',
                  color: t.v.ink,
                  font: `700 9.5px/1 ${t.font}`,
                  letterSpacing: '.14em',
                  cursor: 'pointer',
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The customisable button dock. Scrolls sideways when the resident has
          docked more buttons than the width can hold. */}
      <div style={{ pointerEvents: 'auto', display: 'flex', gap: '5px', overflowX: 'auto', flex: 'none' }}>
        {DEFAULT_DOCK.map((key) => {
          const b = DOCK_BUTTONS[key];
          const Icon = icon(b.icon);
          const on = !!toggles[key];
          return (
            <button
              key={key}
              type="button"
              aria-pressed={b.toggle ? on : undefined}
              onClick={() => pressDock(key)}
              style={{
                flex: 'none',
                minWidth: '52px',
                height: '46px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                borderRadius: t.v.rs,
                border: `1px solid ${on ? t.v.pri : t.v.outv}`,
                background: on ? t.v.priC : t.light ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.4)',
                color: on ? t.v.onpriC : t.v.ink,
                cursor: 'pointer',
              }}
            >
              <Icon size={15} strokeWidth={1.8} />
              <span style={{ font: `600 7.5px/1 ${t.dfont}`, letterSpacing: '.1em' }}>{b.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flex: 'none' }}>
      {/* Movement cross, with the camera mode at its centre. */}
      <div style={{ pointerEvents: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,46px)', gridTemplateRows: 'repeat(3,46px)', gap: '4px' }}>
          {MOVE_PAD.map((cell, i) => {
            if (!cell.key) return <span key={i} />;
            const Icon = cell.icon!;
            const isCam = cell.key === 'cam';
            const active = held === cell.key;
            return (
              <button
                key={cell.key}
                type="button"
                aria-label={cell.label}
                onPointerDown={() => !isCam && setHeld(cell.key)}
                onPointerUp={() => setHeld('')}
                onPointerLeave={() => setHeld('')}
                onClick={() => isCam && setCamera((c) => (c === 'ORBIT' ? 'MOUSELOOK' : c === 'MOUSELOOK' ? 'FRONT' : 'ORBIT'))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: PAD_RADIUS[i] || t.v.rs,
                  border: `1px solid ${active || isCam ? t.v.pri : t.v.outv}`,
                  background: active ? t.v.pri : isCam ? t.v.priC : t.light ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.4)',
                  color: active ? t.v.onpri : isCam ? t.v.onpriC : t.v.ink,
                }}
              >
                <Icon size={18} strokeWidth={2} />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-pressed={running}
          onClick={() => {
            setRunning((r) => !r);
            flash(`RUN — ${!running ? 'ON' : 'OFF'}`);
          }}
          style={{
            marginTop: '5px',
            width: '100%',
            minHeight: '34px',
            borderRadius: t.v.rs,
            border: `1px solid ${running ? t.v.pri : t.v.outv}`,
            background: running ? t.v.priC : 'transparent',
            color: running ? t.v.onpriC : t.v.ink2,
            font: `700 9px/1 ${t.dfont}`,
            letterSpacing: '.18em',
            cursor: 'pointer',
          }}
        >
          {flying ? 'FLYING' : running ? 'RUNNING' : 'WALK'}
        </button>
      </div>

      {/* Right-hand stack: touch, HUD picker and target picker. */}
      <div style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {[
          { icon: Hand, label: 'Touch', act: () => flash('TOUCH — aim at an object') },
          { icon: Layers, label: 'Worn HUDs', act: () => setHudPicker(true) },
          { icon: Video, label: 'Select target', act: () => setTargetPicker(true) },
        ].map(({ icon: Icon, label, act }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={act}
            style={{
              width: '46px',
              height: '46px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: t.v.rs,
              border: `1px solid ${t.v.outv}`,
              background: t.light ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.4)',
              color: t.v.ink,
              cursor: 'pointer',
            }}
          >
            <Icon size={18} strokeWidth={1.8} />
          </button>
        ))}
      </div>
      </div>
      </div>

      {hudPicker && (
        <Sheet
          title="WORN HUDS"
          subtitle={
            detachBlocked
              ? 'Locked by RLV — worn attachments cannot be changed right now.'
              : 'Pick which attachments paint over the view. Drag a panel to move it.'
          }
          onClose={() => setHudPicker(false)}
        >
          {HUDS.map((h) => {
            const on = !!hudOn[h.id];
            return (
              <button
                key={h.id}
                type="button"
                disabled={detachBlocked}
                onClick={() => !detachBlocked && setHudOn((s) => ({ ...s, [h.id]: !s[h.id] }))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '11px',
                  minHeight: '48px',
                  padding: '0 2px',
                  cursor: 'pointer',
                  border: 'none',
                  borderBottom: `1px solid ${t.v.outv}`,
                  background: 'transparent',
                  color: on ? t.v.ink : t.v.ink2,
                  textAlign: 'left',
                }}
              >
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    flex: 'none',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${on ? t.v.pri : t.v.outv}`,
                    background: on ? t.v.pri : 'transparent',
                    color: t.v.onpri,
                    font: `700 12px/1 ${t.font}`,
                  }}
                >
                  {on ? '✓' : ''}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', font: `400 13px/1.2 ${t.font}` }}>{h.name}</span>
                  <span style={{ display: 'block', font: `400 10px/1.3 ${t.font}`, color: t.v.ink2, marginTop: '2px' }}>
                    {h.attach} · {h.w}×{h.h}px
                  </span>
                </span>
              </button>
            );
          })}
        </Sheet>
      )}

      {targetPicker && (
        <Sheet title="SELECT TARGET" subtitle="What a touch, sit or pay acts on." onClose={() => setTargetPicker(false)}>
          {TARGETS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setTarget(x.id);
                setTargetPicker(false);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
                minHeight: '48px',
                padding: '9px 2px',
                cursor: 'pointer',
                border: 'none',
                borderBottom: `1px solid ${t.v.outv}`,
                background: 'transparent',
                textAlign: 'left',
              }}
            >
              <span style={{ font: `400 13px/1.2 ${t.font}`, color: t.v.ink }}>{x.name}</span>
              <span style={{ font: `400 10px/1.3 ${t.font}`, color: t.v.ink2 }}>{x.meta}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setTarget(null);
              setTargetPicker(false);
            }}
            style={{
              marginTop: '10px',
              minHeight: '44px',
              border: `1px solid ${t.v.outv}`,
              borderRadius: t.v.rs,
              background: 'transparent',
              color: t.v.ink2,
              font: `700 10px/1 ${t.font}`,
              letterSpacing: '.16em',
              cursor: 'pointer',
            }}
          >
            CLEAR SELECTION
          </button>
        </Sheet>
      )}
    </div>
  );
};

/** A bottom sheet, used for the in-world pickers. */
const Sheet: React.FC<{ title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }> = ({
  title,
  subtitle,
  onClose,
  children,
}) => {
  const t = useTheme();
  return (
    <div
      data-no-look
      onClick={onClose}
      style={merge({
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        background: t.light ? 'rgba(20,24,28,.38)' : 'rgba(0,0,0,.58)',
        display: 'flex',
        alignItems: 'flex-end',
      })}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '78%',
          overflowY: 'auto',
          padding: '14px 16px 18px',
          boxSizing: 'border-box',
          background: t.v.surf,
          borderTop: `1px solid ${t.v.outv}`,
          borderRadius: `${t.v.rl} ${t.v.rl} 0 0`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ font: `700 11px/1 ${t.dfont}`, letterSpacing: '.2em', color: t.v.pri }}>{title}</div>
            {subtitle && <div style={{ font: `400 10.5px/1.5 ${t.font}`, color: t.v.ink2, marginTop: '6px' }}>{subtitle}</div>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'transparent', color: t.v.ink2, cursor: 'pointer', display: 'flex' }}>
            <X size={17} strokeWidth={2.2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default WorldScreen;
