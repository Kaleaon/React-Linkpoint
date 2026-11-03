import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { NAV_ALL, TABS_NAV_IDS } from '../data/content.js';
import Icon from './Icon.jsx';
import TouchTarget from './TouchTarget';
import { navActive } from '../theme/look.js';
import { useRovingTabindex } from '../hooks/useRovingTabindex';
import { BottomTabs as SystemBottomTabs } from '@linkpoint/design-system/react';
import { LAYOUTS } from '@linkpoint/design-system/tokens';

/**
 * BottomTabs component provides accessible bottom tab bar navigation.
 *
 * Complies with WCAG 2.2 Level A standards:
 * - WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard)
 * - WCAG 2.2 SC 2.4.3 Focus Order (https://www.w3.org/TR/WCAG22/#focus-order)
 * - WCAG 2.2 SC 4.1.2 Name, Role, Value (https://www.w3.org/TR/WCAG22/#name-role-value)
 * - WCAG 2.2 SC 1.3.1 Info and Relationships (https://www.w3.org/TR/WCAG22/#info-and-relationships)
 * - WCAG 2.2 SC 2.4.7 Focus Visible (https://www.w3.org/TR/WCAG22/#focus-visible)
 * - WAI-ARIA APG Tabs Pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
 *
 * Applicable W3C Techniques:
 * - ARIA6: Using aria-label to provide labels for objects (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA6)
 * - ARIA11: Using ARIA landmarks to identify regions of a page (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA11)
 * - ARIA17: Using grouping roles to identify related controls (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA17)
 * - G202: Ensuring keyboard control for all functionality (https://www.w3.org/WAI/WCAG22/Techniques/general/G202)
 */
export default function BottomTabs() {
  const { state, actions } = useApp();
  const { V, t, nav } = useTheme();

  const items = NAV_ALL.filter((n) => TABS_NAV_IDS.includes(n.id));
  const activeItem = items.find((n) => navActive(state.screen, n.id)) || items[0];
  const activeId = activeItem ? activeItem.id : items[0]?.id || '';
  const tabIds = items.map((n) => n.id);

  const { getTabIndex, getTabRef, handleKeyDown, handleClick } = useRovingTabindex({
    tabs: tabIds,
    activeTab: activeId,
    onSelect: (id) => actions.setScreen(id),
    activationMode: 'auto',
  });

  // Navigation stays visible on the 3D View too. Hiding it left no way out of the
  // scene on phones and tablets (the 3D screen has no header or back button).
  if (nav !== 'tabs') return null;

  return (
    <nav
      aria-label="Bottom Navigation"
      style={{
        flex: 'none',
        display: 'flex',
        background: V.surf,
        borderTop: '1px solid ' + V.outv,
        padding: '6px 0 10px',
      }}
    >
      <div role="tablist" style={{ display: 'flex', width: '100%' }}>
        {items.map((n) => {
          const active = navActive(state.screen, n.id);
          const panelId = `panel-${n.id.toLowerCase().replace(/\s+/g, '-')}`;
          return (
            <TouchTarget
              key={n.id}
              ref={getTabRef(n.id)}
              data-tab={n.id}
              role="tab"
              tabIndex={getTabIndex(n.id)}
              aria-selected={active}
              aria-label={n.label}
              aria-controls={panelId}
              onClick={() => handleClick(n.id)}
              onKeyDown={(e) => handleKeyDown(e, n.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '6px 0',
                cursor: 'pointer',
                color: active ? V.pri : V.ink2,
                position: 'relative',
                background: 'transparent',
                border: 'none',
                font: 'inherit',
              }}
            >
              <Icon name={n.icon} size={22} />
              <span style={{ font: '600 9px/1 ' + t.font, letterSpacing: '.14em' }}>{n.label}</span>
              {n.badge ? (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '24%',
                    minWidth: '16px',
                    height: '16px',
                    padding: '0 4px',
                    borderRadius: '8px',
                    background: V.bdg,
                    color: V.onbdg,
                    font: '700 9px/16px ' + t.font,
                    textAlign: 'center',
                  }}
                >
                  {n.badge}
                </span>
              ) : null}
            </TouchTarget>
          );
        })}
      </div>
    </nav>
  );
}
