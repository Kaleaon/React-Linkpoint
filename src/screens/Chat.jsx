import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { app } from "../linkpoint/app.ts";
import { useApp } from "../context/AppContext.jsx";
import Icon from "../components/Icon.jsx";

function formatTime(timestamp) {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Local chat backed only by ChatManager's received and persisted messages. */
export default function Chat() {
  const { V, t } = useTheme();
  const { state } = useApp();
  const [messages, setMessages] = useState(() => [...app.chat.messages]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const refresh = () => setMessages([...app.chat.messages]);
    app.chat.on("message_received", refresh);
    app.chat.on("message_sent", refresh);
    app.chat.on("history_cleared", refresh);
    refresh();
    return () => {
      app.chat.off("message_received", refresh);
      app.chat.off("message_sent", refresh);
      app.chat.off("history_cleared", refresh);
    };
  }, []);

  const offline = state.loginMode === "offline";
  const canSend = (app.auth.isLoggedIn() || offline) && draft.trim().length > 0;
  const ordered = useMemo(() => [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)), [messages]);
  const send = async () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    if (offline) {
      app.chat.addMessage({ id: crypto.randomUUID(), sender: "You", text, timestamp: Date.now(), type: "local-offline" });
      app.chat.emit("message_sent");
    } else {
      await app.chat.sendMessage(text);
    }
  };

  return (
    <section className="live-screen">
      <div className="live-list" aria-live="polite">
        {ordered.length ? ordered.map((message) => {
          const mine = message.senderId && message.senderId === app.auth.user?.id;
          return (
            <article className={`chat-message${mine ? " mine" : ""}`} key={message.id || `${message.timestamp}-${message.sender}`} style={{ borderColor: V.outv, background: mine ? V.priC : V.surf }}>
              <div style={{ color: V.pri, font: `600 10px/1.3 ${t.font}` }}>{message.sender || "Unknown"} · {formatTime(message.timestamp)}</div>
              <div style={{ marginTop: 4, font: `400 13px/1.45 ${t.font}` }}>{message.text}</div>
            </article>
          );
        }) : <Empty text={app.auth.isLoggedIn() || offline ? "No local chat has been received in this session." : "Connect to a grid to receive local chat."} />}
      </div>
      <div className="composer" style={{ borderColor: V.outv, background: V.surf }}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void send()}
          placeholder={app.auth.isLoggedIn() || offline ? "Say to local chat" : "Grid connection required"}
          disabled={!app.auth.isLoggedIn() && !offline}
          aria-label="Local chat message"
        />
        <button type="button" onClick={() => void send()} disabled={!canSend} style={{ background: V.pri, color: V.onpri }} aria-label="Send local chat message"><Icon name="send" size={18} /></button>
      </div>
    </section>
  );
}

function Empty({ text }) {
  return <div className="honest-empty"><Icon name="message-square" size={28} /><p>{text}</p></div>;
}
