import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { LOCAL_MSGS, IM_THREADS, GROUP_THREADS, IM_CHIPS, GROUP_CHIPS } from "../data/content.js";
import Icon from "../components/Icon.jsx";

// Ported from the `isChat` <sc-if> block: message transcript + composer.
// `msgs`/`bubble`/`headStyle`/`textStyle` are rebuilt per-message here exactly
// as renderVals() computed them (two visual modes: bordered bubble normally,
// flush left-accent row when `bleed` — console/desktop nav).
export default function Chat() {
  const { state } = useApp();
  const { V, t, bleed, pad, C, nav } = useTheme();

  const curTab = state.tabs.Chat;
  const chipList = curTab === "GROUP" ? GROUP_CHIPS : curTab === "IM" ? IM_CHIPS : [];
  const activeChip = chipList.includes(state.chip) ? state.chip : chipList[0];
  const source = curTab === "IM" ? IM_THREADS[activeChip] : curTab === "GROUP" ? GROUP_THREADS[activeChip] : LOCAL_MSGS;

  const wrapBase = { width: "100%", display: "flex", justifyContent: "flex-start" };
  const bubBase = { maxWidth: "88%", padding: "8px 10px", border: "1px solid " + V.outv, borderRadius: V.rp, background: V.surf };
  const headBase = { font: "400 10px/1.3 " + t.font, color: V.pri, marginBottom: "3px" };
  const textBase = { font: "400 13px/1.45 " + t.font, color: V.ink };

  const chatBodyStyle = bleed
    ? { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: C.gap + "px", padding: 0, background: V.bg }
    : { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: "6px", padding: "8px 12px" };

  const composerStyle = { flex: "none", display: "flex", gap: "8px", borderTop: "1px solid " + V.outv, background: V.surf, padding: nav === "sweep" ? "12px 12px 12px 0" : "12px", borderTopLeftRadius: nav === "sweep" ? V.rl : "0", borderTopRightRadius: nav === "sweep" ? V.rl : "0" };
  const composerFieldStyle = { flex: 1, minWidth: 0, minHeight: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", border: "1px solid " + V.outv, background: V.bg, borderRadius: nav === "sweep" ? "0 " + V.rs + " " + V.rs + " 0" : V.rs };

  return (
    <>
      <div style={chatBodyStyle}>
        {source.map((m, i) => {
          const acc = m.sys ? V.info : m.me ? V.pri : V.sec2;
          const align = bleed ? { display: "flex", width: "100%" } : { ...wrapBase, ...(m.me ? { justifyContent: "flex-end" } : null) };
          const bubble = bleed
            ? { flex: 1, minWidth: 0, background: V.surf, borderLeft: "4px solid " + acc, overflow: "hidden", padding: pad + " 12px " + pad + " 10px" }
            : { ...bubBase, ...(m.me ? { background: V.priC, borderColor: V.pri } : m.sys ? { background: "transparent", borderStyle: "dashed", borderColor: V.info } : null) };
          const headStyle = bleed ? { font: "400 10px/1.3 " + t.font, color: acc, letterSpacing: ".06em", marginBottom: "3px" } : { ...headBase, ...(m.sys ? { color: V.info } : m.me ? { color: V.onpriC } : null) };
          const textStyle = bleed ? { ...textBase, ...(m.sys ? { color: V.info } : null) } : { ...textBase, ...(m.sys ? { color: V.info } : m.me ? { color: V.onpriC } : null) };
          return (
            <div key={i} style={align}>
              <div style={bubble}>
                <div style={headStyle}>
                  [{m.ts}] {m.sender}
                </div>
                <div style={textStyle}>{m.text}</div>
                {m.linkTitle ? (
                  <div style={{ marginTop: "8px", border: "1px solid " + V.outv, borderRadius: V.rs, overflow: "hidden", background: V.bg }}>
                    <div style={{ height: "62px", background: "repeating-linear-gradient(135deg,#1B2A2D 0 8px,transparent 8px 16px)" }} />
                    <div style={{ padding: "7px 9px" }}>
                      <div style={{ font: "600 11px/1.3 " + t.font }}>{m.linkTitle}</div>
                      <div style={{ font: "400 10px/1.3 " + t.font, color: V.ink2, marginTop: "2px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{m.linkUrl}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        <div style={{ font: "400 12px/1.4 " + t.font, color: V.ink2, padding: bleed ? "6px 10px" : "4px 2px" }}>
          &gt; Nyx is typing<span style={{ animation: "blink 1s steps(1) infinite" }}>_</span>
        </div>
      </div>
      <div style={composerStyle}>
        <div style={composerFieldStyle}>
          <Icon name="smile" size={16} style={{ opacity: 0.55 }} />
          <span style={{ font: "400 13px/1 " + t.font, color: V.ink2 }}>say to local…</span>
          <span style={{ marginLeft: "auto", font: "600 10px/1 " + t.font, color: V.ink2, letterSpacing: ".1em" }}>/1</span>
        </div>
        <div style={{ width: "48px", height: "44px", flex: "none", borderRadius: V.rs, background: V.pri, color: V.onpri, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Icon name="send" size={19} />
        </div>
      </div>
    </>
  );
}
