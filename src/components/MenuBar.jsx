import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { FMENU, FLOATERS } from '../theme/constants.js';
import { app } from '../linkpoint/app.ts';
import { slBridge } from '../linkpoint/sl-bridge.ts';
import { deskKind } from '../theme/deskStyle.js';
import Icon from './Icon.jsx';
import ViewModeSwitcher from './ViewModeSwitcher.jsx';
import { formatLatency, liveRegionName, formatSlt } from './menuStatus.js';

/**
 * MenuBar component provides an accessible desktop menu bar with dropdowns.
 *
 * Complies with WCAG 2.2 Level A standards:
 * - WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard)
 * - WCAG 2.2 SC 4.1.2 Name, Role, Value (https://www.w3.org/TR/WCAG22/#name-role-value)
 * - WCAG 2.2 SC 1.3.1 Info and Relationships (https://www.w3.org/TR/WCAG22/#info-and-relationships)
 * - WCAG 2.2 SC 2.4.7 Focus Visible (https://www.w3.org/TR/WCAG22/#focus-visible)
 *
 * Applicable W3C Techniques:
 * - ARIA6: Using aria-label to provide labels for objects (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA6)
 * - ARIA11: Using ARIA landmarks to identify regions of a page (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA11)
 * - ARIA17: Using grouping roles to identify related controls (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA17)
 * - G202: Ensuring keyboard control for all functionality (https://www.w3.org/WAI/WCAG22/Techniques/general/G202)
 */
export default function MenuBar() {
  const { state, actions } = useApp();
  const { V, t, ink, isFloat } = useTheme();
  const topMenuRefs = useRef([]);
  const dropdownRefs = useRef({});

  if (!isFloat) return null;
  const kind = deskKind(t);

  const handleMenuClick = async (menuLabel, itemLabel) => {
    actions.setMenu(null);
    if (itemLabel === 'World Map') {
      actions.flFocus('Map');
      actions.setScreen('Map');
    } else if (itemLabel === 'Animation Overrider…' || itemLabel === 'Animation Overrider') {
      actions.flFocus('AO');
      actions.setScreen('AO');
    } else if (itemLabel === 'Cache Storage…') {
      actions.flFocus('Cache');
      actions.setScreen('Cache');
    } else if (itemLabel === 'Network Diagnostics…') {
      actions.flFocus('Diagnostics');
      actions.setScreen('Diagnostics');
    } else if (itemLabel === 'Teleport Home') {
      if (!app.auth.isLoggedIn()) {
        actions.notify('Connect to a grid to teleport home.');
        return;
      }
      slBridge.teleportHome().then(
        () => actions.notify('Teleport home requested'),
        (err) => actions.notify(err instanceof Error ? err.message : 'Could not teleport home'),
      );
    } else if (itemLabel === 'Preferences…') {
      actions.flFocus('Settings');
      actions.setScreen('Settings');
    } else if (itemLabel === 'Appearance…') {
      actions.setScreen('Outfits');
    } else if (itemLabel === 'Switch to Mobile Mode') {
      actions.setViewMode('mobile');
    } else if (itemLabel === 'Switch to Desktop Mode') {
      actions.setViewMode('desktop');
    } else if (itemLabel === 'About Linkpoint') {
      actions.notify('Linkpoint Viewer v2.0 (Firestorm Edition)');
    } else if (itemLabel === 'Quit') {
      if (app.auth.isLoggedIn()) await app.auth.logout();
      actions.setScreen('Login');
    } else {
      actions.notify(`${itemLabel.replace(/…$/, '')} is not available yet.`);
    }
  };

  return (
    <nav
      aria-label="Application Menu"
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'stretch',
        height: '28px',
        padding: '0 8px',
        background: kind === 'metro' ? V.bg : V.surf,
        borderBottom:
          kind === 'sweep'
            ? '2px solid ' + V.pri
            : kind === 'metro'
              ? 'none'
              : '1px solid ' + V.outv,
        position: 'relative',
        zIndex: 80,
      }}
      onClick={() => state.menu && actions.setMenu(null)}
    >
      <div role="menubar" style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
        {FMENU.map((mm, menuIdx) => {
          const open = state.menu === mm.label;
          const win = mm.items === 'WINDOWS';
          const items = win
            ? FLOATERS.map((f) => [f.title, state.flOpen[f.id] && !state.flMin[f.id] ? '✓' : ''])
            : mm.items;

          const handleTopKeyDown = (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) actions.setMenu(mm.label);
              setTimeout(() => {
                dropdownRefs.current[`${menuIdx}-0`]?.focus();
              }, 0);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              const nextIdx = (menuIdx + 1) % FMENU.length;
              if (open) actions.setMenu(FMENU[nextIdx].label);
              topMenuRefs.current[nextIdx]?.focus();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const prevIdx = (menuIdx - 1 + FMENU.length) % FMENU.length;
              if (open) actions.setMenu(FMENU[prevIdx].label);
              topMenuRefs.current[prevIdx]?.focus();
            } else if (e.key === 'Escape') {
              if (open) {
                e.preventDefault();
                actions.setMenu(null);
              }
            }
          };

          return (
            <div key={mm.label} style={{ position: 'relative' }}>
              <div
                ref={(el) => (topMenuRefs.current[menuIdx] = el)}
                role="menuitem"
                tabIndex={0}
                aria-haspopup="true"
                aria-expanded={open}
                aria-label={mm.label}
                onClick={(e) => {
                  e.stopPropagation();
                  actions.setMenu(state.menu === mm.label ? null : mm.label);
                }}
                onKeyDown={handleTopKeyDown}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: '100%',
                  padding: '0 10px',
                  cursor: 'pointer',
                  background: open ? V.pri : 'transparent',
                  color: open ? ink(V.pri, [V.bg, V.onpri, V.ink]) : V.ink,
                  font:
                    kind === 'sweep'
                      ? '700 11px/1 ' + t.dfont
                      : kind === 'metro'
                        ? '300 13px/1 ' + t.dfont
                        : '500 11px/1 ' + t.font,
                  letterSpacing: kind === 'sweep' ? '.12em' : kind === 'metro' ? '0' : '.04em',
                  borderRadius: kind === 'sweep' ? '999px' : kind === 'metro' ? 0 : V.rs,
                  textTransform:
                    kind === 'sweep' ? 'uppercase' : kind === 'metro' ? 'lowercase' : 'none',
                }}
              >
                {mm.label}
              </div>
              {open ? (
                <div
                  role="menu"
                  aria-label={mm.label}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '28px',
                    minWidth: '216px',
                    background: V.surf,
                    border: '1px solid ' + V.pri,
                    boxShadow: '0 14px 34px rgba(0,0,0,.55)',
                    padding: '3px 0',
                    zIndex: 90,
                    borderRadius: V.rp,
                    overflow: 'hidden',
                  }}
                >
                  {items.map((it, i) => {
                    const handleDropdownItemClick = (e) => {
                      e.stopPropagation();
                      if (win) {
                        const f = FLOATERS.find((x) => x.title === it[0]);
                        if (f) actions.flToggle(f.id);
                      } else {
                        void handleMenuClick(mm.label, it[0]);
                      }
                    };

                    const handleDropdownKeyDown = (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleDropdownItemClick(e);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        actions.setMenu(null);
                        topMenuRefs.current[menuIdx]?.focus();
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const nextItemIdx = (i + 1) % items.length;
                        dropdownRefs.current[`${menuIdx}-${nextItemIdx}`]?.focus();
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prevItemIdx = (i - 1 + items.length) % items.length;
                        dropdownRefs.current[`${menuIdx}-${prevItemIdx}`]?.focus();
                      } else if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        const nextMenuIdx = (menuIdx + 1) % FMENU.length;
                        actions.setMenu(FMENU[nextMenuIdx].label);
                        setTimeout(() => {
                          dropdownRefs.current[`${nextMenuIdx}-0`]?.focus();
                        }, 0);
                      } else if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        const prevMenuIdx = (menuIdx - 1 + FMENU.length) % FMENU.length;
                        actions.setMenu(FMENU[prevMenuIdx].label);
                        setTimeout(() => {
                          dropdownRefs.current[`${prevMenuIdx}-0`]?.focus();
                        }, 0);
                      }
                    };

                    return (
                      <div
                        key={i}
                        ref={(el) => (dropdownRefs.current[`${menuIdx}-${i}`] = el)}
                        role="menuitem"
                        tabIndex={0}
                        aria-label={it[0]}
                        onClick={handleDropdownItemClick}
                        onKeyDown={handleDropdownKeyDown}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          minHeight: '26px',
                          padding: '0 12px',
                          cursor: 'pointer',
                          font: '400 11.5px/1 ' + t.font,
                          color: V.ink,
                        }}
                      >
                        <span style={{ flex: 1, font: 'inherit' }}>{it[0]}</span>
                        <span
                          style={{
                            flex: 'none',
                            font: '400 10px/1 ' + t.font,
                            color: V.ink2,
                            letterSpacing: '.06em',
                          }}
                        >
                          {it[1]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {/* Second Life Viewer Status Indicators & Mobile Mode Switcher */}
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          font: '500 10.5px/1 ' + t.font,
          color: V.ink2,
          letterSpacing: '.06em',
        }}
      >
        <MenuStatus V={V} />

        <ViewModeSwitcher />
      </div>
    </nav>
  );
}

