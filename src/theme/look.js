// Ported style-builder helpers from renderVals() — the per-layout-pack "look"
// treatments (card chrome, segmented-tab chrome, action buttons) shared by
// several screens/components.

const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

export function sideBorder(side, width, color) {
  const out = {};
  for (const s of SIDES) {
    const on = s === side;
    out['border' + s + 'Style'] = on ? 'solid' : 'none';
    out['border' + s + 'Width'] = on ? width : 0;
    out['border' + s + 'Color'] = on ? color : 'transparent';
  }
  return out;
}

export function fullBorder(width, color) {
  const out = {};
  for (const s of SIDES) {
    out['border' + s + 'Style'] = 'solid';
    out['border' + s + 'Width'] = width;
    out['border' + s + 'Color'] = color;
  }
  return out;
}

export function cardLooks(V, pad) {
  return {
    box: {
      ...fullBorder('1px', V.outv),
      borderRadius: V.rs || V.rp,
      background: V.surf,
      padding: pad,
    },
    flat: {
      ...sideBorder('Left', '4px', V.pri || 'transparent'),
      borderRadius: '0px',
      background: V.surf,
      padding: pad,
    },
    soft: {
      ...fullBorder('1px', 'rgba(255,255,255,0.18)'),
      borderRadius: V.rp,
      background: V.surf,
      padding: pad,
      boxShadow: '0 6px 20px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.30)',
    },
    rule: {
      ...sideBorder('Top', '1px', V.outv),
      borderRadius: '0px',
      background: 'transparent',
      padding: pad + ' 2px',
    },
    quiet: {
      ...sideBorder('Bottom', '1px', V.outv),
      borderRadius: '0px',
      background: 'transparent',
      padding: '4px 0 ' + pad,
    },
    cap: {
      ...sideBorder('Left', '10px', V.sec2 || V.pri),
      borderRadius: '0 ' + (V.rp || '22px') + ' ' + (V.rp || '22px') + ' 0',
      background: V.surf,
      padding: pad,
    },
  };
}

export function cardAccentStyle(cardKind, V, accent) {
  if (!accent) return null;
  if (cardKind === 'box')
    return {
      borderTopColor: accent,
      borderRightColor: accent,
      borderBottomColor: accent,
      borderLeftColor: accent,
    };
  if (cardKind === 'flat' || cardKind === 'cap') return { borderLeftColor: accent };
  if (cardKind === 'quiet') return { borderBottomColor: accent };
  if (cardKind === 'rule') return { borderTopColor: accent };
  return { boxShadow: 'inset 4px 0 0 ' + accent + ', 0 4px 16px rgba(0,0,0,.25)' };
}

export function actionButtonStyle(V, font, a) {
  const isPill = V.rs === '999px';
  const isFlat = V.rs === '0px';
  const base = {
    flex: 1,
    height: '44px',
    borderWidth: isFlat ? 0 : '1px',
    borderStyle: isFlat ? 'none' : 'solid',
    borderColor: V.outv,
    borderRadius: V.rs,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: '700 11px/1 ' + font,
    letterSpacing: isPill ? '.18em' : isFlat ? '.08em' : '.14em',
    textTransform: isPill || isFlat ? 'uppercase' : 'none',
    color: V.ink,
    cursor: 'pointer',
  };
  if (a.primary) return { ...base, background: V.pri, color: V.onpri, borderColor: V.pri };
  if (a.dim) return { ...base, color: V.err, borderColor: V.err };
  return { ...base, background: V.surf2 };
}

export function segLooks(V, font) {
  return {
    fill: {
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      padding: '12px 0',
      cursor: 'pointer',
      background: V.surf,
      color: V.ink2,
      font: '600 12px/1 ' + font,
      letterSpacing: '.22em',
      borderRadius: V.rs === '999px' ? '999px' : '0',
    },
    pivot: {
      flex: 'none',
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'flex-start',
      gap: '8px',
      padding: '8px 20px 14px 0',
      cursor: 'pointer',
      background: 'transparent',
      color: V.ink2,
      font: '300 28px/1 ' + font,
      textTransform: 'lowercase',
      letterSpacing: '-.02em',
    },
    text: {
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: '6px',
      padding: '13px 20px 11px 0',
      cursor: 'pointer',
      background: 'transparent',
      color: V.ink2,
      font: '600 12px/1 ' + font,
      letterSpacing: undefined,
    },
  };
}

export function segOnLooks(V) {
  return {
    fill: { background: undefined }, // filled in by caller with `on` shared style
    pivot: { color: V.pri, fontWeight: 400 },
    text: { color: V.pri, boxShadow: 'inset 0 -2px 0 ' + V.pri },
  };
}

// Cache is reached from Settings and has no nav entry of its own, so it keeps the
// Settings/MORE item lit rather than leaving the whole nav unhighlighted.
export const navActive = (screen, id) => screen === id || (id === 'Settings' && screen === 'Cache');
