import React, { useId } from 'react';
import { CRYSTAL } from './linkpointCrystal.js';
import { BrandedLoader } from '@linkpoint/design-system/react';

/**
 * The Linkpoint crystal mark, reduced to a loading indicator:
 * two pyramid halves close into the octahedron and the core lights as they meet.
 * Consumes 512x512 master geometry definitions from CRYSTAL.
 *
 * Colours come from the palette's CSS custom properties (the shell sets them on
 * the device frame), so it re-skins with every colour pack like the login logo.
 * Keyframes live in index.css next to `spin`.
 *
 * @param {Object} props
 * @param {number} [props.size]
 * @param {"block" | "inline" | "screen" | "card" | "asset"} [props.variant]
 * @param {string} [props.className]
 * @param {Object} [props.style]
 * @param {string} [props.idPrefix]
 */
export default function CrystalLoader({
  size,
  variant = 'block',
  className = '',
  style = {},
  idPrefix,
  ...rest
}) {
  const reactId = useId();

  if (variant === 'card' || variant === 'asset') {
    return (
      <BrandedLoader
        size={size}
        variant={variant}
        className={className}
        style={style}
        idPrefix={idPrefix}
        {...rest}
      />
    );
  }

  const cleanId = reactId.replace(/:/g, '');
  const prefix = idPrefix ? idPrefix.replace(/:/g, '') : `lpld-${cleanId}`;
  const gradA = `${prefix}-a`;
  const gradB = `${prefix}-b`;
  const gradCore = `${prefix}-core`;

  const finalSize = size ?? (variant === 'inline' ? 16 : 88);

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
      {...rest}
    >
      <svg
        viewBox="0 0 512 512"
        aria-hidden="true"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradA} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--pri,#6CFF9A)" />
            <stop offset="100%" stopColor="var(--priC,#123B27)" />
          </linearGradient>
          <linearGradient id={gradB} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--sec2,#8AD0B0)" />
            <stop offset="100%" stopColor="var(--sec,#365047)" />
          </linearGradient>
          <radialGradient id={gradCore} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
            <stop offset="55%" stopColor="var(--pri,#6CFF9A)" stopOpacity=".8" />
            <stop offset="100%" stopColor="var(--pri,#6CFF9A)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle
          className="lpld-ring"
          cx="256"
          cy="256"
          r="25.6"
          fill="none"
          stroke="var(--pri,#6CFF9A)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <g className="lpld-bot">
          <polygon
            points={CRYSTAL.bot.faces[0].points}
            fill={`url(#${gradB})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={CRYSTAL.bot.faces[0].opacity}
          />
          <polygon
            points={CRYSTAL.bot.faces[1].points}
            fill={`url(#${gradA})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={CRYSTAL.bot.faces[1].opacity}
          />
          <polygon
            points={CRYSTAL.bot.faces[2].points}
            fill={`url(#${gradB})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.6}
          />
          <polygon
            points={CRYSTAL.bot.faces[3].points}
            fill={`url(#${gradA})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.6}
          />
        </g>
        <g className="lpld-top">
          <polygon
            points={CRYSTAL.top.faces[0].points}
            fill={`url(#${gradA})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={CRYSTAL.top.faces[0].opacity}
          />
          <polygon
            points={CRYSTAL.top.faces[1].points}
            fill={`url(#${gradB})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={CRYSTAL.top.faces[1].opacity}
          />
          <polygon
            points={CRYSTAL.top.faces[2].points}
            fill={`url(#${gradA})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.6}
          />
          <polygon
            points={CRYSTAL.top.faces[3].points}
            fill={`url(#${gradB})`}
            stroke="var(--outv,#365047)"
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.6}
          />
          <polyline
            points={CRYSTAL.top.ridge}
            fill="none"
            stroke="var(--pri,#6CFF9A)"
            strokeOpacity=".45"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <circle className="lpld-core" cx="256" cy="256" r="64" fill={`url(#${gradCore})`} />
      </svg>
    </div>
  );
}
