import type { CSSProperties } from 'react';
import type { Theme } from '../theme/ThemeContext';

/**
 * Style builders.
 *
 * Every visual decision that varies by layout pack lives here, so a screen
 * never branches on the pack itself — it asks for "a card" and gets the box,
 * flat, soft, rule, quiet or cap treatment the current pack calls for.
 */

/** Merge style objects, ignoring nulls, without mutating the base. */
export const merge = (...parts: (CSSProperties | null | undefined | false)[]): CSSProperties =>
  Object.assign({}, ...parts.filter(Boolean));

/** Card treatment per layout pack. Each pack carries its edge differently. */
export function cardStyle(t: Theme, accent?: string | null): CSSProperties {
  const { v, pad, look } = t;
  const base: Record<string, CSSProperties> = {
    box: { border: `1px solid ${v.outv}`, borderRadius: v.rp, background: v.surf, padding: pad },
    flat: { border: 'none', borderLeft: '4px solid transparent', borderRadius: 0, background: v.surf, padding: pad },
    soft: {
      border: 'none',
      borderRadius: v.rp,
      background: v.surf,
      padding: pad,
      boxShadow: '0 3px 12px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.16)',
    },
    rule: { border: 'none', borderTop: `1px solid ${v.outv}`, borderRadius: 0, background: 'transparent', padding: `${pad} 2px` },
    quiet: { border: 'none', borderBottom: `1px solid ${v.outv}`, borderRadius: 0, background: 'transparent', padding: `4px 0 ${pad}` },
    cap: { border: 'none', borderLeft: `9px solid ${v.sec2}`, borderRadius: `0 ${v.rp} ${v.rp} 0`, background: v.surf, padding: pad },
  };

  const style = base[look.card] || base.box;
  if (!accent) return style;

  // The accent recolours whichever edge this pack actually draws.
  const accented: Record<string, CSSProperties> = {
    box: { borderColor: accent },
    flat: { borderLeftColor: accent },
    cap: { borderLeftColor: accent },
    quiet: { borderBottomColor: accent },
    rule: { borderTopColor: accent },
    soft: { boxShadow: `inset 3px 0 0 ${accent}, 0 3px 12px rgba(0,0,0,.20)` },
  };
  return merge(style, accented[look.card]);
}

/** Segmented-control item, in its off state. */
export function segItemStyle(t: Theme): CSSProperties {
  const { v, font, dfont, look } = t;
  const looks: Record<string, CSSProperties> = {
    fill: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      padding: '13px 0',
      cursor: 'pointer',
      background: v.surf,
      color: v.ink2,
      font: `600 12px/1 ${font}`,
      letterSpacing: '.22em',
    },
    pivot: {
      flex: 'none',
      display: 'flex',
      alignItems: 'baseline',
      gap: '6px',
      padding: '6px 18px 12px 0',
      cursor: 'pointer',
      background: 'transparent',
      color: v.ink2,
      font: `300 24px/1 ${dfont}`,
      textTransform: 'lowercase',
    },
    text: {
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '13px 20px 11px 0',
      cursor: 'pointer',
      background: 'transparent',
      color: v.ink2,
      font: `600 12px/1 ${font}`,
      letterSpacing: v.tls,
    },
  };
  return looks[look.seg] || looks.fill;
}

/** Segmented-control item, selected. */
export function segOnStyle(t: Theme): CSSProperties {
  const { v, look } = t;
  const looks: Record<string, CSSProperties> = {
    fill: { background: v.priC, color: v.onpriC, borderBottom: `2px solid ${v.pri}` },
    pivot: { color: v.pri, fontWeight: 400 },
    text: { color: v.pri, boxShadow: `inset 0 -2px 0 ${v.pri}` },
  };
  return looks[look.seg] || looks.fill;
}

/** The row that holds a segmented control. */
export function segWrapStyle(t: Theme): CSSProperties {
  const { v, look, nav } = t;
  if (look.seg === 'fill') {
    return {
      flex: 'none',
      display: 'flex',
      // Sweep's tab row hangs off the elbow, flush to the inner corner.
      margin: nav === 'sweep' ? '2px 12px 10px 4px' : '2px 16px 10px',
      border: `1px solid ${v.outv}`,
      borderRadius: v.rs,
      overflow: 'hidden',
    };
  }
  return {
    flex: 'none',
    display: 'flex',
    margin: '0 16px 8px',
    borderBottom: look.seg === 'text' ? `1px solid ${v.outv}` : 'none',
    overflowX: 'auto',
  };
}

