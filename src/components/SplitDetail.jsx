import { useTheme } from "../context/ThemeContext.jsx";
import { DETAIL } from "../data/content.js";
import Icon from "./Icon.jsx";

// Ported from the `isSplit` <sc-if> block — the 44% detail pane shown next to
// Chat/Inventory/Radar on split (tablet/foldable) devices.
export default function SplitDetail() {
  const { V, t, d, isFloat, scr } = useTheme();
  const isSplit = d.split && !isFloat && ["Chat", "Inventory", "Radar"].includes(scr);
  if (!isSplit) return null;
  const dd = DETAIL[scr] || DETAIL.Chat;

  return (
    <div style={{ flex: "none", width: "44%", borderLeft: "1px solid " + V.outv, background: V.surf, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "none", padding: "14px 16px 10px", borderBottom: "1px solid " + V.outv }}>
        <div style={{ font: "600 13px/1.2 " + t.font, color: V.ink }}>{dd.title}</div>
        <div style={{ font: "400 10.5px/1.4 " + t.font, color: V.ink2, marginTop: "4px" }}>{dd.sub}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {dd.rows.map(([head, body], i) => (
          <div key={i} style={{ border: "1px solid " + V.outv, borderRadius: V.rs, padding: "10px", background: V.bg }}>
            <div style={{ font: "400 10px/1.3 " + t.font, color: V.pri }}>{head}</div>
            <div style={{ font: "400 12.5px/1.5 " + t.font, color: V.ink, marginTop: "4px" }}>{body}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: "none", display: "flex", gap: "8px", padding: "12px", borderTop: "1px solid " + V.outv }}>
        <div style={{ flex: 1, minHeight: "42px", display: "flex", alignItems: "center", padding: "0 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.bg, font: "400 12px/1 " + t.font, color: V.ink2 }}>reply · ⌘↩ sends</div>
        <div style={{ width: "44px", height: "42px", borderRadius: V.rs, background: V.pri, color: V.onpri, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="send" size={18} />
        </div>
      </div>
    </div>
  );
}
