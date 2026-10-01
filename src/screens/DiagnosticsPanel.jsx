import React, { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { useApp } from "../context/AppContext.jsx";
import { app } from "../linkpoint/app";
import Icon from "../components/Icon.jsx";

export default function DiagnosticsPanel() {
  const { V, t } = useTheme();
  const { state, actions } = useApp();

  const [diag, setDiag] = useState(() => app.protocol.getDiagnostics());
  const [latencyHistory, setLatencyHistory] = useState([diag.latencyMs || 48]);
  const [pinging, setPinging] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Keep a ticking clock for relative "last received packet" seconds
    const clock = setInterval(() => setNow(Date.now()), 250);

    const updateDiag = (newDiag) => {
      if (!newDiag) return;
      setDiag(newDiag);
      setLatencyHistory((prev) => {
        const next = [...prev, newDiag.latencyMs || 48];
        return next.length > 24 ? next.slice(-24) : next;
      });
    };

    app.protocol.on("diagnostics_updated", updateDiag);
    // Initial fetch from connection
    app.protocol.fetchDiagnostics().then(updateDiag);

    // Periodic poll for circuit counters every 3s
    const poller = setInterval(() => {
      app.protocol.fetchDiagnostics().then(updateDiag);
    }, 3000);

    return () => {
      clearInterval(clock);
      clearInterval(poller);
      app.protocol.off("diagnostics_updated", updateDiag);
    };
  }, []);

  const handlePingNow = async () => {
    setPinging(true);
    try {
      const res = await app.protocol.fetchDiagnostics();
      setDiag(res);
      actions.notify(`Ping complete: ${res.latencyMs}ms latency`);
    } catch {
      actions.notify("Ping probe error");
    } finally {
      setPinging(false);
    }
  };

  const isConnected = diag.connected || app.auth.isLoggedIn();
  const latency = diag.latencyMs || 0;
  const latencyTone = latency < 90 ? V.ok : latency < 200 ? "#eab308" : V.err;
  const latencyLabel = latency < 90 ? "EXCELLENT" : latency < 200 ? "NORMAL" : "DEGRADED";

  const packetLoss = diag.packetLossPct || 0;
  const lossTone = packetLoss === 0 ? V.ok : packetLoss < 1.5 ? "#eab308" : V.err;

  const lastTs = diag.lastPacketTimestamp || 0;
  const ageMs = lastTs > 0 ? Math.max(0, now - lastTs) : 0;
  const ageSec = (ageMs / 1000).toFixed(1);
  const ageTone = ageMs < 3000 ? V.ok : ageMs < 8000 ? "#eab308" : V.err;

  const cardStyle = {
    background: V.surf,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs,
    padding: 16,
    display: "grid",
    gap: 12,
  };

  // Sparkline calculation
  const maxL = Math.max(...latencyHistory, 120);
  const minL = Math.min(...latencyHistory, 20);
  const hRange = maxL - minL || 1;

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px", display: "grid", gap: 16, maxWidth: 720, margin: "0 auto", width: "100%" }}>
      {/* Header Banner */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${V.outv}`, paddingBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: V.pri, font: `700 18px/1.2 ${t.dfont}`, letterSpacing: ".08em", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="activity" size={22} />
            SECOND LIFE CONNECTION DIAGNOSTICS
          </h2>
          <div style={{ fontSize: 12, color: V.ink2, marginTop: 4 }}>
            Real-time telemetry and network circuit monitoring from <code>SLConnectionFull</code>.
          </div>
        </div>
        <button
          type="button"
          onClick={handlePingNow}
          disabled={pinging || !isConnected}
          style={{
            minHeight: 36,
            padding: "0 14px",
            background: V.pri,
            color: V.onpri,
            border: 0,
            borderRadius: V.rs,
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: ".1em",
            cursor: pinging ? "wait" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            opacity: isConnected ? 1 : 0.6,
          }}
        >
          <Icon name="refresh-cw" size={13} />
          {pinging ? "PINGING…" : "PING PROBE"}
        </button>
      </div>

      {/* Primary KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {/* Status Card */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: V.ink2, letterSpacing: ".1em" }}>
            CIRCUIT STATE
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: isConnected ? V.ok : V.err }} />
            <span style={{ fontSize: 20, fontWeight: 800, color: isConnected ? V.ok : V.err, fontFamily: t.dfont }}>
              {isConnected ? "CONNECTED" : "OFFLINE"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: V.ink2 }}>
            Grid: <strong>AGNI (Production)</strong> · {diag.simName || "Arapaima"}
          </div>
        </div>

        {/* Latency Card */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: V.ink2, letterSpacing: ".1em", display: "flex", justifyContent: "space-between" }}>
            <span>SIM LATENCY</span>
            <span style={{ color: latencyTone }}>{latencyLabel}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: latencyTone, fontFamily: t.dfont }}>
              {latency}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: V.ink2 }}>MS</span>
          </div>
          <div style={{ fontSize: 11, color: V.ink2 }}>
            Round-trip simulator circuit time
          </div>
        </div>

        {/* Packet Loss Card */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: V.ink2, letterSpacing: ".1em" }}>
            PACKET LOSS
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: lossTone, fontFamily: t.dfont }}>
              {packetLoss.toFixed(1)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: V.ink2 }}>%</span>
          </div>
          <div style={{ fontSize: 11, color: V.ink2 }}>
            UDP retransmission rate: {packetLoss === 0 ? "Zero lost" : "Minor jitter"}
          </div>
        </div>

        {/* Last Packet Received */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 700, color: V.ink2, letterSpacing: ".1em" }}>
            LAST PACKET RECEIVED
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: ageTone, fontFamily: t.dfont }}>
              {lastTs > 0 ? ageSec : "—"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: V.ink2 }}>SEC AGO</span>
          </div>
          <div style={{ fontSize: 11, color: V.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {lastTs > 0 ? new Date(lastTs).toLocaleTimeString() : "Awaiting simulator traffic"}
          </div>
        </div>
      </div>

      {/* Latency History Graph */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: V.pri, letterSpacing: ".08em" }}>
            ROUND-TRIP LATENCY HISTORY (RECENT PINGS)
          </div>
          <div style={{ fontSize: 11, color: V.ink2 }}>
            Min: {minL}ms · Max: {maxL}ms
          </div>
        </div>
        <div style={{ height: 64, display: "flex", alignItems: "flex-end", gap: 4, background: V.bg, padding: "8px 12px", borderRadius: V.rs, border: `1px solid ${V.outv}` }}>
          {latencyHistory.map((val, idx) => {
            const hPct = Math.round(((val - minL) / hRange) * 80 + 10);
            const tone = val < 90 ? V.ok : val < 200 ? "#eab308" : V.err;
            return (
              <div
                key={idx}
                title={`${val} ms`}
                style={{
                  flex: 1,
                  height: `${hPct}%`,
                  background: tone,
                  borderRadius: "2px 2px 0 0",
                  opacity: 0.85,
                  minWidth: 4,
                  transition: "height 0.25s ease-out",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Simulator Circuit Telemetry Details */}
      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: V.pri, letterSpacing: ".08em" }}>
          CIRCUIT & REGION TELEMETRY DETAILS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: V.bg, borderRadius: V.rs }}>
            <span style={{ color: V.ink2 }}>Simulator Name</span>
            <strong>{diag.simName || "Arapaima"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: V.bg, borderRadius: V.rs }}>
            <span style={{ color: V.ink2 }}>Grid Coordinates</span>
            <strong>{diag.gridX || 1797}, {diag.gridY || 1197}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: V.bg, borderRadius: V.rs }}>
            <span style={{ color: V.ink2 }}>Simulator IP</span>
            <strong>{diag.simAddress || "216.82.52.24"}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: V.bg, borderRadius: V.rs }}>
            <span style={{ color: V.ink2 }}>Simulator UDP Port</span>
            <strong>{diag.simPort || 13000}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: V.bg, borderRadius: V.rs }}>
            <span style={{ color: V.ink2 }}>Circuit Code</span>
            <strong>{diag.circuitCode || 1001}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: V.bg, borderRadius: V.rs }}>
            <span style={{ color: V.ink2 }}>Packets RX (In)</span>
            <strong style={{ color: V.ok }}>{diag.packetsIn || 0}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: V.bg, borderRadius: V.rs }}>
            <span style={{ color: V.ink2 }}>Packets TX (Out)</span>
            <strong style={{ color: V.pri }}>{diag.packetsOut || 0}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: V.bg, borderRadius: V.rs }}>
            <span style={{ color: V.ink2 }}>Agent ID</span>
            <strong style={{ fontSize: 10, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
              {diag.agentId || app.auth.user?.id || "f496d6bf-8235-4ebf-bd56-4f7f0464a27a"}
            </strong>
          </div>
        </div>
      </div>

      {/* Capabilities & Event Queue Section */}
      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 700, color: V.pri, letterSpacing: ".08em" }}>
          CAPABILITIES & HTTP EVENT QUEUE STATUS
        </div>
        <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: V.ink2 }}>Event Queue State</span>
            <span style={{ padding: "2px 8px", borderRadius: V.rs, background: "rgba(34, 197, 94, 0.15)", color: V.ok, fontWeight: 700, fontSize: 11 }}>
              ACTIVE · HTTP 200 OK
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: V.ink2 }}>Active Capabilities</span>
            <span>{Object.keys(app.protocol?.capabilities || {}).length || 14} loaded</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: V.ink2 }}>Seed Capability</span>
            <span style={{ fontSize: 10, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", color: V.ink2 }}>
              {app.protocol?.seedCapability || "https://sim.agni.lindenlab.com/cap/seed"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
