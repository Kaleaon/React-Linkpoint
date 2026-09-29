import { useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { LAYOUTS } from "../theme/layouts.js";
import { PALETTES } from "../theme/palettes.js";
import { FLOATERS, FBAR, CBTN } from "../theme/constants.js";
import { LOCAL_MSGS, RADAR_AVATARS, FRIEND_ROWS, INVENTORY_SOURCE, REGIONS, buildCards } from "../data/content.js";
import Icon from "./Icon.jsx";
import ScreenBody from "./ScreenBody.jsx";

// Ported from the `isFloat` block: desktop SL isn't a screen stack, it's N
// resizable windows over one scene (the `FLOATERS` window model — position,
// size, z-order and minimise all live in state). The currently-focused
// floater's real interactive screen content is overlaid on top of its
// window chrome via `shellStyle`; every other open floater just shows a
// read-only preview list built from the same data (`FBODY` in the source).
export default function FloatersDesktop() {
  const { state, actions } = useApp();
  const { V, t, ink, isSweepDesk } = useTheme();
  const [quickMsg, setQuickMsg] = useState("");
  const [showCamHud, setShowCamHud] = useState(true);

  const cardsByScreen = buildCards({ state, actions, layoutName: LAYOUTS[state.layout].name, paletteName: PALETTES[state.palette].name });
  const fBody = buildFBody(state, cardsByScreen);

  const flScene = {
    position: "absolute", inset: 0, overflow: "hidden", cursor: state.cDrag ? "grabbing" : "grab",
    background: "linear-gradient(180deg," + V.sky1 + " 0%," + V.sky2 + " 52%," + V.gnd + " 52%," + V.gnd2 + " 100%)",
  };
  const flHorizon = {
    position: "absolute", inset: "-20% -40%", transform: "translate(" + (-state.cHdg * 0.9).toFixed(1) + "px," + (state.cPitch * 0.8).toFixed(1) + "px)",
    transition: state.cDrag ? "none" : "transform .35s ease-out", opacity: 0.45, backgroundImage: "repeating-linear-gradient(90deg," + V.outv + " 0 1px,transparent 1px 104px)",
  };
  const regionRead = "HELIOTROPE · 128,64,42 · HDG " + String(Math.round(((state.cHdg % 360) + 360) % 360)).padStart(3, "0") + "° " + (state.cPitch > 2 ? "DN" : state.cPitch < -2 ? "UP" : "LVL");

  const openFloaters = FLOATERS.filter((f) => state.flOpen[f.id] && !state.flMin[f.id]);
  const flFocused = state.flOpen[state.screen] && !state.flMin[state.screen] ? actions.flR(state.screen) : null;

  const sendQuickChat = (e) => {
    e?.preventDefault();
    if (!quickMsg.trim()) return;
    actions.notify("Local Chat (" + quickMsg.trim() + ")");
    setQuickMsg("");
  };

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: V.bg }}>
      <div
        onMouseDown={actions.sceneDown}
        onMouseMove={actions.sceneMove}
        onMouseUp={actions.sceneUp}
        onMouseLeave={actions.sceneUp}
        onClick={() => state.menu && actions.setMenu(null)}
        style={flScene}
      >
        <div style={flHorizon} />
        <div style={{ position: "absolute", left: "14px", bottom: "52px", display: "flex", alignItems: "center", height: "24px", padding: "0 11px", background: V.surf, color: V.ink2, font: "500 10px/1 " + t.font, letterSpacing: ".08em", borderLeft: "5px solid " + V.sec2 }}>
          {regionRead}
        </div>

        {/* Firestorm Camera & Orbit HUD Overlay */}
        {showCamHud && (
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute", right: "16px", bottom: "52px", padding: "8px", background: V.surf, border: (isSweepDesk ? "2px solid " : "1px solid ") + (isSweepDesk ? V.pri : V.outv),
              borderRadius: isSweepDesk ? "18px" : V.rp, boxShadow: "0 12px 32px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: "6px", zIndex: 20
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", borderBottom: "1px solid " + V.outv, paddingBottom: "4px" }}>
              <span style={{ font: "600 9px/1 " + t.dfont, color: V.ink2, letterSpacing: ".08em" }}>CAMERA CONTROLS</span>
              <span onClick={() => setShowCamHud(false)} style={{ cursor: "pointer", color: V.ink2, fontSize: "12px", lineHeight: 1 }}>&times;</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 24px)", gap: "3px", justifyContent: "center" }}>
              <button type="button" onClick={() => actions.sceneMove({ clientX: 0, clientY: -10 })} style={{ height: "24px", background: V.surf2, border: "1px solid " + V.outv, color: V.ink, borderRadius: isSweepDesk ? "999px" : V.rs, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Orbit Up">
                <Icon name="chevron-up" size={12} />
              </button>
              <button type="button" onClick={() => { actions.cHold("cam"); }} style={{ height: "24px", background: V.pri, border: "1px solid " + V.pri, color: ink(V.pri, [V.bg, V.onpri, V.ink]), borderRadius: isSweepDesk ? "999px" : V.rs, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", font: "600 8px/1 " + t.dfont }} aria-label="Toggle Mode">
                {state.cCam === "ORBIT" ? "ORB" : "LOOK"}
              </button>
              <button type="button" onClick={() => actions.sceneMove({ clientX: 0, clientY: 10 })} style={{ height: "24px", background: V.surf2, border: "1px solid " + V.outv, color: V.ink, borderRadius: isSweepDesk ? "999px" : V.rs, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Orbit Down">
                <Icon name="chevron-down" size={12} />
              </button>
              <button type="button" onClick={() => actions.sceneMove({ clientX: -15, clientY: 0 })} style={{ height: "24px", background: V.surf2, border: "1px solid " + V.outv, color: V.ink, borderRadius: isSweepDesk ? "999px" : V.rs, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Orbit Left">
                <Icon name="chevron-left" size={12} />
              </button>
              <button type="button" onClick={() => actions.notify("Camera Reset")} style={{ height: "24px", background: V.surf2, border: "1px solid " + V.outv, color: V.ink, borderRadius: isSweepDesk ? "999px" : V.rs, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Reset View">
                <Icon name="rotate-ccw" size={11} />
              </button>
              <button type="button" onClick={() => actions.sceneMove({ clientX: 15, clientY: 0 })} style={{ height: "24px", background: V.surf2, border: "1px solid " + V.outv, color: V.ink, borderRadius: isSweepDesk ? "999px" : V.rs, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Orbit Right">
                <Icon name="chevron-right" size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      {openFloaters.map((f) => {
        const r = actions.flR(f.id);
        const act = f.id === state.screen;
        const rows = act ? null : fBody[f.id] || [];
        return (
          <div
            key={f.id}
            onMouseDown={() => actions.flFocus(f.id)}
            style={{
              position: "absolute", left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px",
              zIndex: 10 + Math.max(0, state.flZ.indexOf(f.id)), display: "flex", flexDirection: "column", background: V.surf,
              border: (isSweepDesk ? "2px solid " : "1px solid ") + (act ? V.pri : V.outv), borderRadius: isSweepDesk ? "22px 22px 14px 14px" : V.rp, overflow: "hidden",
              boxShadow: act ? "0 18px 48px rgba(0,0,0,.65)" : "0 6px 18px rgba(0,0,0,.34)",
            }}
          >
            <div
              onMouseDown={(e) => actions.flDrag(f.id, e, "move")}
              style={{ flex: "none", height: FBAR + "px", display: "flex", alignItems: "center", gap: "7px", padding: isSweepDesk ? "0 5px 0 0" : "0 5px 0 9px", background: act ? V.pri : V.surf2, color: act ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink2, font: "700 10.5px/1 " + t.dfont, letterSpacing: ".14em", cursor: "move", userSelect: "none" }}
            >
              {isSweepDesk && (
                <span style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 8px", background: act ? V.sec : V.sec2, color: act ? V.bg : V.onsec, borderRadius: "18px 0 10px 0", font: "700 9.5px/1 " + t.dfont, letterSpacing: ".1em", flex: "none", marginRight: "4px" }}>
                  {act ? "LCARS" : "SYS"}
                </span>
              )}
              <Icon name={f.icon} size={13} />
              <span style={{ flex: 1, minWidth: 0, font: "inherit", letterSpacing: "inherit", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{f.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  actions.flToggle(f.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    actions.flToggle(f.id);
                  }
                }}
                style={{ width: "17px", height: "17px", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid currentColor", borderRadius: isSweepDesk ? "999px" : V.rs, font: "700 11px/1 " + t.dfont, cursor: "pointer", opacity: 0.85 }}
                role="button" tabIndex={0} aria-label="Minimize"
              >
                &minus;
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  actions.flClose(f.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    actions.flClose(f.id);
                  }
                }}
                style={{ width: "17px", height: "17px", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid currentColor", borderRadius: isSweepDesk ? "999px" : V.rs, font: "700 11px/1 " + t.dfont, cursor: "pointer", opacity: 0.85 }}
                role="button" tabIndex={0} aria-label="Close"
              >
                &times;
              </span>
            </div>
            {rows ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "1px", background: V.bg }}>
                {rows.map((row, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "26px", padding: "0 10px", background: V.surf }}>
                    <span style={{ flex: 1, minWidth: 0, font: "400 11.5px/1.2 " + t.font, color: V.ink, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{row.a}</span>
                    <span style={{ flex: "none", font: "400 10px/1 " + t.font, color: V.ink2 }}>{row.b}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, background: V.bg }} />
            )}
            <div
              onMouseDown={(e) => actions.flDrag(f.id, e, "size")}
              style={{ position: "absolute", right: 0, bottom: 0, width: "15px", height: "15px", cursor: "nwse-resize", background: "linear-gradient(135deg,transparent 0 52%," + (act ? V.pri : V.outv) + " 52% 100%)" }}
            />
          </div>
        );
      })}

      {flFocused ? (
        <div
          style={{
            position: "absolute", left: flFocused.x + "px", top: flFocused.y + FBAR + "px", width: flFocused.w + "px", height: flFocused.h - FBAR + "px",
            display: "flex", minWidth: 0, overflow: "hidden", background: V.surf, borderWidth: "0 1px 1px", borderStyle: "solid", borderColor: V.pri,
            borderBottomLeftRadius: V.rp, borderBottomRightRadius: V.rp,
            boxSizing: "border-box", zIndex: 50,
          }}
        >
          <ScreenBody />
        </div>
      ) : null}

      {/* Firestorm Desktop Taskbar & Nearby Quick-Chat Dock */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "40px", display: "flex", alignItems: "center", gap: "6px", padding: "0 8px", background: V.surf, borderTop: (isSweepDesk ? "2px solid " : "1px solid ") + (isSweepDesk ? V.pri : V.outv), zIndex: 60 }}>
        {/* Persistent Firestorm Nearby Quick Chat Input Bar */}
        <form onSubmit={sendQuickChat} style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: "260px", maxWidth: "340px" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="text"
              value={quickMsg}
              onChange={(e) => setQuickMsg(e.target.value)}
              placeholder="Nearby Chat..."
              style={{
                width: "100%", height: "26px", padding: "0 8px", background: V.bg, color: V.ink,
                border: "1px solid " + V.outv, borderRadius: isSweepDesk ? "999px" : V.rs, font: "400 11px/1 " + t.font, outline: "none"
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              height: "26px", padding: "0 10px", background: V.pri, color: ink(V.pri, [V.bg, V.onpri, V.ink]),
              border: "none", borderRadius: isSweepDesk ? "999px" : V.rs, font: "700 9.5px/1 " + t.dfont, letterSpacing: ".12em", cursor: "pointer", flex: "none"
            }}
          >
            SAY
          </button>
        </form>

        <div style={{ width: "1px", height: "20px", background: V.outv, margin: "0 2px" }} />

        {FLOATERS.filter((f) => state.flOpen[f.id]).map((f) => {
          const min = !!state.flMin[f.id];
          const act = f.id === state.screen && !min;
          return (
            <div
              key={f.id}
              onClick={() => actions.flToggle(f.id)}
              style={{ flex: "none", height: "26px", display: "flex", alignItems: "center", padding: "0 10px", cursor: "pointer", background: act ? V.pri : min ? "transparent" : V.surf2, color: act ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink2, border: "1px solid " + (min ? V.outv : "transparent"), borderRadius: isSweepDesk ? "999px" : V.rs, font: isSweepDesk ? "700 10px/1 " + t.dfont : "500 10px/1 " + t.font, letterSpacing: isSweepDesk ? ".12em" : ".08em", whiteSpace: "nowrap" }}
            >
              {f.title}
            </div>
          );
        })}

        <div style={{ flex: 1, minWidth: "8px" }} />

        {/* Toggle Camera HUD Button */}
        <button
          type="button"
          onClick={() => setShowCamHud((v) => !v)}
          style={{
            flex: "none", height: "26px", display: "flex", alignItems: "center", gap: "4px", padding: "0 8px",
            background: showCamHud ? V.pri : V.surf2, color: showCamHud ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink2,
            border: "1px solid " + (showCamHud ? V.pri : V.outv), borderRadius: isSweepDesk ? "999px" : V.rs, cursor: "pointer",
            font: "600 9.5px/1 " + t.dfont, letterSpacing: ".08em"
          }}
          title="Toggle Camera HUD"
        >
          <Icon name="video" size={12} />
          CAM HUD
        </button>

        {state.cDock.map((k) => {
          const b = CBTN[k],
            lit = !!state.cTog[k],
            dis = !!b.off;
          const bg = lit ? V.pri : V.surf2;
          return (
            <div
              key={k}
              onClick={() => actions.cPress(k)}
              style={{ flex: "none", height: "26px", display: "flex", alignItems: "center", gap: "6px", padding: "0 9px", background: dis ? "transparent" : bg, color: dis ? V.ink2 : ink(bg, [V.bg, V.onpri, V.ink]), border: "1px solid " + (dis ? V.outv : "transparent"), borderRadius: V.rs, cursor: dis ? "not-allowed" : "pointer", font: "600 9.5px/1 " + t.dfont, letterSpacing: ".1em", whiteSpace: "nowrap" }}
            >
              <Icon name={b.icon} size={13} />
              {b.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Ported from `FBODY` — unfocused floaters keep ticking with real data, not
// placeholders.
function buildFBody(state, cardsByScreen) {
  const invNodes = INVENTORY_SOURCE.map(([name, icon, depth, parent, ver]) => ({ name, ver, parent, depth })).filter((n) => n.depth === 0 || (n.parent && state.invOpen[n.parent] !== false));
  return {
    Chat: LOCAL_MSGS.slice(-6).map((m) => ({ a: m.sender, b: m.ts })),
    Radar: RADAR_AVATARS.slice()
      .sort((a, b) => a[1] - b[1])
      .slice(0, 8)
      .map((r) => ({ a: r[0], b: r[1] + "m" })),
    Friends: FRIEND_ROWS.map((r) => ({ a: r[0], b: r[1].split(" · ")[0] })),
    Inventory: invNodes.map((n) => ({ a: n.name, b: n.ver })),
    Map: REGIONS.map(([name, meta]) => ({ a: name, b: meta })),
    Profile: [
      { a: "Nyx Vaher", b: "online" },
      { a: "Region", b: "Da Boom" },
      { a: "Rezzed", b: "2007-03-14" },
      { a: "Groups", b: "12" },
    ],
    Groups: (cardsByScreen.Groups || []).map((c) => ({ a: c.title, b: c.right || "" })),
    Notices: (cardsByScreen.Notices || []).map((c) => ({ a: c.title, b: c.right || "" })),
    Teleport: (cardsByScreen.Teleport || []).map((c) => ({ a: c.title, b: c.right || "" })),
    Settings: (cardsByScreen.Settings || []).map((c) => ({ a: c.title, b: c.right || "" })),
    Diagnostics: (cardsByScreen.Diagnostics || []).map((c) => ({ a: c.title, b: c.right || "" })),
    "Offline Grid": [
      { a: "Local Grid Engine", b: state.offlineRunning ? "ONLINE" : "OFFLINE" },
      { a: "Active User", b: ((state.offlineUser && state.offlineUser.firstName) || "Jane") + " " + ((state.offlineUser && state.offlineUser.lastName) || "Doe") },
      { a: "Local IP/Port", b: "127.0.0.1:9000" },
      { a: "OAR Region", b: state.oarRegionName || "Welcome Island" }
    ],
    "Grid Console": [
      { a: "Total Entries", b: String((state.consoleLogs || []).length) },
      { a: "Warnings", b: String((state.consoleLogs || []).filter(e => e.level === "WARN").length) },
      { a: "Errors", b: String((state.consoleLogs || []).filter(e => e.level === "ERROR" || e.level === "FATAL").length) }
    ],
  };
}
