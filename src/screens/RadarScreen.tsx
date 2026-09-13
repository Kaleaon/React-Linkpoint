import React, { useMemo, useRef, useState } from 'react';
import { Box, CircleDot, Shield, Sparkles, User, UserRound } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { SectionLabel, ScreenTitle } from '../ui/primitives';
import { merge } from '../ui/styles';
import { useViewer } from '../viewer/ViewerContext';
import { RADAR_AVATARS, RADAR_OBJECTS } from '../data/slData';
import { CHAT_RANGE, bearingToCompass, chatBand, type RadarEntry } from '../data/slTypes';
import { RLV_REDACTED, useRlv } from '../viewer/RlvContext';

/**
 * Radar, in the shape Firestorm established: entries sorted by distance, range
 * rings drawn at the chat thresholds, per-entry actions on tap, and the full
 * moderator set behind a long press so it can never be hit by accident.
 */

const RINGS: { metres: number; label: string }[] = [
  { metres: CHAT_RANGE.whisper, label: `WHISPER ${CHAT_RANGE.whisper}m` },
  { metres: CHAT_RANGE.say, label: `CHAT ${CHAT_RANGE.say}m` },
  { metres: CHAT_RANGE.shout, label: `SHOUT ${CHAT_RANGE.shout}m` },
];

/** Square-root scale: close range stays legible while 100m still fits the scope. */
const ringRadius = (metres: number) => Math.min(84, 78 * Math.sqrt(Math.min(metres, 160) / 100));

const RadarScreen: React.FC = () => {
  const t = useTheme();
  const { drawDistance } = useViewer();
  const rlv = useRlv();
  // @shownames=n hides who is nearby without hiding that someone is: the blips
  // and distances stay, the identities do not.
  const hideNames = rlv.restricted('shownames');
  const [mode, setMode] = useState<'AV' | 'OBJ'>('AV');
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  const objects = mode === 'OBJ';
  const entries = useMemo(
    () => (objects ? RADAR_OBJECTS : RADAR_AVATARS).slice().sort((a, b) => a.distance - b.distance),
    [objects],
  );

  const inChatRange = entries.filter((e) => e.distance <= CHAT_RANGE.say).length;

  const bandTone = (metres: number) => {
    const band = chatBand(metres);
    if (band === 'WHISPER') return t.v.pri;
    if (band === 'CHAT') return t.v.ok;
    if (band === 'SHOUT') return t.v.info;
    return t.v.ink2;
  };

  const startHold = (id: string) => {
    longPressFired.current = false;
    holdTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setMenu(id);
      setOpen(null);
    }, 460);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  };
  const tap = (id: string) => {
    // A long press already acted; swallow the click it would otherwise fire.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    setOpen((o) => (o === id ? null : id));
    setMenu(null);
  };

  return (
    <>
      <ScreenTitle
        title="RADAR"
        subtitle={`> ${entries.length} ${objects ? 'objects' : 'avatars'} in region · ${inChatRange} in chat range · draw ${drawDistance}m`}
      />

      {/* Mode switch: avatars and objects are two scopes of one instrument. */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '6px', padding: '0 16px 10px' }}>
        {(['AV', 'OBJ'] as const).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setMode(m);
                setOpen(null);
                setMenu(null);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                minHeight: '44px',
                padding: '0 13px',
                cursor: 'pointer',
                font: `600 10.5px/1 ${t.dfont}`,
                letterSpacing: '.14em',
                borderRadius: t.v.rs,
                background: on ? t.v.pri : 'transparent',
                color: on ? t.ink(t.v.pri) : t.v.ink2,
                border: `1px solid ${on ? t.v.pri : t.v.outv}`,
              }}
            >
              {m === 'AV' ? 'AVATARS' : 'OBJECTS'}
            </button>
          );
        })}
        <span style={{ marginLeft: 'auto', font: `400 10px/1 ${t.font}`, color: t.v.ink2, letterSpacing: '.06em' }}>
          nearest {entries[0]?.distance ?? 0}m · {chatBand(entries[0]?.distance ?? 999).toLowerCase()}
        </span>
      </div>

      {/* The scope. Ring labels live in a fixed legend, never on the arcs: the
          outer ring leaves 8px of headroom, so a radius-anchored label clips. */}
      <div
        style={{
          flex: 'none',
          margin: '0 16px 10px',
          position: 'relative',
          height: '172px',
          overflow: 'hidden',
          border: `1px solid ${t.v.outv}`,
          borderRadius: t.v.rp,
          background: t.v.surf,
        }}
      >
        {RINGS.map((ring, i) => {
          const r = ringRadius(ring.metres);
          return (
            <div
              key={ring.metres}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: `${r * 2}px`,
                height: `${r * 2}px`,
                margin: `${-r}px 0 0 ${-r}px`,
                border: `1px solid ${i === 2 ? t.v.outv : t.v.pri}`,
                borderRadius: '50%',
                opacity: i === 2 ? 0.9 : i === 1 ? 0.45 : 0.32,
              }}
            />
          );
        })}

        {/* Your own position, dead centre. */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '7px',
            height: '7px',
            margin: '-3.5px 0 0 -3.5px',
            borderRadius: '50%',
            background: t.v.ink,
          }}
        />

        {entries.map((e) => {
          const r = ringRadius(e.distance);
          const a = (e.bearing * Math.PI) / 180;
          const selected = open === e.id || menu === e.id;
          const size = selected ? 13 : 9;
          return (
            <button
              key={e.id}
              type="button"
              aria-label={`${hideNames && e.kind === 'avatar' ? RLV_REDACTED : e.name}, ${e.distance} metres ${bearingToCompass(e.bearing)}`}
              onClick={() => tap(e.id)}
              style={{
                position: 'absolute',
                left: `calc(50% + ${(r * Math.sin(a)).toFixed(1)}px)`,
                top: `calc(50% + ${(-r * Math.cos(a)).toFixed(1)}px)`,
                width: `${size}px`,
                height: `${size}px`,
                margin: `${-size / 2}px 0 0 ${-size / 2}px`,
                padding: 0,
                borderRadius: objects ? '2px' : '50%',
                background: bandTone(e.distance),
                cursor: 'pointer',
                border: `1px solid ${t.v.bg}`,
                boxShadow: selected ? `0 0 0 3px ${t.v.outv}` : 'none',
              }}
            />
          );
        })}

        <div style={{ position: 'absolute', right: '10px', top: '9px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          {RINGS.map((ring, i) => (
            <div key={ring.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', font: `500 8px/1 ${t.font}`, letterSpacing: '.1em', color: t.v.ink2, whiteSpace: 'nowrap' }}>
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  flex: 'none',
                  borderRadius: '50%',
                  border: `1px solid ${i === 2 ? t.v.outv : t.v.pri}`,
                  opacity: i === 2 ? 0.9 : i === 1 ? 0.7 : 0.5,
                }}
              />
              {ring.label}
            </div>
          ))}
        </div>

        <div style={{ position: 'absolute', left: '10px', bottom: '8px', font: `400 9px/1 ${t.font}`, letterSpacing: '.06em', color: t.v.ink2 }}>
          N up · {objects ? 'objects' : 'avatars'} by distance
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 16px 16px' }}>
        {entries.map((e) => (
          <RadarRow
            key={e.id}
            entry={e}
            tone={bandTone(e.distance)}
            open={open === e.id}
            menu={menu === e.id}
            objects={objects}
            hideName={hideNames && e.kind === 'avatar'}
            onTap={() => tap(e.id)}
            onHoldStart={() => startHold(e.id)}
            onHoldEnd={endHold}
          />
        ))}
      </div>
    </>
  );
};

