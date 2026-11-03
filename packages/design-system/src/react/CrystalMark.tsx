import React, { useId } from "react";

export interface CrystalMarkProps {
  size?: number;
  idPrefix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const CrystalMark: React.FC<CrystalMarkProps> = ({
  size = 88,
  idPrefix,
  className = "",
  style = {}
}) => {
  const reactId = useId();
  const cleanId = reactId.replace(/:/g, "");
  const prefix = idPrefix ? idPrefix.replace(/:/g, "") : `lpld-${cleanId}`;
  const gradA = `${prefix}-a`;
  const gradB = `${prefix}-b`;
  const gradCore = `${prefix}-core`;

  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        display: "block",
        overflow: "visible",
        ...style
      }}
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
          points="256,472 120,342 256,292"
          fill={`url(#${gradB})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.9"
        />
        <polygon
          points="256,472 256,292 392,342"
          fill={`url(#${gradA})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.9"
        />
        <polygon
          points="256,472 392,342 256,392"
          fill={`url(#${gradB})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.6"
        />
        <polygon
          points="256,472 256,392 120,342"
          fill={`url(#${gradA})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.6"
        />
      </g>
      <g className="lpld-top">
        <polygon
          points="256,40 392,170 256,220"
          fill={`url(#${gradA})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="1.0"
        />
        <polygon
          points="256,40 256,220 120,170"
          fill={`url(#${gradB})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="1.0"
        />
        <polygon
          points="256,40 120,170 256,120"
          fill={`url(#${gradA})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.6"
        />
        <polygon
          points="256,40 256,120 392,170"
          fill={`url(#${gradB})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity="0.6"
        />
        <polyline
          points="120,170 256,120 392,170"
          fill="none"
          stroke="var(--pri,#6CFF9A)"
          strokeOpacity=".45"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <circle className="lpld-core" cx="256" cy="256" r="64" fill={`url(#${gradCore})`} />
    </svg>
  );
};

export default CrystalMark;
