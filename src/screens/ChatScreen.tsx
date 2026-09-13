import React, { useMemo, useRef, useState } from 'react';
import { Link2, Send, Volume1, Volume2, VolumeX } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { ChipRail, SegTabs, ScreenTitle } from '../ui/primitives';
import { merge } from '../ui/styles';
import { CHAT_GROUP, CHAT_IM, CHAT_LOCAL } from '../data/slData';
import { CHAT_RANGE, legacyName, type ChatMessage, type ChatVolume } from '../data/slTypes';
import { RLV_REDACTED, useRlv } from '../viewer/RlvContext';
import { AGENT, CURRENT_REGION } from '../data/slData';
import { RlvNote } from '../ui/RlvBlocked';

type ChatTab = 'LOCAL' | 'IM' | 'GROUP';

/** Volume control: whisper 10m, say 20m, shout 100m, exactly as the sim enforces. */
const VOLUMES: { id: ChatVolume; icon: typeof Volume1; label: string }[] = [
  { id: 'whisper', icon: VolumeX, label: 'WHISPER' },
  { id: 'say', icon: Volume1, label: 'SAY' },
  { id: 'shout', icon: Volume2, label: 'SHOUT' },
];

/**
 * Parse the channel and slash commands every viewer supports, so the compose
 * bar behaves the way a resident's muscle memory expects:
 *   /me <text>       emote on the current channel
 *   /<n> <text>      send on channel n, which local chat never displays
 *   /shout, /whisper set the volume for this one message
 */
export function parseChatInput(raw: string, volume: ChatVolume): { channel: number; text: string; emote: boolean; volume: ChatVolume } {
  let text = raw;
  let channel = 0;
  let emote = false;
  let vol = volume;

  const channelMatch = text.match(/^\/(\d+)\s+(.*)$/s);
  if (channelMatch) {
    channel = parseInt(channelMatch[1], 10);
    text = channelMatch[2];
  }

  const volumeMatch = text.match(/^\/(shout|whisper|say)\s+(.*)$/is);
  if (volumeMatch) {
    vol = volumeMatch[1].toLowerCase() as ChatVolume;
    text = volumeMatch[2];
  }

  const emoteMatch = text.match(/^\/me\s+(.*)$/is);
  if (emoteMatch) {
    emote = true;
    text = emoteMatch[1];
  }

  return { channel, text, emote, volume: vol };
}