const ENTRY_ICONS = { avatar: UserRound, object: Box } as const;

const RadarRow: React.FC<{
  entry: RadarEntry;
  tone: string;
  open: boolean;
  menu: boolean;
  objects: boolean;
  hideName: boolean;
  onTap: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}> = ({ entry, tone, open, menu, objects, hideName, onTap, onHoldStart, onHoldEnd }) => {
  const t = useTheme();
  const Icon = entry.kind === 'object' ? (entry.name.includes('fountain') ? Sparkles : entry.name.includes('orb') ? Shield : Box) : entry.isFriend ? UserRound : User;

  const actions = objects ? ['INSPECT', 'TOUCH', 'DERENDER', 'TRACK'] : ['PROFILE', 'IM', 'TRACK', 'TELEPORT TO'];
  // The moderator set is destructive, so it hides behind a long press and is
  // drawn in the error tone: freeze, eject and ban are estate powers.
  const moderator = objects ? ['RETURN', 'MUTE OWNER', 'BLOCK', 'REPORT'] : ['MUTE', 'DERENDER', 'FREEZE', 'EJECT', 'BAN', 'REPORT'];

  const chip = (danger: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    minHeight: '44px',
    padding: '0 13px',
    cursor: 'pointer',
    font: `600 10px/1 ${t.dfont}`,
    letterSpacing: '.12em',
    borderRadius: t.v.rs,
    background: danger ? 'transparent' : t.v.surf2,
    color: danger ? t.v.err : t.ink(t.v.surf2),
    border: `1px solid ${danger ? t.v.err : t.v.outv}`,
    whiteSpace: 'nowrap',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: open || menu ? '0 0 8px' : 0,
        border: `1px solid ${open || menu ? tone : t.v.outv}`,
        borderRadius: t.v.rs,
        background: t.v.surf,
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: t.pad, cursor: 'pointer' }}
        onClick={onTap}
        onPointerDown={onHoldStart}
        onPointerUp={onHoldEnd}
        onPointerLeave={onHoldEnd}
      >
        <Icon size={17} style={{ color: tone, flex: 'none' }} strokeWidth={1.7} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `400 14px/1.2 ${t.font}`, color: t.v.ink, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {hideName ? RLV_REDACTED : entry.name}
            {entry.typing && <CircleDot size={11} style={{ color: t.v.pri }} />}
          </div>
          <div style={merge({ font: `400 11px/1.3 ${t.font}`, color: t.v.ink2, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
            {bearingToCompass(entry.bearing)}
            {hideName ? '' : ` · ${entry.meta}`}
          </div>
        </div>
        <span style={{ padding: '4px 8px', border: `1px solid ${tone}`, borderRadius: t.v.rs, font: `400 11px/1 ${t.font}`, color: tone, flex: 'none' }}>
          {entry.distance}m
        </span>
      </div>

      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: `0 ${t.pad}` }}>
          {actions.map((a) => (
            <button key={a} type="button" style={chip(false)}>
              {a}
            </button>
          ))}
        </div>
      )}

      {menu && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <SectionLabel style={{ padding: `0 ${t.pad}`, color: t.v.err }}>
            {objects ? 'OBJECT' : 'MODERATOR'} — LONG PRESS
          </SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: `0 ${t.pad}` }}>
            {moderator.map((a) => (
              <button key={a} type="button" style={chip(true)}>
                {a}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RadarScreen;
