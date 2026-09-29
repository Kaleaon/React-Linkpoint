import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { FRIEND_ROWS, RADAR_AVATARS, SEARCH_STRANGERS, IM_CHIPS } from "../data/content.js";
import Icon from "../components/Icon.jsx";

const TABS = [
  { id: "FRIENDS", label: "FRIENDS", icon: "users" },
  { id: "NEARBY", label: "NEARBY", icon: "radar" },
  { id: "SEARCH", label: "SEARCH", icon: "search" },
];

// Ported/extended from the `isSearchScreen` <sc-if> block. This is the
// picker a real SL viewer shows when you go to start a conversation: your
// friends list, who's nearby right now, and a grid-wide name search — not
// just a bare text box. Reached from Friends' header icons (opens straight
// to SEARCH) and Chat's "ALL (n)" chip (opens on FRIENDS, see searchFrom).
export default function Search() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();

  const tab = TABS.some((x) => x.id === state.searchTab) ? state.searchTab : "FRIENDS";
  const q = (state.searchQuery || "").trim().toLowerCase();
  const friendNames = new Set(FRIEND_ROWS.map((r) => r[0]));

  const startIm = (name) => actions.startIm(name);

  const imPillStyle = (known) => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    height: "30px",
    padding: "0 12px",
    borderRadius: V.rs,
    border: "1px solid " + V.pri,
    background: known ? V.pri : "transparent",
    color: known ? V.onpri : V.pri,
    font: "700 10.5px/1 " + t.font,
    letterSpacing: ".14em",
    cursor: "pointer",
    flex: "none",
  });

  let rows = null;
  let emptyText = "";

  if (tab === "FRIENDS") {
    const list = FRIEND_ROWS.filter(([n]) => !q || n.toLowerCase().includes(q));
    rows = list.map(([name, meta, online]) => (
      <div key={name} onClick={() => startIm(name)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, cursor: "pointer" }}>
        <Icon name={online ? "circle-dot" : "circle"} size={20} style={{ color: online ? V.ok : V.ink2, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 13px/1.3 " + t.font, color: V.ink }}>{name}</div>
          <div style={{ font: "400 10px/1.3 " + t.font, color: V.ink2, marginTop: "1px" }}>{meta}</div>
        </div>
        <div onClick={(e) => { e.stopPropagation(); startIm(name); }} style={imPillStyle(IM_CHIPS.includes(name))}>
          IM
        </div>
      </div>
    ));
    emptyText = q ? "> no friends match “" + state.searchQuery + "”" : "> no friends yet";
  } else if (tab === "NEARBY") {
    const list = RADAR_AVATARS.filter(([n]) => !q || n.toLowerCase().includes(q)).slice().sort((a, b) => a[1] - b[1]);
    rows = list.map(([name, dm, , meta]) => (
      <div key={name} onClick={() => startIm(name)} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, cursor: "pointer" }}>
        <Icon name="circle-user-round" size={20} style={{ color: V.sec2, flex: "none" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 13px/1.3 " + t.font, color: V.ink }}>{name}</div>
          <div style={{ font: "400 10px/1.3 " + t.font, color: V.ink2, marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
        </div>
        <div style={{ padding: "4px 8px", border: "1px solid " + V.outv, borderRadius: V.rs, font: "400 11px/1 " + t.font, color: V.ink2, flex: "none" }}>{dm}m</div>
        <div onClick={(e) => { e.stopPropagation(); startIm(name); }} style={imPillStyle(IM_CHIPS.includes(name))}>
          IM
        </div>
      </div>
    ));
    emptyText = q ? "> nobody nearby matches “" + state.searchQuery + "”" : "> nobody in range right now";
  } else {
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
    rows = results.map((sr) => (
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
    ));
    emptyText = q.length < 2 ? "> type a name to search the grid" : "> no residents match";
  }

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
          <div style={{ font: "700 18px/1 " + t.dfont, letterSpacing: ".16em", color: V.pri }}>PEOPLE</div>
          <div style={{ font: "400 10.5px/1.3 " + t.font, color: V.ink2, marginTop: "2px" }}>&gt; friends, who's nearby, or search the grid</div>
        </div>
      </div>

      <div style={{ flex: "none", display: "flex", gap: "8px", padding: "0 16px 10px" }}>
        {TABS.map((tb) => {
          const on = tab === tb.id;
          return (
            <div
              key={tb.id}
              onClick={() => actions.setSearchTab(tb.id)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                height: "38px",
                borderRadius: V.rs,
                border: "1px solid " + (on ? V.pri : V.outv),
                background: on ? V.priC : V.surf,
                color: on ? V.onpriC : V.ink2,
                font: "700 10.5px/1 " + t.font,
                letterSpacing: ".12em",
                cursor: "pointer",
              }}
            >
              <Icon name={tb.icon} size={14} />
              {tb.label}
            </div>
          );
        })}
      </div>

      <div style={{ flex: "none", margin: "0 16px 10px", height: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
        <Icon name="search" size={16} style={{ color: V.ink2 }} />
        <input
          value={state.searchQuery}
          onChange={(e) => actions.setSearchQuery(e.target.value)}
          placeholder={tab === "SEARCH" ? "resident name (min 2 chars)" : "filter by name"}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", font: "400 13px/1 " + t.font, color: V.ink }}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {rows}
        {rows.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", font: "400 12px/1.5 " + t.font, color: V.ink2 }}>{emptyText}</div>
        ) : null}
      </div>
    </div>
  );
}
