import React, { useState, useEffect, useCallback } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import Icon from "./Icon.jsx";
import { SkeletonAssetPlaceholder } from "./SkeletonLoader.jsx";

/**
 * AssetContainer component with skeleton UI placeholder, progressive download progress listener,
 * smooth transition to loaded asset content, and clear error state with retry.
 * @param {{ asset?: any, onFetch?: ((asset: any, onProgress: (loaded: number, total: number) => void) => Promise<any>) | null, onProgress?: ((percent: number, loaded: number, total: number) => void) | null, autoFetch?: boolean, title?: string | null, renderContent?: ((data: any) => import("react").ReactNode) | null, children?: import("react").ReactNode, style?: import("react").CSSProperties, className?: string }} props
 */
export default function AssetContainer({
  asset = null,
  onFetch = null,
  onProgress: externalOnProgress = null,
  autoFetch = true,
  title = null,
  renderContent = null,
  children = null,
  style = {},
  className = "",
}) {
  const { V, t } = useTheme?.() || { V: {}, t: { font: "sans-serif" } };

  const [status, setStatus] = useState(asset?.data ? "loaded" : "idle"); // "idle" | "loading" | "downloading" | "loaded" | "error"
  const [progress, setProgress] = useState(0); // 0 to 100
  const [bytesInfo, setBytesInfo] = useState({ loaded: 0, total: 0 });
  const [loadedData, setLoadedData] = useState(asset?.data || null);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleProgress = useCallback(
    (loadedBytes, totalBytes) => {
      let percent = 0;
      if (totalBytes > 0) {
        percent = Math.min(100, Math.max(0, (loadedBytes / totalBytes) * 100));
      } else if (loadedBytes > 0) {
        percent = Math.min(99, loadedBytes % 100);
      }
      setProgress(percent);
      setBytesInfo({ loaded: loadedBytes, total: totalBytes });
      setStatus("downloading");
      if (externalOnProgress) {
        externalOnProgress(percent, loadedBytes, totalBytes);
      }
    },
    [externalOnProgress]
  );

  const executeFetch = useCallback(async () => {
    if (!asset && !onFetch) return;
    setStatus("loading");
    setProgress(0);
    setErrorMsg(null);

    try {
      if (onFetch) {
        const result = await onFetch(asset, handleProgress);
        setLoadedData(result || asset?.data || true);
      } else if (asset?.data) {
        setLoadedData(asset.data);
      } else {
        // Fallback progress simulation if no custom fetch provided
        handleProgress(50, 100);
        await new Promise((resolve) => setTimeout(resolve, 100));
        handleProgress(100, 100);
        setLoadedData(asset || true);
      }
      setStatus("loaded");
    } catch (err) {
      const message = err?.message || "Failed to download asset from network.";
      setErrorMsg(message);
      setStatus("error");
    }
  }, [asset, onFetch, handleProgress]);

  useEffect(() => {
    if (asset?.data && !onFetch) {
      setLoadedData(asset.data);
      setStatus("loaded");
      return;
    }
    if (autoFetch) {
      void executeFetch();
    }
  }, [asset, autoFetch, executeFetch, onFetch]);

  const handleRetry = () => {
    void executeFetch();
  };

  const displayTitle = title || asset?.name || "Asset View";

  if (status === "loading" || status === "idle") {
    return <SkeletonAssetPlaceholder title={displayTitle} progress={null} />;
  }

  if (status === "downloading") {
    return (
      <div
        className={`asset-container asset-downloading ${className}`}
        style={{
          background: V?.surf || "rgba(0,0,0,0.2)",
          border: `1px solid ${V?.outv || "rgba(255,255,255,0.15)"}`,
          borderRadius: V?.rs || "6px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          ...style,
        }}
        data-testid="asset-downloading-state"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name="download-cloud" size={18} style={{ color: V?.pri || "#6CFF9A" }} />
          <span style={{ fontWeight: 700, fontSize: "13px", color: V?.ink || "#fff" }}>{displayTitle}</span>
        </div>
        <SkeletonAssetPlaceholder title={displayTitle} progress={progress} />
        {bytesInfo.total > 0 && (
          <div style={{ fontSize: "11px", color: V?.ink2 || "#aaa", textAlign: "right" }}>
            {(bytesInfo.loaded / 1024).toFixed(1)} KB / {(bytesInfo.total / 1024).toFixed(1)} KB
          </div>
        )}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className={`asset-container asset-error ${className}`}
        style={{
          background: V?.surf || "rgba(0,0,0,0.2)",
          border: `1px solid ${V?.err || "#ff4d4d"}`,
          borderRadius: V?.rs || "6px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          ...style,
        }}
        role="alert"
        data-testid="asset-error-state"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", color: V?.err || "#ff4d4d" }}>
          <Icon name="alert-triangle" size={20} />
          <span style={{ fontWeight: 700, fontSize: "14px" }}>Asset Load Error</span>
        </div>
        <p style={{ fontSize: "12px", margin: 0, color: V?.ink || "#fff" }}>{errorMsg}</p>
        <button
          type="button"
          onClick={handleRetry}
          data-testid="asset-retry-button"
          style={{
            alignSelf: "flex-start",
            padding: "8px 16px",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: ".1em",
            background: V?.err || "#ff4d4d",
            color: "#ffffff",
            border: "none",
            borderRadius: V?.rs || "4px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Icon name="rotate-cw" size={14} />
          RETRY
        </button>
      </div>
    );
  }

  // "loaded" state
  return (
    <div
      className={`asset-container asset-loaded ${className}`}
      style={{
        background: V?.surf || "rgba(0,0,0,0.2)",
        border: `1px solid ${V?.outv || "rgba(255,255,255,0.15)"}`,
        borderRadius: V?.rs || "6px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        ...style,
      }}
      data-testid="asset-loaded-state"
    >
      {renderContent ? (
        renderContent(loadedData, asset)
      ) : children ? (
        children
      ) : (
        <div>
          <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "6px", color: V?.ink || "#fff" }}>
            {displayTitle}
          </div>
          {asset?.description && (
            <p style={{ fontSize: "12px", color: V?.ink2 || "#aaa", margin: "0 0 8px 0" }}>{asset.description}</p>
          )}
          {typeof loadedData === "string" ? (
            <pre
              style={{
                fontFamily: "monospace",
                fontSize: "11px",
                background: V?.surf2 || "rgba(0,0,0,0.3)",
                padding: "10px",
                borderRadius: "4px",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {loadedData}
            </pre>
          ) : (
            <div style={{ fontSize: "12px", color: V?.pri || "#6CFF9A" }}>Asset loaded successfully.</div>
          )}
        </div>
      )}
    </div>
  );
}
