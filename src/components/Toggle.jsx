import { useTheme } from '../context/ThemeContext.jsx';
import { inkOn } from '@linkpoint/design-system/tokens';
import AccessibleButton from './AccessibleButton.jsx';

// Ported from CARDS[].toggleStyle/knobStyle in renderVals().
/**
 * @param {object} props
 * @param {boolean} props.on
 * @param {((e?: any) => void)} [props.onClick]
 * @param {boolean} [props.disabled]
 * @param {string} [props.aria-label]
 * @param {string} [props.aria-labelledby]
 * @param {string} [props.ariaLabel]
 * @param {string} [props.ariaLabelledBy]
 */
export default function Toggle({
  on,
  onClick = undefined,
  disabled = false,
  'aria-label': ariaLabel = undefined,
  'aria-labelledby': ariaLabelledby = undefined,
  ...props
}) {
  const resolvedLabel = ariaLabel || props.ariaLabel;
  const resolvedLabelledby = ariaLabelledby || props.ariaLabelledBy;

  if (process.env.NODE_ENV !== 'production' && !resolvedLabel && !resolvedLabelledby) {
    console.warn(
      'Toggle requires either an `aria-label` or `aria-labelledby` prop for accessibility (WCAG 2.2 SC 4.1.2).',
    );
  }

  const { V, t } = useTheme();

  const ariaProps = {};
  if (resolvedLabel) ariaProps['aria-label'] = resolvedLabel;
  if (resolvedLabelledby) ariaProps['aria-labelledby'] = resolvedLabelledby;

  const restProps = { ...props };
  delete restProps.ariaLabel;
  delete restProps.ariaLabelledBy;

  if (t.nav === 'SWEEP')
    return (
      <AccessibleButton
        as="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={onClick}
        {...ariaProps}
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
        {...restProps}
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
      {...ariaProps}
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
      {...restProps}
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
