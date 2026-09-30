import { useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app";
import Icon from "./Icon.jsx";

const TOOLBAR = [
  ["message-square", "Chat", "Chat"],
  ["users", "People", "Friends"],
  ["radar", "Nearby", "Radar"],
  ["map", "Map", "Map"],
  ["folder", "Inventory", "Inventory"],
  ["settings", "Preferences", "Settings"],
];

/**
 * Persistent desktop chrome modelled after the conventional SL viewer layout:
 * navigation and location are always above the world, while high-frequency
 * tools stay on a compact edge rail instead of becoming another floater.
 */
export default function DesktopChrome() {
  const { state, actions } = useApp();
  const { V, t, ink } = useTheme();
  const region = app.world?.regionName || app.protocol?.authReply?.sim_name || "Arapaima";
  const position = app.world?.avatarPosition || [128, 128, 25];
  const canonicalLocation = `${region} (${position.slice(0, 3).map((value) => Math.round(value)).join(", ")})`;
  const [location, setLocation] = useState(canonicalLocation);

  const goToLocation = (event) => {
    event.preventDefault();
    const destination = location.trim();
    if (!destination) return;
    actions.notify(`Location: ${destination}`);
  };

  const iconButton = {
    width: 28,
    height: 28,
    border: `1px solid ${V.outv}`,
    borderRadius: V.rs,
    background: V.surf2,
    color: V.ink2,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };

  return (
    <>
      <div className="desktop-location-bar" style={{ background: V.surf, borderBottomColor: V.outv }}>
        <div className="desktop-history-controls" aria-label="Navigation history">
          <button type="button" aria-label="Back" title="Back" style={iconButton} onClick={() => actions.notify("No previous location") }><Icon name="chevron-left" size={15} /></button>
          <button type="button" aria-label="Forward" title="Forward" style={iconButton} onClick={() => actions.notify("No next location") }><Icon name="chevron-right" size={15} /></button>
          <button type="button" aria-label="Teleport home" title="Teleport home" style={iconButton} onClick={() => { actions.flFocus("Map"); actions.notify("Teleporting Home..."); }}><Icon name="house" size={14} /></button>
        </div>

        <form className="desktop-location-form" onSubmit={goToLocation}>
          <Icon name="lock-keyhole" size={13} style={{ color: V.ok }} aria-hidden="true" />
          <label className="sr-only" htmlFor="desktop-location">Location</label>
          <input id="desktop-location" value={location} onChange={(event) => setLocation(event.target.value)} onFocus={(event) => event.currentTarget.select()} style={{ color: V.ink, fontFamily: t.font }} />
          <button type="submit" aria-label="Go to location" title="Go to location" style={{ ...iconButton, width: 25, height: 24, border: 0, background: "transparent" }}><Icon name="corner-down-left" size={13} /></button>
        </form>

        <button type="button" className="desktop-balance" onClick={() => actions.notify("Opening transaction history") } style={{ color: V.ink, borderColor: V.outv, background: V.surf2, fontFamily: t.font }}>
          <span style={{ color: V.ok }}>L$</span> —
        </button>
        <button type="button" aria-label="Search" title="Search" style={iconButton} onClick={() => actions.openSearch(state.screen, "ALL")}><Icon name="search" size={14} /></button>
      </div>

      <nav className="desktop-tool-rail" aria-label="Viewer tools" style={{ background: V.surf, borderColor: V.outv }}>
        {TOOLBAR.map(([icon, label, screen]) => {
          const active = state.screen === screen;
          return (
            <button
              key={label}
              type="button"
              className="desktop-tool-button"
              aria-label={label}
              aria-pressed={active}
              title={label}
              onClick={() => actions.flFocus(screen)}
              style={{ background: active ? V.pri : "transparent", color: active ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink2, borderColor: active ? V.pri : "transparent" }}
            >
              <Icon name={icon} size={18} />
            </button>
          );
        })}
      </nav>
    </>
  );
}
