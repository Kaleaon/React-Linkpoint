import { useTheme } from "../context/ThemeContext.jsx";
import { cardLooks, cardAccentStyle, actionButtonStyle } from "../theme/look.js";
import Icon from "./Icon.jsx";
import Toggle from "./Toggle.jsx";

// Ported from the CARDS.map(...) block + the `isCards` template section
// (sc-if value="{{ isCards }}"). One card renders: icon+title+right/badge/
// toggle header row, optional body text, optional big stat, optional action
// row.
export default function Card({ c }) {
  const { V, t, LK, pad } = useTheme();
  const looks = cardLooks(V, pad);
  const style = { ...(looks[LK.card] || looks.box), ...cardAccentStyle(LK.card, V, c.accent ? V[c.accent] : null) };

  return (
    <div style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        {c.icon && <Icon name={c.icon} size={16} style={{ color: V.pri }} />}
        <span style={{ flex: 1, font: "600 13px/1.25 " + t.font, color: V.ink }}>{c.title}</span>
        {c.right != null && c.right !== "" && <span style={{ font: "400 10.5px/1 " + t.font, color: V.ink2 }}>{c.right}</span>}
        {c.rights && c.rights.length ? (
          <span style={{ display: "flex", gap: "4px", flex: "none" }}>
            {c.rights.map((r) => (
              <Icon key={r} name={r} size={13} style={{ color: V.sec2 }} />
            ))}
          </span>
        ) : null}
        {c.badge ? (
          <span
            style={{
              minWidth: "20px",
              height: "20px",
              padding: "0 6px",
              borderRadius: "10px",
              background: V.bdg,
              color: V.onbdg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "700 10px/1 " + t.font,
            }}
          >
            {c.badge}
          </span>
        ) : null}
        {c.toggle ? <Toggle on={c.on} onClick={c.togglePick} /> : null}
      </div>
      {c.body ? <div style={{ font: "400 12px/1.6 " + t.font, color: V.ink2, marginTop: "8px" }}>{c.body}</div> : null}
      {c.big ? <div style={{ font: "700 46px/1 " + t.font, color: c.tone ? V[c.tone] : V.ok, marginTop: "6px" }}>{c.big}</div> : null}
      {c.actions && c.actions.length ? (
        <div style={{ display: "flex", gap: "8px", marginTop: "11px" }}>
          {c.actions.map((a, i) => (
            <div key={i} onClick={a.pick} style={actionButtonStyle(V, t.font, a)}>
              {a.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
