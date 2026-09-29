import React from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

export default function GridConsole() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();

  const logs = (state.consoleLogs || []).filter((entry) => {
    if (state.consoleQuery) {
      const q = state.consoleQuery.toLowerCase();
      return entry.msg.toLowerCase().includes(q) || entry.tag.toLowerCase().includes(q);
    }
    return true;
  });

  const totalCount = (state.consoleLogs || []).length;
  const warnCount = (state.consoleLogs || []).filter((e) => e.level === "WARN").length;
  const errorCount = (state.consoleLogs || []).filter((e) => e.level === "ERROR" || e.level === "FATAL").length;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "12px", gap: "10px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", padding: "10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ padding: "4px 8px", borderRadius: V.rs, background: V.surf2, font: "700 10px/1 " + t.font, color: V.ink }}>ENTRIES: {totalCount}</span>
          <span style={{ padding: "4px 8px", borderRadius: V.rs, background: "rgba(255,176,32,0.15)", font: "700 10px/1 " + t.font, color: "#FFB020" }}>WARN: {warnCount}</span>
          <span style={{ padding: "4px 8px", borderRadius: V.rs, font: "700 10px/1 " + t.font, background: errorCount > 0 ? "rgba(255,85,85,0.25)" : V.surf2, color: errorCount > 0 ? "#FF5555" : V.ink2 }}>
            ERRORS: {errorCount}
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
          <input
            value={state.consoleQuery || ""}
            onChange={(e) => actions.setConsoleQuery(e.target.value)}
            placeholder="filter logs..."
            style={{ height: "28px", padding: "0 8px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, color: V.ink, font: "400 11px/1 " + t.font }}
          />
          <div
            onClick={actions.copyConsoleLogs}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.copyConsoleLogs(); } }}
            style={{ padding: "6px 10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf2, font: "700 10px/1 " + t.font, color: V.pri, cursor: "pointer" }}
            role="button" aria-label="Copy logs" tabIndex={0}
          >
            COPY
          </div>
          <div
            onClick={actions.downloadConsoleLogs}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.downloadConsoleLogs(); } }}
            style={{ padding: "6px 10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf2, font: "700 10px/1 " + t.font, color: V.pri, cursor: "pointer" }}
            role="button" aria-label="Download logs" tabIndex={0}
          >
            DOWNLOAD
          </div>
          <div
            onClick={actions.clearConsoleLogs}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.clearConsoleLogs(); } }}
            style={{ padding: "6px 10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf2, font: "700 10px/1 " + t.font, color: "#FF6C6C", cursor: "pointer" }}
            role="button" aria-label="Clear logs" tabIndex={0}
          >
            CLEAR
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: "#050B0C", fontFamily: "'JetBrains Mono', monospace" }}>
        {logs.map((cl, i) => {
          let col = V.ink2;
          if (cl.level === "INFO") col = V.sec2 || V.pri;
          if (cl.level === "WARN") col = "#FFB020";
          if (cl.level === "ERROR" || cl.level === "FATAL") col = "#FF5555";
          return (
            <div key={i} style={{ font: "400 11px/1.5 " + t.font, color: col, display: "flex", gap: "8px", padding: "2px 0", borderBottom: "1px solid " + V.surf2 }}>
              <span style={{ opacity: 0.6, flex: "none" }}>[{cl.ts}]</span>
              <span style={{ fontWeight: 700, flex: "none", width: "52px" }}>{cl.level}</span>
              <span style={{ color: V.pri, flex: "none" }}>{cl.tag}</span>
              <span style={{ flex: 1 }}>{cl.msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
