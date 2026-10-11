import React from "react";
import { useTheme } from "./LayoutContext.js";
import { type PaletteColors } from "../tokens/index.js";
import { SectionHeading } from "./SectionHeading.js";
import { AccessibleButton } from "./AccessibleButton.js";

export interface CardAction {
  label: string;
  pick?: () => void;
  accent?: boolean;
}

export interface CardProps {
  c?: {
    sect?: boolean;
    title?: string;
    icon?: string;
    right?: string;
    rights?: string[];
    badge?: string | number;
    toggle?: boolean;
    on?: boolean;
    togglePick?: () => void;
    select?: boolean;
    value?: string | number;
    options?: { label: string; value: string | number }[];
    onChange?: (val: any) => void;
    body?: React.ReactNode;
    big?: string | number;
    tone?: keyof PaletteColors;
    meter?: number | null;
    actions?: CardAction[];
    accent?: keyof PaletteColors;
  };
  children?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ c, children }) => {
  const theme = useTheme();
  const V = theme.v;
  const LK = theme.look;

  if (!c) {
    return (
      <div
        style={{
          background: V.surf,
          color: V.ink,
          borderRadius: V.rp,
          padding: theme.pad,
          border: `1px solid ${V.outv}`
        }}
      >
        {children}
      </div>
    );
  }

  if (c.sect) {
    return <SectionHeading title={c.title} tokens={V} font={theme.dfont} console={LK.card === "cap"} />;
  }

  const accentColor = c.accent ? V[c.accent] : null;
  const cardStyle: React.CSSProperties = {
    background: V.surf,
    color: V.ink,
    borderRadius: V.rp,
    padding: theme.pad,
    border: `1px solid ${V.outv}`,
    borderLeft: accentColor ? `4px solid ${accentColor}` : `1px solid ${V.outv}`
  };

  if (LK.card === "cap") Object.assign(cardStyle, { border: "none", borderLeft: `8px solid ${accentColor || V.sec2}`, borderRadius: 0 });
  if (LK.card === "flat") Object.assign(cardStyle, { border: "none", borderLeft: `4px solid ${accentColor || V.pri}`, borderRadius: 0 });
  if (LK.card === "rule" || LK.card === "quiet") Object.assign(cardStyle, { border: "none", [LK.card === "rule" ? "borderTop" : "borderBottom"]: `1px solid ${accentColor || V.outv}`, borderRadius: 0, background: "transparent" });
  if (LK.card === "box") cardStyle.borderRadius = V.rs;

  const meterPct = c.meter == null ? null : Math.max(1, Math.min(100, Math.round(c.meter * 100)));

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        {c.title && <span style={{ flex: 1, font: "600 13px/1.25 " + theme.font, color: V.ink }}>{c.title}</span>}
        {c.right != null && c.right !== "" && <span style={{ font: "400 12px/1.3 " + theme.font, color: V.ink2 }}>{c.right}</span>}
        {c.badge ? (
          <span
            style={{
              minWidth: "20px",
              height: "20px",
              padding: "0 6px",
              borderRadius: V.rs === "999px" ? "10px" : "4px",
              background: V.bdg,
              color: V.onbdg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              font: "700 10px/1 " + theme.font
            }}
          >
            {c.badge}
          </span>
        ) : null}
      </div>
      {c.body ? <div style={{ font: "400 12px/1.6 " + theme.font, color: V.ink2, marginTop: "8px" }}>{c.body}</div> : null}
      {children}
      {c.big ? <div style={{ font: "700 46px/1 " + theme.font, color: c.tone ? V[c.tone] : V.ok, marginTop: "6px" }}>{c.big}</div> : null}
      {meterPct != null ? (
        <div style={{ height: "4px", borderRadius: "2px", background: V.surf2, overflow: "hidden", marginTop: "10px" }}>
          <div style={{ width: meterPct + "%", height: "100%", background: c.meter! > 0.9 ? V.err : c.meter! > 0.7 ? V.sec2 : V.pri, transition: "width .2s ease" }} />
        </div>
      ) : null}
      {c.actions && c.actions.length ? (
        <div style={{ display: "flex", gap: "8px", marginTop: "11px" }}>
          {c.actions.map((a, i) => (
            <AccessibleButton
              key={i}
              onClick={a.pick}
              style={{
                padding: "6px 12px",
                borderRadius: LK.card === "cap" ? 0 : V.rs,
                minHeight: 48,
                minWidth: 48,
                background: a.accent ? V.pri : V.surf2,
                color: a.accent ? V.onpri : V.ink,
                font: "600 11px/1 " + theme.font,
                cursor: "pointer"
              }}
            >
              {a.label}
            </AccessibleButton>
          ))}
        </div>
      ) : null}
    </div>
  );
};
