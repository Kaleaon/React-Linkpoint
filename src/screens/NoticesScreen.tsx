import React, { useState } from 'react';
import { Banknote, BellOff, Megaphone, MessageSquare, Package, UserPlus } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Card, CardList, SegTabs, ScreenTitle } from '../ui/primitives';
import { StateBlock } from '../ui/StateBlock';
import { useViewer } from '../viewer/ViewerContext';
import { CONDITIONS, NOTIFICATIONS } from '../data/slData';
import type { Notification, NotificationKind } from '../data/slTypes';

/**
 * Notifications.
 *
 * Everything the simulator queued while the resident was away: offline IMs,
 * inventory offers, payments, group notices and friendship offers. Each type
 * carries the actions it actually needs, so an inventory offer can be accepted
 * from the list without opening anything.
 */
const KIND_ICONS: Record<NotificationKind, typeof MessageSquare> = {
  im: MessageSquare,
  inventory: Package,
  payment: Banknote,
  notice: Megaphone,
  friendship: UserPlus,
  system: BellOff,
};

/** The action set each notification type earns. */
function actionsFor(n: Notification): { label: string; kind?: 'primary' | 'danger' }[] {
  switch (n.kind) {
    case 'im':
      return [{ label: 'QUICK REPLY', kind: 'primary' }, { label: 'MARK READ' }];
    case 'inventory':
      return [{ label: 'ACCEPT', kind: 'primary' }, { label: 'DECLINE', kind: 'danger' }];
    case 'friendship':
      return [{ label: 'ACCEPT', kind: 'primary' }, { label: 'DECLINE', kind: 'danger' }];
    case 'notice':
      return [{ label: 'OPEN GROUP' }, { label: 'MARK READ' }];
    default:
      return [{ label: 'MARK READ' }];
  }
}

const NoticesScreen: React.FC = () => {
  const t = useTheme();
  const { prefs, setPref } = useViewer();
  const [tab, setTab] = useState('ALL');
  const [dismissed, setDismissed] = useState<string[]>([]);

  const list = NOTIFICATIONS.filter((n) => !dismissed.includes(n.id)).filter((n) => (tab === 'UNREAD' ? n.unread : true));
  const unread = NOTIFICATIONS.filter((n) => n.unread && !dismissed.includes(n.id)).length;

  return (
    <>
      <ScreenTitle
        title="NOTIFICATIONS"
        subtitle={`> ${unread} unread · autoresponse ${prefs.autoresponse ? 'ON' : 'OFF'}`}
      />

      <SegTabs tabs={[{ label: 'ALL' }, { label: 'UNREAD', badge: unread }]} value={tab} onChange={setTab} />

      {list.length === 0 ? (
        <StateBlock copy={CONDITIONS.empty.Notices} condition="empty" onAction={() => setDismissed([])} />
      ) : (
        <CardList>
          {list.map((n) => {
            const Icon = KIND_ICONS[n.kind];
            return (
              <Card
                key={n.id}
                icon={Icon}
                title={n.title}
                right={n.time}
                body={n.body}
                accent={n.unread ? t.v.pri : undefined}
                actions={actionsFor(n).map((a) => ({ ...a, onClick: () => setDismissed((d) => [...d, n.id]) }))}
              />
            );
          })}

          {/* The autoresponse switch belongs here: it is the setting that
              decides what the people in this list hear back while you are away. */}
          <Card
            icon={BellOff}
            title="Autoresponse"
            body={
              prefs.autoresponse
                ? '"On mobile — replies may be slow." Sent to anyone who IMs you.'
                : 'Off. Residents who IM you get no automatic reply.'
            }
            toggle={{ on: prefs.autoresponse, onChange: (v) => setPref('autoresponse', v) }}
          />
        </CardList>
      )}
    </>
  );
};

export default NoticesScreen;
