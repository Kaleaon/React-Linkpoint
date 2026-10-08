import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app";
import Icon from "../components/Icon.jsx";
import FormField from "../components/FormField.jsx";

export default function Login() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();
  const [username, setUsername] = useState(app.auth.credentials?.username || "");
  const [password, setPassword] = useState("");
  const [start, setStart] = useState("last");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  // Set when the grid asks for a multi-factor code (reason "mfa_challenge").
  const [mfa, setMfa] = useState({ needed: false, token: "", message: "" });
  const [autoLogin, setAutoLogin] = useState(null);
  const grids = actions.allGrids().filter((grid) => !["offline", "gemini"].includes(grid.key));

  useEffect(() => {
    const saved = app.auth.credentials;
    if (saved?.username) setUsername(saved.username);
    const savedGrid = grids.find((grid) => grid.key === saved?.grid || grid.host === saved?.grid);
    if (savedGrid) actions.setLoginGrid(savedGrid.key);
    let active = true;
    void app.protocol.checkAutoLoginStatus?.().then((status) => {
      if (active && status?.available) setAutoLogin(status);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const connect = async (event) => {
    event.preventDefault();
    const errs = {};
    if (!username.trim()) errs.username = "Avatar name cannot be blank.";
    if (!password) errs.password = "Password cannot be blank.";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError("Enter both an avatar name and password.");
      return;
    }
    const grid = grids.find((item) => item.key === state.loginGrid);
    if (!grid) { setError("Select a valid grid endpoint."); return; }
    setBusy(true); setError(""); setFieldErrors({});
    try {
      if (grid.key.startsWith("custom-") && window.linkpointDesktop?.allowLoginEndpoint) await window.linkpointDesktop.allowLoginEndpoint(grid.host);
      await app.auth.login(grid.key.startsWith("custom-") ? grid.host : grid.key, username.trim(), password, remember, start, mfa.token.trim());
      setPassword(""); setMfa({ needed: false, token: "", message: "" }); actions.setScreen("Chat");
    } catch (reason) {
      const details = reason?.details;
      if (details?.mfaRequired) {
        // Keep the name and password so the resident only has to type the code.
        const rejected = details.reason === "mfa_failure" || Boolean(mfa.token);
        setMfa({ needed: true, token: "", message: details.message });
        setError(rejected ? details.message : "");
        if (rejected) setFieldErrors({ mfa: details.message });
      } else {
        const msg = reason instanceof Error ? reason.message : "The grid rejected the connection.";
        setError(msg);
      }
    } finally { setBusy(false); }
  };

  const connectSavedSession = async () => {
    setBusy(true); setError(""); setFieldErrors({});
    try { await app.auth.autoLogin(start); actions.setScreen("Chat"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Saved server credentials could not connect."); }
    finally { setBusy(false); }
  };

  const control = { width: "100%", minHeight: 44, boxSizing: "border-box", padding: "0 11px", border: `1px solid ${V.outv}`, borderRadius: V.rs, background: V.bg, color: V.ink, font: `400 15px/1.3 ${t.font}` };

  return <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 16px" }}>
    <form onSubmit={connect} style={{ maxWidth: 460, margin: "0 auto", display: "grid", gap: 15 }}>
      <header style={{ textAlign: "center" }}><Icon name="box" size={28} /><h1 style={{ color: V.pri, font: `700 28px/1.1 ${t.dfont}`, letterSpacing: ".12em" }}>LINKPOINT</h1><p style={{ color: V.ink2 }}>Connect directly to Second Life or an OpenSim login service.</p></header>
      <FormField label="GRID">
        <select value={state.loginGrid} onChange={(event) => actions.setLoginGrid(event.target.value)} style={control}>
          {grids.map((grid) => <option key={grid.key} value={grid.key}>{grid.label}</option>)}
        </select>
      </FormField>
      <FormField label="AVATAR NAME" error={fieldErrors.username}>
        <input autoComplete="username" value={username} onChange={(event) => { setUsername(event.target.value); if (fieldErrors.username) setFieldErrors({ ...fieldErrors, username: null }); }} placeholder="First Last or username" style={control} />
      </FormField>
      <FormField label="PASSWORD" error={fieldErrors.password}>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: null }); }} placeholder="Password" style={control} />
      </FormField>
      {mfa.needed ? <FormField label="AUTHENTICATOR CODE" error={fieldErrors.mfa} helpText={mfa.message}><input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={mfa.token} onChange={(event) => { setMfa({ ...mfa, token: event.target.value }); if (fieldErrors.mfa) setFieldErrors({ ...fieldErrors, mfa: null }); }} placeholder="6-digit code" style={{ ...control, letterSpacing: ".3em" }} /></FormField> : null}
      <FormField label="START LOCATION">
        <select value={start} onChange={(event) => setStart(event.target.value)} style={control}>
          <option value="last">Last location</option>
          <option value="home">Home</option>
        </select>
      </FormField>
      <label style={{ color: V.ink2, fontSize: 12 }}><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember avatar name and grid (never password)</label>
      {error ? <div role="alert" style={{ color: V.err }}>{error}</div> : null}
      <button type="submit" disabled={busy} style={{ minHeight: 48, border: 0, borderRadius: V.rs, background: V.pri, color: V.onpri, fontWeight: 700 }}>{busy ? "CONNECTING…" : mfa.needed ? "VERIFY AND CONNECT" : "CONNECT TO GRID"}</button>
      {autoLogin ? <button type="button" disabled={busy} onClick={() => void connectSavedSession()} style={{ minHeight: 44, border: `1px solid ${V.pri}`, borderRadius: V.rs, background: V.priC, color: V.pri }}>CONNECT WITH SERVER CREDENTIALS{autoLogin.username ? ` · ${autoLogin.username}` : ""}</button> : null}
      <button type="button" onClick={actions.openAddGrid} style={{ minHeight: 40, border: `1px solid ${V.outv}`, borderRadius: V.rs, background: V.surf, color: V.ink }}>ADD CUSTOM OPENSIM GRID</button>
      {state.addGrid ? <section className="runtime-card"><FormField label="GRID NAME"><input value={state.addGridName} onChange={(e) => actions.setAddGridName(e.target.value)} style={control} /></FormField><FormField label="LOGIN URI"><input value={state.addGridHost} onChange={(e) => actions.setAddGridHost(e.target.value)} placeholder="https://login.example.org/" style={control} /></FormField><button type="button" onClick={actions.saveCustomGrid}>Save grid</button> <button type="button" onClick={actions.cancelAddGrid}>Cancel</button></section> : null}
    </form>
  </div>;
}
