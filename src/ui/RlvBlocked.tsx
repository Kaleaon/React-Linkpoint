import React from 'react';
import { Lock } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { RLV_REASONS, type RlvRestriction } from '../viewer/RlvContext';

/**
 * What a whole screen shows when RLV has closed it.
 *
 * The screen body is not rendered at all — hiding it with CSS would leave the
 * restricted content in the tree, which is not "strictly prohibits the action"
 * in any sense that matters.
 */
export const RlvBlocked: React.FC<{ restriction: RlvRestriction }> = ({ restriction }) => {
  const t = useTheme();
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
          border: `1px solid ${t.v.warn}`,
          background: t.v.surf,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: t.v.warn,
        }}
      >
        <Lock size={24} strokeWidth={1.7} />
      </div>
      <div style={{ font: `700 15px/1.3 ${t.dfont}`, letterSpacing: t.v.tls, color: t.v.warn }}>RESTRICTED</div>
      <div style={{ font: `400 12.5px/1.6 ${t.font}`, color: t.v.ink2, maxWidth: '300px' }}>{RLV_REASONS[restriction]}</div>
      <div style={{ font: `400 10.5px/1.6 ${t.font}`, color: t.v.ink2, maxWidth: '300px' }}>
        This restriction was issued by an object you are wearing. It lifts when that object releases it, or when you detach it —
        if detaching is itself permitted.
      </div>
    </div>
  );
};

/** A short inline note under a control that RLV has disabled. */
export const RlvNote: React.FC<{ restriction: RlvRestriction }> = ({ restriction }) => {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px', font: `400 10px/1.4 ${t.font}`, color: t.v.warn }}>
      <Lock size={11} strokeWidth={2} style={{ flex: 'none' }} />
      {RLV_REASONS[restriction]}
    </div>
  );
};
