import React, { useId } from 'react';

// The Linkpoint crystal from the login screen, reduced to a loading indicator:
// two pyramid halves close into the octahedron and the core lights as they meet.
// Loading states used to spin the screen's lucide glyph inside its bordered box,
// which read as a generic spinner rather than as this product's mark.
//
// Colours come from the palette's CSS custom properties (the shell sets them on
// the device frame), so it re-skins with every colour pack like the login logo.
// Keyframes live in index.css next to `spin`.
/**
 * @param {Object} props
 * @param {number} [props.size]
 * @param {"block" | "inline"} [props.variant]
 * @param {string} [props.className]
 * @param {Object} [props.style]
 */
export default function CrystalLoader({
  size = undefined,
  variant = 'block',
  className = '',
  style = {},
}) {
  const reactId = useId().replace(/:/g, '');
  const finalSize = size ?? (variant === 'inline' ? 16 : 88);

  const gradientAId = `lpld-a-${reactId}`;
  const gradientBId = `lpld-b-${reactId}`;
  const gradientCoreId = `lpld-core-${reactId}`;

  const containerStyle = {
    width: finalSize,
    height: finalSize,
    flex: 'none',
    display: variant === 'inline' ? 'inline-flex' : 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: variant === 'inline' ? 'middle' : undefined,
    ...style,
  };

  return (
    <div
      className={className}
      style={containerStyle}
      role="img"
      aria-label="Loading"
      data-testid="crystal-loader"
      data-variant={variant}
    >
      <svg
        viewBox="0 0 120 120"
        aria-hidden="true"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradientAId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--pri,#6CFF9A)" />
            <stop offset="100%" stopColor="var(--priC,#123B27)" />
          </linearGradient>
          <linearGradient id={gradientBId} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--sec2,#8AD0B0)" />
            <stop offset="100%" stopColor="var(--sec,#365047)" />
          </linearGradient>
          <radialGradient id={gradientCoreId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
            <stop offset="55%" stopColor="var(--pri,#6CFF9A)" stopOpacity=".8" />
            <stop offset="100%" stopColor="var(--pri,#6CFF9A)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle
          className="lpld-ring"
          cx="60"
          cy="60"
          r="6"
          fill="none"
          stroke="var(--pri,#6CFF9A)"
          strokeWidth="1"
        />
        <g className="lpld-bot">
          <polygon
            points="60,114 12,60 60,76"
            fill={`url(#${gradientBId})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon
            points="60,114 60,76 108,60"
            fill={`url(#${gradientAId})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            opacity=".72"
          />
        </g>
        <g className="lpld-top">
          <polygon
            points="60,6 12,60 60,76"
            fill={`url(#${gradientAId})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon
            points="60,6 60,76 108,60"
            fill={`url(#${gradientBId})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            opacity=".72"
          />
          <polyline
            points="12,60 60,44 108,60"
            fill="none"
            stroke="var(--pri,#6CFF9A)"
            strokeOpacity=".45"
            strokeWidth="1"
          />
        </g>
        <circle className="lpld-core" cx="60" cy="60" r="15" fill={`url(#${gradientCoreId})`} />
      </svg>
    </div>
  );
}