const ChatScreen: React.FC = () => {
  const t = useTheme();
  const rlv = useRlv();
  const [tab, setTab] = useState<ChatTab>('LOCAL');
  const [chip, setChip] = useState('Nyx Vaher');
  const [volume, setVolume] = useState<ChatVolume>('say');
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<ChatMessage[]>([]);
  const nextId = useRef(0);

  const messages = useMemo<ChatMessage[]>(() => {
    const base =
      tab === 'LOCAL' ? CHAT_LOCAL : tab === 'IM' ? CHAT_IM[chip] || [] : CHAT_GROUP[chip] || CHAT_GROUP['Bay City Builders'];
    return [...base, ...sent.filter((m) => m.id.startsWith(tab))];
  }, [tab, chip, sent]);

  const imChips = useMemo(
    () =>
      tab === 'IM'
        ? [
            { label: 'Nyx Vaher', dot: t.v.ok },
            { label: 'Kit Sandalwood', dot: t.v.ok, badge: 2 },
            { label: 'Sable Ashgrove', dot: t.v.ink2 },
          ]
        : tab === 'GROUP'
          ? [
              { label: 'Bay City Builders', badge: 4 },
              { label: 'Sansara Cartographers' },
              { label: 'Terraform Co-op', badge: 12 },
            ]
          : [],
    [tab, t.v.ok, t.v.ink2],
  );

  // Local chat and IMs are restricted independently, so which one is in force
  // depends on the tab the resident is composing in.
  const sendLock = tab === 'LOCAL' ? 'sendchat' : 'sendim';
  const sendBlocked = rlv.restricted(sendLock);

  const send = () => {
    // The restriction is enforced here as well as on the control, so a stray
    // Enter key cannot get a message out past a disabled button.
    if (sendBlocked) return;
    const body = draft.trim();
    if (!body) return;
    const parsed = parseChatInput(body, volume);
    const id = `${tab}-${nextId.current++}`;
    setSent((s) => [
      ...s,
      {
        id,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        from: legacyName(AGENT),
        // A message sent on a non-zero channel is for scripts, not residents:
        // the viewer echoes it back so the resident sees it went somewhere.
        text: parsed.channel ? `[channel ${parsed.channel}] ${parsed.text}` : parsed.text,
        mine: true,
        emote: parsed.emote,
        volume: parsed.volume,
      },
    ]);
    setDraft('');
  };

  // @showloc=n reaches the chat header too: naming the region here would leak
  // exactly what the restriction exists to hide.
  const where = rlv.restricted('showloc') ? RLV_REDACTED : CURRENT_REGION.name;
  const subtitle =
    tab === 'LOCAL'
      ? `> ${legacyName(AGENT)} @ ${where} · ${volume} reaches ${CHAT_RANGE[volume]}m`
      : tab === 'IM'
        ? `> ${chip} · instant message`
        : `> ${chip} · group session`;

  return (
    <>
      <ScreenTitle title="CHAT" subtitle={subtitle} />

      <SegTabs
        tabs={[{ label: 'LOCAL' }, { label: 'IM', badge: 3 }, { label: 'GROUP', badge: 1 }]}
        value={tab}
        onChange={(v) => {
          setTab(v as ChatTab);
          if (v === 'IM') setChip('Nyx Vaher');
          if (v === 'GROUP') setChip('Bay City Builders');
        }}
      />

      {imChips.length > 0 && <ChipRail chips={imChips} value={chip} onChange={setChip} />}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '2px 16px 12px' }}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 12px 12px',
          borderTop: `1px solid ${t.v.outv}`,
          background: t.v.surf,
        }}
      >
        {tab === 'LOCAL' && (
          <div style={{ display: 'flex', flex: 'none', border: `1px solid ${t.v.outv}`, borderRadius: t.v.rs, overflow: 'hidden' }}>
            {VOLUMES.map((v) => {
              const Icon = v.icon;
              const on = v.id === volume;
              return (
                <button
                  key={v.id}
                  type="button"
                  title={`${v.label} — ${CHAT_RANGE[v.id]}m`}
                  aria-label={`${v.label}, reaches ${CHAT_RANGE[v.id]} metres`}
                  aria-pressed={on}
                  onClick={() => setVolume(v.id)}
                  style={{
                    width: '36px',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    cursor: 'pointer',
                    background: on ? t.v.priC : 'transparent',
                    color: on ? t.v.onpriC : t.v.ink2,
                  }}
                >
                  <Icon size={16} strokeWidth={1.8} />
                </button>
              );
            })}
          </div>
        )}

        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={sendBlocked}
          placeholder={sendBlocked ? 'Restricted by RLV' : tab === 'LOCAL' ? 'Say something — /me, /1, /shout' : `Message ${chip}`}
          aria-label="Chat message"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: '44px',
            boxSizing: 'border-box',
            padding: '0 12px',
            border: `1px solid ${t.v.outv}`,
            borderRadius: t.v.rs,
            background: t.v.bg,
            color: t.v.ink,
            font: `400 16px/1.4 ${t.font}`,
            outline: 'none',
          }}
        />

        <button
          type="button"
          onClick={send}
          disabled={sendBlocked}
          aria-label="Send"
          style={{
            width: '44px',
            height: '44px',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: t.v.rs,
            background: sendBlocked ? t.v.surf2 : t.v.pri,
            color: sendBlocked ? t.v.ink2 : t.v.onpri,
            cursor: sendBlocked ? 'not-allowed' : 'pointer',
          }}
        >
          <Send size={17} strokeWidth={1.9} />
        </button>
      </div>

      {sendBlocked && (
        <div style={{ flex: 'none', padding: '0 12px 10px' }}>
          <RlvNote restriction={sendLock} />
        </div>
      )}
    </>
  );
};

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message: m }) => {
  const t = useTheme();

  const bubble = merge(
    { maxWidth: '88%', padding: '8px 10px', border: `1px solid ${t.v.outv}`, borderRadius: t.v.rp, background: t.v.surf },
    m.mine ? { background: t.v.priC, borderColor: t.v.pri } : null,
    m.system ? { background: 'transparent', borderStyle: 'dashed', borderColor: t.v.info } : null,
  );
  const headColor = m.system ? t.v.info : m.mine ? t.v.onpriC : t.v.pri;
  const textColor = m.system ? t.v.info : m.mine ? t.v.onpriC : t.v.ink;

  return (
    <div style={{ width: '100%', display: 'flex', justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
      <div style={bubble}>
        <div style={{ font: `400 10px/1.3 ${t.font}`, color: headColor, marginBottom: '3px' }}>
          {m.time} · {m.from}
          {m.volume && m.volume !== 'say' && ` · ${m.volume}`}
        </div>

        <div
          style={{
            font: `${m.emote ? 'italic 400' : '400'} var(--body, 13px)/1.45 ${t.font}`,
            color: textColor,
          }}
        >
          {/* An emote reads as "Name does thing", never as a quoted line. */}
          {m.emote ? `${m.from} ${m.text}` : m.text}
        </div>

        {m.link && (
          <a
            href={m.link.url}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '7px',
              padding: '6px 8px',
              border: `1px solid ${t.v.info}`,
              borderRadius: t.v.rs,
              font: `500 11px/1 ${t.font}`,
              color: t.v.info,
              textDecoration: 'none',
            }}
          >
            <Link2 size={12} strokeWidth={2} />
            {m.link.title}
          </a>
        )}
      </div>
    </div>
  );
};

export default ChatScreen;
