import { useState, useEffect, useMemo } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { useApp } from "../context/AppContext.jsx";
import { app } from "../linkpoint/app.ts";
import Icon from "../components/Icon.jsx";
import {
  auth,
  initGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
  getGoogleAccessToken,
} from "../services/googleAuth.ts";
import {
  fetchGoogleCalendarEvents,
  addNoticeToGoogleCalendar,
  deleteCalendarEvent,
  parseNoticeDateSuggestion,
  GoogleCalendarEvent,
  GroupNoticeItem,
} from "../services/googleCalendar.ts";

export default function CalendarScreen() {
  const { V, t } = useTheme();
  const { state, actions } = useApp();

  const [googleUser, setGoogleUser] = useState(auth.currentUser);
  const [token, setToken] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [activeTab, setActiveTab] = useState("NOTICES");

  // Selected notice for reading full content
  const [selectedNotice, setSelectedNotice] = useState(null);

  // Group notices state from app notifications & groups
  const [notices, setNotices] = useState([]);

  // Confirmation modal state (MANDATORY for user data modifications)
  const [confirmModal, setConfirmModal] = useState(null);

  const [actionInProgress, setActionInProgress] = useState(false);

  // Refresh notices from notifications and groups
  const refreshNotices = () => {
    const list = [];

    // From notifications
    const rawItems = app.notifications?.items || [];
    for (const item of rawItems) {
      if (item.kind === "notice" || item.subject || item.message) {
        list.push({
          id: item.id || `notif-${Math.random()}`,
          groupId: item.groupId,
          groupName: item.groupName || (item.groupId ? app.groups?.getGroup?.(item.groupId)?.name : "Second Life Group"),
          subject: item.subject || item.title || "Group Notice",
          message: item.message || "",
          from: item.from || "Resident",
          timestamp: item.timestamp || Date.now(),
          hasAttachment: Boolean(item.hasAttachment),
        });
      }
    }

    // Also pull notices recorded in groups manager
    try {
      const allGroups = app.groups?.getGroups?.() || [];
      for (const grp of allGroups) {
        const grpNotices = app.groups?.getGroupNotices?.(grp.id, 20) || [];
        for (const gn of grpNotices) {
          if (!list.some((existing) => existing.id === gn.id)) {
            list.push({
              id: gn.id,
              groupId: grp.id,
              groupName: grp.name || "Second Life Group",
              subject: gn.subject || "Group Notice",
              message: gn.message || "",
              from: gn.from || "Resident",
              timestamp: gn.timestamp || Date.now(),
              hasAttachment: Boolean(gn.hasAttachment),
            });
          }
        }
      }
    } catch {
      // ignore
    }

    // Sort newest first
    list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    setNotices(list);
  };

  useEffect(() => {
    refreshNotices();
    app.notifications?.on("notification_received", refreshNotices);
    app.notifications?.on("cleared", refreshNotices);
    return () => {
      app.notifications?.off("notification_received", refreshNotices);
      app.notifications?.off("cleared", refreshNotices);
    };
  }, []);

  // Listen for Google Auth changes
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, accessToken) => {
        setGoogleUser(user);
        setToken(accessToken);
        void loadEvents();
      },
      () => {
        setGoogleUser(null);
        setToken(null);
        setEvents([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const loadEvents = async () => {
    if (!auth.currentUser) return;
    setLoadingEvents(true);
    try {
      const list = await fetchGoogleCalendarEvents();
      setEvents(list);
    } catch (err: any) {
      console.warn("[CalendarScreen] Failed to fetch events:", err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const res = await signInWithGoogle();
      setGoogleUser(res.user);
      setToken(res.accessToken);
      await loadEvents();
      actions.notify("Signed in to Google Calendar successfully");
    } catch (err: any) {
      actions.notify(`Google Sign-In failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogle();
    setGoogleUser(null);
    setToken(null);
    setEvents([]);
    actions.notify("Signed out of Google Calendar");
  };

  // Open modal to add notice to Google Calendar
  const requestAddNoticeToCalendar = (notice) => {
    if (!googleUser) {
      actions.notify("Please sign in with Google to add notices to your calendar.");
      return;
    }

    const suggestion = parseNoticeDateSuggestion(
      `${notice.subject}\n${notice.message}`,
      notice.timestamp || Date.now()
    );

    // Format default input values in YYYY-MM-DD and HH:MM
    const dateStr = suggestion.start.toISOString().slice(0, 10);
    const timeStr = `${String(suggestion.start.getHours()).padStart(2, "0")}:${String(
      suggestion.start.getMinutes()
    ).padStart(2, "0")}`;

    let eventDate = dateStr;
    let eventTime = timeStr;

    setConfirmModal({
      open: true,
      type: "add_event",
      title: `Add Notice to Google Calendar?`,
      description: `This will create an event in your Google Calendar (${googleUser.email}) for the group notice "${notice.subject}".`,
      notice,
      eventDateInput: eventDate,
      eventTimeInput: eventTime,
      onConfirm: async () => {
        setActionInProgress(true);
        try {
          const [yr, mo, dy] = eventDate.split("-").map(Number);
          const [hr, mn] = eventTime.split(":").map(Number);
          const startDate = new Date(yr, mo - 1, dy, hr, mn);
          const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

          await addNoticeToGoogleCalendar(notice, {
            startDateTime: startDate.toISOString(),
            endDateTime: endDate.toISOString(),
            summary: `[SL Notice] ${notice.subject}`,
          });

          await loadEvents();
          actions.notify(`Added "${notice.subject}" to Google Calendar!`);
          setConfirmModal(null);
        } catch (err: any) {
          actions.notify(`Failed to add to calendar: ${err.message}`);
        } finally {
          setActionInProgress(false);
        }
      },
    });
  };

  // Open modal to delete event
  const requestDeleteEvent = (event) => {
    setConfirmModal({
      open: true,
      type: "delete_event",
      title: `Delete Calendar Event?`,
      description: `Are you sure you want to delete "${event.summary}" from your Google Calendar? This action cannot be undone.`,
      event,
      onConfirm: async () => {
        setActionInProgress(true);
        try {
          await deleteCalendarEvent(event.id);
          await loadEvents();
          actions.notify(`Deleted "${event.summary}" from Google Calendar`);
          setConfirmModal(null);
        } catch (err: any) {
          actions.notify(`Failed to delete event: ${err.message}`);
        } finally {
          setActionInProgress(false);
        }
      },
    });
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: V.bg,
        color: V.ink,
        padding: 12,
        gap: 12,
        position: "relative",
      }}
    >
      {/* Top Header Card */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          background: V.surf,
          border: `1px solid ${V.outv}`,
          borderRadius: V.rs,
          padding: "10px 14px",
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
            <Icon name="calendar" size={18} />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.04em" }}>
              NOTICES & GOOGLE CALENDAR
            </div>
            <div style={{ fontSize: "11px", color: V.ink2 }}>
              {googleUser
                ? `Connected to ${googleUser.email}`
                : "Read Second Life group notices and add events to Google Calendar"}
            </div>
          </div>
        </div>

        {googleUser ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={loadEvents}
              disabled={loadingEvents}
              style={{
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 700,
                background: V.surf2 || V.surf,
                border: `1px solid ${V.outv}`,
                borderRadius: V.rs,
                color: V.ink,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="rotate-cw" size={13} />
              {loadingEvents ? "REFRESHING…" : "REFRESH"}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                padding: "6px 12px",
                fontSize: "11px",
                fontWeight: 700,
                background: "transparent",
                border: `1px solid ${V.outv}`,
                borderRadius: V.rs,
                color: V.ink2,
                cursor: "pointer",
              }}
            >
              SIGN OUT
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="gsi-material-button"
            onClick={handleSignIn}
            disabled={isLoggingIn}
            style={{
              userSelect: "none",
              background: "#131314",
              border: "1px solid #8e918f",
              borderRadius: "4px",
              color: "#e3e3e3",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Roboto', arial, sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              height: "36px",
              padding: "0 12px",
              gap: 8,
            }}
          >
            <svg
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              style={{ width: "18px", height: "18px", display: "block" }}
            >
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
              <path fill="none" d="M0 0h48v48H0z" />
            </svg>
            <span>{isLoggingIn ? "Connecting…" : "Sign in with Google"}</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => setActiveTab("NOTICES")}
          style={{
            padding: "6px 14px",
            fontSize: "11px",
            fontWeight: 700,
            background: activeTab === "NOTICES" ? V.pri : V.surf,
            color: activeTab === "NOTICES" ? V.onpri : V.ink,
            border: `1px solid ${activeTab === "NOTICES" ? V.pri : V.outv}`,
            borderRadius: V.rs,
            cursor: "pointer",
          }}
        >
          GROUP NOTICES ({notices.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("CALENDAR")}
          style={{
            padding: "6px 14px",
            fontSize: "11px",
            fontWeight: 700,
            background: activeTab === "CALENDAR" ? V.pri : V.surf,
            color: activeTab === "CALENDAR" ? V.onpri : V.ink,
            border: `1px solid ${activeTab === "CALENDAR" ? V.pri : V.outv}`,
            borderRadius: V.rs,
            cursor: "pointer",
          }}
        >
          UPCOMING EVENTS ({events.length})
        </button>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12 }}>
        {activeTab === "NOTICES" ? (
          /* Group Notices List & Reader */
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
            {notices.length === 0 ? (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: V.ink2,
                  fontSize: "12px",
                  background: V.surf,
                  border: `1px dashed ${V.outv}`,
                  borderRadius: V.rs,
                }}
              >
                <Icon name="bell" size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                <div>No group notices received yet this session.</div>
                <div style={{ fontSize: "11px", marginTop: 4 }}>
                  Notices broadcasted by your Second Life groups will appear here.
                </div>
              </div>
            ) : (
              notices.map((notice) => {
                const dateStr = new Date(notice.timestamp || Date.now()).toLocaleString();
                const isSelected = selectedNotice?.id === notice.id;
                return (
                  <article
                    key={notice.id}
                    onClick={() => setSelectedNotice(isSelected ? null : notice)}
                    style={{
                      background: V.surf,
                      border: `1px solid ${isSelected ? V.pri : V.outv}`,
                      borderRadius: V.rs,
                      padding: 12,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      transition: "border-color 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: "10px", color: V.pri, fontWeight: 700, textTransform: "uppercase" }}>
                          {notice.groupName || "Second Life Group"}
                        </div>
                        <h3 style={{ margin: "2px 0 0", fontSize: "13px", fontWeight: 700, color: V.ink }}>
                          {notice.subject}
                        </h3>
                      </div>
                      <div style={{ fontSize: "10px", color: V.ink2, whiteSpace: "nowrap" }}>
                        {dateStr}
                      </div>
                    </div>

                    <div style={{ fontSize: "11px", color: V.ink2, display: "flex", gap: 10 }}>
                      <span>From: {notice.from || "Resident"}</span>
                      {notice.hasAttachment && <span>📎 Has Attachment</span>}
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        color: V.ink,
                        lineHeight: 1.45,
                        whiteSpace: isSelected ? "pre-wrap" : "nowrap",
                        overflow: isSelected ? "visible" : "hidden",
                        textOverflow: isSelected ? "clip" : "ellipsis",
                      }}
                    >
                      {notice.message || "(No message body)"}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 4,
                        paddingTop: 8,
                        borderTop: `1px solid ${V.outv}`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedNotice(isSelected ? null : notice)}
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
                        onClick={() => requestAddNoticeToCalendar(notice)}
                        style={{
                          padding: "5px 10px",
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
                        ADD TO GOOGLE CALENDAR
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        ) : (
          /* Upcoming Google Calendar Events List */
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
            {!googleUser ? (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: V.ink2,
                  fontSize: "12px",
                  background: V.surf,
                  border: `1px dashed ${V.outv}`,
                  borderRadius: V.rs,
                }}
              >
                Sign in with Google to view upcoming events and sync your Second Life schedule.
              </div>
            ) : loadingEvents ? (
              <div style={{ padding: 24, textAlign: "center", color: V.ink2, fontSize: "12px" }}>
                Loading Google Calendar events…
              </div>
            ) : events.length === 0 ? (
              <div
                style={{
                  padding: 32,
                  textAlign: "center",
                  color: V.ink2,
                  fontSize: "12px",
                  background: V.surf,
                  border: `1px dashed ${V.outv}`,
                  borderRadius: V.rs,
                }}
              >
                No upcoming events found on your Google Calendar.
              </div>
            ) : (
              events.map((ev) => {
                const startRaw = ev.start?.dateTime || ev.start?.date;
                const startDate = startRaw ? new Date(startRaw) : null;
                const timeFormatted = startDate
                  ? startDate.toLocaleString([], {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Date TBD";

                return (
                  <div
                    key={ev.id}
                    style={{
                      background: V.surf,
                      border: `1px solid ${V.outv}`,
                      borderRadius: V.rs,
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: V.rs,
                          background: ev.isSLNotice ? V.pri : V.sec || "#1e293b",
                          color: ev.isSLNotice ? V.onpri : V.ink,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="calendar" size={16} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: "13px", color: V.ink }}>
                            {ev.summary}
                          </span>
                          {ev.isSLNotice && (
                            <span
                              style={{
                                fontSize: "9px",
                                fontWeight: 800,
                                background: V.pri,
                                color: V.onpri,
                                padding: "2px 5px",
                                borderRadius: 3,
                              }}
                            >
                              SL NOTICE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: V.ink2, marginTop: 2 }}>
                          {timeFormatted} {ev.location ? `· ${ev.location}` : ""}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {ev.htmlLink && (
                        <a
                          href={ev.htmlLink}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: "4px 8px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: V.surf2 || V.surf,
                            color: V.pri,
                            border: `1px solid ${V.outv}`,
                            borderRadius: V.rs,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Icon name="external-link" size={11} />
                          VIEW
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => requestDeleteEvent(ev)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          background: "transparent",
                          border: `1px solid ${V.outv}`,
                          borderRadius: V.rs,
                          color: "#ef4444",
                          cursor: "pointer",
                        }}
                        title="Delete from Google Calendar"
                      >
                        <Icon name="trash-2" size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal (MANDATORY User Confirmation Dialog) */}
      {confirmModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.75)",
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
              maxWidth: 440,
              width: "100%",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: confirmModal.type === "delete_event" ? "#ef4444" : V.pri,
                  color: confirmModal.type === "delete_event" ? "#ffffff" : V.onpri,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={confirmModal.type === "delete_event" ? "trash-2" : "calendar-plus"}
                  size={17}
                />
              </div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: V.ink }}>
                {confirmModal.title}
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: "12px", color: V.ink2, lineHeight: 1.45 }}>
              {confirmModal.description}
            </p>

            {confirmModal.notice && (
              <div
                style={{
                  background: V.bg,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 700, color: V.pri }}>
                  EVENT DATE & TIME (SLT / PACIFIC TIME)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="date"
                    defaultValue={confirmModal.eventDateInput}
                    onChange={(e) => (confirmModal.eventDateInput = e.target.value)}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      fontSize: "12px",
                      background: V.surf,
                      border: `1px solid ${V.outv}`,
                      borderRadius: V.rs,
                      color: V.ink,
                    }}
                  />
                  <input
                    type="time"
                    defaultValue={confirmModal.eventTimeInput}
                    onChange={(e) => (confirmModal.eventTimeInput = e.target.value)}
                    style={{
                      width: "100px",
                      padding: "6px 8px",
                      fontSize: "12px",
                      background: V.surf,
                      border: `1px solid ${V.outv}`,
                      borderRadius: V.rs,
                      color: V.ink,
                    }}
                  />
                </div>
                <div style={{ fontSize: "10px", color: V.ink2 }}>
                  Notice snippet: "{confirmModal.notice.message.slice(0, 90)}..."
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={actionInProgress}
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
                onClick={confirmModal.onConfirm}
                disabled={actionInProgress}
                style={{
                  padding: "7px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  background: confirmModal.type === "delete_event" ? "#ef4444" : V.pri,
                  color: confirmModal.type === "delete_event" ? "#ffffff" : V.onpri,
                  border: 0,
                  borderRadius: V.rs,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {actionInProgress && <Icon name="loader" size={13} />}
                {confirmModal.type === "delete_event" ? "DELETE EVENT" : "CONFIRM & ADD TO CALENDAR"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
