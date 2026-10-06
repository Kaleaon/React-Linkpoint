import { useEffect, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { NAV_ALL } from "../data/content.js";
import useGoogleEnabled from "../hooks/useGoogleEnabled.js";
import Toggle from "../components/Toggle.jsx";
import ThemeStudio from "../components/ThemeStudio.jsx";
import { loadGoogle } from "../services/google.ts";
import { useApp } from "../context/AppContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";
import { LAYOUTS, PALETTES, PALETTE_FAMILIES as FAMILIES } from "@linkpoint/design-system/tokens";

function SwitchSetting({ id, title, description, on, onClick }) {
  const unavailable = ["shadows", "voice-indicator", "media-auto", "chat-cmds", "typing", "push", "show-online", "rlv", "cache-exit"].includes(id);
  return (
    <div className="settings-switch-row">
      <div>
        <strong id={`${id}-label`}>{title}</strong>
        {unavailable ? <small>Not available yet — requires viewer backend support.</small> : description ? <small>{description}</small> : null}
      </div>
      <span aria-labelledby={`${id}-label`}><Toggle on={on} onClick={onClick} disabled={unavailable} /></span>
    </div>
  );
}

export default function Settings() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();
  const contentRef = useRef(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [matches, setMatches] = useState(11);
  const categories = [["all", "All preferences"], ["session", "Connection"], ["appearance", "Appearance"], ["graphics", "Graphics"], ["sound-voice", "Sound & voice"], ["chat-im", "Chat & IM"], ["notifications", "Notifications"], ["privacy", "Privacy & RLV"], ["storage", "Storage & network"], ["integrations", "Integrations"], ["about", "About"]];
  useEffect(() => {
    let count = 0;
    for (const section of contentRef.current?.querySelectorAll(":scope > section") || []) {
      const id = section.getAttribute("aria-labelledby").replace("-heading", "");
      section.hidden = (category !== "all" && id !== category) || !section.textContent.toLowerCase().includes(search.trim().toLowerCase());
      if (!section.hidden) count++;
    }
    setMatches(count);
  }, [category, search]);
  const [disconnecting, setDisconnecting] = useState(false);
  const googleEnabled = useGoogleEnabled();
  const [googleNote, setGoogleNote] = useState("");
  const user = app.auth.user;
  const region = app.world.region;

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

  return (
    <div className="settings-browser" style={{ color: V.ink, background: V.bg, fontFamily: t.font, "--settings-surface": V.surf, "--settings-border": V.outv, "--settings-radius": V.rs, "--settings-accent": V.pri }}>
      <aside className="settings-categories">
        <label>Search settings<input type="search" value={search} onChange={event => { setSearch(event.target.value); setCategory("all"); }} placeholder="Camera, chat, cache…" /></label>
        <nav aria-label="Preference categories">{categories.map(([id, label]) => <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)} style={{ color: category === id ? V.onpriC : V.ink, background: category === id ? V.priC : V.surf }}>{label}</button>)}</nav>
      </aside>
      <div className="tool-page settings-content" ref={contentRef}>
      <nav aria-label="Viewer tools" className="settings-tools">{NAV_ALL.filter(item => !["Settings", "Screens"].includes(item.id)).map(item => <button key={item.id} type="button" onClick={() => actions.setScreen(item.id)}>{item.id}</button>)}</nav>
      {!matches ? <p role="status">No settings match your search.</p> : null}
      {/* Current Session */}
      <section className="runtime-card" aria-labelledby="session-heading">
        <Icon name="plug" size={22} />
        <h2 id="session-heading">Current session</h2>
        <dl>
          <dt>Status</dt><dd>{app.auth.isLoggedIn() ? "Connected" : "Disconnected"}</dd>
          <dt>Resident</dt><dd>{user?.fullName || "—"}</dd>
          <dt>Grid</dt><dd>{user?.grid || state.loginGrid || "—"}</dd>
          <dt>Region</dt><dd>{region?.name || app.protocol.authReply?.sim_name || "Not supplied"}</dd>
          <dt>Account ID</dt><dd>{app.protocol.agentId || "Not supplied"}</dd>
        </dl>
        <div className="inline-tool" style={{ gap: "8px", marginTop: "12px" }}>
          <button type="button" onClick={() => actions.reconnect()} disabled={state.reconnecting}>
            {state.reconnecting ? "Reconnecting…" : "Reconnect to Grid"}
          </button>
          {app.auth.isLoggedIn() ? (
            <button type="button" disabled={disconnecting} onClick={() => void disconnect()}>
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : null}
        </div>
      </section>

      {/* Optional Integrations */}
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

      {/* Appearance, Themes & Palettes */}
      <section className="runtime-card" aria-labelledby="appearance-heading">
        <Icon name="palette" size={22} />
        <h2 id="appearance-heading">Appearance &amp; format</h2>
        <div className="settings-field-grid">
          <label htmlFor="settings-layout-select">Layout
            <select id="settings-layout-select" value={state.layout} onChange={(event) => actions.setLayout(event.target.value)}>
              {Object.entries(LAYOUTS).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}
            </select>
          </label>
          <label htmlFor="settings-theme-select">Colour theme
            <select id="settings-theme-select" value={state.palette} onChange={(event) => actions.setPalette(event.target.value)}>
              {FAMILIES ? FAMILIES.map((family) => (
                <optgroup key={family.name} label={family.name}>
                  {family.keys.filter((key) => PALETTES[key]).map((key) => <option key={key} value={key}>{PALETTES[key].name}</option>)}
                </optgroup>
              )) : Object.entries(PALETTES).map(([k, x]) => (
                <option key={k} value={k}>{x.name}</option>
              ))}
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
            <select id="settings-density-select" value={state.customTheme.density} onChange={(event) => actions.setDensity(event.target.value)}>
              <option value="standard">Standard</option>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </div>
        <SwitchSetting id="large-type" title="Large text" description="Increase interface text for easier touch-screen reading." on={state.toggles.largeType} onClick={() => actions.toggleSetting("largeType")} />
        <ThemeStudio />
      </section>

      {/* Graphics & Performance / Viewer Preferences */}
      <section className="runtime-card" aria-labelledby="graphics-heading">
        <Icon name="eye" size={22} />
        <h2 id="graphics-heading">Graphics &amp; performance</h2>
        <div className="settings-field-grid">
          <label htmlFor="settings-draw-distance-select">Draw distance
            <select id="settings-draw-distance-select" value={state.prefs.draw} onChange={(event) => actions.setPref("draw", event.target.value)}>
              {["20 m", "32 m", "64 m", "96 m", "128 m", "192 m", "256 m"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label htmlFor="settings-fov-select">Camera field of view
            <select id="settings-fov-select" value={state.prefs.fov} onChange={event => actions.setPref("fov", Number(event.target.value))}>{[40, 60, 80, 100].map(value => <option key={value} value={value}>{value}°</option>)}</select>
          </label>
          <label htmlFor="settings-graphics-quality-select">Graphics quality
            <select id="settings-graphics-quality-select" disabled title="Requires backend support; use the dedicated manager where available" value={state.prefs.quality} onChange={(event) => actions.setPref("quality", event.target.value)}>
              {["Low", "Balanced", "High", "Ultra"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label htmlFor="settings-frame-rate-select">Frame rate cap
            <select id="settings-frame-rate-select" value={state.prefs.fps} onChange={(event) => actions.setPref("fps", event.target.value)}>
              {["30 fps", "45 fps", "60 fps", "Uncapped"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label htmlFor="settings-avatar-complexity-select">Avatar complexity
            <select id="settings-avatar-complexity-select" disabled title="Requires backend support; use the dedicated manager where available" value={state.prefs.complexity} onChange={(event) => actions.setPref("complexity", event.target.value)}>
              {["20 000", "40 000", "80 000", "160 000", "No limit"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label htmlFor="settings-bandwidth-limit-select">Bandwidth limit
            <select id="settings-bandwidth-limit-select" disabled title="Requires backend support; use the dedicated manager where available" value={state.prefs.bandwidth} onChange={(event) => actions.setPref("bandwidth", event.target.value)}>
              {["500 kbps", "1 500 kbps", "3 000 kbps", "Unlimited"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <SwitchSetting id="shadows" title="Render shadows" description="Dynamic shadows and deferred lighting pipeline." on={state.toggles.shadows} onClick={() => actions.toggleSetting("shadows")} />
        <SwitchSetting id="battery" title="Battery saver" description="Reduce background rendering on mobile." on={state.toggles.battery} onClick={() => actions.toggleSetting("battery")} />
      </section>

      {/* Sound & Audio (Microphone controls moved to 3D View and IM calls) */}
      <section className="runtime-card" aria-labelledby="sound-voice-heading">
        <Icon name="volume-2" size={22} />
        <h2 id="sound-voice-heading">Sound &amp; audio</h2>
        <div className="settings-field-grid">
          <label htmlFor="settings-master-volume-select">Master volume
            <select id="settings-master-volume-select" value={state.prefs.volume} onChange={(event) => setVolume(event.target.value)}>
              {["Muted", "25%", "50%", "70%", "100%"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <SwitchSetting id="voice-indicator" title="Voice indicator" description="Show speaking rings in radar and chat logs." on={state.toggles.voice} onClick={() => actions.toggleSetting("voice")} />
        <SwitchSetting id="media-auto" title="Autoplay parcel media" description="Automatically start parcel audio streams and MOAP media." on={state.toggles.mediaAuto} onClick={() => actions.toggleSetting("mediaAuto")} />
        <p style={{ fontSize: "12px", opacity: 0.8, marginTop: "8px" }}>
          Simulator audio uses positional HRTF sound. Live microphone and voice call controls are located directly in the 3D World View and IM Calls.
        </p>
      </section>

      {/* Chat & IM */}
      <section className="runtime-card" aria-labelledby="chat-im-heading">
        <Icon name="message-square" size={22} />
        <h2 id="chat-im-heading">Chat, language &amp; privacy</h2>
        <div className="settings-field-grid">
          <label htmlFor="settings-translation-select">Translate incoming chat
            <select id="settings-translation-select" disabled title="Requires backend support; use the dedicated manager where available" value={state.prefs.translate} onChange={(event) => actions.setPref("translate", event.target.value)}>
              {["Off", "English", "Spanish", "French", "German", "Japanese", "Português"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label htmlFor="settings-maturity-select">Maturity rating
            <select id="settings-maturity-select" disabled title="Requires backend support; use the dedicated manager where available" value={state.prefs.maturity} onChange={(event) => actions.setPref("maturity", event.target.value)}>
              {["General", "Moderate", "Adult"].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <SwitchSetting id="chat-cmds" title="Chat channel commands" description="Enable /1 gesture shortcuts and chat channel commands." on={state.toggles.chatCmds} onClick={() => actions.toggleSetting("chatCmds")} />
        <SwitchSetting id="timestamps" title="Message timestamps" description="Show the device’s local time alongside messages." on={state.toggles.timestamps} onClick={() => actions.toggleSetting("timestamps")} />
        <SwitchSetting id="im-logs" title="Keep chat logs on device" description="Save conversation history locally in device storage." on={state.toggles.imLogs} onClick={() => actions.toggleSetting("imLogs")} />
        <SwitchSetting id="typing" title="Send typing status" description="Notify contacts when you are composing a reply." on={state.toggles.typingSent} onClick={() => actions.toggleSetting("typingSent")} />
        <SwitchSetting id="autoresponse" title="Autoresponse while away" description="Send auto-reply message on incoming IMs while away." on={state.toggles.autoresponse} onClick={() => actions.toggleSetting("autoresponse")} />
      </section>

      {/* Notifications */}
      <section className="runtime-card" aria-labelledby="notifications-heading">
        <Icon name="bell" size={22} />
        <h2 id="notifications-heading">Notifications</h2>
        <SwitchSetting id="notify-local" title="Local notification popups" on={state.toggles.notifyLocal} onClick={() => actions.toggleSetting("notifyLocal")} />
        <SwitchSetting id="notify-im" title="Private message notification popups" on={state.toggles.notifyIM} onClick={() => actions.toggleSetting("notifyIM")} />
        <SwitchSetting id="notify-group" title="Group notice popups" description="Notices remain available in the notification list when popups are off." on={state.toggles.notifyGroup} onClick={() => actions.toggleSetting("notifyGroup")} />
        <SwitchSetting id="push" title="Push notifications" description="Receive IMs, group notices, and teleport offers in system shade." on={state.toggles.push} onClick={() => actions.toggleSetting("push")} />
      </section>

      {/* Privacy & Safety */}
      <section className="runtime-card" aria-labelledby="privacy-heading">
        <Icon name="shield" size={22} />
        <h2 id="privacy-heading">Privacy &amp; safety</h2>
        <div className="inline-tool" style={{ marginBottom: "12px" }}>
          <button type="button" onClick={() => actions.setScreen("Mute List")}>Open Mute &amp; Block List</button>
        </div>
        <SwitchSetting id="show-online" title="Show me as online" description="When off, friends see you offline and map position is hidden." on={state.toggles.showOnline} onClick={() => actions.toggleSetting("showOnline")} />
        <SwitchSetting id="rlv" title="RestrainedLove (RLV)" description="Enable RLV script commands for viewer interactions." on={state.toggles.rlv} onClick={() => actions.toggleSetting("rlv")} />
        <div style={{ marginTop: "8px" }}>
          <strong>Scripted object permissions</strong>
          <p style={{ margin: "2px 0 10px", opacity: 0.8, fontSize: "12px" }}>Manage object animation, attachment, and control grants.</p>
          <div className="inline-tool" style={{ gap: "8px" }}>
            <button type="button" onClick={() => actions.setScreen("Notices")}>Review incoming requests</button>
            <button type="button" disabled title="Simulator grant revocation is not implemented">Revoke All Grants</button>
          </div>
        </div>
      </section>

      {/* Storage & Network */}
      <section className="runtime-card" aria-labelledby="storage-heading">
        <Icon name="database" size={22} />
        <h2 id="storage-heading">Storage &amp; network</h2>
        <div className="settings-field-grid">
          <label htmlFor="settings-cache-limit-select">Cache size
            <select id="settings-cache-limit-select" disabled title="Requires backend support; use the dedicated manager where available" value={state.prefs.cacheLimit} onChange={(event) => actions.setPref("cacheLimit", Number(event.target.value))}>
              {[256, 512, 1024, 2048].map((value) => <option key={value} value={value}>{value >= 1024 ? `${value / 1024} GB` : `${value} MB`}</option>)}
            </select>
          </label>
          <label htmlFor="settings-cache-location-select">Cache location
            <select id="settings-cache-location-select" disabled title="Requires backend support; use the dedicated manager where available" value={state.prefs.cacheLoc} onChange={(event) => actions.setPref("cacheLoc", event.target.value)}>
              <option>Internal storage</option>
              <option>Removable storage</option>
            </select>
          </label>
        </div>
        <SwitchSetting id="cache-exit" title="Clear cache on sign out" on={state.toggles.cacheOnExit} onClick={() => actions.toggleSetting("cacheOnExit")} />
        <div className="inline-tool" style={{ gap: "8px", marginTop: "12px" }}>
          <button type="button" onClick={actions.clearAllCache}>Clear cached assets</button>
          <button type="button" onClick={() => actions.setScreen("Cache")}>Open Cache &amp; Storage Manager</button>
          <button type="button" onClick={() => actions.setScreen("Diagnostics")}>Run Connection Diagnostics</button>
        </div>
      </section>

      {/* About Linkpoint */}
      <section className="runtime-card" aria-labelledby="about-heading">
        <Icon name="info" size={22} />
        <h2 id="about-heading">About Linkpoint</h2>
        <p style={{ margin: "0 0 12px", opacity: 0.85, fontSize: "13px" }}>
          Linkpoint Mobile &amp; Desktop Viewer · Open Source AGPL-3.0 License.
        </p>
        <div className="inline-tool" style={{ gap: "8px" }}>
          <a href="https://github.com/Kaleaon/React-Linkpoint/releases" target="_blank" rel="noreferrer">Release Notes</a>
          <a href="https://github.com/Kaleaon/React-Linkpoint/issues/new" target="_blank" rel="noreferrer">Report a Bug</a>
        </div>
      </section>
      </div>
    </div>
  );
}
