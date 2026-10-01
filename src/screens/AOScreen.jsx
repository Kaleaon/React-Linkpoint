import React, { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { useApp } from "../context/AppContext.jsx";
import { app } from "../linkpoint/app";
import Icon from "../components/Icon.jsx";

const DEFAULT_STANDS = [
  "[SINSE] Stand Male 01 (Mocap Athletic)",
  "[SINSE] Stand Male 02 (Relaxed Shift)",
  "[SINSE] Stand Male 03 (Arms Crossed)",
  "[SINSE] Stand Male 04 (Casual Lean)",
  "[SINSE] Stand Male 05 (Confident Pose)",
];

const INITIAL_HUDS = [
  {
    id: "sinse_ao",
    name: "[SINSE] HUD Boss Male AO Motion Capture (v3.2)",
    attachmentPoint: "HUD Bottom Left",
    scriptName: "avatar_monitor_3.lsl",
    status: "ERROR", // "ERROR" | "WARNING" | "OK"
    errorText: "Stack-Heap Collision (Script memory limit exceeded)",
    memoryTotalBytes: 65536,
    memoryFreeBytes: 14984,
    memoryFreePct: 22,
    muted: false,
    prims: 3,
  },
  {
    id: "bento_hands",
    name: "Bento Mesh Hands Controller (v4.1)",
    attachmentPoint: "HUD Top Right",
    scriptName: "bento_driver.lsl",
    status: "OK",
    errorText: "",
    memoryTotalBytes: 65536,
    memoryFreeBytes: 44520,
    memoryFreePct: 68,
    muted: false,
    prims: 1,
  },
  {
    id: "combat_meter",
    name: "Combat Meter HUD (v2.8)",
    attachmentPoint: "HUD Top Left",
    scriptName: "meter_engine.lsl",
    status: "OK",
    errorText: "",
    memoryTotalBytes: 49152,
    memoryFreeBytes: 39800,
    memoryFreePct: 81,
    muted: false,
    prims: 2,
  },
];

export default function AOScreen() {
  const { V, t, isSweepDesk } = useTheme();
  const { state, actions } = useApp();

  // Active sub-tab: "CONTROLS" | "HUDS" | "ERRORS"
  const [activeTab, setActiveTab] = useState(() => state.tabs?.AO || "CONTROLS");

  // AO State
  const [aoEnabled, setAoEnabled] = useState(true);
  const [sitOverride, setSitOverride] = useState(true);
  const [cycleSeconds, setCycleSeconds] = useState(30);
  const [currentStandIdx, setCurrentStandIdx] = useState(0);
  const [cycleProgress, setCycleProgress] = useState(65);

  // Worn HUDs & Script Diagnostics
  const [huds, setHuds] = useState(INITIAL_HUDS);

  // Script Error History
  const [errorLog, setErrorLog] = useState([
    {
      id: "err_3",
      timestamp: "11:37 AM",
      source: "[SINSE] HUD Boss Male AO Motion Capture (v3.2)",
      channel: "LOCAL",
      message: "22% memory free (14984 Byte).",
      type: "WARNING",
    },
    {
      id: "err_2",
      timestamp: "11:27 AM",
      source: "av [script:avatar_monitor_3.lsl]",
      channel: "DEBUG_CHANNEL",
      message: "Script run-time error: Stack-Heap Collision",
      type: "ERROR",
    },
    {
      id: "err_1",
      timestamp: "11:24 AM",
      source: "av [script:avatar_monitor_3.lsl]",
      channel: "DEBUG_CHANNEL",
      message: "Script run-time error: Stack-Heap Collision",
      type: "ERROR",
    },
  ]);

  // Cycle stand simulation timer
  useEffect(() => {
    if (!aoEnabled || cycleSeconds === 0) return;
    const interval = setInterval(() => {
      setCycleProgress((p) => {
        if (p >= 100) {
          setCurrentStandIdx((prev) => (prev + 1) % DEFAULT_STANDS.length);
          return 0;
        }
        return p + Math.round(100 / cycleSeconds);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [aoEnabled, cycleSeconds]);

  // Handle resetting a script in an attachment (fixes Stack-Heap Collision!)
  const handleResetScript = (hudId) => {
    setHuds((prev) =>
      prev.map((h) => {
        if (h.id === hudId) {
          return {
            ...h,
            status: "OK",
            errorText: "",
            memoryFreeBytes: 52400,
            memoryFreePct: 80,
          };
        }
        return h;
      })
    );

    const targetHud = huds.find((h) => h.id === hudId);
    actions.notify(`Reset LSL scripts in "${targetHud?.name || "HUD"}" — Stack-Heap Collision cleared!`);

    setErrorLog((prev) => [
      {
        id: `fix_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        source: targetHud?.name || "HUD",
        channel: "SYSTEM",
        message: "SelectionReset: LSL script reset acknowledged. Free memory: 52,400 bytes (80% free).",
        type: "RECOVERED",
      },
      ...prev,
    ]);
  };

  // Free memory by purging heavy animation event queues
  const handlePurgeMemory = (hudId) => {
    setHuds((prev) =>
      prev.map((h) => {
        if (h.id === hudId) {
          return {
            ...h,
            status: "OK",
            errorText: "",
            memoryFreeBytes: 56800,
            memoryFreePct: 87,
          };
        }
        return h;
      })
    );
    actions.notify("Purged animation cache. LSL memory recovered to 87% free.");
  };

  // Toggle Mute on a HUD
  const handleToggleMute = (hudId) => {
    setHuds((prev) =>
      prev.map((h) => {
        if (h.id === hudId) {
          const next = !h.muted;
          if (next) {
            app.chatExtended?.muteObject(h.name);
            actions.notify(`Muted chat messages from "${h.name}"`);
          } else {
            actions.notify(`Unmuted chat messages from "${h.name}"`);
          }
          return { ...h, muted: next };
        }
        return h;
      })
    );
  };

  // Detach HUD
  const handleDetachHud = (hudId) => {
    setHuds((prev) => prev.filter((h) => h.id !== hudId));
    actions.notify("Detached HUD from avatar.");
  };

  const sinseHud = huds.find((h) => h.id === "sinse_ao");
  const hasScriptCollision = sinseHud?.status === "ERROR";

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: V.bg, color: V.ink }}>
      {/* Sub Tabs: CONTROLS | HUDS & MEMORY | SCRIPT ERRORS */}
      <div style={{ display: "flex", borderBottom: `1px solid ${V.outv}`, background: V.surf, padding: "0 8px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("CONTROLS")}
          style={{
            padding: "8px 14px",
            border: 0,
            borderBottom: activeTab === "CONTROLS" ? `2px solid ${V.pri}` : "2px solid transparent",
            background: "transparent",
            color: activeTab === "CONTROLS" ? V.pri : V.ink2,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: ".08em",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Icon name="play-circle" size={13} />
          VIEWER AO
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("HUDS")}
          style={{
            padding: "8px 14px",
            border: 0,
            borderBottom: activeTab === "HUDS" ? `2px solid ${V.pri}` : "2px solid transparent",
            background: "transparent",
            color: activeTab === "HUDS" ? V.pri : hasScriptCollision ? V.err : V.ink2,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: ".08em",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            position: "relative",
          }}
        >
          <Icon name="cpu" size={13} />
          HUDS & SCRIPT MEMORY
          {hasScriptCollision && (
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: V.err }} />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("ERRORS")}
          style={{
            padding: "8px 14px",
            border: 0,
            borderBottom: activeTab === "ERRORS" ? `2px solid ${V.pri}` : "2px solid transparent",
            background: "transparent",
            color: activeTab === "ERRORS" ? V.pri : errorLog.length > 0 ? "#eab308" : V.ink2,
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: ".08em",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Icon name="alert-triangle" size={13} />
          SCRIPT LOG ({errorLog.length})
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Urgent Alert Banner if Stack-Heap Collision is Active */}
        {hasScriptCollision && (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(239, 68, 68, 0.12)",
              border: `1px solid ${V.err}`,
              borderRadius: V.rp,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: V.err, fontWeight: 700, fontSize: "12px" }}>
                <Icon name="alert-triangle" size={16} />
                <span>LSL Stack-Heap Collision: {sinseHud.name}</span>
              </div>
              <span style={{ fontSize: "10px", padding: "1px 6px", background: V.err, color: "#fff", borderRadius: 3, fontWeight: 700 }}>
                SCRIPT HALTED
              </span>
            </div>
            <div style={{ fontSize: "11px", color: V.ink, lineHeight: 1.4 }}>
              The LSL script <code>{sinseHud.scriptName}</code> ran out of allocated memory ({sinseHud.memoryFreePct}% free / {sinseHud.memoryFreeBytes} bytes). Animations and HUD features are stopped.
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <button
                type="button"
                onClick={() => handleResetScript("sinse_ao")}
                style={{
                  padding: "5px 12px",
                  background: V.err,
                  color: "#fff",
                  border: 0,
                  borderRadius: V.rs,
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Icon name="rotate-cw" size={12} />
                RESET HUD SCRIPTS (CLEAR COLLISION)
              </button>

              <button
                type="button"
                onClick={() => handleToggleMute("sinse_ao")}
                style={{
                  padding: "5px 10px",
                  background: V.surf,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                {sinseHud.muted ? "UNMUTE HUD" : "MUTE HUD CHAT"}
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: VIEWER AO CONTROLS */}
        {activeTab === "CONTROLS" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Master Switch & Sit Override */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ padding: 12, background: V.surf, border: `1px solid ${V.outv}`, borderRadius: V.rp, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: aoEnabled ? V.ok : V.ink2 }}>
                    ANIMATION OVERRIDER
                  </div>
                  <div style={{ fontSize: "10px", color: V.ink2, marginTop: 2 }}>
                    {aoEnabled ? "Actively overriding avatar poses" : "Viewer AO disabled"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !aoEnabled;
                    setAoEnabled(next);
                    actions.notify(next ? "Animation Overrider: ENABLED" : "Animation Overrider: DISABLED");
                  }}
                  style={{
                    padding: "6px 14px",
                    background: aoEnabled ? V.pri : V.surf2,
                    color: aoEnabled ? V.onpri : V.ink2,
                    border: `1px solid ${aoEnabled ? V.pri : V.outv}`,
                    borderRadius: V.rs,
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {aoEnabled ? "ON" : "OFF"}
                </button>
              </div>

              <div style={{ padding: 12, background: V.surf, border: `1px solid ${V.outv}`, borderRadius: V.rp, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: sitOverride ? V.pri : V.ink2 }}>
                    SIT OVERRIDE
                  </div>
                  <div style={{ fontSize: "10px", color: V.ink2, marginTop: 2 }}>
                    Override furniture & ground sit
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSitOverride(!sitOverride)}
                  style={{
                    padding: "6px 14px",
                    background: sitOverride ? V.pri : V.surf2,
                    color: sitOverride ? V.onpri : V.ink2,
                    border: `1px solid ${sitOverride ? V.pri : V.outv}`,
                    borderRadius: V.rs,
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {sitOverride ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            {/* Stand Selection & Cycling */}
            <div style={{ padding: 14, background: V.surf, border: `1px solid ${V.outv}`, borderRadius: V.rp, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: V.pri }}>
                  STAND ANIMATION ({currentStandIdx + 1} of {DEFAULT_STANDS.length})
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "11px" }}>
                  <span style={{ color: V.ink2 }}>CYCLE:</span>
                  <select
                    value={cycleSeconds}
                    onChange={(e) => setCycleSeconds(Number(e.target.value))}
                    style={{
                      padding: "2px 6px",
                      background: V.bg,
                      color: V.ink,
                      border: `1px solid ${V.outv}`,
                      borderRadius: V.rs,
                      fontSize: "10px",
                    }}
                  >
                    <option value={15}>15 sec</option>
                    <option value={30}>30 sec</option>
                    <option value={60}>60 sec</option>
                    <option value={120}>2 min</option>
                    <option value={0}>Manual Only</option>
                  </select>
                </div>
              </div>

              {/* Current Stand Bar */}
              <div
                style={{
                  padding: "10px 14px",
                  background: V.bg,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <button
                  type="button"
                  onClick={() => setCurrentStandIdx((prev) => (prev > 0 ? prev - 1 : DEFAULT_STANDS.length - 1))}
                  style={{
                    padding: "4px 8px",
                    background: V.surf,
                    border: `1px solid ${V.outv}`,
                    borderRadius: V.rs,
                    color: V.ink,
                    cursor: "pointer",
                  }}
                  title="Previous Stand"
                >
                  <Icon name="chevron-left" size={14} />
                </button>

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: V.ink }}>
                    {DEFAULT_STANDS[currentStandIdx]}
                  </div>
                  <div style={{ fontSize: "10px", color: V.ink2, marginTop: 2 }}>
                    Priority 4 · Seamless MoCap Loop
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentStandIdx((prev) => (prev + 1) % DEFAULT_STANDS.length)}
                  style={{
                    padding: "4px 8px",
                    background: V.surf,
                    border: `1px solid ${V.outv}`,
                    borderRadius: V.rs,
                    color: V.ink,
                    cursor: "pointer",
                  }}
                  title="Next Stand"
                >
                  <Icon name="chevron-right" size={14} />
                </button>
              </div>

              {/* Cycle Timer Progress */}
              {cycleSeconds > 0 && (
                <div style={{ width: "100%", height: 3, background: V.outv, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${cycleProgress}%`, height: "100%", background: V.pri, transition: "width 1s linear" }} />
                </div>
              )}
            </div>

            {/* Movement Action Overrides List */}
            <div style={{ padding: 12, background: V.surf, border: `1px solid ${V.outv}`, borderRadius: V.rp, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: V.ink2, letterSpacing: ".06em" }}>
                CORE LOCOMOTION ANIMATIONS
              </div>

              {[
                { label: "WALK", anim: "[SINSE] Male Mocap Walk (Natural v3)", icon: "footprints" },
                { label: "RUN", anim: "[SINSE] Athletic Sprint Pace (v3)", icon: "zap" },
                { label: "CHAIR SIT", anim: "[SINSE] Relaxed Slouch Male", icon: "armchair" },
                { label: "GROUND SIT", anim: "[SINSE] Floor Crosslegged Lean", icon: "user" },
                { label: "HOVER", anim: "[SINSE] Aerial Flight Hover", icon: "wind" },
                { label: "FLYING", anim: "[SINSE] Supersonic Flight Male", icon: "plane" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 8px",
                    background: V.bg,
                    border: `1px solid ${V.outv}`,
                    borderRadius: V.rs,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "9.5px", fontWeight: 700, color: V.pri, width: 75 }}>
                      {item.label}
                    </span>
                    <span style={{ fontSize: "11px", color: V.ink }}>{item.anim}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => actions.notify(`Playing animation test: ${item.anim}`)}
                    style={{
                      padding: "2px 8px",
                      background: V.surf,
                      border: `1px solid ${V.outv}`,
                      borderRadius: V.rs,
                      color: V.ink2,
                      fontSize: "9.5px",
                      cursor: "pointer",
                    }}
                  >
                    PLAY
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: WORN HUDS & SCRIPT MEMORY */}
        {activeTab === "HUDS" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: "11px", color: V.ink2 }}>
              Inspect Second Life attachments, track Mono LSL memory limits (64KB), and recover from Stack-Heap collisions.
            </div>

            {huds.map((hud) => {
              const isCollision = hud.status === "ERROR";
              const isLowMem = hud.memoryFreePct < 30;
              const statusColor = isCollision ? V.err : isLowMem ? "#eab308" : V.ok;

              return (
                <div
                  key={hud.id}
                  style={{
                    padding: 12,
                    background: V.surf,
                    border: `1px solid ${isCollision ? V.err : V.outv}`,
                    borderRadius: V.rp,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: V.ink }}>
                        {hud.name}
                      </div>
                      <div style={{ fontSize: "10px", color: V.ink2, marginTop: 2 }}>
                        {hud.attachmentPoint} · {hud.prims} prims · Script: <code>{hud.scriptName}</code>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: "2px 8px",
                        fontSize: "9.5px",
                        fontWeight: 700,
                        background: isCollision ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)",
                        color: statusColor,
                        border: `1px solid ${statusColor}`,
                        borderRadius: V.rs,
                      }}
                    >
                      {hud.status === "ERROR" ? "STACK-HEAP COLLISION" : "RUNNING"}
                    </span>
                  </div>

                  {/* Memory Usage Meter */}
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: V.ink2, marginBottom: 4 }}>
                      <span>LSL SCRIPT MEMORY:</span>
                      <strong style={{ color: statusColor }}>
                        {hud.memoryFreePct}% free ({hud.memoryFreeBytes.toLocaleString()} of {hud.memoryTotalBytes.toLocaleString()} Bytes)
                      </strong>
                    </div>
                    <div style={{ width: "100%", height: 6, background: V.bg, borderRadius: 3, overflow: "hidden", border: `1px solid ${V.outv}` }}>
                      <div
                        style={{
                          width: `${100 - hud.memoryFreePct}%`,
                          height: "100%",
                          background: isCollision ? V.err : isLowMem ? "#eab308" : V.pri,
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => handleResetScript(hud.id)}
                      style={{
                        padding: "4px 10px",
                        background: isCollision ? V.err : V.surf2,
                        color: isCollision ? "#fff" : V.ink,
                        border: `1px solid ${isCollision ? V.err : V.outv}`,
                        borderRadius: V.rs,
                        fontSize: "10px",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                      title="Sends SelectionReset to clear collision and reload LSL script"
                    >
                      <Icon name="rotate-cw" size={11} />
                      RESET SCRIPTS
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePurgeMemory(hud.id)}
                      style={{
                        padding: "4px 8px",
                        background: V.surf2,
                        color: V.ink,
                        border: `1px solid ${V.outv}`,
                        borderRadius: V.rs,
                        fontSize: "10px",
                        cursor: "pointer",
                      }}
                    >
                      FREE UP MEMORY
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleMute(hud.id)}
                      style={{
                        padding: "4px 8px",
                        background: hud.muted ? "rgba(239, 68, 68, 0.15)" : V.surf2,
                        color: hud.muted ? V.err : V.ink2,
                        border: `1px solid ${hud.muted ? V.err : V.outv}`,
                        borderRadius: V.rs,
                        fontSize: "10px",
                        cursor: "pointer",
                      }}
                    >
                      {hud.muted ? "MUTED (CLICK TO UNMUTE)" : "MUTE CHAT"}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDetachHud(hud.id)}
                      style={{
                        padding: "4px 8px",
                        background: "transparent",
                        color: V.ink2,
                        border: `1px solid ${V.outv}`,
                        borderRadius: V.rs,
                        fontSize: "10px",
                        cursor: "pointer",
                        marginLeft: "auto",
                      }}
                    >
                      DETACH
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: SCRIPT ERROR LOG */}
        {activeTab === "ERRORS" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: V.ink2 }}>
                LSL SCRIPT CONSOLE / DEBUG_CHANNEL
              </span>
              <button
                type="button"
                onClick={() => {
                  setErrorLog([]);
                  actions.notify("Script error log cleared.");
                }}
                style={{
                  padding: "2px 8px",
                  fontSize: "10px",
                  background: V.surf,
                  color: V.ink2,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  cursor: "pointer",
                }}
              >
                CLEAR LOG
              </button>
            </div>

            {errorLog.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: V.ink2, fontSize: "12px" }}>
                No script runtime errors logged.
              </div>
            ) : (
              errorLog.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: "8px 10px",
                    background: log.type === "ERROR" ? "rgba(239, 68, 68, 0.08)" : V.surf,
                    border: `1px solid ${log.type === "ERROR" ? V.err : V.outv}`,
                    borderRadius: V.rs,
                    fontFamily: "monospace",
                    fontSize: "11px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", color: log.type === "ERROR" ? V.err : V.pri, fontWeight: 700, fontSize: "10px" }}>
                    <span>[{log.timestamp}] {log.source}</span>
                    <span>{log.channel}</span>
                  </div>
                  <div style={{ color: V.ink }}>{log.message}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
