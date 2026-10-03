import React from "react";
import TouchTarget from "./TouchTarget";
import Icon from "./Icon";
import { useTheme } from "../context/ThemeContext.jsx";

export interface MobileOverlayControlsProps {
  cameraPreset?: string;
  onCameraChange?: (preset: string) => void;
  onMove?: (forward: number, right: number, up?: number) => void;
  onOpenChat?: () => void;
  onOpenMenu?: () => void;
  onOpenInventory?: () => void;
  onOpenRadar?: () => void;
  onOpenSettings?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetView?: () => void;
  onRefreshScene?: () => void;
  onToggleOverlays?: () => void;
  showDpad?: boolean;
  onToggleDpad?: () => void;
  panMode?: boolean;
  onTogglePan?: () => void;
  chatOpen?: boolean;
  enhanced?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * MobileOverlayControls provides accessible touch-target overlay toolbars
 * over the 3D viewer canvas.
 *
 * Containers maintain 8px gaps between targets using flexbox layout rules (Technique C38, C18)
 * and encapsulate all interactive buttons within <TouchTarget> wrappers (Technique C42, WCAG 2.5.8).
 */
export const MobileOverlayControls: React.FC<MobileOverlayControlsProps> = ({
  cameraPreset = "rear",
  onCameraChange,
  onMove,
  onOpenChat,
  onOpenMenu,
  onOpenInventory,
  onOpenRadar,
  onOpenSettings,
  onZoomIn,
  onZoomOut,
  onResetView,
  onRefreshScene,
  onToggleOverlays,
  showDpad = true,
  onToggleDpad,
  panMode = false,
  onTogglePan,
  chatOpen = false,
  enhanced = false,
  className = "",
  style,
}) => {
  const { V } = useTheme();

  const buttonStyle: React.CSSProperties = {
    background: V.surf,
    color: V.pri,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs || "4px",
    fontSize: "11px",
    fontWeight: 600,
  };

  const activeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: V.pri,
    color: V.onpri || "#000",
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    boxSizing: "border-box",
  };

