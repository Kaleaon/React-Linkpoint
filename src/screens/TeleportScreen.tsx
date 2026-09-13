import React, { useState } from 'react';
import { History, MapPin, Star, Zap } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Button, Card, CardList, SectionLabel, SegTabs, ScreenTitle } from '../ui/primitives';
import { LANDMARKS, RECENT_DESTINATIONS } from '../data/slData';
import { positionLabel, slurl, type Landmark } from '../data/slTypes';
import { RLV_REDACTED, useRlv } from '../viewer/RlvContext';
import { RlvNote } from '../ui/RlvBlocked';

/** A SLURL the resident pasted, parsed back into a destination. */
export function parseSlurl(input: string): Landmark | null {
  const trimmed = input.trim();
  // Both forms residents actually paste: the protocol URL the viewer emits and
  // the maps.secondlife.com web link that a browser hands them.
  const patterns = [
    /^secondlife:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\/?$/i,
    /^https?:\/\/maps\.secondlife\.com\/secondlife\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\/?$/i,
    /^https?:\/\/slurl\.com\/secondlife\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\/?$/i,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) {
      return {
        id: 'pasted',
        name: decodeURIComponent(m[1].replace(/%20/g, ' ')),
        region: decodeURIComponent(m[1].replace(/%20/g, ' ')),
        x: parseInt(m[2], 10),
        y: parseInt(m[3], 10),
        z: parseInt(m[4], 10),
        rating: 'General',
      };
    }
  }
  return null;
}

const TeleportScreen: React.FC = () => {
  const t = useTheme();
  const rlv = useRlv();
  const [tab, setTab] = useState('LANDMARKS');
  const [paste, setPaste] = useState('');

  const parsed = paste.trim() ? parseSlurl(paste) : null;
  const list = tab === 'LANDMARKS' ? LANDMARKS : RECENT_DESTINATIONS;

  // Landmark teleports and arbitrary-location teleports are separate
  // restrictions: a resident may be free to use their landmarks while still
  // barred from typing in a destination of their own.
  const landmarkBlocked = rlv.restricted('tplm');
  const locationBlocked = rlv.restricted('tploc');
  // @showloc=n also censors coordinates and SLURLs, not just the region name.
  const hideLoc = rlv.restricted('showloc');

  return (
    <>
      <ScreenTitle title="TELEPORT" subtitle={`> ${LANDMARKS.length} landmarks · ${RECENT_DESTINATIONS.length} recent`} />

      <SegTabs tabs={[{ label: 'LANDMARKS' }, { label: 'RECENT' }]} value={tab} onChange={setTab} />

      {/* Pasting a SLURL is how most teleports actually start on mobile:
          someone sends a link in chat or a browser hands one over. */}
      <div style={{ flex: 'none', padding: '0 16px 12px' }}>
        <SectionLabel>Paste a SLURL</SectionLabel>
        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            disabled={locationBlocked}
            placeholder={locationBlocked ? 'Restricted by RLV' : 'secondlife://Region/128/128/25'}
            aria-label="Paste a SLURL"
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: '44px',
              boxSizing: 'border-box',
              padding: '0 12px',
              border: `1px solid ${parsed ? t.v.ok : t.v.outv}`,
              borderRadius: t.v.rs,
              background: t.v.surf,
              color: t.v.ink,
              font: `400 16px/1.4 ${t.font}`,
              outline: 'none',
            }}
          />
          <div style={{ flex: 'none', width: '96px' }}>
            <Button kind="primary" disabled={!parsed || locationBlocked}>
              GO
            </Button>
          </div>
        </div>
        {locationBlocked && <RlvNote restriction="tploc" />}
        {!locationBlocked && paste.trim() && (
          <div style={{ font: `400 10px/1.5 ${t.font}`, color: parsed ? t.v.ok : t.v.err, marginTop: '6px' }}>
            {parsed
              ? `${parsed.region} ${positionLabel(parsed.x, parsed.y, parsed.z)}`
              : 'Not a SLURL. Expected secondlife://Region/x/y/z or a maps.secondlife.com link.'}
          </div>
        )}
      </div>

      <CardList>
        {list.map((l) => (
          <Card
            key={l.id}
            icon={tab === 'LANDMARKS' ? (l.name === 'Home' ? Star : MapPin) : History}
            title={l.name}
            right={l.visited}
            body={
              hideLoc
                ? `${RLV_REDACTED} · ${l.rating.toLowerCase()}`
                : `${l.region} ${positionLabel(l.x, l.y, l.z)} · ${l.rating.toLowerCase()}`
            }
            accent={l.name === 'Home' ? t.v.pri : undefined}
            actions={
              landmarkBlocked
                ? [{ label: tab === 'LANDMARKS' ? 'SHOW ON MAP' : 'SAVE LANDMARK' }]
                : [
                    { label: 'TELEPORT', kind: 'primary' },
                    { label: tab === 'LANDMARKS' ? 'SHOW ON MAP' : 'SAVE LANDMARK' },
                  ]
            }
          >
            {!hideLoc && (
              <div
                style={{
                  marginTop: '9px',
                  font: `400 9.5px/1.4 ${t.font}`,
                  color: t.v.info,
                  wordBreak: 'break-all',
                }}
              >
                {slurl(l.region, l.x, l.y, l.z)}
              </div>
            )}
          </Card>
        ))}

        <Card
          icon={Zap}
          title="Teleport home"
          body={hideLoc ? 'Your set home location.' : 'Da Boom <128, 128, 26> — your set home location.'}
          actions={landmarkBlocked ? [{ label: 'SET HOME HERE' }] : [{ label: 'GO HOME', kind: 'primary' }, { label: 'SET HOME HERE' }]}
        />

        {landmarkBlocked && (
          <div style={{ padding: '2px 2px 0' }}>
            <RlvNote restriction="tplm" />
          </div>
        )}
      </CardList>
    </>
  );
};

export default TeleportScreen;
