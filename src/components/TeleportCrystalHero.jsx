import React from "react";

/**
 * TeleportCrystalHero
 *
 * State-reactive Linkpoint crystal mark for the teleport modal sheet.
 *
 * Props:
 * - stepPercent: Progress percentage (0 - 100)
 * - phase: Teleport session phase string ('initiating' | 'contacting' | 'preparing' | 'arriving' | 'failed' | etc.)
 * - size: Hero graphic size in pixels (default: 120)
 */
export default function TeleportCrystalHero({ stepPercent = 0, phase = "initiating", size = 120 }) {
  const isFailed = phase === "failed";
  const rawP = typeof stepPercent === "number" ? stepPercent : Number(stepPercent) || 0;
  const p = Math.min(100, Math.max(0, rawP));

  // Requirement 2: Closing gap from 20px at 0% to 0px at 100%
  const gap = 20 * (1 - p / 100);
  const topY = -gap / 2;
  const botY = gap / 2;

  // Core glow intensity reacts to progress
  const coreRadius = isFailed ? 14 : 8 + (p / 100) * 8;
  const coreOpacity = isFailed ? 0.95 : 0.4 + (p / 100) * 0.55;

  const priColor = isFailed ? "var(--err, #EF4444)" : "var(--pri, #6CFF9A)";
  const strokeColor = isFailed ? "var(--err, #EF4444)" : "var(--outv, #365047)";

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
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        margin: "0 auto",
      }}
    >
      <svg
        viewBox="0 0 120 120"
        aria-hidden="true"
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          overflow: "visible",
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
          <linearGradient id="tpch-grad-a" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isFailed ? "var(--err, #EF4444)" : "var(--pri, #6CFF9A)"} />
            <stop offset="100%" stopColor={isFailed ? "#7F1D1D" : "var(--priC, #123B27)"} />
          </linearGradient>

          <linearGradient id="tpch-grad-b" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isFailed ? "#F87171" : "var(--sec2, #8AD0B0)"} />
            <stop offset="100%" stopColor={isFailed ? "#991B1B" : "var(--sec, #365047)"} />
          </linearGradient>

          <radialGradient id="tpch-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
            <stop
              offset="50%"
              stopColor={isFailed ? "var(--err, #EF4444)" : "var(--pri, #6CFF9A)"}
              stopOpacity=".8"
            />
            <stop
              offset="100%"
              stopColor={isFailed ? "var(--err, #EF4444)" : "var(--pri, #6CFF9A)"}
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
          opacity={isFailed ? "0.35" : "0.25"}
        />

        {/* Bottom Pyramid Half */}
        <g
          className="tpch-bot"
          style={{
            transform: `translateY(${botY.toFixed(2)}px)`,
            transition: "transform 0.3s ease-out",
          }}
        >
          <polygon
            points="60,114 12,60 60,76"
            fill="url(#tpch-grad-b)"
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon
            points="60,114 60,76 108,60"
            fill="url(#tpch-grad-a)"
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
            transition: "transform 0.3s ease-out",
          }}
        >
          <polygon
            points="60,6 12,60 60,76"
            fill="url(#tpch-grad-a)"
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <polygon
            points="60,6 60,76 108,60"
            fill="url(#tpch-grad-b)"
            stroke={strokeColor}
            strokeWidth="1"
            strokeLinejoin="round"
            opacity=".75"
          />
          <polyline
            points="12,60 60,44 108,60"
            fill="none"
            stroke={priColor}
            strokeOpacity={isFailed ? ".6" : ".45"}
            strokeWidth="1"
          />
        </g>

        {/* Core Lighting Node */}
        <circle
          className="tpch-core"
          cx="60"
          cy="60"
          r={coreRadius}
          fill="url(#tpch-core-glow)"
          opacity={coreOpacity}
        />
      </svg>
    </div>
  );
}
