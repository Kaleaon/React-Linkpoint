import React, { useEffect, useState } from 'react';
import { useTheme, useThemeContext } from '../theme/ThemeContext';
import { Navigation } from './Navigation';
import { StateBlock } from '../ui/StateBlock';
import { SystemDialogView } from '../ui/SystemDialogView';
import { useViewer, type ScreenId } from '../viewer/ViewerContext';
import { RLV_REDACTED, useRlv, type RlvRestriction } from '../viewer/RlvContext';
import { RlvBlocked } from '../ui/RlvBlocked';
import { AGENT, BALANCE, CONDITIONS, CURRENT_REGION, SYSTEM_DIALOGS } from '../data/slData';
import ChatScreen from '../screens/ChatScreen';
import DiagnosticsScreen from '../screens/DiagnosticsScreen';
import FriendsScreen from '../screens/FriendsScreen';
import GroupsScreen from '../screens/GroupsScreen';
import InventoryScreen from '../screens/InventoryScreen';
import MapScreen from '../screens/MapScreen';
import NoticesScreen from '../screens/NoticesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RadarScreen from '../screens/RadarScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TeleportScreen from '../screens/TeleportScreen';
import WorldScreen from '../screens/WorldScreen';

const SCREEN_COMPONENTS: Record<ScreenId, React.ComponentType> = {
  Chat: ChatScreen,
  Friends: FriendsScreen,
  Radar: RadarScreen,
  Map: MapScreen,
  World: WorldScreen,
  Inventory: InventoryScreen,
  Profile: ProfileScreen,
  Groups: GroupsScreen,
  Notices: NoticesScreen,
  Teleport: TeleportScreen,
  Settings: SettingsScreen,
  Diagnostics: DiagnosticsScreen,
};

/** Screens that own the whole frame and draw no status strip over themselves. */
const IMMERSIVE: ScreenId[] = ['World'];

/** Settings never hides behind a forced state — it is how you get back out. */
const NEVER_BLOCKED: ScreenId[] = ['Settings'];

/**
 * Screens an RLV restriction can close outright. Settings is deliberately
 * absent: a restriction must never be able to trap a resident somewhere they
 * cannot reach the controls to understand what is happening to them.
 */
const RLV_SCREEN_LOCKS: Partial<Record<ScreenId, RlvRestriction>> = {
  Inventory: 'showinv',
  Map: 'showworldmap',
  Radar: 'showminimap',
};

/**
 * The viewer shell.
 *
 * Owns the status strip, the navigation model for the current skin and form
 * factor, and the scrim layer that system dialogs paint over everything else.
 */
export const Shell: React.FC = () => {
  const t = useTheme();
  const { cssVars } = useThemeContext();
  const { screen, condition, dialog, setDialog, setCondition } = useViewer();
  const rlv = useRlv();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const Screen = SCREEN_COMPONENTS[screen];
  const immersive = IMMERSIVE.includes(screen);

  // A forced loading, empty or error state replaces the screen body, but the
  // shell around it stays put: the resident can always navigate away.
  const conditionCopy =
    condition !== 'normal' && !NEVER_BLOCKED.includes(screen)
      ? (CONDITIONS[condition][screen] ?? CONDITIONS[condition]._)
      : null;

  // A screen RLV has closed is not rendered at all, so its content never
  // reaches the tree — hiding it visually would not be enforcement.
  const screenLock = RLV_SCREEN_LOCKS[screen];
  const rlvLocked = screenLock && rlv.restricted(screenLock) ? screenLock : null;

  // @showloc=n censors the location strip along with everything else that
  // would give the region away.
  const hideLocation = rlv.restricted('showloc');

  const railLayout = t.nav === 'rail' || t.nav === 'sweep';

  return (
    <div
      style={{
        ...cssVars,
        position: 'relative',
        display: 'flex',
        flexDirection: railLayout ? 'row' : 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: t.v.bg,
        color: t.v.ink,
        fontFamily: t.font,
      }}
    >
      {railLayout && <Navigation />}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!immersive && (
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 16px',
              borderBottom: `1px solid ${t.v.outv}`,
              background: t.v.surf,
              font: `500 10px/1 ${t.font}`,
              color: t.v.ink2,
            }}
          >
            <span style={{ color: t.v.ink }}>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {AGENT.displayName} @ {hideLocation ? RLV_REDACTED : CURRENT_REGION.name}
            </span>
            <span style={{ color: t.v.pri, flex: 'none', font: `600 10px/1 ${t.dfont}`, letterSpacing: '.08em' }}>
              L$ {BALANCE.toLocaleString()}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flex: 'none' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: t.v.ok }} />
              <span>ONLINE</span>
            </span>
          </div>
        )}

        {rlvLocked ? (
          <RlvBlocked restriction={rlvLocked} />
        ) : conditionCopy ? (
          <StateBlock copy={conditionCopy} condition={condition as 'loading' | 'empty' | 'error'} onAction={() => setCondition('normal')} />
        ) : (
          <Screen />
        )}
      </div>

      {!railLayout && <Navigation />}

      {dialog && <SystemDialogView dialog={SYSTEM_DIALOGS[dialog]} onDismiss={() => setDialog(null)} />}
    </div>
  );
};
