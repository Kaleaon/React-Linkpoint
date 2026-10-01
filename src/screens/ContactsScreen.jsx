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
  fetchGoogleContacts,
  addSLFriendToGoogleContacts,
  deleteGoogleContact,
  generateAvatarCanvasPhotoBase64,
  getGoogleAccessToken,
  GoogleContact,
} from "../services/googleContacts.ts";

export default function ContactsScreen() {
  const { V, t } = useTheme();
  const { state, actions } = useApp();

  const [googleUser, setGoogleUser] = useState(auth.currentUser);
  const [token, setToken] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");

  // Confirmation Modal State (MANDATORY for user data modifications)
  const [confirmModal, setConfirmModal] = useState(null);

  const [actionInProgress, setActionInProgress] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);

  // Second Life Friends from linkpoint core
  const [slFriends, setSlFriends] = useState(() => app.friends.getFriends());

  useEffect(() => {
    const updateSlFriends = () => setSlFriends(app.friends.getFriends());
    app.friends.on("friend_added", updateSlFriends);
    app.friends.on("friend_updated", updateSlFriends);
    app.friends.on("friend_removed", updateSlFriends);
    app.protocol.on("friends_loaded", updateSlFriends);
    void app.loadFriends();
    return () => {
      app.friends.off("friend_added", updateSlFriends);
      app.friends.off("friend_updated", updateSlFriends);
      app.friends.off("friend_removed", updateSlFriends);
      app.protocol.off("friends_loaded", updateSlFriends);
    };
  }, []);

  // Initialize Google Auth listener
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, accessToken) => {
        setGoogleUser(user);
        setToken(accessToken);
        void loadContacts();
      },
      () => {
        setGoogleUser(null);
        setToken(null);
        setContacts([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      const list = await fetchGoogleContacts();
      setContacts(list);
    } catch (err) {
      console.warn("[ContactsScreen] Failed to load contacts:", err);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const res = await signInWithGoogle();
      setGoogleUser(res.user);
      setToken(res.accessToken);
      await loadContacts();
      actions.notify("Signed in to Google Contacts successfully");
    } catch (err) {
      actions.notify(`Google Sign-In failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogle();
    setGoogleUser(null);
    setToken(null);
    setContacts([]);
    actions.notify("Signed out of Google Contacts");
  };

  // Check if a friend is already in Google Contacts
  const isFriendSynced = (friend) => {
    const friendId = String(friend.id || "").toLowerCase();
    const friendName = String(friend.name || "").toLowerCase();
    return contacts.some(
      (c) =>
        (c.slUuid && c.slUuid.toLowerCase() === friendId) ||
        (c.displayName && c.displayName.toLowerCase() === friendName) ||
        (c.slName && c.slName.toLowerCase() === friendName)
    );
  };

  // Open confirmation modal for adding an SL friend
  const requestAddFriend = (friend) => {
    const previewPhoto = generateAvatarCanvasPhotoBase64(friend);
    setConfirmModal({
      open: true,
      type: "add_single",
      title: `Add ${friend.name} to Google Contacts?`,
      description: `This will create a new contact in your Google Account (${googleUser?.email || "Google"}) with their Second Life resident name, UUID (${friend.id.slice(0, 8)}...), grid details, and their avatar icon/photo.`,
      friend,
      previewPhoto,
      onConfirm: async () => {
        setActionInProgress(true);
        try {
          await addSLFriendToGoogleContacts(friend);
          await loadContacts();
          actions.notify(`Added ${friend.name} and avatar photo to Google Contacts!`);
          setConfirmModal(null);
        } catch (err) {
          actions.notify(`Failed to add contact: ${err.message}`);
        } finally {
          setActionInProgress(false);
        }
      },
    });
  };

  // Open confirmation modal for batch adding all SL friends
  const requestAddAllFriends = () => {
    const unadded = slFriends.filter((f) => !isFriendSynced(f));
    const targetFriends = unadded.length > 0 ? unadded : slFriends;

    setConfirmModal({
      open: true,
      type: "add_batch",
      title: `Add ${targetFriends.length} Second Life Friends to Google Contacts?`,
      description: `This will create or sync ${targetFriends.length} contact records in your Google Account (${googleUser?.email || "Google"}). Each contact will include resident credentials, grid details, and custom avatar profile photo badges.`,
      onConfirm: async () => {
        setActionInProgress(true);
        setBatchProgress({ current: 0, total: targetFriends.length });
        let successCount = 0;
        try {
          for (let i = 0; i < targetFriends.length; i++) {
            const friend = targetFriends[i];
            setBatchProgress({ current: i + 1, total: targetFriends.length });
            try {
              await addSLFriendToGoogleContacts(friend);
              successCount++;
            } catch (singleErr) {
              console.warn(`Failed to add ${friend.name}:`, singleErr);
            }
          }
          await loadContacts();
          actions.notify(`Added ${successCount} Second Life friends to Google Contacts!`);
          setConfirmModal(null);
        } finally {
          setActionInProgress(false);
          setBatchProgress(null);
        }
      },
    });
  };

  // Open confirmation modal for deleting a contact
  const requestDeleteContact = (contact) => {
    setConfirmModal({
      open: true,
      type: "delete",
      title: `Delete ${contact.displayName} from Google Contacts?`,
      description: `Are you sure you want to permanently remove this contact from your Google Account? This action cannot be undone.`,
      contact,
      onConfirm: async () => {
        setActionInProgress(true);
        try {
          await deleteGoogleContact(contact.resourceName);
          await loadContacts();
          actions.notify(`Deleted ${contact.displayName} from Google Contacts`);
          setConfirmModal(null);
        } catch (err) {
          actions.notify(`Failed to delete contact: ${err.message}`);
        } finally {
          setActionInProgress(false);
        }
      },
    });
  };

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (activeTab === "SL_ONLY") {
      list = list.filter((c) => c.isSLContact);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.organization?.toLowerCase().includes(q) ||
          c.slUuid?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contacts, activeTab, searchQuery]);

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
      {/* Top Bar / Header */}
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
            <Icon name="contact" size={18} />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.04em" }}>
              GOOGLE CONTACTS SYNC
            </div>
            <div style={{ fontSize: "11px", color: V.ink2 }}>
              {googleUser
                ? `Connected as ${googleUser.email}`
                : "Connect your Google account to sync Second Life residents & avatar photos"}
            </div>
          </div>
        </div>

        {googleUser ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={loadContacts}
              disabled={loadingContacts}
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
              title="Refresh contacts from Google"
            >
              <Icon name="rotate-cw" size={13} />
              {loadingContacts ? "REFRESHING…" : "REFRESH"}
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
          /* Official Google Sign-In Button as mandated by workspace skill */
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
              boxSizing: "border-box",
              color: "#e3e3e3",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Roboto', arial, sans-serif",
              fontSize: "13px",
              fontWeight: 500,
              height: "36px",
              letterSpacing: "0.25px",
              outline: "none",
              overflow: "hidden",
              padding: "0 12px",
              position: "relative",
              verticalAlign: "middle",
              whiteSpace: "nowrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            </div>
          </button>
        )}
      </div>

      {!googleUser ? (
        /* Not Logged In Promo State */
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            textAlign: "center",
            background: V.surf,
            border: `1px dashed ${V.outv}`,
            borderRadius: V.rs,
            gap: 16,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: V.sec || "#1e293b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: V.pri,
            }}
          >
            <Icon name="users" size={28} />
          </div>
          <div style={{ maxWidth: 460 }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px 0" }}>
              Sync Second Life Contacts to Google
            </h2>
            <p style={{ fontSize: "13px", color: V.ink2, lineHeight: 1.5, margin: 0 }}>
              With your permission, Linkpoint can export your Second Life friends list directly into
              your Google Contacts, along with their resident UUIDs, profile information, and custom
              avatar icon/photo.
            </p>
          </div>

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
              fontSize: "14px",
              fontWeight: 500,
              height: "40px",
              padding: "0 16px",
              gap: 10,
            }}
          >
            <svg
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 48 48"
              style={{ width: "20px", height: "20px", display: "block" }}
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
            <span>Sign in with Google</span>
          </button>
        </div>
      ) : (
        /* Authenticated Contacts View */
        <>
          {/* Controls & Sub-Tabs */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { key: "ALL", label: `ALL (${contacts.length})` },
                {
                  key: "SL_ONLY",
                  label: `SL RESIDENTS (${contacts.filter((c) => c.isSLContact).length})`,
                },
                { key: "ADD_SL", label: `ADD FROM SL (${slFriends.length})` },
              ].map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as any)}
                    style={{
                      padding: "6px 12px",
                      fontSize: "11px",
                      fontWeight: 700,
                      background: active ? V.pri : V.surf,
                      color: active ? V.onpri : V.ink,
                      border: `1px solid ${active ? V.pri : V.outv}`,
                      borderRadius: V.rs,
                      cursor: "pointer",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Quick Actions & Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end", minWidth: 260 }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                style={{
                  padding: "6px 10px",
                  fontSize: "12px",
                  background: V.surf,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  color: V.ink,
                  outline: "none",
                  width: "160px",
                }}
              />

              {slFriends.length > 0 && (
                <button
                  type="button"
                  onClick={requestAddAllFriends}
                  style={{
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 700,
                    background: V.pri,
                    color: V.onpri,
                    border: 0,
                    borderRadius: V.rs,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="user-plus" size={13} />
                  SYNC ALL SL FRIENDS
                </button>
              )}
            </div>
          </div>

          {/* Tab: ADD FROM SECOND LIFE */}
          {activeTab === "ADD_SL" ? (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {slFriends.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: V.ink2,
                    fontSize: "12px",
                    background: V.surf,
                    borderRadius: V.rs,
                  }}
                >
                  No Second Life friends loaded. Log in to a grid or refresh friends list.
                </div>
              ) : (
                slFriends.map((friend) => {
                  const synced = isFriendSynced(friend);
                  const avatarThumb = generateAvatarCanvasPhotoBase64(friend);
                  return (
                    <div
                      key={friend.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: V.surf,
                        border: `1px solid ${V.outv}`,
                        borderRadius: V.rs,
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {/* Avatar photo preview thumbnail */}
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: "50%",
                            overflow: "hidden",
                            border: `1.5px solid ${friend.onlineStatus === "online" ? "#22c55e" : V.outv}`,
                            flexShrink: 0,
                          }}
                        >
                          <img
                            src={`data:image/jpeg;base64,${avatarThumb}`}
                            alt={friend.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "13px", color: V.ink }}>
                            {friend.name}
                          </div>
                          <div style={{ fontSize: "11px", color: V.ink2, display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ color: friend.onlineStatus === "online" ? "#22c55e" : V.ink2 }}>
                              ● {friend.onlineStatus || "offline"}
                            </span>
                            <span>UUID: {friend.id.slice(0, 8)}…</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {synced ? (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#22c55e",
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              background: "rgba(34,197,94,0.1)",
                              padding: "4px 8px",
                              borderRadius: V.rs,
                            }}
                          >
                            <Icon name="check" size={13} />
                            IN GOOGLE
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => requestAddFriend(friend)}
                          style={{
                            padding: "6px 12px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: synced ? V.surf : V.pri,
                            color: synced ? V.ink : V.onpri,
                            border: `1px solid ${synced ? V.outv : V.pri}`,
                            borderRadius: V.rs,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Icon name="user-plus" size={13} />
                          {synced ? "RE-SYNC PHOTO" : "ADD TO GOOGLE"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Tab: GOOGLE CONTACTS LIST */
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {loadingContacts ? (
                <div style={{ padding: 24, textAlign: "center", color: V.ink2, fontSize: "12px" }}>
                  Loading Google Contacts…
                </div>
              ) : filteredContacts.length === 0 ? (
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
                  {searchQuery ? `No contacts match “${searchQuery}”` : "No Google Contacts found in this filter."}
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <div
                    key={contact.resourceName}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: V.surf,
                      border: `1px solid ${V.outv}`,
                      borderRadius: V.rs,
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {/* Contact Photo Thumbnail */}
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          overflow: "hidden",
                          background: V.sec || "#334155",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: V.pri,
                          flexShrink: 0,
                        }}
                      >
                        {contact.photoUrl ? (
                          <img
                            src={contact.photoUrl}
                            alt={contact.displayName}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ fontWeight: 700, fontSize: "14px" }}>
                            {contact.displayName.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: "13px", color: V.ink }}>
                            {contact.displayName}
                          </span>
                          {contact.isSLContact && (
                            <span
                              style={{
                                fontSize: "9px",
                                fontWeight: 800,
                                background: V.pri,
                                color: V.onpri,
                                padding: "2px 5px",
                                borderRadius: 3,
                                letterSpacing: "0.06em",
                              }}
                            >
                              SECOND LIFE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", color: V.ink2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {contact.email && <span>{contact.email}</span>}
                          {contact.phone && <span>{contact.phone}</span>}
                          {contact.slUuid && <span>UUID: {contact.slUuid.slice(0, 8)}…</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {contact.isSLContact && (
                        <button
                          type="button"
                          onClick={() => actions.startIm(contact.slName || contact.displayName)}
                          style={{
                            padding: "4px 8px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: V.surf2 || V.surf,
                            border: `1px solid ${V.outv}`,
                            borderRadius: V.rs,
                            color: V.pri,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                          title="Instant Message in Second Life"
                        >
                          <Icon name="message-square" size={12} />
                          IM
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => requestDeleteContact(contact)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "11px",
                          background: "transparent",
                          border: `1px solid ${V.outv}`,
                          borderRadius: V.rs,
                          color: "#ef4444",
                          cursor: "pointer",
                        }}
                        title="Delete from Google Contacts"
                      >
                        <Icon name="trash-2" size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal (MANDATORY User Confirmation Dialog) */}
      {confirmModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
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
                  background: confirmModal.type === "delete" ? "#ef4444" : V.pri,
                  color: confirmModal.type === "delete" ? "#ffffff" : V.onpri,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={confirmModal.type === "delete" ? "trash-2" : "user-plus"} size={17} />
              </div>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: V.ink }}>
                {confirmModal.title}
              </h3>
            </div>

            {/* Avatar thumbnail preview if available */}
            {confirmModal.previewPhoto && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: V.bg, padding: 10, borderRadius: V.rs }}>
                <img
                  src={`data:image/jpeg;base64,${confirmModal.previewPhoto}`}
                  alt="Avatar preview"
                  style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
                />
                <div>
                  <div style={{ fontWeight: 700, fontSize: "12px", color: V.ink }}>
                    User Icon / Profile Photo
                  </div>
                  <div style={{ fontSize: "10.5px", color: V.ink2 }}>
                    Will be uploaded to Google People API
                  </div>
                </div>
              </div>
            )}

            <p style={{ margin: 0, fontSize: "12px", color: V.ink2, lineHeight: 1.45 }}>
              {confirmModal.description}
            </p>

            {batchProgress && (
              <div style={{ fontSize: "11px", color: V.pri, fontWeight: 700 }}>
                Uploading: {batchProgress.current} / {batchProgress.total} contacts…
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
                  background: confirmModal.type === "delete" ? "#ef4444" : V.pri,
                  color: confirmModal.type === "delete" ? "#ffffff" : V.onpri,
                  border: 0,
                  borderRadius: V.rs,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {actionInProgress && <Icon name="loader" size={13} />}
                {confirmModal.type === "delete" ? "DELETE" : "CONFIRM & ADD"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
