import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { segLooks } from '../theme/look.js';
import { CSUB, subView, setSub } from '../theme/constants.js';
import { inkOn } from '@linkpoint/design-system/tokens';
import { FocusRing } from '@linkpoint/design-system';
import { app } from '../linkpoint/app';
import { useRovingTabindex } from '../hooks/useRovingTabindex';

/**
 * SegmentedTabs component provides accessible sub-navigation tabs across screens.
 *
 * Complies with WAI-ARIA APG Tabs Pattern and WCAG 2.2 standards:
 * - WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard)
 * - WCAG 2.2 SC 2.4.3 Focus Order (https://www.w3.org/TR/WCAG22/#focus-order)
 * - WCAG 2.2 SC 4.1.2 Name, Role, Value (https://www.w3.org/TR/WCAG22/#name-role-value)
 * - WAI-ARIA APG Tabs Pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
 *
 * Ported from `segTabs`/`segWrap`/`hasSeg`. The labels come from CSUB — the one
 * sub-view table the LCARS rail also renders — so a screen gains a tab strip by
 * appearing there, not by being named here.
 *
 * @param {{ screen?: string }} [props]
 */
export default function SegmentedTabs({ screen } = {}) {
  const { state, actions } = useApp();
  const { V, t, LK, nav, isFloat, norm, scr: themeScr } = useTheme();
  const scr = screen || themeScr;

  const [, setTick] = useState(0);

  useEffect(() => {
    const forceUpdate = () => setTick((v) => v + 1);
    app.world?.on?.('objects_changed', forceUpdate);
    app.world?.on?.('nearby_changed', forceUpdate);
    app.chat?.on?.('message', forceUpdate);
    return () => {
      app.world?.off?.('objects_changed', forceUpdate);
      app.world?.off?.('nearby_changed', forceUpdate);
      app.chat?.off?.('message', forceUpdate);
    };
  }, []);

  const curSub = subView(state, scr) || '';
  const csubEntries = CSUB[scr] || [];
  const tabIds = csubEntries.map(([label]) => label);
  const { getTabIndex, getTabRef, handleKeyDown, handleClick } = useRovingTabindex({
    tabs: tabIds,
    activeTab: curSub,
    onSelect: (label) => setSub(actions, scr, label),
    activationMode: 'auto',
  });

  // Search and Radar render SegmentedTabs internally within their screen bodies.
  // When SegmentedTabs is invoked without an explicit screen prop from top-level
  // ScreenBody, skip rendering for Search and Radar to prevent double-rendering.
  if (!screen && (scr === 'Search' || scr === 'Radar')) return null;

  if (!norm) return null;
  // 3D View is immersive with no header to hang a strip under — it carries its
  // CAM/GFX switch in-scene instead. All other CSUB screens get standard SegmentedTabs.
  if (!CSUB[scr] || scr === '3D View') return null;

  // Real unread counts from live Second Life chat session
  const unreadIM = app.chat?.messages?.filter((m) => m.type === 'im' && m.unread)?.length || 0;
  const unreadGroup =
    app.chat?.messages?.filter((m) => m.type === 'group' && m.unread)?.length || 0;
  const chatBadges = {};
  if (unreadIM > 0) chatBadges.IM = unreadIM;
  if (unreadGroup > 0) chatBadges.GROUP = unreadGroup;

  // Real entity counts for Radar sub-views
  const nearbyAvatars = app.world?.nearbyUsers?.length || 0;
  const sceneObjects =
    app.world?.objects?.filter?.((obj) => !obj.avatar)?.length ?? app.world?.objects?.length ?? 0;
  const radarBadges = {
    AVATAR: nearbyAvatars,
    OBJECT: sceneObjects,
  };

  const tabs = CSUB[scr].map(([label]) => ({
    label,
    badge: scr === 'Chat' ? chatBadges[label] : scr === 'Radar' ? radarBadges[label] : undefined,
  }));

  const segLook = LK.seg || 'fill';
  const looks = segLooks(V, t.font);
  const base = looks[segLook];
  const consoleLayout = t.nav === 'SWEEP';
  const on = { background: V.priC, color: V.onpriC, borderBottom: '2px solid ' + V.pri };
  const onLook =
    segLook === 'fill'
      ? consoleLayout
        ? { background: V.pri, color: V.onpri, border: 'none' }
        : { ...on, color: V.onpriC }
      : segLook === 'pivot'
        ? { color: V.priText, fontWeight: 400 }
        : { color: V.priText, boxShadow: 'inset 0 -2px 0 ' + V.pri, letterSpacing: V.tls };

  const wrap = consoleLayout
    ? { flex: 'none', display: 'flex', gap: 4, margin: '8px 4px', overflowX: 'auto' }
    : isFloat
      ? {
          flex: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          margin: 0,
          borderBottom: '1px solid ' + V.outv,
          background: V.surf,
        }
      : segLook === 'fill'
        ? {
            flex: 'none',
            display: 'flex',
            margin: nav === 'sweep' ? '12px 12px 10px 4px' : '2px 16px 10px',
            border: '1px solid ' + V.outv,
            borderRadius: V.rs,
            overflow: 'hidden',
          }
        : {
            flex: 'none',
            display: 'flex',
            margin: '0 16px 8px',
            borderBottom: segLook === 'text' ? '1px solid ' + V.outv : 'none',
            overflowX: 'auto',
          };

  const isActive = (label) => curSub === label;

  return (
    <div role="tablist" aria-label={scr + ' views'} style={wrap}>
      {tabs.map((x) => {
        const active = isActive(x.label);
        const panelId = `panel-${scr.toLowerCase().replace(/\s+/g, '-')}-${x.label.toLowerCase().replace(/\s+/g, '-')}`;
        const style = {
          ...base,
          ...(consoleLayout
            ? {
                flex: '1 0 auto',
                padding: '8px 12px',
                letterSpacing: '.04em',
                background: V.sec2,
                color: inkOn(V.sec2),
              }
            : null),
          ...(active ? onLook : null),
          ...(isFloat && !consoleLayout
            ? {
                minHeight: '24px',
                height: '24px',
                padding: '0 9px',
                flex: 'none',
                borderRadius: 0,
                font: '600 9.5px/1 ' + t.font,
                letterSpacing: '.1em',
              }
            : null),
        };
        return (
          <FocusRing key={x.label} ringColor={V.pri} borderRadius={style.borderRadius}>
            <button
              ref={getTabRef(x.label)}
              type="button"
              data-tab={x.label}
              onClick={() => handleClick(x.label)}
              role="tab"
              tabIndex={getTabIndex(x.label)}
              aria-selected={active}
              aria-controls={panelId}
              onKeyDown={(e) => handleKeyDown(e, x.label)}
              style={{ cursor: 'pointer', border: 'none', ...style }}
            >
              <span style={{ font: 'inherit', letterSpacing: 'inherit' }}>{x.label}</span>
              {x.badge !== undefined ? (
                <span
                  style={{
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 5px',
                    borderRadius: '9px',
                    background: V.bdg,
                    color: V.onbdg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    font: '700 10px/1 ' + t.font,
                  }}
                >
                  {x.badge}
                </span>
              ) : null}
            </button>
          </FocusRing>
        );
      })}
    </div>
  );
}