// Live status: region, measured latency and Second Life Time. Anything the
// session cannot supply is left out. Latency only appears once the simulator
// reports a ping, so a freshly connected session shows no number at all.
function MenuStatus({ V }) {
  const [, setTick] = useState(0);
  const loggedIn = app.auth.isLoggedIn();

  useEffect(() => {
    if (!loggedIn) return undefined;
    const refresh = () => setTick((n) => n + 1);
    const poll = () => {
      app.protocol.fetchDiagnostics?.().then(refresh, refresh);
    };
    app.protocol.on('diagnostics_updated', refresh);
    app.world.on('region_changed', refresh);
    poll();
    const diagnostics = setInterval(poll, 10000);
    const clock = setInterval(refresh, 30000);
    return () => {
      clearInterval(diagnostics);
      clearInterval(clock);
      app.protocol.off('diagnostics_updated', refresh);
      app.world.off('region_changed', refresh);
    };
  }, [loggedIn]);

  if (!loggedIn) return <span>Offline</span>;
  const region = liveRegionName(app);
  const latency = formatLatency(app.protocol.getDiagnostics());
  const parts = [
    region && (
      <span key="region" style={{ color: V.pri, fontWeight: 600 }}>
        {region}
      </span>
    ),
    latency && <span key="latency">{latency}</span>,
    <span key="slt">{formatSlt()}</span>,
  ].filter(Boolean);
  return parts.flatMap((part, index) =>
    index
      ? [
          <span key={`sep${index}`} style={{ opacity: 0.5 }}>
            |
          </span>,
          part,
        ]
      : [part],
  );
}
