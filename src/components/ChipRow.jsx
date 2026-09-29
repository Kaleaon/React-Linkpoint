import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { IM_CHIPS, GROUP_CHIPS, FRIEND_ROWS } from "../data/content.js";

// Ported from `chips`/`chipList`/`activeChip` — Chat's IM/GROUP thread picker.
// Local has no chip row (it's the single always-on nearby feed). The trailing
// "ALL (n)" chip opens the People picker (Friends/Nearby/Search tabs) for
// starting a thread with someone not already a chip (the chip row only ever
// shows existing threads) — it lands on the Friends tab, not a bare search box.
export default function ChipRow() {
  const { state, actions } = useApp();
  const { V, t, LK, scr, norm } = useTheme();
  if (!norm || scr !== "Chat" || LK.chips === false) return null;

  const curTab = state.tabs.Chat;
  const chipList = curTab === "GROUP" ? GROUP_CHIPS : curTab === "IM" ? IM_CHIPS : [];
  if (!chipList.length) return null;
  const activeChip = chipList.includes(state.chip) ? state.chip : chipList[0];
  const allContacts = FRIEND_ROWS.length + GROUP_CHIPS.length;

  const chipBase = { flex: "none", height: "44px", padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, cursor: "pointer", color: V.ink2 };

  return (
    <div style={{ flex: "none", display: "flex", gap: "8px", padding: "10px 16px", overflowX: "auto" }}>
      {chipList.map((n) => {
        const active = activeChip === n;
        const badge = n === "Kit Sandalwood" ? 2 : 0;
        return (
          <div
            key={n}
            onClick={() => actions.setChip(n)}
            role="button"
            tabIndex={0}
            aria-label={`Chat with ${n}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                actions.setChip(n);
              }
            }}
            style={{ ...chipBase, ...(active ? { borderColor: V.pri, background: V.priC, color: V.onpriC } : null) }}
          >
            <span style={{ width: "8px", height: "8px", borderRadius: "4px", flex: "none", background: n === "Nyx Vaher" ? V.ok : V.ink2 }} />
            <span style={{ font: "400 12px/1 " + t.font, whiteSpace: "nowrap" }}>{n}</span>
            {badge ? (
              <span style={{ minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "9px", background: V.bdg, color: V.onbdg, display: "flex", alignItems: "center", justifyContent: "center", font: "700 10px/1 " + t.font }}>
                {badge}
              </span>
            ) : null}
          </div>
        );
      })}
      <div
        key="all"
        onClick={() => actions.openSearch("Chat")}
        role="button"
        tabIndex={0}
        aria-label={`View all ${allContacts} contacts`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            actions.openSearch("Chat");
          }
        }}
        style={{ ...chipBase, borderStyle: "dashed" }}
      >
        <span style={{ width: "8px", height: "8px", borderRadius: "4px", flex: "none", background: V.pri }} />
        <span style={{ font: "400 12px/1 " + t.font, whiteSpace: "nowrap" }}>{"ALL (" + allContacts + ")"}</span>
      </div>
    </div>
  );
}
