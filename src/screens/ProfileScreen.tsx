import React, { useState } from 'react';
import { CalendarDays, CreditCard, Heart, MapPin, Users } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Button, Card, CardList, SectionLabel, SegTabs, ScreenTitle } from '../ui/primitives';
import { PROFILE } from '../data/slData';
import { legacyName } from '../data/slTypes';

/**
 * A resident profile.
 *
 * The tabs follow the viewer's own profile floater: 2nd Life, Picks, and the
 * optional Real Life tab a resident chooses to fill in. Account facts that
 * residents actually use to judge each other — rez day, payment info on file,
 * partner — sit above the fold rather than buried.
 */
const ProfileScreen: React.FC = () => {
  const t = useTheme();
  const [tab, setTab] = useState('2ND LIFE');
  const r = PROFILE.resident;

  const bornDays = Math.max(0, Math.floor((Date.now() - new Date(PROFILE.born).getTime()) / 86400000));
  const bornYears = (bornDays / 365).toFixed(1);

  return (
    <>
      <ScreenTitle title="PROFILE" subtitle={`> resident record · ${r.userName}`} />

      {/* Identity block: display name over the legacy name, which is what the
          protocol actually carries and what search still matches on. */}
      <div style={{ flex: 'none', display: 'flex', gap: '13px', padding: '0 16px 14px' }}>
        <div
          style={{
            width: '72px',
            height: '72px',
            flex: 'none',
            borderRadius: t.v.rp,
            border: `1px solid ${t.v.outv}`,
            background: `linear-gradient(${t.v.sky1}, ${t.v.gnd})`,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            font: `700 26px/1 ${t.dfont}`,
            color: t.v.ink,
            paddingBottom: '10px',
          }}
        >
          {r.displayName.slice(0, 1)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 17px/1.2 ${t.dfont}`, color: t.v.ink, letterSpacing: t.v.tls }}>{r.displayName}</div>
          <div style={{ font: `400 11px/1.4 ${t.font}`, color: t.v.ink2, marginTop: '3px' }}>{legacyName(r)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '7px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '4px', background: r.online ? t.v.ok : t.v.ink2 }} />
            <span style={{ font: `400 10.5px/1 ${t.font}`, color: t.v.ink2 }}>{r.online ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>

      <div style={{ flex: 'none', display: 'flex', gap: '6px', padding: '0 16px 12px' }}>
        <Button kind="primary">IM</Button>
        <Button>ADD FRIEND</Button>
        <Button>TELEPORT</Button>
      </div>

      <SegTabs tabs={[{ label: '2ND LIFE' }, { label: 'PICKS' }, { label: 'REAL LIFE' }]} value={tab} onChange={setTab} />

      <CardList>
        {tab === '2ND LIFE' && (
          <>
            <Card
              body={
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <Fact icon={CalendarDays} label="Rez day" value={`${PROFILE.born} · ${bornYears} years (${bornDays} days)`} />
                  <Fact icon={CreditCard} label="Account" value={`${PROFILE.accountType} · ${PROFILE.paymentInfo}`} />
                  <Fact icon={Heart} label="Partner" value={PROFILE.partner ?? 'No partner listed'} />
                </div>
              }
            />

            <Card title="About" body={PROFILE.secondLife} />

            <Card
              icon={Users}
              title="Groups"
              body={
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '4px' }}>
                  {PROFILE.groups.map((g) => (
                    <span
                      key={g}
                      style={{
                        padding: '5px 9px',
                        border: `1px solid ${t.v.outv}`,
                        borderRadius: t.v.rs,
                        font: `500 10.5px/1 ${t.font}`,
                        color: t.v.ink2,
                      }}
                    >
                      {g}
                    </span>
                  ))}
                </div>
              }
            />
          </>
        )}

        {tab === 'PICKS' &&
          PROFILE.picks.map((p) => (
            <Card key={p.name} icon={MapPin} title={p.name} right={p.region} body={p.body} actions={[{ label: 'TELEPORT', kind: 'primary' }, { label: 'SHOW ON MAP' }]} />
          ))}

        {tab === 'REAL LIFE' && <Card title="Real life" body={PROFILE.firstLife} />}
      </CardList>
    </>
  );
};

const Fact: React.FC<{ icon: typeof Heart; label: string; value: string }> = ({ icon: Icon, label, value }) => {
  const t = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
      <Icon size={14} style={{ color: t.v.pri, flex: 'none', marginTop: '2px' }} strokeWidth={1.8} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <SectionLabel>{label}</SectionLabel>
        <div style={{ font: `400 12px/1.45 ${t.font}`, color: t.v.ink, marginTop: '3px' }}>{value}</div>
      </div>
    </div>
  );
};

export default ProfileScreen;
