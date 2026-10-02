import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app";
import ViewportCanvas from "../components/ViewportCanvas";
import HudControls from "./HudControls.jsx";
import TouchTarget from "../components/TouchTarget.tsx";
import MobileOverlayControls from "../components/MobileOverlayControls.tsx";
import AccessibleChatLog from "../components/AccessibleChatLog.jsx";

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

  return <section aria-label="3D world view" style={sceneStyle}>
    <ViewportCanvas
      ref={canvasRef}
      id={desktopBackdrop ? "world-canvas-backdrop" : "world-canvas"}
      regionName={region}
      position={position}
      onCameraMove={(forward, right, up) => move(forward, right, up)}
      onZoom={(delta) => { app.world.camera3d?.zoom(delta); refresh(); }}
      onResetView={() => { app.world.resetCamera?.(); refresh(); }}
      showOverlayControls={!desktopBackdrop}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
    {!desktopBackdrop && <output style={{ position: "absolute", left: 12, top: 12, padding: 8, background: V.surf, color: V.ink, font: `400 10px/1.5 ${t.font}`, borderRadius: V.rs, border: `1px solid ${V.outv}`, backdropFilter: "blur(4px)" }}>
      <strong>{region}</strong><br />
      Pos: {position.join(", ")}<br />
      {dataStatus}<br />
      {objectCount} simulator objects<br />
      <span style={{ fontWeight: 700, color: interactionMode === "navigate" ? V.pri : V.ink }}>
        MODE: {interactionMode.toUpperCase()} ({interactionMode === "navigate" ? "Raycast Disabled" : "Raycast Active"})
      </span>
      <div style={{ marginTop: 6, opacity: .75 }}>Drag: orbit · Shift-drag: pan · Wheel/pinch: zoom<br />WASD / ↑↓: move · ←→: turn · E/Q: up/down · Shift: run</div>
      <div style={{ marginTop: 4, opacity: .9 }}>{interactionMode === "navigate" ? "Switch to INTERACT mode to tap objects" : "Tap an object to inspect it"}</div>
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
    </output>}
    {!desktopBackdrop && (
      <div
        aria-label="Viewport interaction mode"
        data-testid="interaction-mode-selector"
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 14,
          display: "flex",
          gap: 4,
          background: V.surf,
          border: `1px solid ${V.outv}`,
          borderRadius: V.rs,
          padding: 3,
          backdropFilter: "blur(4px)",
          zIndex: 10
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
            padding: "4px 12px",
            background: interactionMode === "navigate" ? V.pri : "transparent",
            color: interactionMode === "navigate" ? V.onpri : V.ink,
            fontSize: 10,
            fontWeight: 700,
            borderRadius: V.rs,
            border: 0
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
            padding: "4px 12px",
            background: interactionMode === "interact" ? V.pri : "transparent",
            color: interactionMode === "interact" ? V.onpri : V.ink,
            fontSize: 10,
            fontWeight: 700,
            borderRadius: V.rs,
            border: 0
          }}
        >
          INTERACT
        </button>
      </div>
    )}
    {!desktopBackdrop && selection && <aside aria-label="Selected object" style={{ position: "absolute", right: 14, top: 66, width: 210, padding: 10, color: V.ink, background: V.surf, border: `1px solid ${V.pri}`, borderRadius: V.rs, boxShadow: "0 8px 24px #0008", font: `400 11px/1.4 ${t.font}` }}>
      <div style={{ color: V.pri, fontWeight: 800, letterSpacing: ".08em", fontSize: 9 }}>SELECTED</div>
      <strong style={{ display: "block", marginTop: 3 }}>{selection.name || selection.id || "Simulator object"}</strong>
      <span style={{ opacity: .7 }}>{selection.shape || (selection.avatar ? "Avatar" : "Object")} · {selection.distance?.toFixed?.(1) || "—"} m</span>
      <TouchTarget onClick={() => app.world.focusSelectedObject()} style={{ ...button, width: "100%", minHeight: 32, marginTop: 8, background: V.pri, color: V.onpri, fontSize: 10 }}>FOCUS CAMERA</TouchTarget>
      {!selection.avatar && app.auth.isLoggedIn() ? <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <TouchTarget onClick={() => void app.world.touchSelected()} style={{ ...button, flex: 1, minHeight: 32, fontSize: 10 }}>TOUCH</TouchTarget>
        <TouchTarget onClick={() => void app.protocol.sit(selection.id).catch((error) => app.world.emit("action_failed", { action: "sit", message: error instanceof Error ? error.message : "Sit failed" }))} style={{ ...button, flex: 1, minHeight: 32, fontSize: 10 }}>SIT</TouchTarget>
      </div> : null}
    </aside>}
    {!desktopBackdrop && (
      <MobileOverlayControls
        cameraPreset={cameraPreset}
        onCameraChange={(preset) => {
          app.world.setCameraPreset(preset);
          setCameraPreset(preset);
          refresh();
        }}
        onMove={move}
        onRefreshScene={handleRefreshScene}
      />
    )}
    {!desktopBackdrop && (
      <div
        style={{
          position: "absolute",
          left: 14,
          bottom: 160,
          width: 320,
          maxWidth: "calc(100% - 28px)",
          maxHeight: 180,
          zIndex: 25,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <AccessibleChatLog
          messages={spatialMessages}
          variant="overlay"
          ariaLabel="Spatial chat overlay log"
          emptyStateMessage="No recent spatial chat."
          maxHeight={160}
        />
      </div>
    )}
    <HudControls />
  </section>;
}

export function World3DActionBar() {
  const { V } = useTheme();
  const connected = app.auth.isLoggedIn();
  const count = app.world.objects.length;
  return (
    <div role="status" style={{ padding: 8, textAlign: "center", color: connected ? V.pri : V.err, background: V.surf, fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px" }}>
      {connected ? `CONNECTED — LIVE SECOND LIFE SCENE (${count} OBJECTS)` : "DISCONNECTED"}
    </div>
  );
}
