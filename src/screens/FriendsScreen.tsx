import React, { useMemo, useState } from 'react';
import { Check, Circle, CircleDot, Eye, MapPin, Search, UserPlus, Wrench } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Button, Card, CardList, SectionLabel, SegTabs, ScreenTitle } from '../ui/primitives';
import { chipStyle, merge } from '../ui/styles';
import { FRIENDS } from '../data/slData';
import { legacyName, type Friend, type FriendRights } from '../data/slTypes';

/**
 * The three friendship rights the protocol carries. A viewer must show both
 * directions — what you granted them and what they granted you — because the
 * two are independent and residents routinely get them confused.
 */
const RIGHTS: { key: keyof FriendRights; label: string; icon: typeof Eye }[] = [
  { key: 'seeOnline', label: 'SEE ONLINE', icon: Eye },
  { key: 'mapLocate', label: 'MAP', icon: MapPin },
  { key: 'modifyObjects', label: 'EDIT OBJECTS', icon: Wrench },
];

const FriendsScreen: React.FC = () => {
  const t = useTheme();
  const [tab, setTab] = useState('ALL');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [rights, setRights] = useState<Record<string, FriendRights>>(() =>
    Object.fromEntries(FRIENDS.map((f) => [f.id, { ...f.rights }])),
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FRIENDS.filter((f) => (tab === 'ONLINE' ? f.online : true)).filter(
      (f) => !q || legacyName(f).toLowerCase().includes(q) || f.displayName.toLowerCase().includes(q),
    );
  }, [tab, query]);

  const online = FRIENDS.filter((f) => f.online).length;

  const toggleRight = (friend: Friend, key: keyof FriendRights) =>
    setRights((r) => ({ ...r, [friend.id]: { ...r[friend.id], [key]: !r[friend.id][key] } }));

  return (
    <>
      <ScreenTitle
        title="FRIENDS"
        subtitle={`> ${online} online / ${FRIENDS.length} total · live`}
        right={
          <div style={{ display: 'flex', gap: '6px' }}>
            <IconButton label="Add friend" icon={UserPlus} />
            <IconButton label="Search" icon={Search} />
          </div>
        }
      />

      <SegTabs tabs={[{ label: 'ALL' }, { label: 'ONLINE', badge: online }]} value={tab} onChange={setTab} />

      <div style={{ flex: 'none', padding: '0 16px 10px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name"
          aria-label="Filter friends"
          style={{
            width: '100%',
            minHeight: '44px',
            boxSizing: 'border-box',
            padding: '0 12px',
            border: `1px solid ${t.v.outv}`,
            borderRadius: t.v.rs,
            background: t.v.surf,
            color: t.v.ink,
            font: `400 16px/1.4 ${t.font}`,
            outline: 'none',
          }}
        />
      </div>

      <CardList>
        {/* A pending offer sits above the roster, accented so it cannot be missed. */}
        <Card
          icon={UserPlus}
          title="Kit Sandalwood"
          right="14:28"
          body={'"met you at the Bay City build jam"'}
          accent={t.v.sec2}
          actions={[
            { label: 'ACCEPT', kind: 'primary' },
            { label: 'DECLINE', kind: 'danger' },
          ]}
        />

        {list.map((f) => {
          const isOpen = open === f.id;
          const granted = rights[f.id];
          return (
            <Card
              key={f.id}
              icon={f.online ? CircleDot : Circle}
              title={`${f.displayName} (${legacyName(f)})`}
              right={f.online ? (f.region ?? 'online') : (f.lastSeen ?? 'offline')}
              body={f.online ? `online · ${f.userName}` : `offline · seen ${f.lastSeen}`}
              onClick={() => setOpen(isOpen ? null : f.id)}
              actions={
                isOpen
                  ? [
                      { label: 'IM', kind: 'primary' },
                      { label: 'PROFILE' },
                      { label: 'TELEPORT' },
                      { label: 'REMOVE', kind: 'danger' },
                    ]
                  : undefined
              }
            >
              {isOpen && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                  <div>
                    <SectionLabel>You grant them</SectionLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      {RIGHTS.map((r) => {
                        const Icon = r.icon;
                        const on = granted[r.key];
                        return (
                          <button
                            key={r.key}
                            type="button"
                            aria-pressed={on}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRight(f, r.key);
                            }}
                            style={merge(chipStyle(t, on), { font: `600 10px/1 ${t.dfont}`, letterSpacing: '.12em', gap: '7px' })}
                          >
                            {on ? <Check size={13} strokeWidth={2.4} /> : <Icon size={13} strokeWidth={1.8} />}
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>They grant you</SectionLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                      {RIGHTS.map((r) => (
                        <span
                          key={r.key}
                          style={merge(chipStyle(t, false), {
                            cursor: 'default',
                            font: `600 10px/1 ${t.dfont}`,
                            letterSpacing: '.12em',
                            opacity: f.theirRights[r.key] ? 1 : 0.45,
                          })}
                        >
                          {f.theirRights[r.key] ? <Check size={13} strokeWidth={2.4} /> : <Circle size={13} strokeWidth={1.8} />}
                          {r.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {list.length === 0 && (
          <div style={{ padding: '20px 2px', font: `400 12px/1.6 ${t.font}`, color: t.v.ink2 }}>
            No friends match that filter.
            <div style={{ marginTop: '10px', maxWidth: '200px' }}>
              <Button onClick={() => setQuery('')}>CLEAR FILTER</Button>
            </div>
          </div>
        )}
      </CardList>
    </>
  );
};

const IconButton: React.FC<{ icon: typeof Eye; label: string; onClick?: () => void }> = ({ icon: Icon, label, onClick }) => {
  const t = useTheme();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: '36px',
        height: '36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px solid ${t.v.outv}`,
        borderRadius: t.v.rs,
        background: 'transparent',
        color: t.v.ink2,
        cursor: 'pointer',
      }}
    >
      <Icon size={15} strokeWidth={1.8} />
    </button>
  );
};

export default FriendsScreen;
