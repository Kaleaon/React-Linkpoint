import { useEffect, useRef, useState, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import Icon from './Icon.jsx';

/**
 * Unified Adaptive Accessible Chat Container Component
 *
 * Provides WCAG 2.2 compliant ARIA live region stream log container for spatial chat,
 * group chat, and instant messages.
 *
 * Standards:
 * - WCAG 2.2 SC 4.1.3 Status Messages (Level AA) via role="log" and aria-live="polite" (ARIA19, ARIA22)
 * - WCAG 2.2 SC 1.4.3 Contrast (Minimum) (Level AA) via high-contrast text on rgba(18, 18, 20, 0.85) scrims (G18)
 * - Zero focus stealing on incoming message stream
 * - Auto-scroll freeze toggle to prevent focus disruption during history review
 *
 * @param {Object} props
 * @param {Array} [props.messages]
 * @param {'overlay' | 'embedded'} [props.variant]
 * @param {string} [props.activeTab]
 * @param {string} [props.ariaLabel]
 * @param {React.ReactNode} [props.emptyStateMessage]
 * @param {string | number} [props.maxHeight]
 * @param {Object} [props.style]
 * @param {boolean} [props.showFreezeToggle]
 */
export default function AccessibleChatLog({
  messages = [],
  variant = 'embedded',
  activeTab = 'LOCAL',
  ariaLabel = undefined,
  emptyStateMessage = undefined,
  maxHeight = undefined,
  style = {},
  showFreezeToggle = true,
}) {
  const { V, t } = useTheme();
  const { state } = useApp();
  const showTimestamps = state.toggles.timestamps;
  const containerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [isFrozen, setIsFrozen] = useState(false);

  const formattedMessages = useMemo(() => {
    return (messages || []).map((message) => ({
      ...message,
      time:
        showTimestamps && message.timestamp
          ? new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
    }));
  }, [messages, showTimestamps]);

  // Handle auto-scroll when new messages arrive and freeze is disabled
  useEffect(() => {
    if (!isFrozen && messagesEndRef.current?.scrollIntoView) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [formattedMessages.length, isFrozen]);

  // Detect manual user scroll to auto-freeze scroll when reading history
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 25;
    if (!isAtBottom && !isFrozen) {
      setIsFrozen(true);
    } else if (isAtBottom && isFrozen) {
      setIsFrozen(false);
    }
  };

  const isOverlay = variant === 'overlay';

  // Contrast tokens per Technique G18 & WCAG 1.4.3 (Minimum 4.5:1 ratio)
  const containerBg = isOverlay ? 'rgba(18, 18, 20, 0.85)' : V.bg;
  const cardBg = isOverlay ? 'rgba(28, 28, 32, 0.9)' : V.surf;
  const borderColor = isOverlay ? 'rgba(255, 255, 255, 0.2)' : V.outv;
  const primaryTextColor = isOverlay ? '#FFFFFF' : V.ink;
  const headerTextColor = isOverlay ? '#F3F4F6' : V.pri;
  const autoReplyColor = '#FACC15'; // High contrast yellow (> 4.5:1 against dark scrim)
  const badgeTextColor = isOverlay ? '#FFFFFF' : V.ink2;

  const defaultLabel = ariaLabel || `${activeTab} chat log`;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        borderRadius: isOverlay ? V.rs : 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Optional Log Controls / Auto-Scroll Freeze Toggle */}
      {showFreezeToggle && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            background: isOverlay ? 'rgba(18, 18, 20, 0.95)' : V.surf,
            borderBottom: `1px solid ${borderColor}`,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              color: headerTextColor,
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name="message-square" size={12} />
            {isOverlay ? 'SPATIAL CHAT OVERLAY' : `${activeTab} LOG`}
          </span>
          <button
            type="button"
            aria-pressed={isFrozen}
            onClick={() => {
              const nextState = !isFrozen;
              setIsFrozen(nextState);
              if (!nextState && messagesEndRef.current?.scrollIntoView) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            style={{
              padding: '2px 8px',
              fontSize: '10px',
              fontWeight: 700,
              background: isFrozen
                ? isOverlay
                  ? '#374151'
                  : V.pri
                : isOverlay
                  ? 'rgba(255, 255, 255, 0.1)'
                  : V.bg,
              color: isFrozen ? (isOverlay ? '#FFFFFF' : V.onpri) : headerTextColor,
              border: `1px solid ${borderColor}`,
              borderRadius: V.rs,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={
              isFrozen
                ? 'Resume auto-scrolling on new messages'
                : 'Freeze auto-scrolling to review history'
            }
          >
            <Icon name={isFrozen ? 'pause' : 'arrow-down'} size={11} />
            {isFrozen ? 'SCROLL FROZEN' : 'AUTO-SCROLL ON'}
          </button>
        </div>
      )}

      {/* ARIA Live Region Log Container */}
      <section
        ref={containerRef}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label={defaultLabel}
        tabIndex={0}
        onScroll={handleScroll}
        style={{
          flex: 1,
          minHeight: 0,
          maxHeight: maxHeight || '100%',
          overflowY: 'auto',
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: containerBg,
          backdropFilter: isOverlay ? 'blur(8px)' : 'none',
        }}
      >
        {!formattedMessages.length && (
          <div
            style={{
              color: badgeTextColor,
              margin: 'auto',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: 12,
              fontSize: '12px',
            }}
          >
            <Icon name="message-square" size={22} />
            <div>{emptyStateMessage || 'No messages.'}</div>
          </div>
        )}

        {formattedMessages.map((m) => {
          return (
            <article
              key={m.id || `${m.timestamp}-${m.sender}-${m.text}`}
              style={{
                alignSelf: 'stretch',
                padding: '6px 8px',
                border: `1px solid ${m.isAutoReply ? autoReplyColor : borderColor}`,
                borderRadius: V.rp || '6px',
                background: m.isAutoReply ? 'rgba(234, 179, 8, 0.15)' : cardBg,
                boxShadow: isOverlay ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
              }}
            >
              <header
                style={{
                  color: m.isAutoReply ? autoReplyColor : headerTextColor,
                  font: `600 11px/1.3 ${t.font}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span>
                  {m.time ? `[${m.time}] ` : ''}
                  {m.sender || 'Resident'}
                  {m.recipientName ? ` → ${m.recipientName}` : ''}
                </span>
                <span style={{ opacity: 0.9, fontSize: '9px', textTransform: 'uppercase' }}>
                  {m.isAutoReply ? 'AUTO-REPLY' : m.type || activeTab}
                </span>
              </header>
              <div
                style={{
                  color: primaryTextColor,
                  font: `400 13px/1.45 ${t.font}`,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  marginTop: 3,
                }}
              >
                {m.text}
              </div>
            </article>
          );
        })}
        <div ref={messagesEndRef} />
      </section>
    </div>
  );
}
