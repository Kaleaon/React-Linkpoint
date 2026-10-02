import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { NAV_ALL } from "../data/content.js";
import Icon from "./Icon.jsx";
import { navActive } from "../theme/look.js";

// Ported from the `isTiles` <sc-if> block — Metro's bottom tile strip.
export default function TileNav() {
  const { state, actions } = useApp();
  const { V, t, nav } = useTheme();
  if (nav !== "tiles") return null;

  return (
    <div style={{ flex: "none", display: "flex", gap: "3px", background: V.bg, padding: "3px" }}>
      {NAV_ALL.map((n) => {
        const active = navActive(state.screen, n.id);
        const bg = active ? V.pri : V.surf;
        const fg = active ? V.onpri : V.ink;
        return (
          <div
            key={n.id}
            onClick={() => actions.setScreen(n.id)}
            role="button"
            tabIndex={0}
            aria-label={"Go to " + n.id}
            aria-pressed={active}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                actions.setScreen(n.id);
              }
            }}
            style={{
              flex: 1, height: "64px", display: "flex", flexDirection: "column", justifyContent: "space-between",
              padding: "8px", cursor: "pointer", background: bg, color: fg, borderRadius: "0px",
              boxShadow: active ? "inset 0 0 0 2px " + V.onpri : "none", transition: "background .15s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Icon name={n.icon} size={18} />
              {active ? <span style={{ width: "6px", height: "6px", borderRadius: "0px", background: fg }} /> : null}
            </div>
            <span style={{ font: "300 11px/1 " + t.dfont, letterSpacing: ".02em", textTransform: "lowercase" }}>{n.tile}</span>
          </div>
        );
      })}
    </div>
  );
}
