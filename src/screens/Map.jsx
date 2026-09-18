import { useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { REGIONS } from "../data/content.js";
import Icon from "../components/Icon.jsx";

// Ported from the `isMap` <sc-if> block: 4-region grid ground, a live SL map
// tile (falls back to a themed note if the CDN image 404s, same as `tileOk`),
// zoom/locate buttons and the teleport/favourite footer.
export default function Map() {
  const { V, t, bleed, C } = useTheme();
  const [tileOk, setTileOk] = useState(true);

  const mapBoxStyle = bleed
    ? { flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: V.surf, borderRadius: C.rad + "px 0 0 0" }
    : { flex: 1, minHeight: 0, margin: "2px 16px", position: "relative", overflow: "hidden", border: "1px solid " + V.outv, borderRadius: V.rp, background: V.surf };
  const mapFootStyle = { flex: "none", display: "flex", gap: "8px", padding: bleed ? "10px 0 10px 10px" : "12px 16px" };

  return (
    <>
      <div style={mapBoxStyle}>
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
          {REGIONS.map(([name, meta], i) => (
            <div key={name} style={{ border: "1px solid " + V.outv, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "8px", background: i === 0 ? V.priC : V.surf2, borderColor: i === 0 ? V.pri : V.outv }}>
              <span style={{ font: "600 11px/1.25 " + t.font, color: V.ink, display: "block" }}>{name}</span>
              <span style={{ font: "400 9.5px/1.25 " + t.font, color: V.ink2, display: "block" }}>{meta}</span>
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 0 }}>
          {tileOk ? (
            <img
              src="https://secondlife-maps-cdn.akamaized.net/map-1-1000-1000-objects.jpg"
              alt=""
              onError={() => setTileOk(false)}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }}
            />
          ) : null}
        </div>
        <div style={{ position: "absolute", left: "50%", top: "50%", width: "14px", height: "14px", margin: "-7px 0 0 -7px", borderRadius: "7px", background: V.pri, border: "2px solid " + V.bg }} />
        <div style={{ position: "absolute", right: "10px", top: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {["plus", "minus", "locate-fixed"].map((mb) => (
            <div key={mb} style={{ width: "44px", height: "44px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, display: "flex", alignItems: "center", justifyContent: "center", color: V.ink }}>
              <Icon name={mb} size={16} />
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: "10px", bottom: "10px", font: "400 9.5px/1.35 " + t.font, color: V.ink2, background: V.surf, border: "1px solid " + V.outv, padding: "4px 6px", maxWidth: "74%" }}>
          {tileOk ? "live SL map tile · secondlife-maps-cdn" : "tile CDN unreachable — themed vector grid fallback"}
        </div>
      </div>
      <div style={mapFootStyle}>
        <div style={{ flex: 1, height: "46px", borderRadius: V.rs, background: V.pri, color: V.onpri, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", font: "700 12px/1 " + t.font, letterSpacing: ".2em", cursor: "pointer" }}>
          <Icon name="zap" size={16} />
          TELEPORT
        </div>
        <div style={{ width: "46px", height: "46px", border: "1px solid " + V.outv, borderRadius: V.rs, display: "flex", alignItems: "center", justifyContent: "center", color: V.pri }}>
          <Icon name="star" size={18} />
        </div>
      </div>
    </>
  );
}
