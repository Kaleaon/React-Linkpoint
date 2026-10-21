import React, { useId } from 'react';
import { CRYSTAL } from './linkpointCrystal.js';

/**
 * TeleportCrystalHero
 *
 * State-reactive Linkpoint crystal mark for the teleport modal sheet.
 * Consumes 512x512 master geometry definitions from CRYSTAL.
 *
 * @param {Object} props
 * @param {number} [props.stepPercent]
 * @param {string} [props.phase]
 * @param {number} [props.size]
 * @param {string} [props.idPrefix]
 */
export default function TeleportCrystalHero({
  stepPercent = 0,
  phase = 'initiating',
  size = 120,
  idPrefix = undefined,
}) {
  const reactId = useId();
  const cleanId = reactId.replace(/:/g, '');
  const prefix = idPrefix ? idPrefix.replace(/:/g, '') : `tpch-${cleanId}`;
  const gradA = `${prefix}-grad-a`;
  const gradB = `${prefix}-grad-b`;
  const coreGlow = `${prefix}-core-glow`;

  const isFailed = phase === 'failed';
  const rawP = typeof stepPercent === 'number' ? stepPercent : Number(stepPercent) || 0;
  const p = Math.min(100, Math.max(0, rawP));

  // Requirement 2: Closing gap from 85.33px at 0% to 0px at 100% in 512-space
  const gap = (256 / 3) * (1 - p / 100);
  const topY = -gap / 2;
  const botY = gap / 2;

  // Core glow intensity reacts to progress (scaled to 512-space)
  const coreRadius = isFailed ? (14 * 512) / 120 : (8 * 512) / 120 + (p / 100) * ((8 * 512) / 120);
  const coreOpacity = isFailed ? 0.95 : 0.4 + (p / 100) * 0.55;

  const priColor = isFailed ? 'var(--err, #EF4444)' : 'var(--pri, #6CFF9A)';
  const strokeColor = isFailed ? 'var(--err, #EF4444)' : 'var(--outv, #365047)';

  return (
    <div
      role="img"
      aria-label="Teleport transition progress"
      data-testid="teleport-crystal-hero"
      data-step-percent={p}
      data-phase={phase}
      style={{
        width: size,
        height: size,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        margin: '0 auto',
      }}
    >
      <svg
        viewBox="0 0 512 512"
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          overflow: 'visible',
        }}
      >
        <style>{`
          @media (prefers-reduced-motion: reduce) {
            .tpch-top,
            .tpch-bot {
              transform: translateY(0px) !important;
              transition: none !important;
            }
            .tpch-core,
            .tpch-ring {
              animation: none !important;
            }
          }
        `}</style>
        <defs>
          <linearGradient id={gradA} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop
              offset="0%"
              stopColor={isFailed ? 'var(--err, #EF4444)' : 'var(--pri, #6CFF9A)'}
            />
            <stop offset="100%" stopColor={isFailed ? '#7F1D1D' : 'var(--priC, #123B27)'} />
          </linearGradient>

          <linearGradient id={gradB} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isFailed ? '#F87171' : 'var(--sec2, #8AD0B0)'} />
            <stop offset="100%" stopColor={isFailed ? '#991B1B' : 'var(--sec, #365047)'} />
          </linearGradient>

          <radialGradient id={coreGlow} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
            <stop
              offset="50%"
              stopColor={isFailed ? 'var(--err, #EF4444)' : 'var(--pri, #6CFF9A)'}
              stopOpacity=".8"
            />
            <stop
              offset="100%"
              stopColor={isFailed ? 'var(--err, #EF4444)' : 'var(--pri, #6CFF9A)'}
              stopOpacity="0"
            />
          </radialGradient>
        </defs>

        {/* Ambient Ring */}
        <circle
          className="tpch-ring"
          cx="256"
          cy="256"
          r="204.8"
          fill="none"
          stroke={priColor}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="4 8"
          opacity={isFailed ? '0.35' : '0.25'}
        />

        {/* Bottom Pyramid Half (4-face master geometry) */}
        <g
          className="tpch-bot"
          style={{
            transform: `translateY(${botY.toFixed(2)}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <polygon
            points={CRYSTAL.bot.faces[0].points}
            fill={`url(#${gradB})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={CRYSTAL.bot.faces[0].opacity}
          />
          <polygon
            points={CRYSTAL.bot.faces[1].points}
            fill={`url(#${gradA})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={CRYSTAL.bot.faces[1].opacity}
          />
          <polygon
            points={CRYSTAL.bot.faces[2].points}
            fill={`url(#${gradB})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.6"
          />
          <polygon
            points={CRYSTAL.bot.faces[3].points}
            fill={`url(#${gradA})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.6"
          />
        </g>

        {/* Top Pyramid Half (4-face master geometry) */}
        <g
          className="tpch-top"
          style={{
            transform: `translateY(${topY.toFixed(2)}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <polygon
            points={CRYSTAL.top.faces[0].points}
            fill={`url(#${gradA})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={CRYSTAL.top.faces[0].opacity}
          />
          <polygon
            points={CRYSTAL.top.faces[1].points}
            fill={`url(#${gradB})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity={CRYSTAL.top.faces[1].opacity}
          />
          <polygon
            points={CRYSTAL.top.faces[2].points}
            fill={`url(#${gradA})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.6"
          />
          <polygon
            points={CRYSTAL.top.faces[3].points}
            fill={`url(#${gradB})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.6"
          />
          <polyline
            points={CRYSTAL.top.ridge}
            fill="none"
            stroke={priColor}
            strokeOpacity={isFailed ? '.6' : '.45'}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* Core Lighting Node */}
        <circle
          className="tpch-core"
          cx="256"
          cy="256"
          r={coreRadius}
          fill={`url(#${coreGlow})`}
          opacity={coreOpacity}
        />
      </svg>
    </div>
  );
}
