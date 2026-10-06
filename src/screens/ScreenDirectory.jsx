import { useState } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { NAV_ALL } from "../data/content.js";
import Icon from "../components/Icon.jsx";

export default function ScreenDirectory() {
  const { actions } = useApp();
  const { V, t } = useTheme();
  const [query, setQuery] = useState("");
  const screens = NAV_ALL.filter(item => item.id !== "Screens" && item.id.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="tool-page" style={{ color: V.ink, background: V.bg, fontFamily: t.font }}>
    <h2>All screens</h2>
    <label style={{ display: "grid", gap: 8 }}>Find a screen
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Groups, settings, inventory…" style={{ padding: 12, background: V.surf, color: V.ink, border: `1px solid ${V.outv}`, borderRadius: V.rs }} />
    </label>
    <nav aria-label="All screens" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 16 }}>
      {screens.map(item => <button key={item.id} type="button" onClick={() => actions.setScreen(item.id)} style={{ padding: 16, display: "flex", gap: 10, alignItems: "center", minHeight: 52, background: V.surf, color: V.ink, border: `1px solid ${V.outv}`, borderRadius: V.rs, font: `600 13px ${t.font}`, cursor: "pointer" }}><Icon name={item.icon} size={20} style={{ color: V.pri }} />{item.id}</button>)}
    </nav>
    {!screens.length ? <p role="status">No screens match your search.</p> : null}
  </div>;
}
