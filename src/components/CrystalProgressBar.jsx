import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import CrystalLoader from './CrystalLoader.jsx';

/**
 * @typedef {Object} CrystalProgressBarProps
 * @property {number | null} [progress] - Percentage value between 0 and 100
 * @property {string | number} [height] - Height of the progress track bar
 * @property {boolean} [showLabel] - Whether to render progress text & percentage header
 * @property {string} [label] - Label text rendered in progress header
 * @property {string} [className] - Additional CSS class name
 * @property {import('react').CSSProperties} [style] - Inline style overrides for outer wrapper
 * @property {string} [ariaLabel] - Custom ARIA label for accessibility
 * @property {boolean} [isFailed] - Whether teleport or loading failed
 * @property {boolean} [error] - Alias for isFailed to render error styling
 */

/**
 * @typedef {Object} CrystalProgressBarHandle
 * @property {(pct: number) => void} updateProgress - Updates progress imperatively without React re-renders.
 * @property {HTMLElement | null} track - Direct reference to the track DOM element.
 * @property {HTMLElement | null} fill - Direct reference to the fill DOM element.
 * @property {HTMLElement | null} label - Direct reference to the label DOM element.
 * @property {HTMLElement | null} [container] - Direct reference to the outer container DOM element.
 */

/**
 * @param {CrystalProgressBarProps} props
 * @param {React.ForwardedRef<CrystalProgressBarHandle>} ref
 */
function CrystalProgressBarRender(
  {
    progress = 0,
    height = '6px',
    showLabel = false,
    label = 'Downloading asset data...',
    className = '',
    style = {},
    ariaLabel,
    isFailed = false,
    error = false,
  },
  ref,
) {
  const { V } = useTheme?.() || { V: {} };

  const isError = Boolean(isFailed || error);
  const err = V?.err || 'var(--err, #EF4444)';
  const pri = isError ? err : V?.pri || 'var(--pri, #6CFF9A)';
  const priC = isError ? V?.errC || 'rgba(239, 68, 68, 0.3)' : V?.priC || 'var(--priC, #123B27)';
  const sec2 = isError ? err : V?.sec2 || 'var(--sec2, #8AD0B0)';
  const surf2 = V?.surf2 || 'var(--surf2, rgba(255, 255, 255, 0.1))';
  const outv = isError ? err : V?.outv || 'var(--outv, #365047)';

  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const fillRef = useRef(null);
  const capRef = useRef(null);
  const labelRef = useRef(null);
  const labelPercentRef = useRef(null);

  const rawProgress = typeof progress === 'number' && !isNaN(progress) ? progress : 0;
  const clampedProgress = Math.max(0, Math.min(100, rawProgress));
  const roundedPercent = Math.round(clampedProgress);

  const updateProgress = (pct) => {
    const num = typeof pct === 'number' ? pct : Number(pct);
    const validPct =
      !Number.isNaN(num) && Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 0;
    const rounded = Math.round(validPct);

    if (containerRef.current) {
      containerRef.current.setAttribute('aria-valuenow', String(rounded));
    }
    if (fillRef.current) {
      fillRef.current.style.width = `${validPct}%`;
    }
    if (capRef.current) {
      const isVisible = validPct > 0;
      capRef.current.style.display = isVisible ? 'flex' : 'none';
      capRef.current.style.visibility = isVisible ? 'visible' : 'hidden';
    }
    if (labelPercentRef.current) {
      labelPercentRef.current.textContent = `${rounded}%`;
    }
  };

  useImperativeHandle(ref, () => {
    const handle = {
      updateProgress,
      track: trackRef.current,
      fill: fillRef.current,
      label: labelRef.current,
      container: containerRef.current,
    };
    Object.defineProperties(handle, {
      track: {
        get: () => trackRef.current,
        enumerable: true,
        configurable: true,
      },
      fill: {
        get: () => fillRef.current,
        enumerable: true,
        configurable: true,
      },
      label: {
        get: () => labelRef.current,
        enumerable: true,
        configurable: true,
      },
      container: {
        get: () => containerRef.current,
        enumerable: true,
        configurable: true,
      },
    });
    return handle;
  }, [showLabel]);

  const numericHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      ref={containerRef}
      className={`crystal-progress-bar-container ${isError ? 'is-failed' : ''} ${className}`.trim()}
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
          ref={labelRef}
          data-testid="crystal-progress-label"
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
          <span ref={labelPercentRef} style={{ fontWeight: 600, fontFamily: 'monospace' }}>
            {roundedPercent}%
          </span>
        </div>
      )}

      <div
        ref={trackRef}
        data-testid="crystal-progress-track"
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
          ref={fillRef}
          data-testid="asset-progress-bar"
          style={{
            width: `${clampedProgress}%`,
            height: '100%',
            background: isError
              ? err
              : `linear-gradient(90deg, ${priC} 0%, ${sec2} 40%, ${pri} 100%)`,
            transition: 'width 0.2s ease-out',
            borderRadius: 'inherit',
            position: 'relative',
            boxShadow: `0 0 6px ${isError ? err : pri}`,
          }}
        >
          <div
            ref={capRef}
            className="crystal-bar-cap"
            style={{
              position: 'absolute',
              right: '0',
              top: '50%',
              transform: 'translate(50%, -50%)',
              width: '10px',
              height: '10px',
              pointerEvents: 'none',
              display: clampedProgress > 0 ? 'flex' : 'none',
              visibility: clampedProgress > 0 ? 'visible' : 'hidden',
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
                fill={isError ? err : pri}
                stroke={isError ? err : priC}
                strokeWidth="1.5"
                opacity="0.95"
              />
              <polygon points="10,1 10,19 18,10" fill={isError ? err : sec2} opacity="0.75" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export const CrystalProgressBar = forwardRef(CrystalProgressBarRender);

export default CrystalProgressBar;
