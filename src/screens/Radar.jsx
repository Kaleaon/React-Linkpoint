import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { RADAR_AVATARS, RADAR_OBJECTS, COMPASS } from "../data/content.js";
import Icon from "../components/Icon.jsx";

const RINGS = [
  [10, "WHISPER 10m"],
  [20, "CHAT 20m"],
  [100, "SHOUT 100m"],
];
// sqrt scale: the close-range rings stay legible while 100m still fits the scope
const rPix = (dm) => Math.min(84, 78 * Math.sqrt(Math.min(dm, 160) / 100));
const bandTone = (V, dm) => (dm <= 10 ? V.pri : dm <= 20 ? V.ok : dm <= 100 ? V.info : V.ink2);
const bandName = (dm) => (dm <= 10 ? "WHISPER" : dm <= 20 ? "CHAT" : dm <= 100 ? "SHOUT" : "OUT OF RANGE");

// Ported from the `isRadar` <sc-if> block: mode switch, scope (rings + blips),
// and the sorted list with tap-to-open actions / long-press moderator menu.
export default function Radar() {
  const { state, actions } = useApp();
  const { V, t, bleed, pad } = useTheme();

  const objMode = state.rMode === "OBJ";
  const rSrc = (objMode ? RADAR_OBJECTS : RADAR_AVATARS).slice().sort((a, b) => a[1] - b[1]);

  const actChip = (tone) => ({
    display: "flex",
    alignItems: "center",
    minHeight: "44px",
    padding: "0 13px",
    cursor: "pointer",
    font: "600 10px/1 " + t.dfont,
    letterSpacing: ".12em",
    borderRadius: V.rs,
    background: tone ? "transparent" : V.surf2,
    color: tone || V.ink,
    border: tone ? "1px solid " + tone : "1px solid " + V.outv,
    whiteSpace: "nowrap",
  });

  const rModeWrap = { flex: "none", display: "flex", alignItems: "center", gap: "6px", padding: bleed ? "10px 12px 10px" : "0 16px 10px" };
  const rScope = { flex: "none", margin: bleed ? "0 0 4px" : "0 16px 10px", position: "relative", height: "172px", overflow: "hidden", border: bleed ? "none" : "1px solid " + V.outv, borderRadius: bleed ? 0 : V.rp, background: V.surf };
  const rListWrap = { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: bleed ? "4px" : "8px", padding: bleed ? "0" : "0 16px 16px", background: bleed ? V.bg : "transparent" };

  return (
    <>
      <div style={rModeWrap}>
        {[
          ["AV", "AVATARS"],
          ["OBJ", "OBJECTS"],
        ].map(([k, label]) => {
          const on = state.rMode === k;
          return (
            <div
              key={k}
              onClick={() => actions.setRMode(k)}
              style={{
                display: "flex",
                alignItems: "center",
                minHeight: "44px",
                padding: "0 13px",
                cursor: "pointer",
                font: "600 10.5px/1 " + t.dfont,
                letterSpacing: ".14em",
                borderRadius: V.rs,
                background: on ? V.pri : "transparent",
                color: on ? V.onpri : V.ink2,
                border: "1px solid " + (on ? V.pri : V.outv),
              }}
            >
              {label}
            </div>
          );
        })}
        <div style={{ marginLeft: "auto", font: "400 10px/1 " + t.font, color: V.ink2, letterSpacing: ".06em" }}>
          {rSrc.length + (objMode ? " objects" : " avatars") + " · " + rSrc.filter((x) => x[1] <= 20).length + " in chat range"}
        </div>
      </div>

      <div style={rScope}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "linear-gradient(" + V.outv + " 1px,transparent 1px),linear-gradient(90deg," + V.outv + " 1px,transparent 1px)",
            backgroundSize: "24px 24px",
            opacity: 0.35,
          }}
        />
        {RINGS.map(([dm], i) => {
          const r = rPix(dm);
          return (
            <div
              key={dm}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: r * 2 + "px",
                height: r * 2 + "px",
                margin: -r + "px 0 0 " + -r + "px",
                border: "1px solid " + (i === 2 ? V.outv : V.pri),
                borderRadius: "50%",
                opacity: i === 2 ? 0.9 : i === 1 ? 0.45 : 0.32,
              }}
            />
          );
        })}
        <div style={{ position: "absolute", right: "10px", top: "9px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
          {RINGS.map(([, label], i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", font: "500 8px/1 " + t.font, letterSpacing: ".1em", color: V.ink2, whiteSpace: "nowrap" }}>
              <span style={{ width: "7px", height: "7px", flex: "none", borderRadius: "50%", border: "1px solid " + (i === 2 ? V.outv : V.pri), opacity: i === 2 ? 0.9 : i === 1 ? 0.7 : 0.5 }} />
              {label}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: "50%", top: "50%", width: "10px", height: "10px", margin: "-5px 0 0 -5px", borderRadius: "5px", background: V.pri, animation: "ping 2.6s ease-out infinite" }} />
        <div style={{ position: "absolute", left: "50%", top: "50%", width: "9px", height: "9px", margin: "-4.5px 0 0 -4.5px", borderRadius: "5px", background: V.pri }} />
        {rSrc.map(([name, dm, brg]) => {
          const r = rPix(dm),
            a = (brg * Math.PI) / 180,
            selBlip = state.rOpen === name || state.rMenu === name;
          const x = r * Math.sin(a),
            y = -r * Math.cos(a),
            sz = selBlip ? 13 : 9;
          return (
            <div
              key={name}
              onClick={() => actions.radarBlipPick(name)}
              style={{
                position: "absolute",
                left: "calc(50% + " + x.toFixed(1) + "px)",
                top: "calc(50% + " + y.toFixed(1) + "px)",
                width: sz + "px",
                height: sz + "px",
                margin: -sz / 2 + "px 0 0 " + -sz / 2 + "px",
                borderRadius: objMode ? "2px" : "50%",
                background: bandTone(V, dm),
                cursor: "pointer",
                border: "1px solid " + V.bg,
                boxShadow: selBlip ? "0 0 0 3px " + V.outv : "none",
              }}
            />
          );
        })}
        <div style={{ position: "absolute", left: "10px", bottom: "8px", font: "400 9px/1 " + t.font, letterSpacing: ".06em", color: V.ink2 }}>
          {objMode ? "objects by distance" : "nearest " + rSrc[0][1] + "m · " + bandName(rSrc[0][1]).toLowerCase()}
        </div>
      </div>

      <div style={rListWrap}>
        {rSrc.map(([name, dm, brg, meta, icon]) => {
          const tone = bandTone(V, dm),
            open = state.rOpen === name,
            menu = state.rMenu === name;
          const acts = (objMode ? ["INSPECT", "TOUCH", "DERENDER", "TRACK"] : ["PROFILE", "IM", "TRACK", "TELEPORT TO"]).map((label) => ({ label, style: actChip(null) }));
          const mods = (objMode ? ["RETURN", "MUTE OWNER", "BLOCK", "REPORT"] : ["MUTE", "DERENDER", "FREEZE", "EJECT", "BAN", "REPORT"]).map((label) => ({ label, style: actChip(V.err) }));
          const wrap = {
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            padding: open || menu ? "0 0 8px" : "0",
            border: bleed ? "none" : "1px solid " + (open || menu ? tone : V.outv),
            borderLeft: bleed ? "4px solid " + (open || menu ? tone : "transparent") : undefined,
            borderRadius: bleed ? 0 : V.rs,
            background: V.surf,
          };
          return (
            <div key={name} style={wrap}>
              <div
                onClick={() => actions.radarTap(name)}
                onMouseDown={() => actions.radarHold(name)}
                onMouseUp={actions.radarRelease}
                onMouseLeave={actions.radarRelease}
                style={{ display: "flex", alignItems: "center", gap: "12px", padding: pad, cursor: "pointer" }}
              >
                <Icon name={icon} size={22} style={{ color: V.pri }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "400 14px/1.2 " + t.font, color: V.ink }}>{name}</div>
                  <div style={{ font: "400 11px/1.3 " + t.font, color: V.ink2, marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {COMPASS[Math.round(brg / 22.5) % 16] + " · " + meta}
                  </div>
                </div>
                <div style={{ padding: "4px 8px", border: "1px solid " + tone, borderRadius: V.rs, font: "400 11px/1 " + t.font, color: tone, flex: "none" }}>{dm}m</div>
              </div>
              {open ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "0 " + pad }}>
                  {acts.map((a, i) => (
                    <div key={i} style={a.style}>
                      {a.label}
                    </div>
                  ))}
                </div>
              ) : null}
              {menu ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ padding: "0 " + pad, font: "600 9px/1 " + t.dfont, letterSpacing: ".18em", color: V.err }}>{(objMode ? "OBJECT" : "MODERATOR") + " — LONG PRESS"}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "0 " + pad }}>
                    {mods.map((a, i) => (
                      <div key={i} style={a.style}>
                        {a.label}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
