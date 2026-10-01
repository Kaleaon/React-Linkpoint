import { useEffect, useMemo, useState } from "react";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useApp } from "../context/AppContext.jsx";
import Radar from "./Radar.jsx";
import ContactsScreen from "./ContactsScreen.jsx";
import CalendarScreen from "./CalendarScreen.jsx";
import {
  addSLFriendToGoogleContacts,
  generateAvatarCanvasPhotoBase64,
} from "../services/googleContacts.ts";
import {
  addNoticeToGoogleCalendar,
  parseNoticeDateSuggestion,
} from "../services/googleCalendar.ts";
import { auth, signInWithGoogle } from "../services/googleAuth.ts";

function Empty({ icon, children }) {
  return <div className="honest-empty"><Icon name={icon} size={30} /><p>{children}</p></div>;
}

function Rows({ rows, icon = "circle" }) {
  return <div className="live-list">{rows.map((row) => <div className="inventory-row" key={row.id || row.name || row.title}><Icon name={row.icon || icon} size={17} /><div><strong>{row.name || row.title || row.id}</strong>{row.meta || row.message ? <small>{row.meta || row.message}</small> : null}</div></div>)}</div>;
}

export function FriendsScreen() {
  const { V } = useTheme();
  const { state, actions } = useApp();
  const [, setRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);

  // User confirmation dialog for Google Contacts
  const [contactConfirm, setContactConfirm] = useState(null);
  const [addingContact, setAddingContact] = useState(false);

  useEffect(() => {
    const listener = () => setRevision((n) => n + 1);
    app.friends.addStatusListener(listener);
    app.friends.on("friend_added", listener);
    app.friends.on("friend_updated", listener);
    app.friends.on("friend_removed", listener);
    app.protocol.on("friends_loaded", listener);
    app.protocol.on("friend_status", listener);
    void app.loadFriends();
    return () => {
      app.friends.removeStatusListener(listener);
      app.friends.off("friend_added", listener);
      app.friends.off("friend_updated", listener);
      app.friends.off("friend_removed", listener);
      app.protocol.off("friends_loaded", listener);
      app.protocol.off("friend_status", listener);
    };
  }, []);

  const handleSyncFriends = async () => {
    setSyncing(true);
    try {
      await app.loadFriends();
      setRevision((n) => n + 1);
    } finally {
      setSyncing(false);
    }
  };

  const filterTab = state.tabs?.Friends || "ALL";

  if (filterTab === "CONTACTS") {
    return <ContactsScreen />;
  }

  const promptAddContact = (friend) => {
    const previewPhoto = generateAvatarCanvasPhotoBase64(friend);
    setContactConfirm({
      friend,
      previewPhoto,
      title: `Add ${friend.name} to Google Contacts?`,
      description: `This will create a new contact with resident UUID (${friend.id.slice(0, 8)}...), Second Life grid details, and their custom avatar profile photo.`,
    });
  };

  const handleConfirmAddContact = async () => {
    if (!contactConfirm?.friend) return;
    setAddingContact(true);
    try {
      if (!auth.currentUser) {
        await signInWithGoogle();
      }
      await addSLFriendToGoogleContacts(contactConfirm.friend);
      actions.notify(`Added ${contactConfirm.friend.name} and avatar photo to Google Contacts!`);
      setContactConfirm(null);
    } catch (err) {
      actions.notify(`Failed to add contact: ${err.message || err}`);
    } finally {
      setAddingContact(false);
    }
  };

  const allFriends = app.friends.getFriends();
  const filtered = allFriends.filter((f) => {
    if (filterTab === "ONLINE") return f.onlineStatus === "online";
    return true;
  });

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 12, gap: 10, background: V.bg, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "11px", color: V.ink2, fontWeight: 700 }}>
          {allFriends.filter(f => f.onlineStatus === 'online').length} ONLINE · {allFriends.length} TOTAL FRIENDS
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => actions.setScreen("Contacts")}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 700,
              background: V.surf,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              color: V.ink,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
            title="Open Google Contacts sync"
          >
            <Icon name="contact" size={13} />
            GOOGLE CONTACTS
          </button>
          <button
            type="button"
            onClick={handleSyncFriends}
            disabled={syncing || !app.auth.isLoggedIn()}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 700,
              background: V.surf,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              color: V.pri,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
            title="Reload friends list from Second Life"
          >
            <Icon name="rotate-cw" size={13} />
            {syncing ? "SYNCING…" : "SYNC FRIENDS"}
          </button>
        </div>
      </div>

      {!filtered.length ? (
        <Empty icon="users">
          {app.auth.isLoggedIn()
            ? (filterTab === "ONLINE" ? "None of your friends are currently online." : "No friends loaded from the grid.")
            : "Connect to a grid to see your friends."}
        </Empty>
      ) : (
        <div className="live-list" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {filtered.map((friend) => {
            const isOnline = friend.onlineStatus === "online";
            return (
              <div
                key={friend.id}
                className="inventory-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: V.surf,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}
                  onClick={() => setSelectedFriend(selectedFriend?.id === friend.id ? null : friend)}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: isOnline ? "#22c55e" : "#6b7280",
                      boxShadow: isOnline ? "0 0 6px rgba(34, 197, 94, 0.6)" : "none",
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <strong style={{ color: V.ink, fontSize: "13px" }}>{friend.name}</strong>
                    <div style={{ fontSize: "11px", color: isOnline ? "#22c55e" : V.ink2, textTransform: "capitalize" }}>
                      {friend.onlineStatus || "offline"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      promptAddContact(friend);
                    }}
                    style={{
                      padding: "4px 8px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: V.surf,
                      color: V.pri,
                      border: `1px solid ${V.outv}`,
                      borderRadius: V.rs,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                    title="Add to Google Contacts with avatar photo"
                  >
                    <Icon name="contact" size={13} />
                    CONTACT
                  </button>

                  <button
                    type="button"
                    onClick={() => actions.startIm(friend.name)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: V.pri,
                      color: V.onpri,
                      border: 0,
                      borderRadius: V.rs,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icon name="message-circle" size={13} />
                    IM
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedFriend && (
        <aside className="record-detail" style={{ background: V.surf, borderColor: V.outv, padding: 12 }}>
          <button className="detail-close" onClick={() => setSelectedFriend(null)} aria-label="Close friend details">×</button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <img
              src={`data:image/jpeg;base64,${generateAvatarCanvasPhotoBase64(selectedFriend)}`}
              alt={selectedFriend.name}
              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${V.pri}` }}
            />
            <div>
              <h2 style={{ margin: 0, fontSize: "15px" }}>{selectedFriend.name}</h2>
              <div style={{ fontSize: "11px", color: selectedFriend.onlineStatus === 'online' ? '#22c55e' : V.ink2 }}>
                ● {selectedFriend.onlineStatus || 'offline'}
              </div>
            </div>
          </div>
          <dl>
            <dt>Resident UUID</dt>
            <dd>{selectedFriend.id}</dd>
            <dt>Status</dt>
            <dd style={{ color: selectedFriend.onlineStatus === 'online' ? '#22c55e' : V.ink2, textTransform: 'capitalize' }}>{selectedFriend.onlineStatus || 'offline'}</dd>
            <dt>Permissions</dt>
            <dd>
              {selectedFriend.permissions?.canSeeOnline ? '✓ See online status ' : ''}
              {selectedFriend.permissions?.canSeeOnMap ? '✓ Map location ' : ''}
              {selectedFriend.permissions?.canModifyObjects ? '✓ Modify objects' : ''}
              {!selectedFriend.permissions?.canSeeOnline && !selectedFriend.permissions?.canSeeOnMap && !selectedFriend.permissions?.canModifyObjects ? 'Standard friendship' : ''}
            </dd>
          </dl>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                actions.startIm(selectedFriend.name);
                setSelectedFriend(null);
              }}
              style={{
                width: "100%",
                padding: "8px",
                background: V.pri,
                color: V.onpri,
                border: 0,
                borderRadius: V.rs,
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              START INSTANT MESSAGE
            </button>

            <button
              type="button"
              onClick={() => promptAddContact(selectedFriend)}
              style={{
                width: "100%",
                padding: "8px",
                background: V.surf,
                color: V.pri,
                border: `1px solid ${V.outv}`,
                borderRadius: V.rs,
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Icon name="contact" size={14} />
              ADD TO GOOGLE CONTACTS & SYNC PHOTO
            </button>
          </div>
        </aside>
      )}

      {/* Confirmation Modal for Google Contacts */}
      {contactConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: V.surf,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              padding: 20,
              maxWidth: 420,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: V.pri,
                  color: V.onpri,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="user-plus" size={16} />
              </div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: V.ink }}>
                {contactConfirm.title}
              </h3>
            </div>

            {contactConfirm.previewPhoto && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: V.bg, padding: 10, borderRadius: V.rs }}>
                <img
                  src={`data:image/jpeg;base64,${contactConfirm.previewPhoto}`}
                  alt="Avatar"
                  style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: "12px", color: V.ink }}>
                    User Icon / Profile Photo
                  </div>
                  <div style={{ fontSize: "10.5px", color: V.ink2 }}>
                    Will be uploaded to Google Contacts
                  </div>
                </div>
              </div>
            )}

            <p style={{ margin: 0, fontSize: "12px", color: V.ink2, lineHeight: 1.45 }}>
              {contactConfirm.description}
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setContactConfirm(null)}
                disabled={addingContact}
                style={{
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: "transparent",
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  color: V.ink,
                  cursor: "pointer",
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmAddContact}
                disabled={addingContact}
                style={{
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: V.pri,
                  color: V.onpri,
                  border: 0,
                  borderRadius: V.rs,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {addingContact && <Icon name="loader" size={13} />}
                CONFIRM & ADD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RadarScreen() {
  return <Radar />;
}

export function MapScreen() {
  const [region, setRegion] = useState(app.world.region);
  useEffect(() => { const refresh = (next) => setRegion(next); app.world.on("region_changed", refresh); return () => app.world.off("region_changed", refresh); }, []);
  return region ? <Rows rows={[{ id: region.id || region.name, name: region.name, meta: [region.x, region.y].filter((v) => v != null).join(", ") }]} icon="map-pin" /> : <Empty icon="map">No region handshake has been received.</Empty>;
}

export function WorldScreen() {
  useEffect(() => { void app.world.init(); return () => app.world.stopRendering(); }, []);
  return <div className="world-runtime"><canvas id="world-canvas" aria-label="Live simulator scene" />{!app.world.region ? <div className="world-overlay">Waiting for a live simulator scene</div> : null}</div>;
}

export function GroupsScreen() {
  const rows = app.groups.getGroups();
  return rows.length ? <Rows rows={rows} icon="users-round" /> : <Empty icon="users-round">No group records have been received.</Empty>;
}

export function NoticesScreen() {
  const { V } = useTheme();
  const { state, actions } = useApp();
  const sub = state.tabs?.Notices || "NOTICES";

  if (sub === "CALENDAR") {
    return <CalendarScreen />;
  }

  const [items, setItems] = useState(() => [...app.notifications.items]);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [calendarConfirm, setCalendarConfirm] = useState(null);
  const [addingEvent, setAddingEvent] = useState(false);

  useEffect(() => {
    const refresh = () => setItems([...app.notifications.items]);
    app.notifications.on("notification_received", refresh);
    app.notifications.on("cleared", refresh);
    return () => {
      app.notifications.off("notification_received", refresh);
      app.notifications.off("cleared", refresh);
    };
  }, []);

  const promptAddNotice = (notice) => {
    const suggestion = parseNoticeDateSuggestion(
      `${notice.subject || notice.title || ""}\n${notice.message || ""}`,
      notice.timestamp || Date.now()
    );
    const dateStr = suggestion.start.toISOString().slice(0, 10);
    const timeStr = `${String(suggestion.start.getHours()).padStart(2, "0")}:${String(
      suggestion.start.getMinutes()
    ).padStart(2, "0")}`;

    setCalendarConfirm({
      notice,
      eventDateInput: dateStr,
      eventTimeInput: timeStr,
      title: `Add Notice to Google Calendar?`,
      description: `This will create a new calendar event for "${notice.subject || notice.title || "Group Notice"}" with the group notice details.`,
    });
  };

  const handleConfirmAddEvent = async () => {
    if (!calendarConfirm?.notice) return;
    setAddingEvent(true);
    try {
      if (!auth.currentUser) {
        await signInWithGoogle();
      }
      const [yr, mo, dy] = calendarConfirm.eventDateInput.split("-").map(Number);
      const [hr, mn] = calendarConfirm.eventTimeInput.split(":").map(Number);
      const startDate = new Date(yr, mo - 1, dy, hr, mn);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

      await addNoticeToGoogleCalendar(
        {
          id: calendarConfirm.notice.id,
          groupId: calendarConfirm.notice.groupId,
          groupName: calendarConfirm.notice.groupName,
          subject: calendarConfirm.notice.subject || calendarConfirm.notice.title || "Group Notice",
          message: calendarConfirm.notice.message || "",
          from: calendarConfirm.notice.from || "Resident",
          timestamp: calendarConfirm.notice.timestamp || Date.now(),
        },
        {
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
        }
      );
      actions.notify(`Added "${calendarConfirm.notice.subject || calendarConfirm.notice.title}" to Google Calendar!`);
      setCalendarConfirm(null);
    } catch (err) {
      actions.notify(`Failed to add to calendar: ${err.message || err}`);
    } finally {
      setAddingEvent(false);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 12, gap: 10, background: V.bg, position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "11px", color: V.ink2, fontWeight: 700 }}>
          {items.length} GROUP NOTICES RECEIVED
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => actions.setScreen("Calendar")}
            style={{
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 700,
              background: V.surf,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              color: V.ink,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="calendar" size={13} />
            GOOGLE CALENDAR
          </button>
          {items.length > 0 && (
            <button
              type="button"
              className="screen-action"
              onClick={() => app.notifications.clear()}
              style={{
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 700,
                background: "transparent",
                border: `1px solid ${V.outv}`,
                borderRadius: V.rs,
                color: V.ink2,
                cursor: "pointer",
              }}
            >
              CLEAR
            </button>
          )}
        </div>
      </div>

      {!items.length ? (
        <Empty icon="bell">No notices or announcements have been received from your groups.</Empty>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, idx) => {
            const isSelected = selectedNotice?.id === (item.id || idx);
            return (
              <article
                key={item.id || idx}
                style={{
                  background: V.surf,
                  border: `1px solid ${isSelected ? V.pri : V.outv}`,
                  borderRadius: V.rs,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: V.pri, textTransform: "uppercase" }}>
                      {item.groupName || (item.groupId ? "Group Notice" : "Second Life System")}
                    </div>
                    <strong style={{ fontSize: "13px", color: V.ink }}>{item.subject || item.title || "Group Notice"}</strong>
                  </div>
                  {item.from && <small style={{ color: V.ink2, fontSize: "10.5px" }}>From: {item.from}</small>}
                </div>

                {item.message && (
                  <p style={{ margin: 0, fontSize: "12px", color: V.ink, lineHeight: 1.45, whiteSpace: isSelected ? "pre-wrap" : "nowrap", overflow: isSelected ? "visible" : "hidden", textOverflow: isSelected ? "clip" : "ellipsis" }}>
                    {item.message}
                  </p>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 6, borderTop: `1px solid ${V.outv}` }}>
                  <button
                    type="button"
                    onClick={() => setSelectedNotice(isSelected ? null : { ...item, id: item.id || idx })}
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      background: "transparent",
                      border: 0,
                      color: V.ink2,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {isSelected ? "COLLAPSE" : "READ FULL NOTICE"}
                  </button>

                  <button
                    type="button"
                    onClick={() => promptAddNotice(item)}
                    style={{
                      padding: "4px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: V.pri,
                      color: V.onpri,
                      border: 0,
                      borderRadius: V.rs,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                    title="Add notice to Google Calendar"
                  >
                    <Icon name="calendar-plus" size={13} />
                    ADD TO CALENDAR
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Google Calendar */}
      {calendarConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: V.surf,
              border: `1px solid ${V.outv}`,
              borderRadius: V.rs,
              padding: 20,
              maxWidth: 420,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: V.pri,
                  color: V.onpri,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="calendar-plus" size={16} />
              </div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: V.ink }}>
                {calendarConfirm.title}
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: "12px", color: V.ink2, lineHeight: 1.45 }}>
              {calendarConfirm.description}
            </p>

            <div style={{ background: V.bg, border: `1px solid ${V.outv}`, borderRadius: V.rs, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: V.pri }}>
                EVENT DATE & TIME (SLT / PACIFIC TIME)
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="date"
                  defaultValue={calendarConfirm.eventDateInput}
                  onChange={(e) => (calendarConfirm.eventDateInput = e.target.value)}
                  style={{ flex: 1, padding: "6px 8px", fontSize: "12px", background: V.surf, border: `1px solid ${V.outv}`, borderRadius: V.rs, color: V.ink }}
                />
                <input
                  type="time"
                  defaultValue={calendarConfirm.eventTimeInput}
                  onChange={(e) => (calendarConfirm.eventTimeInput = e.target.value)}
                  style={{ width: "100px", padding: "6px 8px", fontSize: "12px", background: V.surf, border: `1px solid ${V.outv}`, borderRadius: V.rs, color: V.ink }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setCalendarConfirm(null)}
                disabled={addingEvent}
                style={{
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: "transparent",
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  color: V.ink,
                  cursor: "pointer",
                }}
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleConfirmAddEvent}
                disabled={addingEvent}
                style={{
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: V.pri,
                  color: V.onpri,
                  border: 0,
                  borderRadius: V.rs,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {addingEvent && <Icon name="loader" size={13} />}
                CONFIRM & ADD TO CALENDAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function MuteListScreen() {
  const { state } = useApp();
  const sub = state.tabs?.["Mute List"] || "AVATARS";
  const [entry, setEntry] = useState("");
  const [revision, setRevision] = useState(0);

  const isObjects = sub === "OBJECTS";
  const mutedUsers = useMemo(() => app.chatExtended.getMutedUsers?.() || [], [revision]);
  const mutedObjects = useMemo(() => app.chatExtended.getMutedObjects?.() || [], [revision]);
  const activeList = isObjects ? mutedObjects : mutedUsers;

  const add = () => {
    if (!entry.trim()) return;
    if (isObjects) {
      app.chatExtended.muteObject(entry.trim());
    } else {
      app.chatExtended.muteUser(entry.trim());
    }
    setEntry("");
    setRevision((n) => n + 1);
  };

  const remove = (nameOrId) => {
    if (isObjects) {
      app.chatExtended.unmuteObject(nameOrId);
    } else {
      app.chatExtended.unmuteUser(nameOrId);
    }
    setRevision((n) => n + 1);
  };

  return (
    <div className="tool-screen">
      <div className="inline-tool">
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder={isObjects ? "Object or HUD name (e.g. av)" : "Avatar UUID or Name"}
        />
        <button onClick={add}>Mute {isObjects ? "Object" : "Avatar"}</button>
      </div>
      {activeList.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
          {activeList.map((id) => (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 4,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>{id}</span>
              <button
                type="button"
                onClick={() => remove(id)}
                style={{
                  padding: "3px 8px",
                  fontSize: 11,
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Unmute
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon="volume-x">No {isObjects ? "objects or HUDs" : "avatars"} are muted.</Empty>
      )}
    </div>
  );
}

export function GenericInventoryScreen({ kind }) {
  const wearableTypes = new Set([5, 13, 18, 19, 20, 21, 22, 23, 24]);
  const values = Array.from(app.inventory.items.values()).filter((item) => kind === "wearable" ? wearableTypes.has(Number(item.assetType)) : Number(item.assetType) === 6);
  return values.length ? <Rows rows={values} icon="package" /> : <Empty icon="package">No {kind.toLowerCase()} data has been loaded from inventory.</Empty>;
}

export function ConnectionScreen({ title }) {
  return <Empty icon="plug">{app.auth.isLoggedIn() ? `${title} is waiting for data from the current grid.` : `Connect to a grid to use ${title.toLowerCase()}.`}</Empty>;
}

export function SearchScreen() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const matches = app.friends.getFriends().filter((friend) => String(friend.name || friend.id).toLowerCase().includes(query.trim().toLowerCase()));
  const request = async () => {
    if (!query.trim()) return;
    try {
      await app.friends.sendFriendRequest(query.trim());
      setStatus("Friend request queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to queue friend request.");
    }
  };
  return <div className="tool-screen"><div className="inline-tool"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Resident UUID or loaded name" aria-label="Resident search" /><button onClick={() => void request()}>Add</button></div>{status ? <p className="tool-status">{status}</p> : null}{query && matches.length ? <Rows rows={matches} icon="user" /> : <Empty icon="search">Search checks residents received in this session. Enter a resident UUID to send a request.</Empty>}</div>;
}