/** A 44px action button — the minimum comfortable touch target. */
export function actionStyle(t: Theme, kind: 'normal' | 'primary' | 'danger' = 'normal'): CSSProperties {
  const { v, font } = t;
  const base: CSSProperties = {
    flex: 1,
    minHeight: '44px',
    border: `1px solid ${v.outv}`,
    borderRadius: v.rs,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: `700 10.5px/1 ${font}`,
    letterSpacing: '.16em',
    color: v.ink,
    background: 'transparent',
    cursor: 'pointer',
    padding: '0 8px',
    textAlign: 'center',
  };
  if (kind === 'primary') return merge(base, { background: v.pri, color: v.onpri, borderColor: v.pri });
  if (kind === 'danger') return merge(base, { color: v.err, borderColor: v.err });
  return base;
}

/** A filter or scope chip. */
export function chipStyle(t: Theme, on = false): CSSProperties {
  const { v } = t;
  return merge(
    {
      flex: 'none',
      minHeight: '44px',
      padding: '0 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      border: `1px solid ${v.outv}`,
      borderRadius: v.rs,
      background: v.surf,
      cursor: 'pointer',
      color: v.ink2,
      whiteSpace: 'nowrap',
    },
    on ? { borderColor: v.pri, background: v.priC, color: v.onpriC } : null,
  );
}

/** The scrolling list that holds a screen's cards. */
export function listStyle(t: Theme): CSSProperties {
  const { look } = t;
  return {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: look.card === 'flat' ? '0 12px 18px 0' : '2px 16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: look.gap,
    maxWidth: look.measure || 'none',
    boxSizing: 'border-box',
  };
}

/** A standard list row: 44px minimum, dot, title, meta, divider. */
export function rowStyle(t: Theme): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minHeight: '44px',
    padding: t.pad,
    cursor: 'pointer',
  };
}

/** Title type for a screen header, per pack. */
export function titleStyle(t: Theme): CSSProperties {
  const { v, dfont, look } = t;
  if (look.head === 'pivot') return { font: `300 30px/1.05 ${dfont}`, color: v.ink, textTransform: 'lowercase' };
  if (look.head === 'editorial') return { font: `600 22px/1.2 ${dfont}`, color: v.ink, letterSpacing: v.tls };
  if (look.head === 'rule') return { font: `600 14px/1.2 ${dfont}`, color: v.ink, letterSpacing: v.tls, textTransform: 'uppercase' };
  return { font: `700 15px/1.2 ${dfont}`, color: v.ink, letterSpacing: v.tls, textTransform: 'uppercase' };
}

/** Sub-line under a screen title. Terminal packs get their "> " prompt. */
export function subtitleStyle(t: Theme): CSSProperties {
  return { font: `400 10.5px/1.4 ${t.font}`, color: t.v.ink2, marginTop: '4px' };
}

/** Body copy. Honours the large-type preference through the --body variable. */
export function bodyStyle(t: Theme): CSSProperties {
  return { font: `400 var(--body, 13px)/1.45 ${t.font}`, color: t.v.ink };
}

/** Small meta text under a title. */
export function metaStyle(t: Theme): CSSProperties {
  return { font: `400 11px/1.35 ${t.font}`, color: t.v.ink2 };
}

/** Section label: the small tracked caps used above a group of controls. */
export function labelStyle(t: Theme): CSSProperties {
  return { font: `600 9px/1 ${t.dfont}`, letterSpacing: '.18em', color: t.v.ink2, textTransform: 'uppercase' };
}

/** Unread-count badge. */
export function badgeStyle(t: Theme): CSSProperties {
  return {
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    borderRadius: '9px',
    background: t.v.bdg,
    color: t.v.onbdg,
    font: `700 10px/18px ${t.font}`,
    textAlign: 'center',
    flex: 'none',
  };
}

/** Text input, styled to the pack. */
export function inputStyle(t: Theme): CSSProperties {
  const { v, font } = t;
  return {
    width: '100%',
    minHeight: '44px',
    boxSizing: 'border-box',
    padding: '0 12px',
    border: `1px solid ${v.outv}`,
    borderRadius: v.rs,
    background: v.surf,
    color: v.ink,
    font: `400 13px/1.4 ${font}`,
    outline: 'none',
  };
}

/** The scrim behind a dialog or sheet. Light packs need a lighter veil. */
export function scrimStyle(t: Theme): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    zIndex: 30,
    background: t.light ? 'rgba(20,24,28,.38)' : 'rgba(0,0,0,.58)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  };
}