  return (
    <div
      className={`mobile-overlay-controls ${className}`.trim()}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "12px",
        boxSizing: "border-box",
        zIndex: 20,
        ...style,
      }}
    >
      {/* Top Bar: Camera Presets & Sync */}
      <div
        className="overlay-container top-bar"
        style={{
          ...containerStyle,
          justifyContent: "space-between",
          pointerEvents: "auto",
          width: "100%",
          flexWrap: "wrap",
        }}
      >
        <div style={{ ...containerStyle, flexWrap: "wrap" }}>
          {[
            { id: "rear", label: "REAR" },
            { id: "front", label: "FRONT" },
            { id: "first-person", label: "MOUSELOOK" },
            { id: "free", label: "FREE" },
          ].map((preset) => (
            <TouchTarget
              key={preset.id}
              minSize={24}
              enhanced={enhanced}
              aria-label={`Camera view ${preset.label}`}
              aria-pressed={cameraPreset === preset.id}
              onClick={() => onCameraChange?.(preset.id)}
              style={cameraPreset === preset.id ? activeButtonStyle : buttonStyle}
            >
              <span style={{ fontSize: "10px", padding: "0 2px" }}>{preset.label}</span>
            </TouchTarget>
          ))}
        </div>

        <div style={{ ...containerStyle, flexWrap: "wrap" }}>
          {onRefreshScene && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Sync 3D Scene"
              title="Sync Scene"
              onClick={onRefreshScene}
              style={buttonStyle}
            >
              <Icon name="rotate-cw" size={14} />
            </TouchTarget>
          )}

          {onResetView && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Reset Camera View"
              title="Reset Camera View (Home key)"
              onClick={onResetView}
              style={buttonStyle}
            >
              <Icon name="home" size={14} />
            </TouchTarget>
          )}

          {onToggleDpad && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label={showDpad ? "Hide movement controls" : "Show movement controls"}
              title={showDpad ? "Hide D-pad controls" : "Show D-pad controls"}
              aria-pressed={showDpad}
              onClick={onToggleDpad}
              style={showDpad ? activeButtonStyle : buttonStyle}
            >
              <span style={{ fontSize: "10px", padding: "0 4px" }}>
                {showDpad ? "DPAD ON" : "DPAD OFF"}
              </span>
            </TouchTarget>
          )}

          {onToggleOverlays && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Hide 3D overlays"
              title="Hide all overlays (H)"
              onClick={onToggleOverlays}
              style={{ ...buttonStyle, padding: "0 6px" }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "10px" }}>
                <Icon name="eye-off" size={13} />
                <span>HIDE UI</span>
              </span>
            </TouchTarget>
          )}
        </div>
      </div>

      {/* Middle Area: Side Action Rail */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flex: 1,
          pointerEvents: "none",
          margin: "8px 0",
        }}
      >
        {/* Left Side Actions */}
        <div
          className="overlay-container side-toolbar-left"
          style={{
            ...containerStyle,
            flexDirection: "column",
            pointerEvents: "auto",
          }}
        >
          {onOpenChat && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label={chatOpen ? "Close Chat Overlay" : "Open Chat"}
              aria-pressed={chatOpen}
              onClick={onOpenChat}
              style={chatOpen ? activeButtonStyle : buttonStyle}
            >
              <Icon name="message-square" size={16} />
            </TouchTarget>
          )}
          {onOpenMenu && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Open Menu"
              onClick={onOpenMenu}
              style={buttonStyle}
            >
              <Icon name="menu" size={16} />
            </TouchTarget>
          )}
          {onOpenInventory && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Open Inventory"
              onClick={onOpenInventory}
              style={buttonStyle}
            >
              <Icon name="folder" size={16} />
            </TouchTarget>
          )}
        </div>

        {/* Right Side Actions / Zoom */}
        <div
          className="overlay-container side-toolbar-right"
          style={{
            ...containerStyle,
            flexDirection: "column",
            pointerEvents: "auto",
          }}
        >
          {onZoomIn && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Zoom In"
              onClick={onZoomIn}
              style={buttonStyle}
            >
              <Icon name="zoom-in" size={16} />
            </TouchTarget>
          )}
          {onZoomOut && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Zoom Out"
              onClick={onZoomOut}
              style={buttonStyle}
            >
              <Icon name="zoom-out" size={16} />
            </TouchTarget>
          )}
          {onTogglePan && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label={panMode ? "Switch to Orbit Mode" : "Switch to Pan Mode"}
              title={panMode ? "Pan Mode Active (Tap to Orbit)" : "Orbit Mode Active (Tap to Pan)"}
              aria-pressed={panMode}
              onClick={onTogglePan}
              style={panMode ? activeButtonStyle : buttonStyle}
            >
              <Icon name="move" size={16} />
            </TouchTarget>
          )}
          {onResetView && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Reset Camera View"
              title="Reset View (Home key)"
              onClick={onResetView}
              style={buttonStyle}
            >
              <Icon name="home" size={16} />
            </TouchTarget>
          )}
          {onOpenRadar && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Open Radar"
              onClick={onOpenRadar}
              style={buttonStyle}
            >
              <Icon name="compass" size={16} />
            </TouchTarget>
          )}
          {onOpenSettings && (
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Open Settings"
              onClick={onOpenSettings}
              style={buttonStyle}
            >
              <Icon name="settings" size={16} />
            </TouchTarget>
          )}
        </div>
      </div>

      {/* Bottom Bar: Directional Movement Controls */}
      <div
        className="overlay-container bottom-bar"
        style={{
          ...containerStyle,
          justifyContent: "space-between",
          alignItems: "flex-end",
          pointerEvents: showDpad ? "auto" : "none",
          width: "100%",
          visibility: showDpad ? "visible" : "hidden",
        }}
      >
        {/* D-Pad Movement Flexbox Container */}
        <div
          className="overlay-container movement-dpad"
          style={{
            ...containerStyle,
            flexDirection: "column",
          }}
        >
          <div style={containerStyle}>
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Move forward"
              onClick={() => onMove?.(1, 0)}
              style={buttonStyle}
            >
              <Icon name="arrow-up" size={16} />
            </TouchTarget>
          </div>
          <div style={containerStyle}>
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Move left"
              onClick={() => onMove?.(0, -1)}
              style={buttonStyle}
            >
              <Icon name="arrow-left" size={16} />
            </TouchTarget>
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Move backward"
              onClick={() => onMove?.(-1, 0)}
              style={buttonStyle}
            >
              <Icon name="arrow-down" size={16} />
            </TouchTarget>
            <TouchTarget
              minSize={24}
              enhanced={enhanced}
              aria-label="Move right"
              onClick={() => onMove?.(0, 1)}
              style={buttonStyle}
            >
              <Icon name="arrow-right" size={16} />
            </TouchTarget>
          </div>
        </div>

        {/* Up / Down Elevation Controls */}
        <div
          className="overlay-container movement-elevation"
          style={{
            ...containerStyle,
            flexDirection: "column",
          }}
        >
          <TouchTarget
            minSize={24}
            enhanced={enhanced}
            aria-label="Move up"
            onClick={() => onMove?.(0, 0, 1)}
            style={buttonStyle}
          >
            <span style={{ fontSize: "10px" }}>UP</span>
          </TouchTarget>
          <TouchTarget
            minSize={24}
            enhanced={enhanced}
            aria-label="Move down"
            onClick={() => onMove?.(0, 0, -1)}
            style={buttonStyle}
          >
            <span style={{ fontSize: "10px" }}>DN</span>
          </TouchTarget>
        </div>
      </div>
    </div>
  );
};

export default MobileOverlayControls;
