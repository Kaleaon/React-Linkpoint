import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app";
import ViewportCanvas from "../components/ViewportCanvas";
import HudControls from "./HudControls.jsx";
import TouchTarget from "../components/TouchTarget.tsx";
import MobileOverlayControls from "../components/MobileOverlayControls.tsx";
import OutfitCarouselDrawer from "../components/OutfitCarouselDrawer.tsx";
import AccessibleChatLog from "../components/AccessibleChatLog.jsx";
import Icon from "../components/Icon.jsx";

export default function World3D({ desktopBackdrop = false }) {
  const { V, t } = useTheme();
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState([0, 0, 0]);
  const [objectCount, setObjectCount] = useState(app.world.objects.length);
  const [cameraPreset, setCameraPreset] = useState("rear");
  const [selection, setSelection] = useState(app.world.selectedObject);
  const [interactionMode, setInteractionModeState] = useState(() => app.world.getInteractionMode());
  const [chatMessages, setChatMessages] = useState(() => app.chat.messages);
  const [voice, setVoice] = useState({ state: app.voice.state, muted: app.voice.muted, message: "" });
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  const [showOutfitDrawer, setShowOutfitDrawer] = useState(false);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isSmallViewport = viewportWidth < 480;
  const isDesktopViewport = viewportWidth >= 768;

  useEffect(() => {
    const updateVoice = (next) => setVoice((current) => ({ ...current, ...next }));
    app.voice.on("state", updateVoice);
    return () => app.voice.off("state", updateVoice);
  }, []);

  // Overlay visibility controls
  const [showOverlays, setShowOverlays] = useState(true);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [showChatOverlay, setShowChatOverlay] = useState(false);
  const [showDpad, setShowDpad] = useState(true);
  const [panMode, setPanModeState] = useState(() => app.world.getPanMode?.() || false);

  const toggleOverlays = useCallback(() => {
    setShowOverlays((prev) => !prev);
  }, []);

  const handleResetView = useCallback(() => {
    app.world.resetCamera?.();
    refresh();
  }, []);

  const handleTogglePan = useCallback(() => {
    const next = app.world.togglePanMode?.();
    setPanModeState(!!next);
  }, []);

  useEffect(() => {
    const onPanMode = (enabled) => setPanModeState(enabled);
    app.world.on("pan_mode_changed", onPanMode);
    return () => {
      app.world.off("pan_mode_changed", onPanMode);
    };
  }, []);

  // Listen to keyboard shortcut (H/h to toggle overlays, Escape to deselect/toggle) and custom events
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isInput) return;

      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        toggleOverlays();
      } else if (event.key === "Home" || ((event.ctrlKey || event.metaKey) && (event.key === "r" || event.key === "R"))) {
        event.preventDefault();
        handleResetView();
      } else if (event.key === "Escape") {
        if (selection) {
          event.preventDefault();
          app.world.selectObject(null);
          setSelection(null);
        } else if (!showOverlays) {
          setShowOverlays(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    app.world.on("toggle_overlays", toggleOverlays);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      app.world.off("toggle_overlays", toggleOverlays);
    };
  }, [toggleOverlays, selection, showOverlays]);

  useEffect(() => {
    const updateChat = () => setChatMessages([...app.chat.messages]);
    app.chat.on("message_received", updateChat);
    app.chat.on("message_sent", updateChat);
    return () => {
      app.chat.off("message_received", updateChat);
      app.chat.off("message_sent", updateChat);
    };
  }, []);

  const spatialMessages = useMemo(() => {
    return chatMessages.filter((m) => m.type !== "im" && m.type !== "group").slice(-10);
  }, [chatMessages]);

  const refresh = () => setPosition(app.world.camera3d?.position.map(Math.round) || [0, 0, 0]);
  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    const updateObjects = (objects) => { if (active) setObjectCount(objects.length); };
    const updateCamera = (camera) => { if (active && camera) { setPosition(camera.position.map(Math.round)); setCameraPreset(camera.preset); } };
    app.world.on("objects_changed", updateObjects);
    app.world.on("camera_changed", updateCamera);
    const updateSelection = (object) => { if (active) setSelection(object); };
    app.world.on("selection_changed", updateSelection);
    const updateInteractionMode = (mode) => { if (active) setInteractionModeState(mode); };
    app.world.on("interaction_mode_changed", updateInteractionMode);
    app.world.init(canvas).then(() => { if (active) { setReady(!!app.world.graphics3d); refresh(); } }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "WebGL initialization failed"); });
    return () => { active = false; app.world.off("objects_changed", updateObjects); app.world.off("camera_changed", updateCamera); app.world.off("selection_changed", updateSelection); app.world.off("interaction_mode_changed", updateInteractionMode); app.world.destroyRenderer(canvas); };
  }, []);

  const move = (forward, right, up = 0) => { app.world.moveCamera(right, forward, up); refresh(); };
  const region = app.protocol.authReply?.sim_name || app.protocol.authReply?.region_name || app.world.region?.name || "Region unavailable";
  const dataStatus = app.world.getDataStatus();
  const button = { minWidth: 44, minHeight: 44, border: `1px solid ${V.outv}`, borderRadius: V.rs, background: V.surf, color: V.pri, cursor: "pointer" };

  const handleRefreshScene = async () => {
    try {
      await app.world.loadScene();
      setObjectCount(app.world.objects.length);
      refresh();
    } catch (err) {
      console.warn('Refresh scene error:', err);
    }
  };

  const sceneStyle = desktopBackdrop
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", background: "#000" }
    : { flex: 1, minHeight: 0, position: "relative", background: "#000" };

  return (
    <section aria-label="3D world view" style={sceneStyle}>
      <ViewportCanvas
        ref={canvasRef}
        id={desktopBackdrop ? "world-canvas-backdrop" : "world-canvas"}
        regionName={region}
        position={position}
        onCameraMove={(forward, right, up) => move(forward, right, up)}
        onZoom={(delta) => { app.world.camera3d?.zoom(delta); refresh(); }}
        onResetView={handleResetView}
        onPan={(dx, dy) => { app.world.camera3d?.pan(-dx * 0.02, dy * 0.02); refresh(); }}
        showOverlayControls={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
      />

      {/* Floating buttons when overlays are hidden to easily restore them */}
      {!desktopBackdrop && !showOverlays && (
        <div style={{ position: "absolute", top: 14, right: 14, zIndex: 40, display: "flex", gap: 8 }}>
          <TouchTarget
            minSize={44}
            aria-label="Reset Camera View"
            title="Reset Camera View (Home key)"
            onClick={handleResetView}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 10px",
              background: "rgba(0, 0, 0, 0.75)",
              color: V.ink,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              fontSize: 11,
              fontWeight: 700,
              backdropFilter: "blur(6px)",
              cursor: "pointer",
            }}
          >
            <Icon name="home" size={14} />
            <span>RESET</span>
          </TouchTarget>
          <TouchTarget
            minSize={44}
            aria-label="Show 3D overlays"
            title="Show overlays (Shortcut: H)"
            onClick={toggleOverlays}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              background: "rgba(0, 0, 0, 0.75)",
              color: V.pri,
              border: `1px solid ${V.pri}`,
              borderRadius: V.rs,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.5px",
              backdropFilter: "blur(6px)",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
              cursor: "pointer",
            }}
          >
            <Icon name="eye" size={16} />
            <span>SHOW OVERLAYS (H)</span>
          </TouchTarget>
        </div>
      )}

      {/* Overlays when enabled */}
      {!desktopBackdrop && showOverlays && (
        <>
          {/* Top-Right Quick Action Buttons */}
          <div style={{ position: "absolute", top: 12, right: 12, zIndex: 35, display: "flex", gap: 6 }}>
            <TouchTarget
              minSize={44}
              aria-label="Reset Camera View"
              title="Reset View (Home key)"
              onClick={handleResetView}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                background: "rgba(0, 0, 0, 0.7)",
                color: V.ink,
                border: `1px solid ${V.outv}`,
                borderRadius: V.rs,
                fontSize: 10,
                fontWeight: 700,
                backdropFilter: "blur(4px)",
                cursor: "pointer",
              }}
            >
              <Icon name="home" size={13} />
              <span>RESET</span>
            </TouchTarget>
            <TouchTarget
              minSize={44}
              aria-label="Hide 3D overlays"
              title="Hide all overlays (Shortcut: H)"
              onClick={toggleOverlays}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 8px",
                background: "rgba(0, 0, 0, 0.7)",
                color: V.pri,
                border: `1px solid ${V.outv}`,
                borderRadius: V.rs,
                fontSize: 10,
                fontWeight: 700,
                backdropFilter: "blur(4px)",
                cursor: "pointer",
              }}
            >
              <Icon name="eye-off" size={13} />
              <span>HIDE UI (H)</span>
            </TouchTarget>
          </div>

          {/* Diagnostics Widget in Top-Left */}
          {showDiagnostics ? (
            diagnosticsExpanded ? (
              <output
                style={{
                  position: "absolute",
                  left: 12,
                  top: 12,
                  padding: 8,
                  maxWidth: "min(280px, calc(100% - 24px))",
                  maxHeight: "38%",
                  overflowY: "auto",
                  background: V.surf,
                  color: V.ink,
                  font: `400 10px/1.5 ${t.font}`,
                  borderRadius: V.rs,
                  border: `1px solid ${V.outv}`,
                  backdropFilter: "blur(4px)",
                  zIndex: 25,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <strong>{region}</strong>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      aria-label="Collapse scene statistics"
                      title="Collapse details"
                      onClick={() => setDiagnosticsExpanded(false)}
                      style={{
                        background: "transparent",
                        border: 0,
                        color: V.pri,
                        cursor: "pointer",
                        padding: "1px 4px",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      [−]
                    </button>
                    <button
                      type="button"
                      aria-label="Close scene statistics"
                      title="Close info"
                      onClick={() => setShowDiagnostics(false)}
                      style={{
                        background: "transparent",
                        border: 0,
                        color: V.ink2,
                        cursor: "pointer",
                        padding: "1px 4px",
                        fontSize: 11,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                Pos: {position.join(", ")}<br />
                {dataStatus}<br />
                {objectCount} simulator objects<br />
                <span style={{ fontWeight: 700, color: interactionMode === "navigate" ? V.pri : V.ink }}>
                  MODE: {interactionMode.toUpperCase()} ({interactionMode === "navigate" ? "Raycast Disabled" : "Raycast Active"}) · {panMode ? "PAN" : "ORBIT"}
                </span>
                <div style={{ marginTop: 6, opacity: 0.75 }}>
                  Mobile: 2-finger pan & pinch-zoom (spread: zoom in, pinch: zoom out) · 1-finger orbit or pan
                  {isDesktopViewport && (
                    <>
                      <br />
                      Desktop: Drag: orbit · Shift-drag: pan · Wheel: zoom · WASD: move
                    </>
                  )}
                </div>
                <div style={{ marginTop: 4, opacity: 0.9 }}>
                  {interactionMode === "navigate" ? "Switch to INTERACT mode to tap objects" : "Tap an object to inspect it"}
                </div>
                <div style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={handleRefreshScene}
                    disabled={!app.auth.isLoggedIn()}
                    style={{ padding: "2px 8px", fontSize: "10px", background: V.pri, color: V.onpri, border: 0, borderRadius: V.rs, cursor: "pointer" }}
                  >
                    SYNC SCENE
                  </button>
                </div>
                {!ready && !error ? <><br />Starting renderer…</> : null}
                {error ? <><br /><span style={{ color: V.err }}>{error}</span></> : null}
              </output>
            ) : (
              <output
                style={{
                  position: "absolute",
                  left: 12,
                  top: 12,
                  padding: "4px 8px",
                  background: "rgba(0, 0, 0, 0.7)",
                  color: V.ink,
                  font: `400 10px/1.4 ${t.font}`,
                  borderRadius: V.rs,
                  border: `1px solid ${V.outv}`,
                  backdropFilter: "blur(4px)",
                  zIndex: 25,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span><strong>{region}</strong> · {position.join(", ")}</span>
                <button
                  type="button"
                  aria-label="Expand scene statistics"
                  title="Expand details"
                  onClick={() => setDiagnosticsExpanded(true)}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: V.pri,
                    cursor: "pointer",
                    padding: "2px 4px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  [+]
                </button>
                <button
                  type="button"
                  aria-label="Hide scene statistics"
                  title="Hide"
                  onClick={() => setShowDiagnostics(false)}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: V.ink2,
                    cursor: "pointer",
                    padding: "2px 4px",
                    fontSize: 10,
                  }}
                >
                  ✕
                </button>
              </output>
            )
          ) : (
            <TouchTarget
              minSize={44}
              aria-label="Show scene information"
              title="Show scene info"
              onClick={() => setShowDiagnostics(true)}
              style={{
                position: "absolute",
                left: 12,
                top: 12,
                zIndex: 22,
                background: "rgba(0, 0, 0, 0.65)",
                color: V.pri,
                border: `1px solid ${V.outv}`,
                borderRadius: V.rs,
                padding: "4px 6px",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              <Icon name="info" size={13} />
              <span>INFO</span>
            </TouchTarget>
          )}

          {/* Mode Selector Top-Center */}
          <div
            aria-label="Viewport interaction mode"
            data-testid="interaction-mode-selector"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 12,
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(0, 0, 0, 0.7)",
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              padding: 3,
              backdropFilter: "blur(4px)",
              zIndex: 24,
            }}
          >
            <button
              type="button"
              aria-pressed={interactionMode === "navigate"}
              aria-label="Navigate Mode"
              onClick={() => app.world.setInteractionMode("navigate")}
              style={{
                ...button,
                minWidth: 0,
                padding: "4px 8px",
                background: interactionMode === "navigate" ? V.pri : "transparent",
                color: interactionMode === "navigate" ? V.onpri : V.ink,
                fontSize: 10,
                fontWeight: 700,
                borderRadius: V.rs,
                border: 0,
              }}
            >
              NAVIGATE
            </button>
            <button
              type="button"
              aria-pressed={interactionMode === "interact"}
              aria-label="Interact Mode"
              onClick={() => app.world.setInteractionMode("interact")}
              style={{
                ...button,
                minWidth: 0,
                padding: "4px 8px",
                background: interactionMode === "interact" ? V.pri : "transparent",
                color: interactionMode === "interact" ? V.onpri : V.ink,
                fontSize: 10,
                fontWeight: 700,
                borderRadius: V.rs,
                border: 0,
              }}
            >
              INTERACT
            </button>
            <div style={{ width: 1, height: 16, background: V.outv, margin: "0 2px" }} />
            <button
              type="button"
              aria-pressed={!panMode}
              aria-label="Orbit View Mode"
              title="1-finger drag orbits view"
              onClick={() => app.world.setPanMode?.(false)}
              style={{
                ...button,
                minWidth: 0,
                padding: "4px 6px",
                background: !panMode ? V.pri : "transparent",
                color: !panMode ? V.onpri : V.ink,
                fontSize: 10,
                fontWeight: 700,
                borderRadius: V.rs,
                border: 0,
              }}
            >
              ORBIT
            </button>
            <button
              type="button"
              aria-pressed={panMode}
              aria-label="Pan View Mode"
              title="1-finger drag pans view"
              onClick={() => app.world.setPanMode?.(true)}
              style={{
                ...button,
                minWidth: 0,
                padding: "4px 6px",
                background: panMode ? V.pri : "transparent",
                color: panMode ? V.onpri : V.ink,
                fontSize: 10,
                fontWeight: 700,
                borderRadius: V.rs,
                border: 0,
              }}
            >
              PAN
            </button>
          </div>

          {/* Selected Object Inspector */}
          {selection && (
            <aside
              aria-label="Selected object"
              style={{
                position: "absolute",
                right: 14,
                top: 50,
                width: 220,
                padding: 10,
                color: V.ink,
                background: V.surf,
                border: `1px solid ${V.pri}`,
                borderRadius: V.rs,
                boxShadow: "0 8px 24px #0008",
                font: `400 11px/1.4 ${t.font}`,
                zIndex: 28,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: V.pri, fontWeight: 800, letterSpacing: ".08em", fontSize: 9 }}>SELECTED</span>
                <button
                  type="button"
                  aria-label="Deselect object"
                  title="Deselect (Escape)"
                  onClick={() => {
                    setSelection(null);
                    app.world.selectObject(null);
                  }}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: V.ink2,
                    cursor: "pointer",
                    padding: "2px 4px",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              </div>
              <strong style={{ display: "block", marginTop: 3 }}>
                {selection.name || selection.id || "Simulator object"}
              </strong>
              <span style={{ opacity: 0.7 }}>
                {selection.shape || (selection.avatar ? "Avatar" : "Object")} · {selection.distance?.toFixed?.(1) || "—"} m
              </span>
              <TouchTarget
                onClick={() => app.world.focusSelectedObject()}
                style={{ ...button, width: "100%", minHeight: 32, marginTop: 8, background: V.pri, color: V.onpri, fontSize: 10 }}
              >
                FOCUS CAMERA
              </TouchTarget>
              {!selection.avatar && app.auth.isLoggedIn() ? (
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <TouchTarget onClick={() => void app.world.touchSelected()} style={{ ...button, flex: 1, minHeight: 32, fontSize: 10 }}>
                    TOUCH
                  </TouchTarget>
                  <TouchTarget
                    onClick={() =>
                      void app.protocol
                        .sit(selection.id)
                        .catch((error) =>
                          app.world.emit("action_failed", {
                            action: "sit",
                            message: error instanceof Error ? error.message : "Sit failed",
                          })
                        )
                    }
                    style={{ ...button, flex: 1, minHeight: 32, fontSize: 10 }}
                  >
                    SIT
                  </TouchTarget>
                </div>
              ) : null}
            </aside>
          )}

          {/* Mobile Overlay Controls (D-pad, camera presets, side toolbars) */}
          <MobileOverlayControls
            cameraPreset={cameraPreset}
            onCameraChange={(preset) => {
              app.world.setCameraPreset(preset);
              setCameraPreset(preset);
              refresh();
            }}
            onMove={move}
            onRefreshScene={handleRefreshScene}
            onToggleOverlays={toggleOverlays}
            showDpad={showDpad}
            onToggleDpad={() => setShowDpad((prev) => !prev)}
            panMode={panMode}
            onTogglePan={handleTogglePan}
            onResetView={handleResetView}
            onOpenChat={() => setShowChatOverlay((prev) => !prev)}
            chatOpen={showChatOverlay}
            onOpenOutfits={() => setShowOutfitDrawer((prev) => !prev)}
            outfitsOpen={showOutfitDrawer}
            voiceState={voice.state}
            voiceMuted={voice.muted}
            onToggleMic={() => app.voice.setMuted(!voice.muted)}
            onJoinVoice={() => void app.voice.connect().catch(() => {})}
            onZoomIn={() => {
              app.world.camera3d?.zoom(0.2);
              refresh();
            }}
            onZoomOut={() => {
              app.world.camera3d?.zoom(-0.2);
              refresh();
            }}
          />

          {/* 3D World View Microphone & Voice Widget */}
          <div
            style={{
              position: "absolute",
              left: 14,
              top: showDiagnostics ? (diagnosticsExpanded ? "42%" : 46) : 14,
              zIndex: 25,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px",
              background: "rgba(0, 0, 0, 0.75)",
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              backdropFilter: "blur(6px)",
              color: V.ink,
            }}
          >
            <Icon name={voice.muted ? "mic-off" : "mic"} size={14} style={{ color: voice.state === "connected" ? (voice.muted ? V.err : V.pri) : V.ink2 }} />
            <span style={{ fontSize: "10px", fontWeight: 700 }}>
              VOICE: {voice.state.toUpperCase()}{voice.state === "connected" ? (voice.muted ? " (MUTED)" : " (LIVE)") : ""}
            </span>
            {voice.state === "connected" ? (
              <>
                <button
                  type="button"
                  onClick={() => app.voice.setMuted(!voice.muted)}
                  style={{
                    padding: "2px 8px",
                    fontSize: "10px",
                    fontWeight: 700,
                    background: voice.muted ? V.pri : "rgba(255, 255, 255, 0.12)",
                    color: voice.muted ? V.onpri : V.ink,
                    border: `1px solid ${V.outv}`,
                    borderRadius: V.rs,
                    cursor: "pointer",
                  }}
                >
                  {voice.muted ? "UNMUTE MIC" : "MUTE MIC"}
                </button>
                <button
                  type="button"
                  onClick={() => void app.voice.disconnect()}
                  style={{
                    padding: "2px 6px",
                    fontSize: "10px",
                    background: "transparent",
                    color: V.err,
                    border: `1px solid ${V.err}`,
                    borderRadius: V.rs,
                    cursor: "pointer",
                  }}
                >
                  LEAVE
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!app.auth.isLoggedIn()}
                onClick={() => void app.voice.connect().catch(() => {})}
                style={{
                  padding: "2px 8px",
                  fontSize: "10px",
                  fontWeight: 700,
                  background: V.pri,
                  color: V.onpri,
                  border: 0,
                  borderRadius: V.rs,
                  cursor: "pointer",
                }}
              >
                JOIN VOICE
              </button>
            )}
          </div>

          {/* Spatial Chat Overlay (Collapsible & dismissible) */}
          {showChatOverlay && (
            <div
              style={{
                position: "absolute",
                left: 14,
                bottom: showDpad ? 160 : 60,
                width: 320,
                maxWidth: "calc(100% - 28px)",
                maxHeight: 180,
                zIndex: 26,
                display: "flex",
                flexDirection: "column",
                background: "rgba(0, 0, 0, 0.75)",
                borderRadius: V.rs,
                border: `1px solid ${V.outv}`,
                backdropFilter: "blur(6px)",
                overflow: "hidden",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.5)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 8px",
                  background: V.surf,
                  borderBottom: `1px solid ${V.outv}`,
                  fontSize: 10,
                  fontWeight: 700,
                  color: V.pri,
                }}
              >
                <span>SPATIAL CHAT</span>
                <button
                  type="button"
                  aria-label="Close spatial chat overlay"
                  title="Close chat overlay"
                  onClick={() => setShowChatOverlay(false)}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: V.ink2,
                    cursor: "pointer",
                    padding: "2px 4px",
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              </div>
              <AccessibleChatLog
                messages={spatialMessages}
                variant="overlay"
                ariaLabel="Spatial chat overlay log"
                emptyStateMessage="No recent spatial chat."
                maxHeight={140}
              />
            </div>
          )}

          {/* HUD Controls */}
          <HudControls
            bottomOffset={isSmallViewport && showDpad ? 110 : 14}
            outfitDrawerOpen={showOutfitDrawer}
          />

          {/* Outfit Carousel Drawer */}
          <OutfitCarouselDrawer
            isOpen={showOutfitDrawer}
            onClose={() => setShowOutfitDrawer(false)}
          />
        </>
      )}
    </section>
  );
}

