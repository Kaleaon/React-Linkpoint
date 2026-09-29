import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app";
import Icon from "../components/Icon.jsx";

export default function Login() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();
  const [username, setUsername] = useState(app.auth.credentials?.username || "");
  const [password, setPassword] = useState("");
  const [start, setStart] = useState("last");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autoLoginAvailable, setAutoLoginAvailable] = useState(false);
  const [autoLoginName, setAutoLoginName] = useState("");
  const grids = actions.allGrids();

  const isOffline = state.loginMode === "offline" || state.loginGrid === "offline";

  useEffect(() => {
    const loadSaved = (credentials) => {
      setUsername(credentials?.username || "");
      const savedGrid = grids.find((grid) => grid.key === credentials?.grid || grid.host === credentials?.grid);
      if (savedGrid) actions.setLoginGrid(savedGrid.key);
    };
    app.auth.on("credentials_loaded", loadSaved);
    if (app.auth.credentials) loadSaved(app.auth.credentials);

    // Check for auto-login credentials in environment secrets
    let active = true;
    async function checkAutoLogin() {
      try {
        const res = await fetch("/api/sl/auto-login-status");
        if (!res.ok) return;
        const data = await res.json();
        if (data.available && active) {
          setAutoLoginAvailable(true);
          const name = data.username || "Resident";
          setAutoLoginName(name);
          if (!username) setUsername(name);

          // Automatically auto-login to Second Life if not already connected
          if (!app.auth.isLoggedIn()) {
            setBusy(true);
            try {
              actions.setLoginGrid("agni");
              await app.auth.autoLogin("last");
              if (active) {
                actions.setScreen("Chat");
              }
            } catch (err) {
              if (active) {
                setError(err instanceof Error ? err.message : "Auto-login to Second Life failed.");
              }
            } finally {
              if (active) setBusy(false);
            }
          }
        }
      } catch {
        // Silently skip if auto login check fails
      }
    }
    checkAutoLogin();

    return () => {
      active = false;
      app.auth.off("credentials_loaded", loadSaved);
    };
  }, []);

  const handleLogin = async (gridKey, user, pass, isOfflineMode = false) => {
    setBusy(true);
    setError("");
    try {
      if (isOfflineMode || gridKey === "offline") {
        actions.setLoginMode("offline");
        await app.auth.login("offline", user.trim() || "Ruth Resident", pass || "offline", remember, start);
      } else if (gridKey === "gemini") {
        actions.setLoginGrid("gemini");
        await app.auth.login("gemini", user.trim() || "Ruth Resident", pass || "gemini", remember, start);
      } else {
        const grid = grids.find((item) => item.key === gridKey);
        if (!grid) throw new Error("Select a valid grid.");
        if (grid.key.startsWith("custom-") && window.linkpointDesktop?.allowLoginEndpoint) {
          await window.linkpointDesktop.allowLoginEndpoint(grid.host);
        }
        await app.auth.login(grid.key.startsWith("custom-") ? grid.host : grid.key, user.trim(), pass, remember, start);
      }
      setPassword("");
      actions.setScreen("Chat");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Login failed. Check the grid, credentials, or proxy configuration.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (isOffline) {
      return handleLogin("offline", username.trim() || "Ruth Resident", password || "offline", true);
    }
    if (state.loginGrid === "gemini") {
      return handleLogin("gemini", username.trim() || "Ruth Resident", password || "gemini", false);
    }
    if (!username.trim() || !password) {
      return setError("Enter both an avatar name and password for grid login.");
    }
    return handleLogin(state.loginGrid, username, password, false);
  };

  const quickGuestLogin = () => {
    const guestName = username.trim() || "Ruth Resident";
    handleLogin("offline", guestName, "demo", true);
  };

  const connectWithGemini = () => {
    const guestName = username.trim() || "Ruth Resident";
    handleLogin("gemini", guestName, "gemini", false);
  };

  const control = {
    width: "100%",
    minHeight: 44,
    boxSizing: "border-box",
    padding: "0 11px",
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs,
    background: V.bg,
    color: V.ink,
    font: `400 15px/1.3 ${t.font}`,
  };
  const label = { font: `600 10px/1 ${t.font}`, letterSpacing: ".16em", color: V.pri };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 16px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", display: "grid", gap: 14 }}>
        <header style={{ textAlign: "center", marginBottom: 4 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
            <Icon name="box" size={26} />
            <h1 style={{ margin: 0, color: V.pri, font: `700 28px/1.1 ${t.dfont}`, letterSpacing: ".12em" }}>LINKPOINT</h1>
          </div>
          <p style={{ margin: "6px 0 0", color: V.ink2, font: `400 12px/1.4 ${t.font}` }}>
            Second Life Communicator & OpenSim Viewer Suite
          </p>
        </header>

        {/* Second Life Live Protocol Status Banner */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          border: `1px solid ${V.pri}`,
          borderRadius: V.rs,
          background: V.priC,
          color: V.pri,
          font: `600 11px/1.4 ${t.font}`,
          letterSpacing: ".06em"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="globe" size={14} />
            <span>SECOND LIFE PROTOCOL: LIVE</span>
          </div>
          <span style={{ opacity: 0.85, fontSize: 10 }}>Direct Circuit &amp; Caps Engine</span>
        </div>

        {/* Mode Selector: Grid Login vs Offline Grid */}
        <div style={{ display: "flex", border: `1px solid ${V.outv}`, borderRadius: V.rs, overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => { actions.setLoginMode("grid"); if (state.loginGrid === "offline") actions.setLoginGrid("gemini"); }}
            style={{
              flex: 1,
              padding: "10px 0",
              border: 0,
              cursor: "pointer",
              background: !isOffline ? V.priC : "transparent",
              color: !isOffline ? V.pri : V.ink2,
              borderBottom: !isOffline ? `2px solid ${V.pri}` : "2px solid transparent",
              font: `700 11px/1 ${t.font}`,
              letterSpacing: ".16em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="globe" size={14} />
            GRID LOGIN
          </button>
          <button
            type="button"
            onClick={() => { actions.setLoginMode("offline"); actions.setLoginGrid("offline"); }}
            style={{
              flex: 1,
              padding: "10px 0",
              border: 0,
              cursor: "pointer",
              background: isOffline ? V.priC : "transparent",
              color: isOffline ? V.pri : V.ink2,
              borderBottom: isOffline ? `2px solid ${V.pri}` : "2px solid transparent",
              font: `700 11px/1 ${t.font}`,
              letterSpacing: ".16em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Icon name="server" size={14} />
            OFFLINE / LOCAL
          </button>
        </div>

        {error && (
          <div role="alert" style={{ color: V.err, border: `1px solid ${V.err}`, borderRadius: V.rs, padding: 12, background: "rgba(255,108,108,0.08)", fontSize: 13, lineHeight: 1.4 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>&gt; {error}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={connectWithGemini}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  background: V.pri,
                  color: V.onpri,
                  border: 0,
                  borderRadius: V.rs,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".1em",
                  cursor: "pointer"
                }}
              >
                USE GEMINI PROXY INSTEAD
              </button>
              <button
                type="button"
                onClick={quickGuestLogin}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  background: V.surf2,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".1em",
                  cursor: "pointer"
                }}
              >
                OFFLINE GUEST
              </button>
            </div>
          </div>
        )}

        {state.toast && <div role="status" style={{ color: V.info, border: `1px solid ${V.info}`, borderRadius: V.rs, padding: 10 }}>{state.toast}</div>}

        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          {!isOffline ? (
            <>
              <label style={label}>
                GRID & PROXY SETUP
                <select
                  aria-label="Grid"
                  value={state.loginGrid}
                  onChange={(e) => actions.setLoginGrid(e.target.value)}
                  style={{ ...control, display: "block", marginTop: 6 }}
                >
                  {grids.map((g) => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
              </label>

              {!state.addGrid ? (
                <button
                  type="button"
                  onClick={actions.openAddGrid}
                  style={{ ...control, minHeight: 38, cursor: "pointer", color: V.pri, fontSize: 12, fontWeight: 600, letterSpacing: ".1em" }}
                >
                  + ADD CUSTOM OPENSIM GRID
                </button>
              ) : (
                <fieldset style={{ border: `1px solid ${V.outv}`, borderRadius: V.rs, padding: 10, display: "grid", gap: 8 }}>
                  <legend style={label}>CUSTOM GRID</legend>
                  <input
                    aria-label="Custom grid name"
                    placeholder="Grid name (e.g. My OpenSim)"
                    value={state.addGridName}
                    onChange={(e) => actions.setAddGridName(e.target.value)}
                    style={control}
                  />
                  <input
                    aria-label="Custom grid login URI"
                    placeholder="https://login.example.org/"
                    value={state.addGridHost}
                    onChange={(e) => actions.setAddGridHost(e.target.value)}
                    style={control}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={actions.cancelAddGrid} style={{ flex: 1, padding: "8px 0", cursor: "pointer" }}>Cancel</button>
                    <button type="button" onClick={actions.saveCustomGrid} style={{ flex: 1, padding: "8px 0", background: V.pri, color: V.onpri, border: 0, fontWeight: 700, cursor: "pointer" }}>Save grid</button>
                  </div>
                </fieldset>
              )}

              <label style={label}>
                AVATAR NAME
                <input
                  aria-label="Avatar name"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="First Last or username"
                  style={{ ...control, display: "block", marginTop: 6 }}
                />
              </label>

              <label style={label}>
                PASSWORD
                <input
                  aria-label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  style={{ ...control, display: "block", marginTop: 6 }}
                />
              </label>

              <label style={label}>
                START AT
                <select
                  aria-label="Start location"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  style={{ ...control, display: "block", marginTop: 6 }}
                >
                  <option value="last">Last location</option>
                  <option value="home">Home</option>
                </select>
              </label>

              <label style={{ color: V.ink2, font: `400 12px/1.4 ${t.font}`, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember avatar name and grid
              </label>

              {autoLoginAvailable && (
                <button
                  type="button"
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      actions.setLoginGrid("agni");
                      await app.auth.autoLogin(start);
                      actions.setScreen("Chat");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Auto-login failed.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                  style={{
                    minHeight: 46,
                    border: `1px solid ${V.pri}`,
                    borderRadius: V.rs,
                    background: V.pri,
                    color: V.onpri,
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: ".14em",
                    cursor: busy ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="globe" size={16} />
                  {busy ? "CONNECTING TO SECOND LIFE…" : `AUTO-LOGIN AS ${autoLoginName.toUpperCase()}`}
                </button>
              )}

              <button
                type="submit"
                disabled={busy}
                style={{
                  minHeight: 46,
                  border: 0,
                  borderRadius: V.rs,
                  background: autoLoginAvailable ? V.surf2 : V.pri,
                  color: autoLoginAvailable ? V.ink : V.onpri,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: ".18em",
                  cursor: busy ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Icon name="power" size={16} />
                {busy ? "CONNECTING TO GRID…" : "CONNECT WITH PASSWORD"}
              </button>

              {/* One-Click Connect via Gemini AI Proxy */}
              <button
                type="button"
                onClick={connectWithGemini}
                disabled={busy}
                style={{
                  minHeight: 44,
                  border: `1px solid ${V.pri}`,
                  borderRadius: V.rs,
                  background: V.priC,
                  color: V.pri,
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: ".14em",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Icon name="sparkles" size={16} />
                CONNECT VIA GEMINI PROXY
              </button>
            </>
          ) : (
            <>
              <div style={{ padding: "12px", border: `1px solid ${V.outv}`, borderRadius: V.rs, background: V.surf, fontSize: 12, lineHeight: 1.5, color: V.ink2 }}>
                <div style={{ color: V.pri, fontWeight: 700, letterSpacing: ".1em", marginBottom: 4 }}>LOCAL OPENSIM ENVIRONMENT</div>
                Connect to the simulated local grid engine (127.0.0.1:9000). You can explore regions, 3D scenes, radar, local chat, inventory, and inspect LLSD assets without external network reliance.
              </div>

              <label style={label}>
                LOCAL AVATAR NAME
                <input
                  aria-label="Local avatar name"
                  value={username || "Ruth Resident"}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ruth Resident or Jane Doe"
                  style={{ ...control, display: "block", marginTop: 6 }}
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                style={{
                  minHeight: 46,
                  border: 0,
                  borderRadius: V.rs,
                  background: V.pri,
                  color: V.onpri,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: ".18em",
                  cursor: busy ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Icon name="play" size={16} />
                {busy ? "STARTING LOCAL GRID…" : "ENTER OFFLINE GRID"}
              </button>

              <button
                type="button"
                onClick={connectWithGemini}
                disabled={busy}
                style={{
                  minHeight: 44,
                  border: `1px solid ${V.pri}`,
                  borderRadius: V.rs,
                  background: V.priC,
                  color: V.pri,
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: ".14em",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Icon name="sparkles" size={16} />
                CONNECT VIA GEMINI PROXY
              </button>
            </>
          )}

          {/* Quick Demo Login Shortcut */}
          <button
            type="button"
            onClick={quickGuestLogin}
            disabled={busy}
            style={{
              minHeight: 38,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              background: V.surf2,
              color: V.ink,
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: ".14em",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Icon name="zap" size={14} />
            ONE-CLICK GUEST DEMO ACCESS
          </button>

          {/* Dedicated Settings Button */}
          <button
            type="button"
            onClick={() => actions.setScreen("Settings")}
            style={{
              minHeight: 44,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              background: V.surf2,
              color: V.pri,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: ".2em",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 4,
            }}
          >
            <Icon name="settings" size={16} />
            SETTINGS & PREFERENCES
          </button>
        </form>
      </div>
    </div>
  );
}
