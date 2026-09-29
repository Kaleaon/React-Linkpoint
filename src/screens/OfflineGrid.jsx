import React from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import Icon from "../components/Icon.jsx";

export default function OfflineGrid() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();

  const isRunning = state.offlineRunning !== false;
  const userFullName = ((state.offlineUser && state.offlineUser.firstName) || "Jane") + " " + ((state.offlineUser && state.offlineUser.lastName) || "Doe");
  const cacheSize = state.offlineCacheSize || 1024;
  const gaugePercent = Math.min(100, Math.max(5, (cacheSize / 100000) * 100));

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, padding: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ font: "600 10px/1 " + t.font, letterSpacing: ".22em", color: V.pri }}>LOCAL GRID ENGINE</div>
            <div style={{ font: "700 15px/1.3 " + t.dfont, marginTop: "4px", color: V.ink }}>OpenSim Local Server</div>
          </div>
          <div
            onClick={actions.toggleOfflineGrid}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.toggleOfflineGrid(); } }}
            style={{
              padding: "8px 14px", borderRadius: V.rs, font: "700 11px/1 " + t.font, letterSpacing: ".14em",
              cursor: "pointer", background: V.pri, color: V.onpri
            }}
            role="button" aria-label="Toggle grid status" tabIndex={0}
          >
            {isRunning ? "STOP GRID" : "START GRID"}
          </div>
        </div>
        <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            padding: "4px 8px", borderRadius: V.rs, font: "700 10.5px/1 " + t.font,
            background: isRunning ? V.priC : "rgba(255,108,108,0.15)", color: isRunning ? V.pri : "#FF6C6C"
          }}>
            {isRunning ? "ONLINE · 127.0.0.1:9000" : "OFFLINE · Server stopped"}
          </div>
          <div style={{ font: "400 11px/1 " + t.font, color: V.ink2 }}>User: {userFullName}</div>
          <div
            onClick={() => actions.setOfflineAccountModal(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.setOfflineAccountModal(true); } }}
            style={{ marginLeft: "auto", font: "600 10px/1 " + t.font, letterSpacing: ".12em", color: V.pri, cursor: "pointer", textDecoration: "underline" }}
            role="button" aria-label="Account setup" tabIndex={0}
          >
            ACCOUNT SETUP
          </div>
        </div>
      </div>

      {state.offlineAccountModal && (
        <div style={{ border: "1px solid " + V.pri, borderRadius: V.rs, background: V.surf2, padding: "14px" }}>
          <div style={{ font: "700 12px/1 " + t.font, letterSpacing: ".18em", color: V.pri, marginBottom: "10px" }}>FIRST-TIME ACCOUNT SETUP</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <div style={{ font: "400 10px/1 " + t.font, color: V.ink2, marginBottom: "3px" }}>FIRST NAME</div>
              <input
                value={state.offlineAccountFirstName || "Jane"}
                onChange={(e) => actions.setOfflineAccountFirstName(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", height: "34px", padding: "0 8px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, color: V.ink, font: "400 12px/1 " + t.font }}
              />
            </div>
            <div>
              <div style={{ font: "400 10px/1 " + t.font, color: V.ink2, marginBottom: "3px" }}>LAST NAME</div>
              <input
                value={state.offlineAccountLastName || "Doe"}
                onChange={(e) => actions.setOfflineAccountLastName(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", height: "34px", padding: "0 8px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, color: V.ink, font: "400 12px/1 " + t.font }}
              />
            </div>
            <div>
              <div style={{ font: "400 10px/1 " + t.font, color: V.ink2, marginBottom: "3px" }}>LOCAL PASSWORD</div>
              <input
                type="password"
                value={state.offlineAccountPassword || ""}
                onChange={(e) => actions.setOfflineAccountPassword(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", height: "34px", padding: "0 8px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, color: V.ink, font: "400 12px/1 " + t.font }}
              />
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <div
                onClick={actions.saveOfflineAccount}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.saveOfflineAccount(); } }}
                style={{ flex: 1, height: "36px", borderRadius: V.rs, background: V.pri, color: V.onpri, display: "flex", alignItems: "center", justifyContent: "center", font: "700 11px/1 " + t.font, letterSpacing: ".16em", cursor: "pointer" }}
                role="button" aria-label="Save account" tabIndex={0}
              >
                SAVE ACCOUNT
              </div>
              <div
                onClick={() => actions.setOfflineAccountModal(false)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.setOfflineAccountModal(false); } }}
                style={{ flex: 1, height: "36px", borderRadius: V.rs, border: "1px solid " + V.outv, display: "flex", alignItems: "center", justifyContent: "center", font: "600 11px/1 " + t.font, color: V.ink2, cursor: "pointer" }}
                role="button" aria-label="Cancel modal" tabIndex={0}
              >
                CANCEL
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, padding: "14px" }}>
        <div style={{ font: "600 10px/1 " + t.font, letterSpacing: ".22em", color: V.pri, marginBottom: "8px" }}>OAR REGION BACKUP IMPORTER</div>
        <div style={{ border: "1px dashed " + V.outv, borderRadius: V.rs, padding: "12px", textAlign: "center", background: V.bg, marginBottom: "10px" }}>
          <Icon name="file-up" size={20} />
          <div style={{ font: "600 11px/1.3 " + t.font, marginTop: "4px" }}>{state.oarFile || "A1_Grid_Region_v2.oar"}</div>
          <div style={{ font: "400 10px/1.3 " + t.font, color: V.ink2, marginTop: "2px" }}>Region: {state.oarRegionName || "Welcome Island"} · Loc: &lt;{state.oarCoords || "1000, 1000"}&gt; · {state.oarPrims || 1420} prims</div>
        </div>
        <div
          onClick={actions.importOarBackup}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.importOarBackup(); } }}
          style={{ height: "38px", borderRadius: V.rs, border: "1px solid " + V.outv, background: V.surf2, color: V.pri, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", font: "700 11px/1 " + t.font, letterSpacing: ".16em", cursor: "pointer" }}
          role="button" aria-label="Import OAR" tabIndex={0}
        >
          <Icon name="download-cloud" size={16} />
          IMPORT OAR BACKUP
        </div>
      </div>

      <div style={{ border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, padding: "14px" }}>
        <div style={{ font: "600 10px/1 " + t.font, letterSpacing: ".22em", color: V.pri, marginBottom: "8px" }}>LOCAL ASSET & SL UPLOAD CENTER</div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
          <input
            value={state.assetName || ""}
            onChange={(e) => actions.setAssetName(e.target.value)}
            placeholder="Asset title..."
            style={{ flex: 2, height: "34px", padding: "0 8px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, color: V.ink, font: "400 12px/1 " + t.font }}
          />
          <input
            value={state.assetType || "Texture"}
            onChange={(e) => actions.setAssetType(e.target.value)}
            placeholder="Type..."
            style={{ flex: 1, height: "34px", padding: "0 8px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, color: V.ink, font: "400 11px/1 " + t.font }}
          />
          <div
            onClick={actions.addLocalAsset}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.addLocalAsset(); } }}
            style={{ padding: "0 12px", height: "34px", borderRadius: V.rs, background: V.pri, color: V.onpri, display: "flex", alignItems: "center", justifyContent: "center", font: "700 10px/1 " + t.font, letterSpacing: ".12em", cursor: "pointer" }}
            role="button" aria-label="Add asset" tabIndex={0}
          >
            ADD
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {(state.localAssets || []).map((ast) => (
            <div key={ast.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg }}>
              <div>
                <div style={{ font: "600 11px/1.2 " + t.font }}>{ast.name} <span style={{ fontWeight: 400, color: V.ink2 }}>({ast.type})</span></div>
                <div style={{ font: "400 9.5px/1.2 " + t.font, color: V.ink2, marginTop: "2px" }}>UUID: {ast.uuid} · {ast.size}</div>
              </div>
              <div
                onClick={() => actions.notify("Uploading " + ast.name + " (" + ast.uuid + ") to SL Grid...")}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.notify("Uploading " + ast.name + " (" + ast.uuid + ") to SL Grid..."); } }}
                style={{ padding: "5px 9px", borderRadius: V.rs, border: "1px solid " + V.outv, background: V.surf2, color: V.pri, font: "700 9.5px/1 " + t.font, letterSpacing: ".12em", cursor: "pointer" }}
                role="button" aria-label="Upload to SL" tabIndex={0}
              >
                UPLOAD TO SL
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, padding: "14px" }}>
        <div style={{ font: "600 10px/1 " + t.font, letterSpacing: ".22em", color: V.pri, marginBottom: "8px" }}>STORAGE & CACHE SIZING MANAGER</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ font: "400 11px/1 " + t.font, color: V.ink2 }}>Cache Allocation:</span>
          <span style={{ font: "700 12px/1 " + t.font, color: V.pri }}>{cacheSize} MB</span>
        </div>
        <input
          type="range"
          min="256"
          max="100000"
          value={cacheSize}
          onChange={(e) => actions.setOfflineCacheSize(parseInt(e.target.value, 10) || 256)}
          style={{ width: "100%", marginBottom: "10px" }}
        />
        <div style={{ height: "8px", borderRadius: "4px", background: V.bg, overflow: "hidden", marginBottom: "10px", border: "1px solid " + V.outv }}>
          <div style={{ width: gaugePercent + "%", height: "100%", background: V.pri, borderRadius: "4px" }} />
        </div>
        <div
          onClick={actions.clearOfflineCache}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); actions.clearOfflineCache(); } }}
          style={{ height: "36px", borderRadius: V.rs, border: "1px solid " + V.outv, background: V.surf2, color: "#FF6C6C", display: "flex", alignItems: "center", justifyContent: "center", font: "700 10.5px/1 " + t.font, letterSpacing: ".14em", cursor: "pointer" }}
          role="button" aria-label="Clear cache" tabIndex={0}
        >
          CLEAR OFFLINE CACHE
        </div>
      </div>
    </div>
  );
}
