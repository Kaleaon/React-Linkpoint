import React, { useEffect, useRef, useId, useImperativeHandle } from 'react';
import { MINI_CRYSTAL } from './linkpointCrystal.js';

/**
 * @typedef {Object} TeleportCrystalHeroProps
 * @property {number} [stepPercent]
 * @property {string} [phase]
 * @property {number} [size]
 * @property {string} [idPrefix]
 */

/**
 * @typedef {Object} TeleportCrystalHeroHandle
 * @property {(pct: number) => void} updateProgress
 */

/**
 * @param {TeleportCrystalHeroProps} props
 * @param {React.ForwardedRef<TeleportCrystalHeroHandle>} ref
 */
function TeleportCrystalHeroRender(
  { stepPercent = 0, phase = 'initiating', size = 120, idPrefix = undefined },
  ref,
) {
  const reactId = useId();
  const cleanId = reactId.replace(/:/g, '');
  const prefix = idPrefix ? idPrefix.replace(/:/g, '') : `tpch-${cleanId}`;
  const gradA = `${prefix}-grad-a`;
  const gradB = `${prefix}-grad-b`;
  const coreGlow = `${prefix}-core-glow`;

  const containerRef = useRef(null);
  const topRef = useRef(null);
  const botRef = useRef(null);
  const coreRef = useRef(null);
  const rafIdRef = useRef(null);

  const isFailed = phase === 'failed';
  const rawP = typeof stepPercent === 'number' ? stepPercent : Number(stepPercent) || 0;
  const p = Math.min(100, Math.max(0, rawP));

  // Core glow intensity reacts to progress
  const coreRadius = isFailed ? 14 : 8 + (p / 100) * 8;
  const coreOpacity = isFailed ? 0.95 : 0.4 + (p / 100) * 0.55;

  const priColor = isFailed ? 'var(--err, #EF4444)' : 'var(--pri, #6CFF9A)';
  const strokeColor = isFailed ? 'var(--err, #EF4444)' : 'var(--outv, #365047)';

  const applyProgressDOM = (pct) => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const rawPct = typeof pct === 'number' ? pct : Number(pct) || 0;
      const validPct = Math.min(100, Math.max(0, rawPct));
      const currentGap = 20 * (1 - validPct / 100);
      const curTopY = -currentGap / 2;
      const curBotY = currentGap / 2;
      const curRadius = isFailed ? 14 : 8 + (validPct / 100) * 8;
      const curOpacity = isFailed ? 0.95 : 0.4 + (validPct / 100) * 0.55;

      if (containerRef.current) {
        containerRef.current.setAttribute('data-step-percent', String(validPct));
        containerRef.current.style.setProperty('--tpch-progress', String(validPct));
      }
      if (topRef.current) {
        topRef.current.style.transform = `translateY(${curTopY.toFixed(2)}px)`;
      }
      if (botRef.current) {
        botRef.current.style.transform = `translateY(${curBotY.toFixed(2)}px)`;
      }
      if (coreRef.current) {
        coreRef.current.setAttribute('r', String(curRadius));
        coreRef.current.setAttribute('opacity', String(curOpacity));
      }
    });
  };

  useImperativeHandle(ref, () => ({
    updateProgress: (pct) => {
      applyProgressDOM(pct);
    },
  }));

  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
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
        '--tpch-progress': p,
        '--tpch-gap': 'calc(20px * (1 - var(--tpch-progress) / 100))',
        '--tpch-top-y': 'calc(var(--tpch-gap) / -2)',
        '--tpch-bot-y': 'calc(var(--tpch-gap) / 2)',
        '--tpch-core-radius': `${coreRadius}px`,
        '--tpch-core-opacity': `${coreOpacity}`,
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
          ref={botRef}
          className="tpch-bot"
          style={{
            transform: 'translateY(var(--tpch-bot-y))',
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
          ref={topRef}
          className="tpch-top"
          style={{
            transform: 'translateY(var(--tpch-top-y))',
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
          ref={coreRef}
          className="tpch-core"
          cx="60"
          cy="60"
          r={coreRadius}
          fill={`url(#${coreGlow})`}
          opacity={coreOpacity}
          style={{
            r: 'var(--tpch-core-radius)',
            opacity: 'var(--tpch-core-opacity)',
          }}
        />
      </svg>
    </div>
  );
}

const TeleportCrystalHero = React.forwardRef(TeleportCrystalHeroRender);

export default React.memo(TeleportCrystalHero);
