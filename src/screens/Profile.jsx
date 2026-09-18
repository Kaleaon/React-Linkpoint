import { useTheme } from "../context/ThemeContext.jsx";
import { PROFILE_BLOCKS } from "../data/content.js";
import Icon from "../components/Icon.jsx";

// Ported from the `isProfile` <sc-if> block.
export default function Profile() {
  const { V, t } = useTheme();
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div style={{ position: "relative", height: "158px", background: "repeating-linear-gradient(135deg,#1B2A2D 0 10px,#101A1C 10px 20px)", display: "flex", alignItems: "flex-end", padding: "12px" }}>
        <span style={{ font: "400 10px/1 " + t.font, color: V.ink2 }}>profile banner — drop 2nd Life picture</span>
      </div>
      <div style={{ padding: "0 16px", marginTop: "-36px", display: "flex", alignItems: "flex-end", gap: "12px" }}>
        <div style={{ width: "76px", height: "76px", border: "1px solid " + V.outv, background: "repeating-linear-gradient(45deg,#1B2A2D 0 6px,#101A1C 6px 12px)" }} />
        <div style={{ paddingBottom: "6px" }}>
          <div style={{ font: "600 17px/1.2 " + t.dfont }}>Nyx Vaher</div>
          <div style={{ font: "400 11px/1.3 " + t.font, color: V.ink2, marginTop: "4px" }}>nyx.vaher · online · Da Boom</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", padding: "14px 16px" }}>
        <div style={{ flex: 1, height: "44px", borderRadius: V.rs, background: V.pri, color: V.onpri, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", font: "700 11px/1 " + t.font, letterSpacing: ".16em" }}>
          <Icon name="message-square" size={16} />
          IM
        </div>
        <div style={{ flex: 1, height: "44px", border: "1px solid " + V.outv, borderRadius: V.rs, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", font: "700 11px/1 " + t.font, letterSpacing: ".16em" }}>
          <Icon name="zap" size={16} />
          OFFER TP
        </div>
        <div style={{ width: "44px", height: "44px", border: "1px solid " + V.outv, borderRadius: V.rs, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="more-horizontal" size={18} />
        </div>
      </div>
      {PROFILE_BLOCKS.map((pb) => (
        <div key={pb.label} style={{ margin: "0 16px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, padding: "12px" }}>
          <div style={{ font: "600 11px/1 " + t.font, letterSpacing: ".26em", color: V.pri, marginBottom: "8px" }}>{pb.label}</div>
          <div style={{ font: "400 12px/1.65 " + t.font, color: V.ink2 }}>{pb.body}</div>
        </div>
      ))}
    </div>
  );
}