export function World3DActionBar() {
  const { V } = useTheme();
  const connected = app.auth.isLoggedIn();
  const count = app.world.objects.length;
  const [overlaysVisible, setOverlaysVisible] = useState(true);

  useEffect(() => {
    const onToggle = () => setOverlaysVisible((prev) => !prev);
    app.world.on("toggle_overlays", onToggle);
    return () => {
      app.world.off("toggle_overlays", onToggle);
    };
  }, []);

  const handleToggle = () => {
    app.world.emit("toggle_overlays");
  };

  return (
    <div
      role="status"
      style={{
        padding: "6px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: V.surf,
        borderTop: `1px solid ${V.outv}`,
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.5px",
        flexWrap: "wrap",
        gap: 6,
      }}
    >
      <span style={{ color: connected ? V.pri : V.err }}>
        {connected ? `CONNECTED — LIVE SECOND LIFE SCENE (${count} OBJECTS)` : "DISCONNECTED"}
      </span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          type="button"
          aria-label="Reset camera view to avatar"
          title="Reset Camera View (Shortcut: Home)"
          onClick={() => {
            app.world.resetCamera?.();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 8px",
            background: "transparent",
            color: V.ink,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            fontSize: "10px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <Icon name="home" size={13} />
          <span>RESET VIEW</span>
        </button>
        <button
          type="button"
          aria-label={overlaysVisible ? "Hide 3D view overlays" : "Show 3D view overlays"}
          title="Toggle overlays (Shortcut: H)"
          onClick={handleToggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "4px 10px",
            background: overlaysVisible ? "transparent" : V.pri,
            color: overlaysVisible ? V.pri : V.onpri,
            border: `1px solid ${V.pri}`,
            borderRadius: V.rs,
            fontSize: "10px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <Icon name={overlaysVisible ? "eye-off" : "eye"} size={13} />
          <span>{overlaysVisible ? "HIDE OVERLAYS (H)" : "SHOW OVERLAYS (H)"}</span>
        </button>
      </div>
    </div>
  );
}
