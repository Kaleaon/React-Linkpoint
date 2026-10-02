import { useEffect, useState } from "react";
import useGoogleEnabled from "../hooks/useGoogleEnabled.js";
import Toggle from "../components/Toggle.jsx";
import { loadGoogle } from "../services/google.ts";
import { useApp } from "../context/AppContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";

export default function Settings() {
  const { state, actions } = useApp();
  const [disconnecting, setDisconnecting] = useState(false);
  const googleEnabled = useGoogleEnabled();
  const [googleNote, setGoogleNote] = useState("");
  const [voice, setVoice] = useState({ state: app.voice.state, muted: app.voice.muted, message: "" });
  const user = app.auth.user;
  const region = app.world.region;

  useEffect(() => {
    const update = (next) => setVoice((current) => ({ ...current, ...next }));
    app.voice.on("state", update);
    return () => app.voice.off("state", update);
  }, []);

  const setVolume = (value) => {
    actions.setPref("volume", value);
    app.audio.setVolume(Number.parseInt(value, 10) / 100 || 0);
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await app.auth.logout();
      actions.setScreen("Login");
    } finally {
      setDisconnecting(false);
    }
  };

  // Turning Google off also signs out and forgets this session's access, so nothing stays connected in the background.
  const toggleGoogle = async () => {
    const next = !googleEnabled;
    app.preferences.set("integrations", "google", next);
    setGoogleNote("");
    if (!next) {
      try {
        const google = await loadGoogle();
        await google.auth.signOutGoogle();
        setGoogleNote("Google is off and you have been signed out of it.");
      } catch {
        setGoogleNote("Google is off. Sign-out could not be confirmed; clear this site's data to be sure.");
      }
    }
  };

  return <div className="tool-page">
    <section className="runtime-card">
      <Icon name="plug" size={22} />
      <h2>Current session</h2>
      <dl>
        <dt>Status</dt><dd>{app.auth.isLoggedIn() ? "Connected" : "Disconnected"}</dd>
        <dt>Resident</dt><dd>{user?.fullName || "—"}</dd>
        <dt>Grid</dt><dd>{user?.grid || "—"}</dd>
        <dt>Region</dt><dd>{region?.name || app.protocol.authReply?.sim_name || "Not supplied"}</dd>
        <dt>Account ID</dt><dd>{app.protocol.agentId || "Not supplied"}</dd>
      </dl>
      {app.auth.isLoggedIn() ? <button type="button" disabled={disconnecting} onClick={() => void disconnect()}>{disconnecting ? "Disconnecting…" : "Disconnect"}</button> : null}
    </section>
    <section className="runtime-card" aria-labelledby="integrations-heading">
      <Icon name="plug" size={22} />
      <h2 id="integrations-heading">Optional integrations</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <strong id="google-label">Google Contacts &amp; Calendar</strong>
          <p style={{ margin: "4px 0 0", opacity: 0.8 }}>
            Off by default. When on, you can copy saved contacts to Google Contacts and add group notices to Google Calendar. You sign in with Google only when you use one of those, and Linkpoint asks for just the access that feature needs. Contacts and notices work without it.
          </p>
        </div>
        <span aria-labelledby="google-label"><Toggle on={googleEnabled} onClick={() => void toggleGoogle()} /></span>
      </div>
      {googleNote ? <p role="status">{googleNote}</p> : null}
    </section>
    <section className="runtime-card">
      <Icon name="settings" size={22} />
      <h2>Viewer preferences</h2>
      <label>Draw distance
        <select value={state.prefs.draw} onChange={(event) => actions.setPref("draw", event.target.value)}>
          {["64 m", "96 m", "128 m", "192 m", "256 m"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>Graphics quality
        <select value={state.prefs.quality} onChange={(event) => actions.setPref("quality", event.target.value)}>
          {["Low", "Balanced", "High", "Ultra"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>Bandwidth limit
        <select value={state.prefs.bandwidth} onChange={(event) => actions.setPref("bandwidth", event.target.value)}>
          {["500 kbps", "1 500 kbps", "3 000 kbps", "Unlimited"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
    </section>
    <section className="runtime-card" aria-labelledby="sound-voice-heading">
      <Icon name="volume-2" size={22} />
      <h2 id="sound-voice-heading">Sound &amp; voice</h2>
      <label>Master volume
        <select value={state.prefs.volume} onChange={(event) => setVolume(event.target.value)}>
          {["Muted", "25%", "50%", "70%", "100%"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <p>Simulator sounds use positional HRTF audio. Voice uses Second Life WebRTC with echo cancellation and noise suppression.</p>
      <div className="inline-tool">
        {voice.state === "off" || voice.state === "error"
          ? <button type="button" disabled={!app.auth.isLoggedIn()} onClick={() => void app.voice.connect().catch(() => {})}>Join nearby voice</button>
          : <button type="button" onClick={() => void app.voice.disconnect()}>Leave voice</button>}
        {voice.state === "connected" ? <button type="button" onClick={() => app.voice.setMuted(!voice.muted)}>{voice.muted ? "Unmute microphone" : "Mute microphone"}</button> : null}
      </div>
      <p role="status">Voice: {voice.state}{voice.state === "connected" ? (voice.muted ? " · microphone muted" : " · microphone live") : ""}{voice.message ? ` · ${voice.message}` : ""}</p>
    </section>
  </div>;
}
