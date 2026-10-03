import { useEffect, useState } from "react";
import useGoogleEnabled from "../hooks/useGoogleEnabled.js";
import Toggle from "../components/Toggle.jsx";
import { loadGoogle } from "../services/google.ts";
import { useApp } from "../context/AppContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";
import ThemeStudio from "../components/ThemeStudio.jsx";
import { LAYOUTS } from "../theme/layouts.js";
import { FAMILIES, PALETTES } from "../theme/palettes.js";

function SwitchSetting({ id, title, description, on, onClick }) {
  return <div className="settings-switch-row">
    <div>
      <strong id={`${id}-label`}>{title}</strong>
      {description ? <small>{description}</small> : null}
    </div>
    <span aria-labelledby={`${id}-label`}><Toggle on={on} onClick={onClick} /></span>
  </div>;
}

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
      <Icon name="palette" size={22} />
      <h2>Appearance &amp; format</h2>
      <div className="settings-field-grid">
        <label htmlFor="settings-layout-select">Layout
          <select id="settings-layout-select" value={state.layout} onChange={(event) => actions.setLayout(event.target.value)}>
            {Object.entries(LAYOUTS).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
          </select>
        </label>
        <label htmlFor="settings-theme-select">Colour theme
          <select id="settings-theme-select" value={state.palette} onChange={(event) => actions.setPalette(event.target.value)}>
            {FAMILIES.map((family) => <optgroup key={family.name} label={family.name}>
              {family.keys.filter((key) => PALETTES[key]).map((key) => <option key={key} value={key}>{PALETTES[key].name}</option>)}
            </optgroup>)}
          </select>
        </label>
        <label htmlFor="settings-format-select">App format
          <select id="settings-format-select" value={state.viewMode} onChange={(event) => actions.setViewMode(event.target.value)}>
            <option value="auto">Automatic</option>
            <option value="mobile">Mobile touch</option>
            <option value="desktop">Desktop windows</option>
          </select>
        </label>
        <label htmlFor="settings-density-select">Content density
          <select id="settings-density-select" value={state.dense ? "compact" : "comfortable"} onChange={(event) => actions.setDense(event.target.value === "compact")}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
      </div>
      <SwitchSetting id="large-type" title="Large text" description="Increase interface text for easier touch-screen reading." on={state.toggles.largeType} onClick={() => actions.toggleSetting("largeType")} />
      <ThemeStudio />
    </section>
    <section className="runtime-card">
      <Icon name="settings" size={22} />
      <h2>Viewer preferences</h2>
      <div className="settings-field-grid">
        <label htmlFor="settings-draw-distance-select">Draw distance
          <select id="settings-draw-distance-select" value={state.prefs.draw} onChange={(event) => actions.setPref("draw", event.target.value)}>
            {["64 m", "96 m", "128 m", "192 m", "256 m"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label htmlFor="settings-graphics-quality-select">Graphics quality
          <select id="settings-graphics-quality-select" value={state.prefs.quality} onChange={(event) => actions.setPref("quality", event.target.value)}>
            {["Low", "Balanced", "High", "Ultra"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label htmlFor="settings-frame-rate-select">Frame rate cap
          <select id="settings-frame-rate-select" value={state.prefs.fps} onChange={(event) => actions.setPref("fps", event.target.value)}>
            {["30 fps", "45 fps", "60 fps", "Uncapped"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label htmlFor="settings-avatar-complexity-select">Avatar complexity
          <select id="settings-avatar-complexity-select" value={state.prefs.complexity} onChange={(event) => actions.setPref("complexity", event.target.value)}>
            {["20 000", "40 000", "80 000", "160 000", "No limit"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label htmlFor="settings-bandwidth-limit-select">Bandwidth limit
          <select id="settings-bandwidth-limit-select" value={state.prefs.bandwidth} onChange={(event) => actions.setPref("bandwidth", event.target.value)}>
            {["500 kbps", "1 500 kbps", "3 000 kbps", "Unlimited"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <SwitchSetting id="shadows" title="Render shadows" on={state.toggles.shadows} onClick={() => actions.toggleSetting("shadows")} />
      <SwitchSetting id="battery" title="Battery saver" description="Reduce background rendering on mobile." on={state.toggles.battery} onClick={() => actions.toggleSetting("battery")} />
    </section>
    <section className="runtime-card">
      <Icon name="message-circle" size={22} />
      <h2>Chat, language &amp; privacy</h2>
      <div className="settings-field-grid">
        <label htmlFor="settings-translation-select">Translate chat
          <select id="settings-translation-select" value={state.prefs.translate} onChange={(event) => actions.setPref("translate", event.target.value)}>
            {["Off", "English", "Spanish", "French", "German", "Japanese"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label htmlFor="settings-maturity-select">Maturity rating
          <select id="settings-maturity-select" value={state.prefs.maturity} onChange={(event) => actions.setPref("maturity", event.target.value)}>
            {["General", "Moderate", "Adult"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <SwitchSetting id="timestamps" title="Message timestamps" on={state.toggles.timestamps} onClick={() => actions.toggleSetting("timestamps")} />
      <SwitchSetting id="typing" title="Send typing status" on={state.toggles.typingSent} onClick={() => actions.toggleSetting("typingSent")} />
      <SwitchSetting id="im-logs" title="Save IM logs" on={state.toggles.imLogs} onClick={() => actions.toggleSetting("imLogs")} />
      <SwitchSetting id="push" title="Push notifications" on={state.toggles.push} onClick={() => actions.toggleSetting("push")} />
      <SwitchSetting id="media-auto" title="Auto-play parcel media" on={state.toggles.mediaAuto} onClick={() => actions.toggleSetting("mediaAuto")} />
    </section>
    <section className="runtime-card" aria-labelledby="sound-voice-heading">
      <Icon name="volume-2" size={22} />
      <h2 id="sound-voice-heading">Sound &amp; voice</h2>
      <label htmlFor="settings-master-volume-select">Master volume
        <select id="settings-master-volume-select" value={state.prefs.volume} onChange={(event) => setVolume(event.target.value)}>
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
    <section className="runtime-card">
      <Icon name="database" size={22} />
      <h2>Storage</h2>
      <div className="settings-field-grid">
        <label htmlFor="settings-cache-limit-select">Cache size
          <select id="settings-cache-limit-select" value={state.prefs.cacheLimit} onChange={(event) => actions.setPref("cacheLimit", Number(event.target.value))}>
            {[256, 512, 1024, 2048].map((value) => <option key={value} value={value}>{value >= 1024 ? `${value / 1024} GB` : `${value} MB`}</option>)}
          </select>
        </label>
        <label htmlFor="settings-cache-location-select">Cache location
          <select id="settings-cache-location-select" value={state.prefs.cacheLoc} onChange={(event) => actions.setPref("cacheLoc", event.target.value)}>
            <option>Internal storage</option>
            <option>Removable storage</option>
          </select>
        </label>
      </div>
      <SwitchSetting id="cache-exit" title="Clear cache on sign out" on={state.toggles.cacheOnExit} onClick={() => actions.toggleSetting("cacheOnExit")} />
      <button type="button" onClick={actions.clearAllCache}>Clear cached assets</button>
    </section>
  </div>;
}
