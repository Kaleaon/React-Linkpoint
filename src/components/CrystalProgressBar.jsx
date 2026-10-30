import React from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import CrystalLoader from './CrystalLoader.jsx';

/**
 * CrystalProgressBar component for standardized Linkpoint brand styling across loading and downloading workflows.
 * Supports numerical percentage values from 0 to 100 with smooth transitions, theme custom properties,
 * and standard crystal brand visual assets.
 *
 * @param {Object} props
 * @param {number | null | undefined} [props.progress=0] - Percentage value between 0 and 100
 * @param {string | number} [props.height="6px"] - Height of the progress track bar
 * @param {boolean} [props.showLabel=false] - Whether to render progress text & percentage header
 * @param {string} [props.label="Downloading asset data..."] - Label text rendered in progress header
 * @param {string} [props.className=""] - Additional CSS class name
 * @param {import('react').CSSProperties} [props.style={}] - Inline style overrides for outer wrapper
 * @param {string} [props.ariaLabel] - Custom ARIA label for accessibility
 */
export function CrystalProgressBar({
  progress = 0,
  height = '6px',
  showLabel = false,
  label = 'Downloading asset data...',
  className = '',
  style = {},
  ariaLabel,
}) {
  const { V } = useTheme?.() || { V: {} };

  const pri = V?.pri || 'var(--pri, #6CFF9A)';
  const priC = V?.priC || 'var(--priC, #123B27)';
  const sec2 = V?.sec2 || 'var(--sec2, #8AD0B0)';
  const surf2 = V?.surf2 || 'var(--surf2, rgba(255, 255, 255, 0.1))';
  const outv = V?.outv || 'var(--outv, #365047)';

  const rawProgress = typeof progress === 'number' && !isNaN(progress) ? progress : 0;
  const clampedProgress = Math.max(0, Math.min(100, rawProgress));
  const roundedPercent = Math.round(clampedProgress);

  const numericHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`crystal-progress-bar-container ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        width: '100%',
        ...style,
      }}
      role="progressbar"
      aria-valuenow={roundedPercent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel || label}
      data-testid="crystal-progress-bar-container"
    >
      {showLabel && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            color: V?.ink || 'currentColor',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CrystalLoader size={14} variant="inline" />
            <span>{label}</span>
          </span>
          <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{roundedPercent}%</span>
        </div>
      )}

      <div
        style={{
          width: '100%',
          height: numericHeight,
          background: surf2,
          border: `1px solid ${outv || 'rgba(255,255,255,0.1)'}`,
          borderRadius: '4px',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <div
          data-testid="asset-progress-bar"
          style={{
            width: `${clampedProgress}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${priC} 0%, ${sec2} 40%, ${pri} 100%)`,
            transition: 'width 0.2s ease-out',
            borderRadius: 'inherit',
            position: 'relative',
            boxShadow: `0 0 6px ${pri}`,
          }}
        >
          {clampedProgress > 0 && (
            <div
              className="crystal-bar-cap"
              style={{
                position: 'absolute',
                right: '0',
                top: '50%',
                transform: 'translate(50%, -50%)',
                width: '10px',
                height: '10px',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              }}
              data-testid="crystal-progress-cap"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 20 20"
                style={{ overflow: 'visible' }}
                aria-hidden="true"
              >
                <polygon
                  points="10,1 18,10 10,19 2,10"
                  fill={pri}
                  stroke={priC}
                  strokeWidth="1.5"
                  opacity="0.95"
                />
                <polygon points="10,1 10,19 18,10" fill={sec2} opacity="0.75" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CrystalProgressBar;
