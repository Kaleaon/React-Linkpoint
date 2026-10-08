import { useEffect, useState, useRef } from "react";
import { useApp } from "../context/AppContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app.ts";
import { slBridge } from "../linkpoint/sl-bridge.ts";
import Icon from "../components/Icon.jsx";
import FormField from "../components/FormField.jsx";

const TABS = [
  { id: "PEOPLE", category: "people", label: "People", icon: "users" },
  { id: "GROUPS", category: "groups", label: "Groups", icon: "users-round" },
  { id: "PLACES", category: "places", label: "Places", icon: "map-pin" },
  { id: "SEARCH", category: "people", label: "SEARCH", icon: "search" },
];

function normalizeTab(rawTab) {
  if (!rawTab) return "PEOPLE";
  const u = String(rawTab).toUpperCase();
  if (u === "GROUPS") return "GROUPS";
  if (u === "PLACES") return "PLACES";
  if (u === "SEARCH") return "SEARCH";
  return "PEOPLE";
}

export default function Search() {
  const { state, actions } = useApp();
  const { V, t } = useTheme();

  const [friendsList, setFriendsList] = useState(() => app.friends.getFriends());
  const [nearbyList, setNearbyList] = useState(() => app.world?.getNearbyUsers ? app.world.getNearbyUsers() : []);

  const [activeTabId, setActiveTabId] = useState(() => normalizeTab(state.searchTab));
  const [serverResults, setServerResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const updateFriends = () => setFriendsList(app.friends.getFriends());
    const updateNearby = (users) => setNearbyList(users || []);

    app.friends.on("friend_added", updateFriends);
    app.friends.on("friend_updated", updateFriends);
    app.friends.on("friend_removed", updateFriends);
    if (app.world && typeof app.world.on === "function") {
      app.world.on("nearby_changed", updateNearby);
    }

    return () => {
      app.friends.off("friend_added", updateFriends);
      app.friends.off("friend_updated", updateFriends);
      app.friends.off("friend_removed", updateFriends);
      if (app.world && typeof app.world.off === "function") {
        app.world.off("nearby_changed", updateNearby);
      }
    };
  }, []);

  // Sync activeTabId if state.searchTab changes externally
  useEffect(() => {
    setActiveTabId(normalizeTab(state.searchTab));
  }, [state.searchTab]);

  const activeTabObj = TABS.find((tb) => tb.id === activeTabId) || TABS[0];
  const query = (state.searchQuery || "").trim();
  const queryLower = query.toLowerCase();

  // Reset page when tab or query changes
  const prevQueryRef = useRef(query);
  const prevTabRef = useRef(activeTabId);
  useEffect(() => {
    if (prevQueryRef.current !== query || prevTabRef.current !== activeTabId) {
      setPage(0);
      prevQueryRef.current = query;
      prevTabRef.current = activeTabId;
    }
  }, [query, activeTabId]);

  // Execute grid directory search via slBridge
  useEffect(() => {
    if (query.length < 2) {
      setServerResults([]);
      setLoading(false);
      setError(null);
      setHasMore(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    slBridge
      .searchDir({
        category: activeTabObj.category,
        query: query,
        start: page * 20,
      })
      .then((res) => {
        if (cancelled) return;
        setServerResults(res?.results || []);
        setHasMore(Boolean(res?.hasMore));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err?.message || "Failed to complete grid directory search";
        setError(msg);
        setLoading(false);
        setServerResults([]);
        if (typeof actions?.notify === "function") {
          actions.notify(`Grid search error: ${msg}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query, activeTabId, page, activeTabObj.category, actions]);

  const handleTabClick = (tabId) => {
    setActiveTabId(tabId);
    if (typeof actions?.setSearchTab === "function") {
      actions.setSearchTab(tabId);
    }
    setPage(0);
  };

  const startIm = (name) => {
    if (typeof actions.startIm === "function") {
      actions.startIm(name);
    } else {
      app.chat.openSession(name);
      actions.setScreen("Chat");
    }
  };

  const viewProfile = (name, id) => {
    if (typeof actions.setTarget === "function") {
      actions.setTarget({ name, id });
    }
    actions.setScreen("Profile");
  };

  const joinGroup = (group) => {
    if (!slBridge.connected) { actions.notify("Connect to a grid to join a group."); return; }
    slBridge.joinGroup({ groupId: group.id }).then(
      (result) => {
        actions.notify(result?.joined ? `Joined group: ${group.name}` : `Could not join ${group.name}: the group did not accept the request.`);
        if (result?.joined) void app.loadGroups().catch(() => undefined);
      },
      (err) => actions.notify(err instanceof Error ? err.message : `Could not join ${group.name}`),
    );
  };

  const teleportTo = (destination) => {
    if (!slBridge.connected) { actions.notify("Connect to a grid to teleport."); return; }
    slBridge.teleport({ destination }).then(
      () => actions.notify(`Teleport to ${destination} requested`),
      (err) => actions.notify(err instanceof Error ? err.message : `Could not teleport to ${destination}`),
    );
  };

  const pillBtnStyle = (primary) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    height: "28px",
    padding: "0 10px",
    borderRadius: V.rs,
    border: "1px solid " + (primary ? V.pri : V.outv),
    background: primary ? V.pri : "transparent",
    color: primary ? V.onpri : V.pri,
    font: "700 10px/1 " + t.font,
    letterSpacing: ".1em",
    cursor: "pointer",
    flex: "none",
  });

  // Calculate local matches for PEOPLE tab
  const matchedFriends =
    activeTabId === "PEOPLE"
      ? friendsList.filter((f) => !queryLower || (f.name || "").toLowerCase().includes(queryLower))
      : [];
  const matchedNearby =
    activeTabId === "PEOPLE"
      ? nearbyList.filter(
          (n) =>
            (!queryLower || (n.name || "").toLowerCase().includes(queryLower)) &&
            !friendsList.some((f) => (f.name || "").toLowerCase() === (n.name || "").toLowerCase())
        )
      : [];

  // Filter server people results to exclude names already shown in local matches
  const localNamesSet = new Set([
    ...matchedFriends.map((f) => (f.name || "").toLowerCase()),
    ...matchedNearby.map((n) => (n.name || "").toLowerCase()),
  ]);

  const serverPeopleResults =
    activeTabId === "PEOPLE"
      ? serverResults.filter(
          (item) =>
            !localNamesSet.has((item.name || "").toLowerCase()) &&
            !localNamesSet.has((item.displayName || "").toLowerCase()) &&
            !localNamesSet.has((item.username || "").toLowerCase())
        )
      : serverResults;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "14px 16px 10px" }}>
        <div
          onClick={() => actions.setScreen(state.searchFrom || "Friends")}
          style={{ width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", color: V.pri, cursor: "pointer" }}
          title="Back"
        >
          <Icon name="chevron-left" size={22} />
        </div>
        <div>
          <div style={{ font: "700 18px/1 " + t.dfont, letterSpacing: ".16em", color: V.pri }}>GRID DIRECTORY</div>
          <div style={{ font: "400 10.5px/1.3 " + t.font, color: V.ink2, marginTop: "2px" }}>
            &gt; search residents, groups, or locations grid-wide
          </div>
        </div>
      </div>

      {/* Category Tabs ("People", "Groups", "Places") */}
      <div style={{ flex: "none", display: "flex", gap: "8px", padding: "0 16px 10px" }}>
        {TABS.map((tb) => {
          const on = activeTabId === tb.id;
          return (
            <button
              key={tb.id}
              data-tab={tb.id}
              onClick={() => handleTabClick(tb.id)}
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
              <div style={{ display: "inline" }}>{tb.label.toUpperCase()}</div>
            </button>
          );
        })}
      </div>

      {/* Query Input */}
      <div style={{ flex: "none", margin: "0 16px 10px" }}>
        <div className="search-container" style={{ minHeight: "44px", display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
          <Icon name="search" size={16} style={{ color: V.ink2 }} />
          <FormField error={query.length === 1 ? "Enter at least 2 characters to search." : null} style={{ flex: 1 }}>
            <input
              className="search-input"
              aria-label={activeTabId === "SEARCH" ? "Search resident by name" : "Filter search results by name"}
              value={state.searchQuery || ""}
              onChange={(e) => {
                actions.setSearchQuery(e.target.value);
                setPage(0);
              }}
              placeholder={
                activeTabId === "PEOPLE" || activeTabId === "SEARCH"
                  ? "Search residents grid-wide (min 2 chars)"
                  : activeTabId === "GROUPS"
                  ? "Search groups by keyword"
                  : "Search places or destinations"
              }
              style={{ width: "100%", border: "none", background: "transparent", font: "400 13px/1 " + t.font, color: V.ink }}
            />
          </FormField>
          {state.searchQuery ? (
            <div onClick={() => actions.setSearchQuery("")} style={{ cursor: "pointer", color: V.ink2, display: "flex", alignItems: "center" }}>
              <Icon name="x" size={16} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Error alert banner if network error occurs */}
      {error ? (
        <div style={{ margin: "0 16px 10px", padding: "8px 12px", borderRadius: V.rs, border: "1px solid " + V.err, background: V.errC || "rgba(255,0,0,0.1)", color: V.err || "#ff4d4d", font: "400 11px/1.3 " + t.font, display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name="alert-triangle" size={16} />
          <div style={{ flex: 1 }}>{error}</div>
        </div>
      ) : null}

      {/* Loading Indicator */}
      {loading ? (
        <div style={{ padding: "12px 16px", textAlign: "center", font: "400 12px/1 " + t.font, color: V.pri, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
          <Icon name="loader-2" size={16} className="animate-spin" />
          <span>Searching Second Life grid directory...</span>
        </div>
      ) : null}

      {/* Results Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* PEOPLE / SEARCH TAB */}
        {activeTabId === "PEOPLE" || activeTabId === "SEARCH" ? (
          <>
            {/* Local Contacts Section (Friends & Nearby) */}
            {(matchedFriends.length > 0 || matchedNearby.length > 0) && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ font: "700 10px/1 " + t.font, color: V.ink2, letterSpacing: ".12em", marginTop: "4px" }}>
                  LOCAL CONTACTS &amp; NEARBY
                </div>
                {matchedFriends.map((f) => {
                  const isOnline = f.onlineStatus === "online";
                  return (
                    <div key={f.id || f.name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
                      <Icon name={isOnline ? "circle-dot" : "circle"} size={20} style={{ color: isOnline ? V.ok : V.ink2, flex: "none" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "600 13px/1.3 " + t.font, color: V.ink }}>{f.name}</div>
                        <div style={{ font: "400 10px/1.3 " + t.font, color: V.ink2, marginTop: "1px" }}>
                          Friend ({isOnline ? "Online" : "Offline"})
                        </div>
                      </div>
                      <button onClick={() => viewProfile(f.name, f.id)} style={pillBtnStyle(false)}>
                        Profile
                      </button>
                      <button onClick={() => startIm(f.name)} style={pillBtnStyle(true)}>
                        IM
                      </button>
                    </div>
                  );
                })}
                {matchedNearby.map((n) => {
                  const name = n.name || n.id;
                  const dm = n.distance != null ? Math.round(n.distance) : 0;
                  return (
                    <div key={n.id || name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
                      <Icon name="circle-user-round" size={20} style={{ color: V.sec2, flex: "none" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "600 13px/1.3 " + t.font, color: V.ink }}>{name}</div>
                        <div style={{ font: "400 10px/1.3 " + t.font, color: V.ink2, marginTop: "1px" }}>
                          Nearby resident ({dm}m)
                        </div>
                      </div>
                      <button onClick={() => viewProfile(name, n.id)} style={pillBtnStyle(false)}>
                        Profile
                      </button>
                      <button onClick={() => startIm(name)} style={pillBtnStyle(true)}>
                        IM
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Grid Directory Server Results Section */}
            {serverPeopleResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                <div style={{ font: "700 10px/1 " + t.font, color: V.pri, letterSpacing: ".12em" }}>
                  GRID DIRECTORY RESULTS
                </div>
                {serverPeopleResults.map((item) => {
                  const dName = item.displayName || item.name || "Resident";
                  const uName = item.username ? `@${item.username}` : item.name || "";
                  return (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
                      <Icon name="user" size={22} style={{ color: V.pri, flex: "none" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: "600 13px/1.3 " + t.font, color: V.ink }}>{dName}</div>
                        <div style={{ font: "400 10.5px/1.3 " + t.font, color: V.ink2, marginTop: "1px" }}>
                          {uName} {item.online != null ? (item.online ? "• Online" : "• Offline") : ""}
                        </div>
                      </div>
                      <button onClick={() => viewProfile(dName, item.id)} style={pillBtnStyle(false)}>
                        Profile
                      </button>
                      <button onClick={() => startIm(item.username || dName)} style={pillBtnStyle(true)}>
                        IM
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty State */}
            {matchedFriends.length === 0 && matchedNearby.length === 0 && serverPeopleResults.length === 0 && !loading ? (
              <div style={{ padding: "40px 0", textAlign: "center", font: "400 12px/1.5 " + t.font, color: V.ink2 }}>
                {query.length < 2
                  ? "> type at least 2 characters to search residents grid-wide"
                  : `> no residents match “${state.searchQuery}”`}
              </div>
            ) : null}
          </>
        ) : null}

        {/* GROUPS TAB */}
        {activeTabId === "GROUPS" ? (
          <>
            {serverResults.map((group) => (
              <div key={group.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
                <Icon name="users-round" size={22} style={{ color: V.pri, flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 13px/1.3 " + t.font, color: V.ink }}>{group.name}</div>
                  <div style={{ font: "400 10.5px/1.3 " + t.font, color: V.ink2, marginTop: "1px" }}>
                    {group.members != null ? `${group.members} members` : "Second Life Group"}
                  </div>
                </div>
                <button onClick={() => joinGroup(group)} style={pillBtnStyle(true)}>
                  Join Group
                </button>
              </div>
            ))}
            {serverResults.length === 0 && !loading ? (
              <div style={{ padding: "40px 0", textAlign: "center", font: "400 12px/1.5 " + t.font, color: V.ink2 }}>
                {query.length < 2
                  ? "> type at least 2 characters to search groups"
                  : `> no groups match “${state.searchQuery}”`}
              </div>
            ) : null}
          </>
        ) : null}

        {/* PLACES TAB */}
        {activeTabId === "PLACES" ? (
          <>
            {serverResults.map((place) => (
              <div key={place.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", border: "1px solid " + V.outv, borderRadius: V.rs, background: V.surf }}>
                <Icon name="map-pin" size={22} style={{ color: V.pri, flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 13px/1.3 " + t.font, color: V.ink }}>{place.name}</div>
                  <div style={{ font: "400 10.5px/1.3 " + t.font, color: V.ink2, marginTop: "1px" }}>
                    {place.description || (place.dwell ? `Dwell: ${place.dwell}` : "Teleport destination")}
                  </div>
                </div>
                <button onClick={() => teleportTo(place.name)} style={pillBtnStyle(true)}>
                  Teleport
                </button>
              </div>
            ))}
            {serverResults.length === 0 && !loading ? (
              <div style={{ padding: "40px 0", textAlign: "center", font: "400 12px/1.5 " + t.font, color: V.ink2 }}>
                {query.length < 2
                  ? "> type at least 2 characters to search places"
                  : `> no places match “${state.searchQuery}”`}
              </div>
            ) : null}
          </>
        ) : null}

        {/* Pagination Controls */}
        {(serverResults.length > 0 || page > 0) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "12px 0 6px", flex: "none" }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              style={{
                ...pillBtnStyle(false),
                opacity: page === 0 || loading ? 0.4 : 1,
                cursor: page === 0 || loading ? "default" : "pointer",
              }}
            >
              &lt; Prev
            </button>
            <span style={{ font: "600 11px/1 " + t.font, color: V.ink2 }}>Page {page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
              style={{
                ...pillBtnStyle(false),
                opacity: !hasMore || loading ? 0.4 : 1,
                cursor: !hasMore || loading ? "default" : "pointer",
              }}
            >
              Next &gt;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
