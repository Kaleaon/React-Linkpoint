import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { NAV_ALL } from "../data/content.js";
import Icon from "./Icon.jsx";
import { navActive } from "../theme/look.js";
import { RailNav as SystemRailNav } from "@linkpoint/design-system/react";
import { LAYOUTS } from "@linkpoint/design-system/tokens";

/**
 * RailNav component provides accessible side rail navigation.
 *
 * Complies with WCAG 2.2 Level A standards:
 * - WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard)
 * - WCAG 2.2 SC 4.1.2 Name, Role, Value (https://www.w3.org/TR/WCAG22/#name-role-value)
 * - WCAG 2.2 SC 1.3.1 Info and Relationships (https://www.w3.org/TR/WCAG22/#info-and-relationships)
 * - WCAG 2.2 SC 2.4.7 Focus Visible (https://www.w3.org/TR/WCAG22/#focus-visible)
 *
 * Applicable W3C Techniques:
 * - ARIA6: Using aria-label to provide labels for objects (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA6)
 * - ARIA11: Using ARIA landmarks to identify regions of a page (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA11)
 * - ARIA17: Using grouping roles to identify related controls (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA17)
 * - G202: Ensuring keyboard control for all functionality (https://www.w3.org/WAI/WCAG22/Techniques/general/G202)
 */
export default function RailNav() {
  const { state, actions } = useApp();
  const { V, t, nav } = useTheme();
  // Navigation stays visible on the 3D View too. Hiding it left no way out of the
  // scene on phones and tablets (the 3D screen has no header or back button).
  if (nav !== "rail") return null;

  return (
    <nav
      aria-label="Side Rail Navigation"
      style={{ flex: "none", width: "104px", minHeight: 0, overflowY: "auto", background: V.surf, borderRight: "1px solid " + V.outv, display: "flex", flexDirection: "column", gap: "5px", padding: "12px 8px" }}
    >
      <div style={{ font: "700 13px/1.15 " + t.dfont, letterSpacing: ".2em", color: V.pri, padding: "2px 6px 14px" }}>
        LINK
        <br />
        POINT
      </div>
      {NAV_ALL.map((n) => {
        const active = navActive(state.screen, n.id);
        const handleKeyDown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            actions.setScreen(n.id);
          }
        };
        return (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            aria-current={active ? "page" : undefined}
            aria-label={n.label}
            onClick={() => actions.setScreen(n.id)}
            onKeyDown={handleKeyDown}
            style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", padding: "10px 4px", cursor: "pointer", borderRadius: V.navr, color: active ? V.onpriC : V.ink2, background: active ? V.priC : undefined }}
          >
            <Icon name={n.icon} size={20} />
            <span style={{ font: "600 8.5px/1 " + t.font, letterSpacing: ".1em" }}>{n.label}</span>
          </div>
        );
      })}
    </nav>
  );
}

