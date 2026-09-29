import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { LAYOUTS } from "../theme/layouts.js";
import { PALETTES } from "../theme/palettes.js";
import { HEAD } from "../data/content.js";
import { SCREENS } from "../theme/constants.js";
import Icon from "./Icon.jsx";

// Ported from the five header <sc-if> blocks (hasHeader/isSweepHead/
// isPivotHead/isRuleHead/isPressHead) plus the shared title/subtitle lookup.
export default function Header() {
  const { state } = useApp();
  const { V, t, headLook, condPack, scr, isConsole } = useTheme();

  const headMap = HEAD(LAYOUTS[state.layout].name, PALETTES[state.palette].name, { cleared: state.cacheCleared, limit: state.prefs.cacheLimit, loc: state.prefs.cacheLoc });
  const [rawTitle, rawSubtitle] = headMap[scr] || ["", ""];
  const title = rawTitle;
  const subtitle = condPack ? condPack.sub || null : rawSubtitle;

  if (headLook === "none" || headLook === "sweep") {
    // "sweep" head only renders outside the console frame (isSweepHead requires
    // !isConsole); when isConsole is true the console chrome draws its own title.
    if (headLook === "sweep" && !isConsole) return <SweepHead title={title} subtitle={subtitle} />;
    return null;
  }
  if (headLook === "pivot") return <PivotHead title={title} subtitle={subtitle} scr={scr} />;
  if (headLook === "rule") return <RuleHead title={title} subtitle={subtitle} />;
  if (headLook === "editorial") return <EditorialHead title={title} subtitle={subtitle} />;
  return <StackHead title={title} subtitle={subtitle} scr={scr} />;
}

function StackHead({ title, subtitle, scr }) {
  const { V, t } = useTheme();
  const { actions } = useApp();
  const showLink = scr === "Chat";
  const headerIcons =
    scr === "Friends"
      ? [
          { icon: "user-plus", label: "ADD FRIEND", pick: () => actions.openSearch("Friends", "SEARCH") },
          { icon: "search", label: "SEARCH", pick: () => actions.openSearch("Friends", "SEARCH") },
        ]
      : scr === "Diagnostics"
      ? [{ icon: "refresh-cw", label: "RE-RUN PROBE", pick: () => actions.notify("RE-RUN PROBE — " + (Math.floor(Math.random() * 60) + 40) + "ms") }]
      : null;
  return (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px 8px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "700 21px/1.05 " + t.dfont, letterSpacing: V.tls, color: V.pri }}>{title}</div>
        <div style={{ font: "400 11px/1.4 " + t.font, color: V.ink2, marginTop: "4px" }}>{subtitle}</div>
      </div>
      {showLink ? (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px", border: "1px solid " + V.ok, borderRadius: V.rs, background: V.surf }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "3px", background: V.ok }} />
          <span style={{ font: "600 10px/1 " + t.font, letterSpacing: ".2em", color: V.ok }}>LINK</span>
        </div>
      ) : null}
      {headerIcons
        ? headerIcons.map((hi) => (
            <div
              key={hi.icon}
              onClick={hi.pick}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  hi.pick();
                }
              }}
              role="button"
              aria-label={hi.label}
              tabIndex={0}
              style={{ width: "44px", height: "44px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, display: "flex", alignItems: "center", justifyContent: "center", color: V.pri, cursor: "pointer" }}
            >
              <Icon name={hi.icon} size={18} />
            </div>
          ))
        : null}
    </div>
  );
}

function SweepHead({ title, subtitle }) {
  const { V, t } = useTheme();
  return (
    <>
      <div style={{ flex: "none", display: "flex", alignItems: "flex-end", gap: "4px", padding: "10px 12px 6px 4px" }}>
        <span style={{ width: "26px", height: "14px", background: V.sec2, borderRadius: "7px 0 0 7px", flex: "none" }} />
        <span style={{ flex: 1, height: "8px", background: V.surf2 }} />
        <span style={{ font: "600 20px/1 " + t.dfont, letterSpacing: ".12em", color: V.pri, flex: "none" }}>{title}</span>
        <span style={{ width: "38px", height: "14px", background: V.pri, borderRadius: "0 7px 7px 0", flex: "none" }} />
      </div>
      <div style={{ flex: "none", padding: "0 12px 8px", font: "400 11px/1.4 " + t.font, letterSpacing: ".06em", color: V.ink2 }}>{subtitle}</div>
    </>
  );
}

function PivotHead({ title, subtitle, scr }) {
  const { t, V } = useTheme();
  const nextScr = SCREENS[(SCREENS.indexOf(scr) + 1) % SCREENS.length];
  return (
    <>
      <div style={{ flex: "none", padding: "14px 0 2px 16px", display: "flex", alignItems: "baseline", gap: "22px", overflow: "hidden" }}>
        <span style={{ flex: "none", font: "300 40px/1 " + t.dfont, color: V.ink }}>{String(title || "").toLowerCase()}</span>
        <span style={{ flex: "none", font: "300 40px/1 " + t.dfont, color: V.ink2, opacity: 0.4 }}>{nextScr.toLowerCase()}</span>
      </div>
      <div style={{ flex: "none", padding: "2px 16px 10px", font: "300 12px/1.4 " + t.font, color: V.ink2 }}>{subtitle}</div>
    </>
  );
}

function RuleHead({ title, subtitle }) {
  const { V, t } = useTheme();
  return (
    <div style={{ flex: "none", padding: "16px 16px 4px" }}>
      <div style={{ height: "1px", background: V.pri }} />
      <div style={{ height: "3px", borderBottom: "1px solid " + V.pri }} />
      <div style={{ textAlign: "center", padding: "12px 0 10px", font: "600 15px/1.1 " + t.dfont, letterSpacing: V.tls, color: V.pri, textIndent: V.tls }}>{title}</div>
      <div style={{ textAlign: "center", font: "400 10px/1.4 " + t.font, letterSpacing: ".16em", color: V.ink2 }}>{subtitle}</div>
      <div style={{ height: "1px", background: V.outv, marginTop: "12px" }} />
    </div>
  );
}

function EditorialHead({ title, subtitle }) {
  const { V, t } = useTheme();
  return (
    <div style={{ flex: "none", padding: "18px 18px 10px", borderBottom: "2px solid " + V.ink }}>
      <div style={{ font: "600 27px/1.12 " + t.font, letterSpacing: "-.01em", color: V.ink, textTransform: "capitalize" }}>{title}</div>
      <div style={{ font: "400 12px/1.5 " + t.font, color: V.ink2, marginTop: "6px", maxWidth: "46ch" }}>{subtitle}</div>
    </div>
  );
}
