import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import Icon from '../components/Icon.jsx';
import FocusRing from '../components/FocusRing';

export default function CapabilityExplorer() {
  const { V, t } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const handleCapsChange = () => setTick((v) => v + 1);

    if (app?.protocol?.on) {
      app.protocol.on('capabilities_ready', handleCapsChange);
      app.protocol.on('capabilities_fetched', handleCapsChange);
      app.protocol.on('diagnostics_updated', handleCapsChange);
      app.protocol.on('connected', handleCapsChange);
      app.protocol.on('disconnected', handleCapsChange);
      app.protocol.on('logout', handleCapsChange);
    }

    return () => {
      if (app?.protocol?.off) {
        app.protocol.off('capabilities_ready', handleCapsChange);
        app.protocol.off('capabilities_fetched', handleCapsChange);
        app.protocol.off('diagnostics_updated', handleCapsChange);
        app.protocol.off('connected', handleCapsChange);
        app.protocol.off('disconnected', handleCapsChange);
        app.protocol.off('logout', handleCapsChange);
      }
    };
  }, []);

  const isConnected = Boolean(
    app?.protocol?.connected ||
    (typeof app?.auth?.isLoggedIn === 'function' && app.auth.isLoggedIn()),
  );

  const allCapabilities = useMemo(() => {
    // Rely on tick to refresh if capabilities reference mutated in place
    void tick;
    const rawCaps = app?.protocol?.capabilities;
    const capsObj = typeof rawCaps === 'object' && rawCaps !== null ? rawCaps : {};
    const entries = Object.keys(capsObj).map((name) => ({
      name,
      endpoint: capsObj[name] || '',
    }));
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [tick]);

  const totalCount = allCapabilities.length;

  const filteredCapabilities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return allCapabilities;
    return allCapabilities.filter((item) => {
      const matchName = item.name.toLowerCase().includes(query);
      const matchEndpoint = item.endpoint.toLowerCase().includes(query);
      return matchName || matchEndpoint;
    });
  }, [allCapabilities, searchQuery]);

  const filteredCount = filteredCapabilities.length;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 720,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${V.outv}`,
          paddingBottom: 12,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: V.pri,
              font: `700 18px/1.2 ${t.dfont}`,
              letterSpacing: '.08em',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="layers" size={22} />
            PROTOCOL CAPABILITY EXPLORER
          </h2>
          <div style={{ fontSize: 12, color: V.ink2, marginTop: 4 }}>
            Simulator capability endpoints negotiated during session handshake.
          </div>
        </div>

        {/* Count Indicators */}
        <div
          data-testid="capability-count-indicator"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: V.rs,
            background: V.surf,
            border: `1px solid ${V.outv}`,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.06em',
            color: V.pri,
          }}
        >
          <span data-testid="total-capability-count">
            {searchQuery.trim()
              ? `SHOWING ${filteredCount} OF ${totalCount} CAPABILITIES`
              : `${totalCount} ACTIVE CAPABILITIES`}
          </span>
        </div>
      </div>

      {/* Search Input Bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <Icon
            name="search"
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              color: V.ink2,
              pointerEvents: 'none',
            }}
          />
          <FocusRing ringColor={V.pri} borderRadius={V.rs}>
            <input
              id="capability-search-input"
              type="search"
              role="searchbox"
              aria-label="Search capabilities"
              placeholder="Search capabilities by name or endpoint…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 38,
                paddingLeft: 36,
                paddingRight: searchQuery ? 36 : 12,
                borderRadius: V.rs,
                border: `1px solid ${V.outv}`,
                background: V.surf,
                color: V.ink,
                font: `13px/1.4 ${t.font}`,
                outline: 'none',
              }}
            />
          </FocusRing>
          {searchQuery && (
            <FocusRing ringColor={V.pri} borderRadius="50%">
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  background: 'transparent',
                  border: 'none',
                  color: V.ink2,
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                }}
              >
                <Icon name="x" size={16} />
              </button>
            </FocusRing>
          )}
        </div>
      </div>

      {/* Main Content Area: List or Empty States */}
      {!isConnected ? (
        <div
          role="status"
          data-testid="capabilities-disconnected-state"
          style={{
            textAlign: 'center',
            padding: '36px 16px',
            background: V.surf,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="wifi-off" size={32} style={{ color: V.ink2 }} />
          <div style={{ color: V.pri, fontWeight: 700, fontSize: 14 }}>Disconnected from Grid</div>
          <div style={{ color: V.ink2, fontSize: 12, maxWidth: 360 }}>
            Connect to a simulator to inspect active protocol capabilities.
          </div>
        </div>
      ) : totalCount === 0 ? (
        <div
          role="status"
          data-testid="capabilities-empty-session-state"
          style={{
            textAlign: 'center',
            padding: '36px 16px',
            background: V.surf,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="inbox" size={32} style={{ color: V.ink2 }} />
          <div style={{ color: V.pri, fontWeight: 700, fontSize: 14 }}>
            No Capabilities Available
          </div>
          <div style={{ color: V.ink2, fontSize: 12, maxWidth: 360 }}>
            No active capabilities received from the simulator session.
          </div>
        </div>
      ) : filteredCount === 0 ? (
        <div
          role="status"
          data-testid="capabilities-no-matches-state"
          style={{
            textAlign: 'center',
            padding: '36px 16px',
            background: V.surf,
            border: `1px solid ${V.outv}`,
            borderRadius: V.rs,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="search-x" size={32} style={{ color: V.ink2 }} />
          <div style={{ color: V.pri, fontWeight: 700, fontSize: 14 }}>
            No matching capabilities
          </div>
          <div style={{ color: V.ink2, fontSize: 12, maxWidth: 360 }}>
            No capabilities match &ldquo;{searchQuery}&rdquo;. Try a different search term.
          </div>
          <FocusRing ringColor={V.pri} borderRadius={V.rs}>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                marginTop: 8,
                padding: '6px 14px',
                background: V.pri,
                color: V.onpri,
                border: 'none',
                borderRadius: V.rs,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Clear Search
            </button>
          </FocusRing>
        </div>
      ) : (
        <div
          data-testid="capability-list"
          role="list"
          aria-label="Capabilities list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            contain: 'content',
          }}
        >
          {filteredCapabilities.map((item) => {
            const hasEndpoint =
              typeof item.endpoint === 'string' && item.endpoint.trim().length > 0;
            const endpointDisplay = hasEndpoint ? item.endpoint : '—';

            return (
              <div
                key={item.name}
                role="listitem"
                data-testid={`capability-item-${item.name}`}
                style={{
                  background: V.surf,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  contentVisibility: 'auto',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span
                    data-testid="capability-name"
                    style={{
                      font: `700 13px/1.3 ${t.font}`,
                      color: V.pri,
                      wordBreak: 'break-all',
                    }}
                  >
                    {item.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.06em',
                      color: hasEndpoint ? V.ok || V.pri : V.ink2,
                      padding: '2px 6px',
                      borderRadius: 3,
                      background: V.sec2,
                      flexShrink: 0,
                    }}
                  >
                    {hasEndpoint ? 'ACTIVE' : 'NO ENDPOINT'}
                  </span>
                </div>
                <div
                  data-testid="capability-endpoint"
                  style={{
                    font: `11px/1.4 monospace`,
                    color: hasEndpoint ? V.ink2 : V.ink2,
                    wordBreak: 'break-all',
                    userSelect: 'all',
                  }}
                >
                  {endpointDisplay}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
