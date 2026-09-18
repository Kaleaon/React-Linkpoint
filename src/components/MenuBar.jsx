import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { FMENU, FLOATERS } from "../theme/constants.js";

// Ported from `fmBar`/`fmMenus` — the desktop-only File/Edit/View/World/
// Build/Help bar with Firestorm-style interactive menu commands.
export default function MenuBar() {
  const { state, actions } = useApp();
  const { V, t, ink, isFloat } = useTheme();
  if (!isFloat) return null;

  const handleMenuClick = (menuLabel, itemLabel) => {
    actions.setMenu(null);
    if (itemLabel === "Teleport Home") {
      actions.setScreen("Map");
      actions.notify("Teleporting Home...");
    } else if (itemLabel === "Preferences…") {
      actions.flFocus("Settings");
    } else if (itemLabel === "Appearance…") {
      actions.setScreen("Outfits");
    } else if (itemLabel === "About Linkpoint") {
      actions.notify("Linkpoint Viewer v2.0 (Firestorm Edition)");
    } else if (itemLabel === "Quit") {
      actions.setScreen("Login");
    } else {
      actions.notify(menuLabel + " > " + itemLabel);
    }
  };

  return (
    <div style={{ flex: "none", display: "flex", alignItems: "stretch", height: "28px", padding: "0 8px", background: V.surf, borderBottom: "1px solid " + V.outv, position: "relative", zIndex: 80 }} onClick={() => state.menu && actions.setMenu(null)}>
      {FMENU.map((mm) => {
        const open = state.menu === mm.label;
        const win = mm.items === "WINDOWS";
        const items = win ? FLOATERS.map((f) => [f.title, state.flOpen[f.id] && !state.flMin[f.id] ? "✓" : ""]) : mm.items;
        return (
          <div key={mm.label} style={{ position: "relative" }}>
            <div
              onClick={(e) => {
                e.stopPropagation();
                actions.setMenu(state.menu === mm.label ? null : mm.label);
              }}
              style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 10px", cursor: "pointer", background: open ? V.pri : "transparent", color: open ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink, font: "500 11px/1 " + t.font, letterSpacing: ".04em", borderRadius: V.rs }}
            >
              {mm.label}
            </div>
            {open ? (
              <div style={{ position: "absolute", left: 0, top: "28px", minWidth: "216px", background: V.surf, border: "1px solid " + V.pri, boxShadow: "0 14px 34px rgba(0,0,0,.55)", padding: "3px 0", zIndex: 90, borderRadius: V.rp, overflow: "hidden" }}>
                {items.map((it, i) => (
                  <div
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (win) {
                        const f = FLOATERS.find((x) => x.title === it[0]);
                        if (f) actions.flToggle(f.id);
                      } else {
                        handleMenuClick(mm.label, it[0]);
                      }
                    }}
                    style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "26px", padding: "0 12px", cursor: "pointer", font: "400 11.5px/1 " + t.font, color: V.ink }}
                  >
                    <span style={{ flex: 1, font: "inherit" }}>{it[0]}</span>
                    <span style={{ flex: "none", font: "400 10px/1 " + t.font, color: V.ink2, letterSpacing: ".06em" }}>{it[1]}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "16px", font: "500 10.5px/1 " + t.font, color: V.ink2, letterSpacing: ".06em" }}>
        {"L$ 2 480   ·   Heliotrope (Adult)   ·   64 FPS   ·   14:32"}
      </div>
    </div>
  );
}
