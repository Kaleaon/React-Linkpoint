import { useTheme } from '../context/ThemeContext.jsx';
import { inkOn } from '@linkpoint/design-system/tokens';
import AccessibleButton from './AccessibleButton.jsx';

// Ported from CARDS[].toggleStyle/knobStyle in renderVals().
export default function Toggle({ on, onClick, disabled = false, ...props }) {
  const { V, t } = useTheme();
  if (t.nav === 'SWEEP')
    return (
      <AccessibleButton
        as="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={onClick}
        style={{
          minWidth: 64,
          minHeight: 48,
          flex: 'none',
          border: 0,
          borderRadius: 0,
          background: on ? V.pri : V.sec2,
          color: on ? V.onpri : inkOn(V.sec2),
          font: '700 12px/1 ' + t.dfont,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        {...props}
      >
        {on ? 'ON' : 'OFF'}
      </AccessibleButton>
    );
  return (
    <AccessibleButton
      as="span"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '42px',
        height: '24px',
        borderRadius: '12px',
        position: 'relative',
        display: 'inline-block',
        flex: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: on === false ? V.surf2 : V.priC,
      }}
      {...props}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          width: '18px',
          height: '18px',
          borderRadius: '9px',
          left: on === false ? '3px' : '21px',
          background: on === false ? V.ink2 : V.pri,
          transition: 'left .18s ease',
        }}
      />
    </AccessibleButton>
  );
}
