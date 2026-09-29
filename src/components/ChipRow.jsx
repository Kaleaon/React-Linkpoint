import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app";

// Ported from `chips`/`chipList`/`activeChip` — Chat's IM/GROUP thread picker.
export default function ChipRow() {
  const { state, actions } = useApp();
  const { V, t, LK, scr, norm } = useTheme();
  if (!norm || scr !== "Chat" || LK.chips === false) return null;

  const curTab = state.tabs.Chat;
  const friends = app.friends.getFriends();
  const imThreads = app.chat.getIMThreads();
  const realGroups = app.groups.getGroups();

  const imContacts = Array.from(new Set([
    ...friends.map((f) => f.name),
    ...imThreads.map((t) => t.contactName),
  ])).filter(Boolean);

  const groupNames = realGroups.map((g) => g.name || g.title).filter(Boolean);
  const chipList = curTab === "GROUP" ? groupNames : curTab === "IM" ? imContacts : [];
  if (!chipList.length) return null;

  const activeChip = chipList.includes(state.chip) ? state.chip : chipList[0];
  const allContacts = imContacts.length + groupNames.length;

  const chipBase = { flex: "none", height: "44px", padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf, cursor: "pointer", color: V.ink2 };

  return (
    <div style={{ flex: "none", display: "flex", gap: "8px", padding: "10px 16px", overflowX: "auto" }}>
      {chipList.map((n) => {
        const active = activeChip === n;
        const friendObj = friends.find((f) => f.name === n);
        const isOnline = friendObj?.onlineStatus === "online";
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
            <span style={{ width: "8px", height: "8px", borderRadius: "4px", flex: "none", background: isOnline ? V.ok : V.ink2 }} />
            <span style={{ font: "400 12px/1 " + t.font, whiteSpace: "nowrap" }}>{n}</span>
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
