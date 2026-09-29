import React, { useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import Icon from "../components/Icon.jsx";
import LinkpointLogo from "../components/LinkpointLogo.jsx";

// Refined Login / Splash Page component using LinkpointLogo
export default function Login() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();
  const [animatedLogo, setAnimatedLogo] = useState(true);

  const isGrid = state.loginMode === "grid";
  const fields = isGrid
    ? [
        { label: "AVATAR NAME", value: "Ruth   /   Resident" },
        { label: "PASSWORD", value: "••••••••" },
      ]
    : [{ label: "AVATAR NAME", value: "Ruth Resident" }];

  return (
    <div style={{ flex: 1, minHeight: 0, position: "relative", overflowY: "auto" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "120px", background: "repeating-linear-gradient(135deg," + V.surf2 + " 0 12px," + V.surf + " 12px 24px)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "160px", background: "linear-gradient(180deg,transparent 0%," + V.bg + " 88%)" }} />

      <div style={{ position: "relative", padding: "20px 16px 12px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Refined Linkpoint Logo Section with Animated / Static Toggle */}
        <div style={{ width: "100%", maxWidth: "240px", position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            onClick={() => setAnimatedLogo(!animatedLogo)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAnimatedLogo(!animatedLogo); } }}
            aria-label="Toggle logo animation"
            style={{
              position: "absolute",
              right: 0,
              top: "-10px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              font: "600 9px/1 " + t.font,
              color: V.ink2,
              cursor: "pointer",
              background: V.surf,
              padding: "4px 8px",
              border: "1px solid " + V.outv,
              borderRadius: V.rs,
              zIndex: 2,
            }}
          >
            <Icon name="sparkles" size={11} style={{ color: V.pri }} />
            <span>{animatedLogo ? "ANIMATED" : "STATIC"}</span>
          </div>

          <LinkpointLogo animated={animatedLogo} showTitle={true} width="100%" height="auto" />
        </div>

        <div style={{ width: "100%", marginTop: "8px", border: "1px solid " + V.outv, borderRadius: V.rp, background: V.surf, padding: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", border: "1px solid " + V.outv, borderRadius: V.rs, overflow: "hidden", marginBottom: "2px" }}>
            {[
              { mode: "grid", label: "GRID LOGIN" },
              { mode: "offline", label: "OFFLINE" },
            ].map((x) => {
              const active = x.mode === state.loginMode;
              return (
                <div
                  key={x.mode}
                  onClick={() => actions.setLoginMode(x.mode)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.setLoginMode(x.mode); } }}
                  aria-label={x.label}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "8px 0",
                    cursor: "pointer",
                    font: "600 11.5px/1 " + t.font,
                    letterSpacing: ".18em",
                    ...(active
                      ? { background: V.priC, color: V.onpriC, borderBottom: "2px solid " + V.pri }
                      : { color: V.ink2 }),
                  }}
                >
                  {x.label}
                </div>
              );
            })}
          </div>

          {isGrid ? (
            <div>
              <div style={{ font: "400 10px/1 " + t.font, letterSpacing: ".2em", color: V.pri, margin: "6px 0 4px" }}>GRID</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {actions.allGrids().map((g) => {
                  const active = state.loginGrid === g.key;
                  return (
                    <div
                      key={g.key}
                      onClick={() => actions.setLoginGrid(g.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.setLoginGrid(g.key); } }}
                      aria-label={"Select grid " + g.label}
                      style={{
                        flex: "1 1 80px",
                        textAlign: "center",
                        padding: "7px 4px",
                        border: "1px solid " + (active ? V.pri : V.outv),
                        borderRadius: V.rs,
                        font: "600 10px/1 " + t.font,
                        letterSpacing: ".04em",
                        color: active ? V.pri : V.ink2,
                        background: active ? V.priC : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      {g.label}
                    </div>
                  );
                })}
                <div
                  onClick={actions.openAddGrid}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.openAddGrid(); } }}
                  aria-label="Add custom grid"
                  style={{
                    flex: "1 1 80px", textAlign: "center", padding: "7px 4px", border: "1px dashed " + V.outv,
                    borderRadius: V.rs, font: "600 10px/1 " + t.font, letterSpacing: ".04em", color: V.ink2,
                    background: "transparent", cursor: "pointer",
                  }}
                >
                  + CUSTOM
                </div>
              </div>

              {state.addGrid ? (
                <div style={{ marginTop: "8px", border: "1px dashed " + V.outv, borderRadius: V.rs, padding: "8px" }}>
                  <div style={{ font: "400 9.5px/1 " + t.font, letterSpacing: ".16em", color: V.ink2 }}>ADD CUSTOM GRID</div>
                  <input
                    value={state.addGridName}
                    onChange={(e) => actions.setAddGridName(e.target.value)}
                    placeholder="grid name"
                    style={{ minHeight: "36px", height: "36px", width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", padding: "0 10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, font: "400 12px/1 " + t.font, color: V.ink, marginTop: "4px" }}
                  />
                  <input
                    value={state.addGridHost}
                    onChange={(e) => actions.setAddGridHost(e.target.value)}
                    placeholder="login URI (e.g. login.example.com:8002)"
                    style={{ minHeight: "36px", height: "36px", width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", padding: "0 10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, font: "400 12px/1 " + t.font, color: V.ink, marginTop: "4px" }}
                  />
                  <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                    <div
                      onClick={actions.cancelAddGrid}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.cancelAddGrid(); } }}
                      aria-label="Cancel adding grid"
                      style={{ flex: 1, textAlign: "center", padding: "7px 0", border: "1px solid " + V.outv, borderRadius: V.rs, font: "600 10px/1 " + t.font, letterSpacing: ".14em", color: V.ink2, cursor: "pointer" }}
                    >
                      CANCEL
                    </div>
                    <div
                      onClick={actions.saveCustomGrid}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.saveCustomGrid(); } }}
                      aria-label="Save custom grid"
                      style={{ flex: 1, textAlign: "center", padding: "7px 0", borderRadius: V.rs, background: V.pri, color: V.onpri, font: "600 10px/1 " + t.font, letterSpacing: ".14em", cursor: "pointer" }}
                    >
                      ADD GRID
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {fields.map((lf) => (
            <div key={lf.label}>
              <div style={{ font: "400 10px/1 " + t.font, letterSpacing: ".2em", color: V.pri, margin: "6px 0 4px" }}>{lf.label}</div>
              <div style={{ minHeight: "36px", display: "flex", alignItems: "center", padding: "0 10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, font: "400 12px/1 " + t.font, color: V.ink2 }}>{lf.value}</div>
            </div>
          ))}

          {!isGrid ? (
            <div style={{ font: "400 10px/1.4 " + t.font, color: V.ink2 }}>&gt; Offline mode: no grid connection, chat stays local.</div>
          ) : null}

          <div
            onClick={actions.connectLogin}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.connectLogin(); } }}
            aria-label={state.loginBusy ? "Connecting" : isGrid ? "Connect to Grid" : "Enter Offline"}
            style={{
              marginTop: "10px",
              height: "42px",
              borderRadius: V.rs,
              background: V.pri,
              color: V.onpri,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              font: "700 12px/1 " + t.font,
              letterSpacing: ".22em",
              cursor: "pointer",
              opacity: state.loginBusy ? 0.7 : 1,
            }}
          >
            <Icon name="power" size={16} />
            {state.loginBusy ? "CONNECTING…" : isGrid ? "CONNECT TO GRID" : "ENTER OFFLINE"}
          </div>

          <div
            onClick={() => actions.setScreen("Settings")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.setScreen("Settings"); } }}
            aria-label="Open Settings"
            style={{
              marginTop: "6px",
              height: "40px",
              borderRadius: V.rs,
              background: V.surf2,
              color: V.pri,
              border: "1px solid " + V.outv,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              font: "700 12px/1 " + t.font,
              letterSpacing: ".22em",
              cursor: "pointer",
            }}
          >
            <Icon name="settings" size={16} />
            SETTINGS
          </div>

          {state.loginError ? (
            <div style={{ font: "400 10px/1.4 " + t.font, color: V.err, marginTop: "6px", border: "1px solid " + V.err, borderRadius: V.rs, padding: "6px" }}>
              &gt; {state.loginError}
            </div>
          ) : (
            <div style={{ font: "400 10px/1.4 " + t.font, color: V.ink2, marginTop: "6px" }}>&gt; last: Agni · Da Boom · 14:02 · biometric unlock available</div>
          )}
        </div>
      </div>
    </div>
  );
}
