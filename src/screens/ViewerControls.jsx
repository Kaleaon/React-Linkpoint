import { useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import World3D from "./World3D.jsx";
import { app } from "../linkpoint/app";

function ControlPage({ title, children }) {
  const { V, t } = useTheme();
  return <div className="tool-page" style={{ background: V.bg, color: V.ink, fontFamily: t.font }}><section className="runtime-card" style={{ background: V.surf, borderColor: V.outv, borderRadius: V.rs }}><h2>{title}</h2>{children}</section></div>;
}

export function CameraScreen() {
  const { isFloat } = useTheme();
  const { actions } = useApp();
  return <ControlPage title="Camera & movement">{!isFloat ? <div style={{ height: 320, display: "flex", position: "relative" }}><World3D /></div> : null}<p>Camera controls affect your view of the world.</p>
    <div className="inline-tool">{[["rear", "Rear view"], ["front", "Front view"], ["first-person", "First person"], ["free", "Free camera"]].map(([preset, label]) => <button key={preset} type="button" onClick={() => app.world.setCameraPreset(preset)}>{label}</button>)}</div>
    <div className="inline-tool">{[["Left", 0, -10], ["Right", 0, 10], ["Up", 8, 0], ["Down", -8, 0]].map(([label, pitch, yaw]) => <button key={label} type="button" onClick={() => app.world.rotateCamera(pitch, yaw)}>{label}</button>)}<button type="button" onClick={() => app.world.resetCamera()}>Reset camera</button></div>
    <button type="button" onClick={() => actions.setScreen("3D View")}>Open world view</button>
  </ControlPage>;
}

export function EnvironmentScreen() {
  const [choice, setChoice] = useState(app.world.localEnvironmentHour == null ? "region" : String(app.world.localEnvironmentHour));
  const setTime = value => { setChoice(value); app.world.setLocalEnvironment(value === "region" ? null : Number(value)); };
  return <ControlPage title="Environment"><p>Choose a local sky preview or follow the region’s environment. This changes your view only.</p>
    <label>Time of day<select value={choice} onChange={event => setTime(event.target.value)}>{[["region", "Region settings"], ["0.25", "Sunrise"], ["0.5", "Midday"], ["0.75", "Sunset"], ["0", "Midnight"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
  </ControlPage>;
}

export function SnapshotScreen() {
  const { isFloat } = useTheme();
  const { actions } = useApp();
  const [status, setStatus] = useState("");
  const capture = () => {
    const canvas = app.world.canvas;
    if (!canvas || !app.world.scene3d) { setStatus("Open the 3D world view before taking a snapshot."); return; }
    try {
      // WebGL drawing buffers may be discarded after presentation; draw and
      // capture synchronously to avoid downloading an empty image.
      app.world.scene3d.render();
      canvas.toBlob(blob => {
        if (!blob) { setStatus("The viewer could not capture this frame."); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; link.download = "linkpoint-snapshot.png"; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("Snapshot saved as PNG.");
      }, "image/png");
    } catch (error) { setStatus(error.message || "Snapshot could not be saved."); }
  };
  return <ControlPage title="Snapshot">{!isFloat ? <div style={{ height: 320, display: "flex", position: "relative" }}><World3D /></div> : null}<p>Save the current world frame to your device. Interface panels are excluded.</p><div className="inline-tool"><button type="button" onClick={capture}>Save PNG snapshot</button><button type="button" onClick={() => actions.setScreen("3D View")}>Open world view</button></div>{status ? <p role="status">{status}</p> : null}</ControlPage>;
}
