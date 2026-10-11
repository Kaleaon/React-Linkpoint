import React from "react";
import { useTheme } from "./LayoutContext.js";
import { LcarsChrome } from "./LcarsChrome.js";
import { lcarsGeometry, inkOn } from "../tokens/index.js";

export interface ConsoleFrameProps {
  title?: string;
  subTitle?: string;
  items?: { id: string; label: string; pick?: () => void }[];
  activeId?: string;
  children?: React.ReactNode;
}

export const ConsoleFrame: React.FC<ConsoleFrameProps> = ({ title = "LINKPOINT", subTitle, items = [], activeId, children }) => {
  const theme = useTheme(), V = theme.v;
  const G = lcarsGeometry(theme.d.split);
  return <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: V.bg, color: V.ink }}>
    <LcarsChrome geometry={G} tokens={V} font={theme.dfont} title={title} readouts={subTitle} />
    <nav aria-label="Console navigation" style={{ position: "absolute", top: G.railTop, left: 0, width: G.rail, bottom: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: G.gap }}>
      {items.map((n, i) => {
        const fill = activeId === n.id ? V.pri : [V.sec2, V.sec, V.bdg][i % 3];
        return <button type="button" key={n.id} onClick={n.pick} aria-current={activeId === n.id ? "page" : undefined} style={{ flex: "none", minHeight: 48, border: "none", borderRadius: 0, padding: "8px", textAlign: "right", background: fill, color: inkOn(fill), font: `700 12px/1.2 ${theme.dfont}`, letterSpacing: ".04em", textTransform: "uppercase", cursor: "pointer" }}>{n.label}</button>;
      })}
    </nav>
    <div data-lcars="body" style={{ position: "absolute", top: G.shellTop + G.gap, left: G.rail + G.gap, right: G.gap, bottom: 0, background: V.bg, borderRadius: `${G.inner}px 0 0 0`, overflow: "auto", padding: theme.pad }}>{children}</div>
  </div>;
};
