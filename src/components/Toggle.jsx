import { useTheme } from '../context/ThemeContext.jsx';

// Ported from CARDS[].toggleStyle/knobStyle in renderVals().
export default function Toggle({ on, onClick, disabled = false }) {
  const { V } = useTheme();
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled && onClick) onClick();
        }
      }}
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
    </span>
  );
}
