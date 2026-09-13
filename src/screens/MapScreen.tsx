import React, { useState } from 'react';
import { Copy, LocateFixed, Minus, Plus, Search } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Button, Card, CardList, SectionLabel, ScreenTitle } from '../ui/primitives';
import { AGENT_POSITION, CURRENT_REGION, NEARBY_REGIONS } from '../data/slData';
import { positionLabel, slurl, type RegionInfo } from '../data/slTypes';
import { RLV_REDACTED, useRlv } from '../viewer/RlvContext';

/**
 * The world map.
 *
 * Tiles come from Second Life's public map CDN, addressed the way the grid
 * names them: map-<zoom>-<gridX>-<gridY>-objects.jpg. When the CDN is
 * unreachable the panel falls back to a themed vector grid drawn from cached
 * region names rather than showing a broken image.
 */
const tileUrl = (gridX: number, gridY: number, zoom = 1) =>
  `https://secondlife-maps-cdn.akamaized.net/map-${zoom}-${gridX}-${gridY}-objects.jpg`;

const MapScreen: React.FC = () => {
  const t = useTheme();
  const rlv = useRlv();
  // The whole Map screen is already closed under @showworldmap; @showloc is the
  // narrower case where the map is viewable but your own position is not.
  const hideLoc = rlv.restricted('showloc');
  const [tilesOk, setTilesOk] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<RegionInfo>(CURRENT_REGION);
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const url = hideLoc ? RLV_REDACTED : slurl(selected.name, AGENT_POSITION.x, AGENT_POSITION.y, AGENT_POSITION.z);

  const copySlurl = async () => {
    if (hideLoc) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the SLURL stays visible and selectable.
      setCopied(false);
    }
  };

  return (
    <>
      <ScreenTitle
        title="WORLD MAP"
        subtitle={
          hideLoc
            ? `> location restricted · ${NEARBY_REGIONS.length} regions loaded`
            : `> ${CURRENT_REGION.name} <${CURRENT_REGION.gridX}, ${CURRENT_REGION.gridY}> · ${NEARBY_REGIONS.length} regions loaded`
        }
      />

      <div style={{ flex: 'none', display: 'flex', gap: '6px', padding: '0 16px 10px' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a region by name"
          aria-label="Find a region"
          style={{
            flex: 1,
            minWidth: 0,
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
        <button
          type="button"
          aria-label="Search regions"
          style={{
            width: '44px',
            height: '44px',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: t.v.rs,
            background: t.v.pri,
            color: t.v.onpri,
            cursor: 'pointer',
          }}
        >
          <Search size={16} strokeWidth={2} />
        </button>
      </div>

      <div
        style={{
          flex: 'none',
          position: 'relative',
          margin: '0 16px 10px',
          height: '220px',
          overflow: 'hidden',
          border: `1px solid ${t.v.outv}`,
          borderRadius: t.v.rp,
          background: t.v.surf2,
        }}
      >
        {tilesOk ? (
          <img
            src={tileUrl(CURRENT_REGION.gridX, CURRENT_REGION.gridY, zoom)}
            alt={`Map tile for ${CURRENT_REGION.name}`}
            onError={() => setTilesOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.9 }}
          />
        ) : (
          // Themed vector fallback: a 2×2 block of the regions we know about.
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '2px', padding: '2px' }}>
            {NEARBY_REGIONS.map((r) => (
              <button
                key={r.name}
                type="button"
                onClick={() => setSelected(r)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  alignItems: 'flex-start',
                  padding: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: r.name === selected.name ? t.v.priC : t.v.surf,
                  border: `1px solid ${r.name === selected.name ? t.v.pri : t.v.outv}`,
                  color: r.name === selected.name ? t.v.onpriC : t.v.ink,
                }}
              >
                <span style={{ font: `600 11px/1.2 ${t.dfont}`, letterSpacing: t.v.tls }}>{r.name}</span>
                <span style={{ font: `400 9.5px/1.3 ${t.font}`, color: r.name === selected.name ? t.v.onpriC : t.v.ink2, marginTop: '3px' }}>
                  {r.avatars} avatars · {r.rating.toLowerCase()}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Your avatar's pin, at the centre of the home region tile. */}
        {tilesOk && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: '11px',
              height: '11px',
              margin: '-5.5px 0 0 -5.5px',
              borderRadius: '50%',
              background: t.v.pri,
              border: `2px solid ${t.v.bg}`,
              boxShadow: `0 0 0 3px ${t.v.priC}`,
            }}
          />
        )}

        <div style={{ position: 'absolute', right: '8px', top: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[
            { icon: Plus, label: 'Zoom in', act: () => setZoom((z) => Math.max(1, z - 1)) },
            { icon: Minus, label: 'Zoom out', act: () => setZoom((z) => Math.min(8, z + 1)) },
            { icon: LocateFixed, label: 'Centre on me', act: () => setSelected(CURRENT_REGION) },
          ].map(({ icon: Icon, label, act }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              onClick={act}
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${t.v.outv}`,
                borderRadius: t.v.rs,
                background: t.v.surf,
                color: t.v.ink,
                cursor: 'pointer',
              }}
            >
              <Icon size={15} strokeWidth={2} />
            </button>
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            left: '8px',
            bottom: '8px',
            padding: '4px 7px',
            borderRadius: t.v.rs,
            background: t.light ? 'rgba(255,255,255,.78)' : 'rgba(0,0,0,.45)',
            font: `400 9px/1.3 ${t.font}`,
            color: t.v.ink2,
          }}
        >
          {tilesOk ? `live map tile · zoom ${zoom}` : 'tile CDN unreachable — themed vector grid'}
        </div>
      </div>

      <CardList>
        <Card
          title={hideLoc && selected.name === CURRENT_REGION.name ? RLV_REDACTED : selected.name}
          right={`${selected.avatars} avatars`}
          accent={t.v.pri}
          body={
            <>
              {hideLoc ? RLV_REDACTED : positionLabel(AGENT_POSITION.x, AGENT_POSITION.y, AGENT_POSITION.z)} · {selected.rating.toLowerCase()}
              {selected.estate ? ` · ${selected.estate}` : ''}
              <div style={{ marginTop: '9px' }}>
                <SectionLabel>SLURL</SectionLabel>
                <div
                  style={{
                    marginTop: '5px',
                    padding: '7px 9px',
                    border: `1px dashed ${t.v.outv}`,
                    borderRadius: t.v.rs,
                    font: `400 10.5px/1.4 ${t.font}`,
                    color: t.v.info,
                    wordBreak: 'break-all',
                  }}
                >
                  {url}
                </div>
              </div>
            </>
          }
          actions={[
            { label: 'TELEPORT', kind: 'primary' },
            { label: 'SAVE LANDMARK' },
          ]}
        >
          <div style={{ marginTop: '8px' }}>
            <Button onClick={copySlurl} disabled={hideLoc}>
              <Copy size={13} strokeWidth={2} style={{ marginRight: '7px' }} />
              {copied ? 'SLURL COPIED' : 'COPY SLURL'}
            </Button>
          </div>
        </Card>

        {NEARBY_REGIONS.filter((r) => r.name !== selected.name).map((r) => (
          <Card
            key={r.name}
            title={r.name}
            right={`${r.avatars} avatars`}
            body={`<${r.gridX}, ${r.gridY}> · ${r.rating.toLowerCase()}${r.note ? ` · ${r.note}` : ''}`}
            onClick={() => setSelected(r)}
          />
        ))}
      </CardList>
    </>
  );
};

export default MapScreen;
