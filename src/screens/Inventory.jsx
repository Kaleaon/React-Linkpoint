import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { INVENTORY_SOURCE, INVENTORY_FOLDERS, INVENTORY_RECENTS } from "../data/content.js";
import Icon from "../components/Icon.jsx";

// Ported from the `isTree` <sc-if> block: search/grid toolbar, recent-items
// strip, and the folder tree (expand/collapse persists per folder in
// `invOpen`, folders default open unless explicitly closed — same as source).
export default function Inventory() {
  const { state, actions } = useApp();
  const { V, t, bleed, pad, C } = useTheme();

  const invToolStyle = { flex: "none", display: "flex", gap: "8px", padding: bleed ? "0 0 8px 10px" : "2px 16px 10px" };
  const invRecentStyle = { flex: "none", display: "flex", gap: "8px", overflowX: "auto", padding: bleed ? "0 0 8px 10px" : "0 16px 10px" };
  const invListStyle = { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: bleed ? C.gap + "px" : 0, background: bleed ? V.bg : "transparent" };

  const nodes = INVENTORY_SOURCE.map(([name, icon, depth, parent, ver]) => {
    const isFolder = INVENTORY_FOLDERS.includes(name);
    const open = state.invOpen[name] !== false;
    return { name, icon, ver, parent, depth, isFolder, open, chev: isFolder ? (open ? "chevron-down" : "chevron-right") : "circle-small" };
  }).filter((n) => n.depth === 0 || (n.parent && state.invOpen[n.parent] !== false));

  return (
    <>
      <div style={invToolStyle}>
        <div style={{ flex: 1, height: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "0 10px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
          <Icon name="search" size={15} style={{ opacity: 0.55 }} />
          <span style={{ font: "400 12px/1 " + t.font, color: V.ink2 }}>filter inventory…</span>
        </div>
        <div style={{ width: "44px", height: "44px", border: "1px solid " + V.outv, borderRadius: V.rs, display: "flex", alignItems: "center", justifyContent: "center", color: V.pri }}>
          <Icon name="layout-grid" size={17} />
        </div>
      </div>
      <div style={invRecentStyle}>
        {INVENTORY_RECENTS.map((ir) => (
          <div key={ir} style={{ flex: "none", width: "62px" }}>
            <div style={{ height: "62px", border: "1px solid " + V.outv, background: "repeating-linear-gradient(135deg,#1B2A2D 0 6px,#101A1C 6px 12px)" }} />
            <div style={{ font: "400 9px/1.3 " + t.font, color: V.ink2, marginTop: "4px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{ir}</div>
          </div>
        ))}
      </div>
      <div style={invListStyle}>
        {nodes.map((n) => {
          const indent = bleed
            ? { display: "flex", alignItems: "center", gap: "8px", padding: pad + " 12px", paddingLeft: 10 + n.depth * 16 + "px", background: V.surf, borderLeft: "4px solid " + (n.depth === 0 ? V.pri : n.depth === 1 ? V.sec2 : "transparent"), cursor: "pointer" }
            : { display: "flex", alignItems: "center", gap: "8px", padding: pad + " 16px", paddingLeft: 16 + n.depth * 18 + "px", borderBottom: "1px solid " + V.outv, cursor: "pointer" };
          return (
            <div key={n.name} onClick={n.isFolder ? () => actions.toggleInvFolder(n.name) : undefined} style={indent}>
              <Icon name={n.chev} size={16} style={{ color: V.pri }} />
              <Icon name={n.icon} size={16} style={{ color: V.sec2 }} />
              <span style={{ flex: 1, font: "400 13px/1.2 " + t.font, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{n.name}</span>
              <span style={{ font: "400 10px/1 " + t.font, color: V.ink2 }}>{n.ver}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
