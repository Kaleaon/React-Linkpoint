import React from "react";
import { useTheme } from "./LayoutContext.js";
import { CrystalProgressBar } from "./CrystalProgressBar.js";
import { CrystalMark, type CrystalMarkProps } from "./CrystalMark.js";

export { CrystalMark, type CrystalMarkProps };

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
          <CrystalProgressBar
            progress={progress}
            showLabel={true}
            idPrefix={idPrefix}
          />
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
