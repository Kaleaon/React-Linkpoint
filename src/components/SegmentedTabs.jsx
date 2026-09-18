import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { segLooks } from "../theme/look.js";

// Ported from `segTabs`/`segWrap`/`hasSeg` — Chat's LOCAL/IM/GROUP,
// Friends' ALL/ONLINE and Diagnostics' AGNI/ADITI row.
export default function SegmentedTabs() {
  const { state, actions } = useApp();
  const { V, t, LK, nav, isFloat, norm, scr } = useTheme();

  if (!norm) return null;
  const curTab = state.tabs[scr];
  let tabs = null;
  if (scr === "Chat") tabs = [{ label: "LOCAL" }, { label: "IM", badge: 3 }, { label: "GROUP", badge: 1 }];
  else if (scr === "Friends") tabs = [{ label: "ALL" }, { label: "ONLINE" }];
  else if (scr === "Diagnostics") tabs = [{ label: "AGNI" }, { label: "ADITI" }];
  if (!tabs) return null;

  const segLook = LK.seg || "fill";
  const looks = segLooks(V, t.font);
  const base = looks[segLook];
  const on = { background: V.priC, color: V.onpriC, borderBottom: "2px solid " + V.pri };
  const onLook = segLook === "fill" ? { ...on, color: V.onpriC } : segLook === "pivot" ? { color: V.pri, fontWeight: 400 } : { color: V.pri, boxShadow: "inset 0 -2px 0 " + V.pri, letterSpacing: V.tls };

  const wrap = isFloat
    ? { flex: "none", display: "flex", flexWrap: "wrap", margin: 0, borderBottom: "1px solid " + V.outv, background: V.surf }
    : segLook === "fill"
    ? { flex: "none", display: "flex", margin: nav === "sweep" ? "12px 12px 10px 4px" : "2px 16px 10px", border: "1px solid " + V.outv, borderRadius: V.rs, overflow: "hidden" }
    : { flex: "none", display: "flex", margin: "0 16px 8px", borderBottom: segLook === "text" ? "1px solid " + V.outv : "none", overflowX: "auto" };

  const isActive = (label) => {
    if (scr === "Friends") return curTab === label || (label === "ALL" && curTab !== "ONLINE");
    if (scr === "Diagnostics") return (curTab || "AGNI") === label;
    return curTab === label;
  };

  return (
    <div style={wrap}>
      {tabs.map((x) => {
        const active = isActive(x.label);
        const style = { ...base, ...(active ? onLook : null), ...(isFloat ? { minHeight: "24px", height: "24px", padding: "0 9px", flex: "none", borderRadius: 0, font: "600 9.5px/1 " + t.font, letterSpacing: ".1em" } : null) };
        return (
          <div key={x.label} onClick={() => actions.setTab(scr, x.label)} style={style}>
            <span style={{ font: "inherit", letterSpacing: "inherit" }}>{x.label}</span>
            {x.badge ? (
              <span
                style={{
                  minWidth: "18px",
                  height: "18px",
                  padding: "0 5px",
                  borderRadius: "9px",
                  background: V.bdg,
                  color: V.onbdg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  font: "700 10px/1 " + t.font,
                }}
              >
                {x.badge}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
