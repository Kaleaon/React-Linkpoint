import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { merge } from './styles';
import { icon } from './icons';
import type { ConditionCopy, ScreenCondition } from '../data/slData';

/**
 * The loading, empty and error state a screen shows instead of its content.
 * Every state names what is happening, what the viewer is waiting on, and what
 * the resident can do about it — a bare spinner tells them nothing.
 */
export const StateBlock: React.FC<{ copy: ConditionCopy; condition: Exclude<ScreenCondition, 'normal'>; onAction?: () => void }> = ({
  copy,
  condition,
  onAction,
}) => {
  const t = useTheme();
  const Icon = icon(copy.icon);
  const tone = condition === 'error' ? t.v.err : t.v.pri;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        padding: '24px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '62px',
          height: '62px',
          flex: 'none',
          borderRadius: t.v.rp,
          border: `1px solid ${condition === 'error' ? t.v.err : t.v.outv}`,
          background: t.v.surf,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone,
          animation: condition === 'loading' ? 'lp-spin 2.6s linear infinite' : 'none',
        }}
      >
        <Icon size={26} strokeWidth={1.6} />
      </div>

      <div style={{ font: `700 15px/1.3 ${t.dfont}`, letterSpacing: t.v.tls, color: condition === 'error' ? t.v.err : t.v.ink }}>
        {copy.title}
      </div>

      <div style={{ font: `400 12.5px/1.6 ${t.font}`, color: t.v.ink2, maxWidth: '300px' }}>{copy.body}</div>

      {copy.bar != null && (
        <div style={{ width: '216px', height: '4px', borderRadius: '2px', background: t.v.surf2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(copy.bar * 100)}%`, height: '100%', background: t.v.pri }} />
        </div>
      )}

      {copy.log && (
        <div
          style={{
            font: `400 10.5px/1.75 ${t.font}`,
            color: t.v.ink2,
            textAlign: 'left',
            border: `1px dashed ${t.v.outv}`,
            borderRadius: t.v.rs,
            padding: '8px 10px',
            maxWidth: '300px',
          }}
        >
          {copy.log.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      {copy.btn && (
        <button
          type="button"
          onClick={onAction}
          style={merge({
            minHeight: '44px',
            padding: '0 22px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: t.v.rs,
            background: condition === 'error' ? t.v.err : t.v.pri,
            color: condition === 'error' ? t.ink(t.v.err) : t.v.onpri,
            font: `700 11px/1 ${t.font}`,
            letterSpacing: '.18em',
            cursor: 'pointer',
          })}
        >
          {copy.btn}
        </button>
      )}
    </div>
  );
};
