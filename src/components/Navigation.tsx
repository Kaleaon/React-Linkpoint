import React from 'react';
import { Box, Folder, Map, MessageSquare, Radar, Settings, Users, type LucideIcon } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { badgeStyle, merge } from '../ui/styles';
import { useViewer, type ScreenId } from '../viewer/ViewerContext';

/**
 * The four navigation models.
 *
 * A layout pack asks for one and the form factor may override it, so every
 * model has to carry the same destinations. Phones cap the bar at five items —
 * beyond that the targets fall under the 44px minimum — and the rest live
 * behind MORE; the rail, tile and sweep models have the room for all of them.
 */
export interface NavItem {
  id: ScreenId;
  label: string;
  /** Metro's lowercase tile wording, which differs from the tab label. */
  tile: string;
  icon: LucideIcon;
  badge?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'Chat', label: 'CHAT', tile: 'chat', icon: MessageSquare, badge: 3 },
  { id: 'Friends', label: 'FRIENDS', tile: 'people', icon: Users },
  { id: 'Radar', label: 'RADAR', tile: 'radar', icon: Radar },
  { id: 'Map', label: 'MAP', tile: 'world', icon: Map },
  { id: 'World', label: 'WORLD', tile: 'in-world', icon: Box },
  { id: 'Inventory', label: 'INV', tile: 'inventory', icon: Folder },
  { id: 'Settings', label: 'MORE', tile: 'settings', icon: Settings },
];

/** Phones show five; everything else shows the lot. */
const PHONE_TABS: ScreenId[] = ['Chat', 'Friends', 'Radar', 'Map', 'Settings'];

export const Navigation: React.FC = () => {
  const t = useTheme();
  const { screen, setScreen } = useViewer();
  const items = t.nav === 'tabs' ? NAV_ITEMS.filter((n) => PHONE_TABS.includes(n.id)) : NAV_ITEMS;

  if (t.nav === 'rail') {
    return (
      <nav
        aria-label="Primary"
        style={{
          flex: 'none',
          width: '86px',
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          padding: '12px 6px',
          borderRight: `1px solid ${t.v.outv}`,
          background: t.v.surf,
          overflowY: 'auto',
        }}
      >
        {items.map((n) => {
          const on = n.id === screen;
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => setScreen(n.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px',
                padding: '10px 4px',
                cursor: 'pointer',
                border: 'none',
                borderRadius: t.v.navr,
                background: on ? t.v.priC : 'transparent',
                color: on ? t.v.onpriC : t.v.ink2,
                position: 'relative',
              }}
            >
              <Icon size={20} strokeWidth={on ? 2.2 : 1.7} />
              <span style={{ font: `600 8px/1 ${t.dfont}`, letterSpacing: '.12em' }}>{n.label}</span>
              {n.badge && <span style={merge(badgeStyle(t), { position: 'absolute', top: '4px', right: '10px' })}>{n.badge}</span>}
            </button>
          );
        })}
      </nav>
    );
  }

  if (t.nav === 'tiles') {
    return (
      <nav
        aria-label="Primary"
        style={{ flex: 'none', display: 'flex', gap: '2px', padding: '2px', background: t.v.bg, overflowX: 'auto' }}
      >
        {items.map((n) => {
          const on = n.id === screen;
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => setScreen(n.id)}
              style={{
                flex: 1,
                minWidth: '72px',
                height: '62px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'flex-start',
                padding: '7px',
                cursor: 'pointer',
                border: 'none',
                background: on ? t.v.pri : t.v.surf,
                color: on ? t.v.onpri : t.v.ink,
              }}
            >
              <Icon size={16} strokeWidth={1.6} />
              <span style={{ font: `300 12px/1.1 ${t.dfont}`, marginTop: '5px', textTransform: 'lowercase' }}>{n.tile}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  if (t.nav === 'sweep') {
    return <SweepNav items={items} />;
  }

  // Bottom tabs: the phone default.
  return (
    <nav
      aria-label="Primary"
      style={{
        flex: 'none',
        display: 'flex',
        borderTop: `1px solid ${t.v.outv}`,
        background: t.v.surf,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {items.map((n) => {
        const on = n.id === screen;
        const Icon = n.icon;
        return (
          <button
            key={n.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => setScreen(n.id)}
            style={{
              flex: 1,
              minHeight: '56px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '6px 0',
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              color: on ? t.v.pri : t.v.ink2,
              position: 'relative',
            }}
          >
            <Icon size={21} strokeWidth={on ? 2.3 : 1.7} />
            <span style={{ font: `600 8.5px/1 ${t.dfont}`, letterSpacing: '.12em' }}>{n.label}</span>
            {n.badge && <span style={merge(badgeStyle(t), { position: 'absolute', top: '4px', right: '22%' })}>{n.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
};

/**
 * The sweep console rail.
 *
 * Built to the LCARS rules the design canvas set out: the rail segments ARE
 * the buttons rather than buttons sitting on a rail, segment thickness changes
 * at every turn and never repeats, a rounded cap terminates the run, labels sit
 * bottom-right, and selection is a fill change — no borders, no gradients.
 */
const SweepNav: React.FC<{ items: NavItem[] }> = ({ items }) => {
  const t = useTheme();
  const { screen, setScreen } = useViewer();

  // Thickness varies turn to turn but never drops below the 44px touch minimum.
  const heights = [58, 44, 50, 44, 54, 46, 44];
  const tints = [t.v.sec2, t.v.surf2, t.v.sec, t.v.surf2, t.v.sec2, t.v.surf2, t.v.sec];

  return (
    <nav
      aria-label="Primary"
      style={{ flex: 'none', width: '68px', display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px 0 4px 4px', background: t.v.bg, overflowY: 'auto' }}
    >
      <div
        style={{
          height: '46px',
          flex: 'none',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          padding: '0 7px 4px 0',
          background: t.v.pri,
          color: t.ink(t.v.pri),
          borderRadius: `${t.v.rl} 0 0 0`,
          font: `700 10px/1 ${t.dfont}`,
          letterSpacing: '.08em',
        }}
      >
        LINKPOINT
      </div>

      {items.map((n, i) => {
        const on = n.id === screen;
        const background = on ? t.v.pri : tints[i % tints.length];
        return (
          <button
            key={n.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => setScreen(n.id)}
            style={{
              height: `${heights[i % heights.length]}px`,
              flex: 'none',
              boxSizing: 'border-box',
              width: '64px',
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              padding: '0 7px 4px 0',
              cursor: 'pointer',
              border: 'none',
              background,
              color: t.ink(background),
              borderRadius: i === items.length - 1 ? '0 22px 22px 0' : 0,
              font: `600 11px/1 ${t.dfont}`,
              letterSpacing: '.08em',
              transition: 'background .18s ease',
            }}
          >
            {n.label}
          </button>
        );
      })}

      {/* The terminator absorbs the leftover height and caps the run. */}
      <div style={{ flex: 1, minHeight: '20px', width: '64px', background: t.v.surf2, borderRadius: `0 0 22px 0` }} />
    </nav>
  );
};
