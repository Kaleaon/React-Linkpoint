import React, { useId } from 'react';
import { MINI_CRYSTAL } from './linkpointCrystal.js';

/**
 * TeleportCrystalHero
 *
 * State-reactive Linkpoint crystal mark for the teleport modal sheet.
 *
 * @param {Object} props
 * @param {number} [props.stepPercent]
 * @param {string} [props.phase]
 * @param {number} [props.size]
 * @param {string} [props.idPrefix]
 */
function TeleportCrystalHero({
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

  // Requirement 2: Closing gap from 20px at 0% to 0px at 100%
  const gap = 20 * (1 - p / 100);
  const topY = -gap / 2;
  const botY = gap / 2;

  // Core glow intensity reacts to progress
  const coreRadius = isFailed ? 14 : 8 + (p / 100) * 8;
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
        viewBox="0 0 120 120"
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          overflow: 'visible',
          '--tpch-gap': `${gap.toFixed(2)}px`,
          '--tpch-top-y': `${topY.toFixed(2)}px`,
          '--tpch-bot-y': `${botY.toFixed(2)}px`,
          '--tpch-progress': `${p}%`,
        }}
      >
        <style>{`
          .tpch-top {
            transform: translateY(var(--tpch-top-y, ${topY.toFixed(2)}px));
            transition: transform 0.3s ease-out;
          }
          .tpch-bot {
            transform: translateY(var(--tpch-bot-y, ${botY.toFixed(2)}px));
            transition: transform 0.3s ease-out;
          }
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
          cx="60"
          cy="60"
          r="48"
          fill="none"
          stroke={priColor}
          strokeWidth="1"
          strokeDasharray="4 8"
          opacity={isFailed ? '0.35' : '0.25'}
        />

        {/* Bottom Pyramid Half */}
        <g
          className="tpch-bot"
          style={{
            transform: `translateY(${botY.toFixed(2)}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <polygon
            points={MINI_CRYSTAL.bot.faceA}
            fill={`url(#${gradB})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon
            points={MINI_CRYSTAL.bot.faceB}
            fill={`url(#${gradA})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            opacity=".75"
          />
        </g>

        {/* Top Pyramid Half */}
        <g
          className="tpch-top"
          style={{
            transform: `translateY(${topY.toFixed(2)}px)`,
            transition: 'transform 0.3s ease-out',
          }}
        >
          <polygon
            points={MINI_CRYSTAL.top.faceA}
            fill={`url(#${gradA})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon
            points={MINI_CRYSTAL.top.faceB}
            fill={`url(#${gradB})`}
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            opacity=".75"
          />
          <polyline
            points={MINI_CRYSTAL.top.ridge}
            fill="none"
            stroke={priColor}
            strokeOpacity={isFailed ? '.6' : '.45'}
            strokeWidth="1"
          />
        </g>

        {/* Core Lighting Node */}
        <circle
          className="tpch-core"
          cx="60"
          cy="60"
          r={coreRadius}
          fill={`url(#${coreGlow})`}
          opacity={coreOpacity}
        />
      </svg>
    </div>
  );
}

export default React.memo(TeleportCrystalHero);
