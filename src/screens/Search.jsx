import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { FRIEND_ROWS, SEARCH_STRANGERS } from "../data/content.js";
import Icon from "../components/Icon.jsx";

// Ported from the `isSearchScreen` <sc-if> block — "FIND RESIDENTS". Reached
// from Friends' header icons and Chat's "ALL (n)" chip (see searchFrom).
export default function Search() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();

  const q = (state.searchQuery || "").trim().toLowerCase();
  const friendNames = new Set(FRIEND_ROWS.map((r) => r[0]));
  const results =
    q.length < 2
      ? []
      : [...FRIEND_ROWS.map((r) => r[0]), ...SEARCH_STRANGERS]
          .filter((n) => n.toLowerCase().includes(q))
          .map((n) => {
            const isFriend = friendNames.has(n);
            const st = state.searchState[n];
            const label = isFriend ? "FRIEND" : st === "sending" ? "…" : st === "sent" ? "OFFERED" : "ADD";
            const pillOn = isFriend || st === "sent";
            return {
              name: n,
              id: n.toLowerCase().replace(/\s+/g, "-").slice(0, 8),
              label,
              pick: !isFriend && !st ? () => actions.searchAdd(n) : () => {},
              style: {
                display: "flex",
                alignItems: "center",
                gap: "6px",
                height: "36px",
                padding: "0 12px",
                borderRadius: V.rs,
                border: "1px solid " + (pillOn ? V.ok : V.pri),
                background: pillOn ? "transparent" : V.pri,
                color: pillOn ? V.ok : V.onpri,
                font: "700 10.5px/1 " + t.font,
                letterSpacing: ".14em",
                cursor: !isFriend && !st ? "pointer" : "default",
              },
            };
          });
  const emptyText = q.length < 2 ? "> type a name to search the grid" : "> no residents match";

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "14px 16px 10px" }}>
        <div
          onClick={() => actions.setScreen(state.searchFrom || "Friends")}
          style={{ width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", color: V.pri, cursor: "pointer" }}
        >
          <Icon name="chevron-left" size={22} />
        </div>
        <div>
          <div style={{ font: "700 18px/1 " + t.dfont, letterSpacing: ".16em", color: V.pri }}>FIND RESIDENTS</div>
          <div style={{ font: "400 10.5px/1.3 " + t.font, color: V.ink2, marginTop: "2px" }}>&gt; search the grid to IM or add a friend</div>
        </div>
      </div>
      <div style={{ flex: "none", margin: "0 16px 10px", height: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
        <Icon name="search" size={16} style={{ color: V.ink2 }} />
        <input
          value={state.searchQuery}
          onChange={(e) => actions.setSearchQuery(e.target.value)}
          placeholder="resident name (min 2 chars)"
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", font: "400 13px/1 " + t.font, color: V.ink }}
        />
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {results.map((sr) => (
          <div key={sr.name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
            <Icon name="circle-user-round" size={22} style={{ color: V.sec2, flex: "none" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 13px/1.3 " + t.font, color: V.ink }}>{sr.name}</div>
              <div style={{ font: "400 10px/1.3 " + t.font, color: V.ink2, marginTop: "1px" }}>resident · {sr.id}</div>
            </div>
            <div onClick={sr.pick} style={sr.style}>
              {sr.label}
            </div>
          </div>
        ))}
        {results.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", font: "400 12px/1.5 " + t.font, color: V.ink2 }}>{emptyText}</div>
        ) : null}
      </div>
    </div>
  );
}
