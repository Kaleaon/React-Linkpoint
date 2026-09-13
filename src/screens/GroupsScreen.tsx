import React, { useState } from 'react';
import { Megaphone, UserPlus, Users } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Card, CardList, Toggle, ScreenTitle } from '../ui/primitives';
import { GROUPS } from '../data/slData';
import { MAX_GROUPS } from '../data/slTypes';

/**
 * Groups.
 *
 * An account holds forty-two group slots, so the header leads with how many
 * are spent — joining another group is a decision with a cost. Per-group
 * notice and mute switches live on the card itself, because that is the
 * setting residents change most and it should never take a second screen.
 */
const GroupsScreen: React.FC = () => {
  const t = useTheme();
  const [groups, setGroups] = useState(GROUPS);

  const unread = groups.reduce((n, g) => n + (g.unread ?? 0), 0);

  const setFlag = (id: string, key: 'notices' | 'muted', value: boolean) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, [key]: value } : g)));

  return (
    <>
      <ScreenTitle title="GROUPS" subtitle={`> ${groups.length} of ${MAX_GROUPS} slots · ${unread} unread`} />

      <CardList>
        {/* An unread notice leads, accented, with the landmark it carried. */}
        <Card
          icon={Megaphone}
          title="Notice · Bay City Builders"
          right="2h"
          body="Build jam Saturday 14:00 SLT — landmark attached."
          accent={t.v.pri}
          actions={[
            { label: 'KEEP LANDMARK' },
            { label: 'OPEN CHAT', kind: 'primary' },
          ]}
        />

        {groups.map((g) => (
          <Card
            key={g.id}
            icon={Users}
            title={g.name}
            badge={g.unread}
            body={
              <>
                {g.members.toLocaleString()} members · {g.role.toLowerCase()}
                {g.joinFee ? ` · L$ ${g.joinFee} to join` : ' · free to join'}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '11px' }}>
                  <SwitchRow label="Receive notices" on={g.notices} onChange={(v) => setFlag(g.id, 'notices', v)} />
                  <SwitchRow label="Mute group chat" on={g.muted} onChange={(v) => setFlag(g.id, 'muted', v)} />
                </div>
              </>
            }
            actions={[
              { label: 'CHAT', kind: 'primary' },
              { label: 'MEMBERS' },
              { label: 'LEAVE', kind: 'danger' },
            ]}
          />
        ))}

        <Card
          icon={UserPlus}
          title="Invite · Aurora Dance Crew"
          body="Nyx Vaher invited you — no join fee."
          accent={t.v.sec2}
          actions={[
            { label: 'JOIN', kind: 'primary' },
            { label: 'IGNORE', kind: 'danger' },
          ]}
        />
      </CardList>
    </>
  );
};

const SwitchRow: React.FC<{ label: string; on: boolean; onChange: (on: boolean) => void }> = ({ label, on, onChange }) => {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ flex: 1, font: `400 11.5px/1.3 ${t.font}`, color: t.v.ink2 }}>{label}</span>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
};

export default GroupsScreen;
