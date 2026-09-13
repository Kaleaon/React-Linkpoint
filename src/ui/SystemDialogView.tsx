import React from 'react';
import { useTheme } from '../theme/ThemeContext';
import { actionStyle, merge, scrimStyle } from './styles';
import { icon } from './icons';
import type { SystemDialog } from '../data/slTypes';

/**
 * A simulator or scripted-object dialog.
 *
 * Third party viewers are expected to disclose, before the resident answers,
 * which object is asking, who owns it and on which channel it listens — that is
 * the `meta` line, and it is never optional for a scripted request.
 */
const DIALOG_ICONS: Record<string, string> = {
  llDialog: 'box',
  permissions: 'shield-alert',
  inventoryOffer: 'package',
  teleportLure: 'zap',
  payment: 'banknote',
  regionRestart: 'alert-triangle',
  friendshipOffer: 'user-plus',
  groupInvite: 'users',
};

export const SystemDialogView: React.FC<{ dialog: SystemDialog; onDismiss: () => void }> = ({ dialog, onDismiss }) => {
  const t = useTheme();
  const Icon = icon(DIALOG_ICONS[dialog.kind] || 'box');

  return (
    <div style={scrimStyle(t)} onClick={onDismiss} role="dialog" aria-modal="true" aria-label={dialog.title}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '86%',
          overflowY: 'auto',
          background: t.v.surf,
          borderTop: `1px solid ${t.v.outv}`,
          borderRadius: `${t.v.rl} ${t.v.rl} 0 0`,
          padding: '16px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '10px' }}>
          <Icon size={16} style={{ color: t.v.pri, flex: 'none' }} strokeWidth={1.8} />
          <span style={{ font: `700 9px/1 ${t.dfont}`, letterSpacing: '.2em', color: t.v.pri }}>{dialog.category}</span>
        </div>

        <div style={{ font: `600 15px/1.35 ${t.dfont}`, color: t.v.ink, letterSpacing: t.v.tls }}>{dialog.title}</div>
        <div style={{ font: `400 12.5px/1.55 ${t.font}`, color: t.v.ink2, marginTop: '8px' }}>{dialog.body}</div>

        {dialog.meta && (
          <div
            style={{
              font: `400 10.5px/1.5 ${t.font}`,
              color: t.v.info,
              marginTop: '10px',
              padding: '7px 9px',
              border: `1px dashed ${t.v.outv}`,
              borderRadius: t.v.rs,
            }}
          >
            {dialog.meta}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '14px' }}>
          {dialog.buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={onDismiss}
              style={merge(actionStyle(t, b.kind), { flex: '1 1 40%', minHeight: '46px', font: `700 11px/1 ${t.font}`, letterSpacing: '.14em' })}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
