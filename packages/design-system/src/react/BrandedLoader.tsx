import React, { useId } from "react";
import { useTheme } from "./LayoutContext.js";

export interface SkeletonBoxProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const SkeletonBox: React.FC<SkeletonBoxProps> = ({
  width = "100%",
  height = "16px",
  borderRadius = "4px",
  style = {},
  className = ""
}) => {
  const theme = useTheme();
  const V = theme?.v || {};
  const surf2 = V.surf2 || "var(--surf2, rgba(255, 255, 255, 0.08))";
  const priC = V.priC || "var(--priC, rgba(18, 59, 39, 0.4))";
  const pri = V.pri || "var(--pri, rgba(108, 255, 154, 0.35))";

  return (
    <div
      className={`skeleton-box ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(90deg, ${surf2} 25%, ${priC} 40%, ${pri} 50%, ${priC} 60%, ${surf2} 75%)`,
        backgroundSize: "200% 100%",
        ...style
      }}
      aria-hidden="true"
    />
  );
};

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
      viewBox="0 0 120 120"
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
          fill={`url(#${gradB})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <polygon
          points="60,114 60,76 108,60"
          fill={`url(#${gradA})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
          opacity=".72"
        />
      </g>
      <g className="lpld-top">
        <polygon
          points="60,6 12,60 60,76"
          fill={`url(#${gradA})`}
          stroke="var(--outv,#365047)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <polygon
          points="60,6 60,76 108,60"
          fill={`url(#${gradB})`}
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
      <circle className="lpld-core" cx="60" cy="60" r="15" fill={`url(#${gradCore})`} />
    </svg>
  );
};

export interface BrandedLoaderProps {
  /**
   * Loader variant:
   * - 'screen' | 'block': Global full screen loading state with Linkpoint crystal asset.
   * - 'inline': Compact inline crystal loading indicator for buttons or text lines.
   * - 'card': Card component loading placeholder with crystal branding and skeleton box layout.
   * - 'asset': Progressive asset download placeholder with crystal branding, title, skeleton preview, and progress bar.
   */
  variant?: "screen" | "card" | "inline" | "asset" | "block";
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  idPrefix?: string;
  title?: string;
  progress?: number | null;
  children?: React.ReactNode;
  contentHeight?: string;
  assetHeight?: string;
  "data-testid"?: string;
}

export const BrandedLoader: React.FC<BrandedLoaderProps> = ({
  variant = "screen",
  size,
  className = "",
  style = {},
  idPrefix,
  title,
  progress = null,
  children,
  contentHeight,
  assetHeight,
  "data-testid": testId
}) => {
  const theme = useTheme();
  const V = theme?.v || {};

  if (variant === "inline") {
    const finalSize = size ?? 16;
    const containerStyle: React.CSSProperties = {
      width: finalSize,
      height: finalSize,
      flex: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      verticalAlign: "middle",
      ...style
    };

    return (
      <div
        className={className}
        style={containerStyle}
        role="img"
        aria-label="Loading"
        data-testid={testId || "crystal-loader"}
        data-variant="inline"
      >
        <CrystalMark size={finalSize} idPrefix={idPrefix} />
      </div>
    );
  }

  if (variant === "screen" || variant === "block") {
    const finalSize = size ?? 88;
    const containerStyle: React.CSSProperties = {
      width: finalSize,
      height: finalSize,
      flex: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      verticalAlign: undefined,
      ...style
    };

    return (
      <div
        className={className}
        style={containerStyle}
        role="img"
        aria-label="Loading"
        data-testid={testId || "crystal-loader"}
        data-variant={variant}
      >
        <CrystalMark size={finalSize} idPrefix={idPrefix} />
      </div>
    );
  }

  if (variant === "card") {
    const iconSize = size ?? 24;
    const bodyHeight = contentHeight || assetHeight || "120px";
    return (
      <div
        className={`skeleton-container ${className}`.trim()}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          ...style
        }}
        role="status"
        aria-label={title || "Loading asset container..."}
        data-testid={testId || "branded-loader-card"}
        data-variant="card"
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{ width: iconSize, height: iconSize, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
            role="img"
            aria-label="Loading"
            data-testid="crystal-loader"
            data-variant="inline"
          >
            <CrystalMark size={iconSize} idPrefix={idPrefix} />
          </div>
          {title ? (
            <span style={{ fontWeight: 600, fontSize: "13px", color: V.ink || "inherit" }}>{title}</span>
          ) : (
            <SkeletonBox width="50%" height="16px" />
          )}
        </div>
        <SkeletonBox width="100%" height={bodyHeight} borderRadius="6px" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SkeletonBox width="80%" height="12px" />
          <SkeletonBox width="40%" height="10px" />
        </div>
        {children}
      </div>
    );
  }

  if (variant === "asset") {
    const iconSize = size ?? 20;
    const displayTitle = title || "Loading Asset...";
    const bodyHeight = contentHeight || assetHeight || "140px";

    return (
      <div
        className={`skeleton-container ${className}`.trim()}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          ...style
        }}
        role="status"
        aria-label={displayTitle}
        data-testid={testId || "skeleton-asset-placeholder"}
        data-variant="asset"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", width: "60%" }}>
            <div
              style={{ width: iconSize, height: iconSize, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
              role="img"
              aria-label="Loading"
              data-testid="crystal-loader"
              data-variant="inline"
            >
              <CrystalMark size={iconSize} idPrefix={idPrefix} />
            </div>
            {title ? (
              <span style={{ fontWeight: 600, fontSize: "13px", color: V.ink || "inherit" }}>{title}</span>
            ) : (
              <SkeletonBox width="80%" height="14px" />
            )}
          </div>
          <SkeletonBox width="15%" height="12px" />
        </div>
        <SkeletonBox width="100%" height={bodyHeight} borderRadius="6px" />
        {progress !== null && progress !== undefined && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "11px"
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{ width: 14, height: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
                  role="img"
                  aria-label="Loading"
                  data-testid="crystal-loader"
                  data-variant="inline"
                >
                  <CrystalMark size={14} idPrefix={idPrefix ? `${idPrefix}-progress` : undefined} />
                </div>
                <span>Downloading asset data...</span>
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div
              style={{
                width: "100%",
                height: "6px",
                background: "var(--surf2, rgba(255,255,255,0.1))",
                borderRadius: "3px",
                overflow: "hidden"
              }}
            >
              <div
                data-testid="asset-progress-bar"
                style={{
                  width: `${Math.max(0, Math.min(100, progress))}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, var(--pri, #6CFF9A), var(--priC, #123B27))",
                  transition: "width 0.2s ease-out"
                }}
              />
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SkeletonBox width="90%" height="12px" />
          <SkeletonBox width="60%" height="12px" />
        </div>
        {children}
      </div>
    );
  }

  return null;
};

export default BrandedLoader;
