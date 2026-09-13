import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Card, CardList, SectionLabel, SegTabs, ScreenTitle } from '../ui/primitives';
import { GRIDS, STATS } from '../data/slData';
import type { ViewerStats } from '../data/slTypes';

/**
 * Diagnostics.
 *
 * The readouts the viewer's statistics bar reports, with the thresholds that
 * make them meaningful: a simulator runs at 45 frames per second nominal, and
 * time dilation below 1.0 means it is not keeping up — that pair explains most
 * "the grid feels laggy" reports on its own.
 */

interface Readout {
  label: string;
  value: string;
  /** Health, which decides the tone. */
  health: 'ok' | 'warn' | 'bad';
  note: string;
}

function readouts(s: ViewerStats): Readout[] {
  return [
    {
      label: 'PING',
      value: `${s.ping} ms`,
      health: s.ping < 150 ? 'ok' : s.ping < 300 ? 'warn' : 'bad',
      note: 'round trip to the simulator',
    },
    {
      label: 'PACKET LOSS',
      value: `${s.packetLoss.toFixed(1)}%`,
      health: s.packetLoss < 1 ? 'ok' : s.packetLoss < 3 ? 'warn' : 'bad',
      note: 'above 3% and objects stop rezzing',
    },
    {
      label: 'VIEWER FPS',
      value: String(s.fps),
      health: s.fps >= 30 ? 'ok' : s.fps >= 15 ? 'warn' : 'bad',
      note: 'what your device renders',
    },
    {
      label: 'SIM FPS',
      value: s.simFps.toFixed(1),
      health: s.simFps >= 40 ? 'ok' : s.simFps >= 25 ? 'warn' : 'bad',
      note: '45 is nominal for a healthy region',
    },
    {
      label: 'TIME DILATION',
      value: s.timeDilation.toFixed(2),
      health: s.timeDilation >= 0.95 ? 'ok' : s.timeDilation >= 0.85 ? 'warn' : 'bad',
      note: 'below 1.0 the region is running slow',
    },
    {
      label: 'PHYSICS FPS',
      value: s.physicsFps.toFixed(1),
      health: s.physicsFps >= 40 ? 'ok' : s.physicsFps >= 25 ? 'warn' : 'bad',
      note: 'vehicles and collisions suffer first',
    },
    {
      label: 'SCRIPT TIME',
      value: `${s.scriptTime.toFixed(2)} ms`,
      health: s.scriptTime < 2 ? 'ok' : s.scriptTime < 5 ? 'warn' : 'bad',
      note: `${s.activeScripts.toLocaleString()} scripts running`,
    },
    {
      label: 'BANDWIDTH',
      value: `${s.bandwidth} kbit/s`,
      health: 'ok',
      note: 'inbound from the simulator',
    },
  ];
}

const DiagnosticsScreen: React.FC = () => {
  const t = useTheme();
  const [grid, setGrid] = useState('AGNI');
  const [refreshed, setRefreshed] = useState(0);

  const tone = (h: Readout['health']) => (h === 'ok' ? t.v.ok : h === 'warn' ? t.v.warn : t.v.err);
  const list = readouts(STATS);
  const gridInfo = GRIDS.find((g) => g.id === grid.toLowerCase()) ?? GRIDS[0];

  return (
    <>
      <ScreenTitle
        title="DIAGNOSTICS"
        subtitle={`> grid connectivity probe · ${grid.toLowerCase()}`}
        right={
          <button
            type="button"
            aria-label="Refresh probe"
            onClick={() => setRefreshed((n) => n + 1)}
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
            <RefreshCw size={15} strokeWidth={1.8} style={{ transform: `rotate(${refreshed * 90}deg)`, transition: 'transform .3s ease' }} />
          </button>
        }
      />

      <SegTabs tabs={[{ label: 'AGNI' }, { label: 'ADITI' }]} value={grid} onChange={setGrid} />

      <CardList>
        {/* Latency leads, at a size readable at arm's length. */}
        <Card
          title="LATENCY"
          big={`${STATS.ping}`}
          bigColor={tone(STATS.ping < 150 ? 'ok' : 'warn')}
          body={`> ${STATS.ping < 150 ? 'excellent' : 'degraded'} · ${grid.toLowerCase()} · round trip in milliseconds`}
          accent={tone(STATS.ping < 150 ? 'ok' : 'warn')}
        />

        <Card
          title="REGION & VIEWER"
          body={
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '11px', marginTop: '6px' }}>
              {list.map((r) => (
                <div key={r.label}>
                  <SectionLabel>{r.label}</SectionLabel>
                  <div style={{ font: `600 17px/1.1 ${t.dfont}`, color: tone(r.health), marginTop: '4px' }}>{r.value}</div>
                  <div style={{ font: `400 9.5px/1.35 ${t.font}`, color: t.v.ink2, marginTop: '3px' }}>{r.note}</div>
                </div>
              ))}
            </div>
          }
        />

        <Card title="DNS" right="12 ms" body={`OK · ${new URL(gridInfo.loginUri || 'https://login.agni.lindenlab.com').hostname}`} accent={t.v.ok} />
        <Card title="TCP / TLS" right="38 ms" body="OK · handshake reachable" accent={t.v.ok} />
        <Card title="SIM CIRCUIT" right="live" body={`rx 18 204 / tx 6 118 packets · ${STATS.packetLoss.toFixed(1)}% loss · ${STATS.agents} agents in region`} />
        <Card title="CAPABILITIES" body="display names OK · event queue OK · avatar picker OK · inventory skeleton OK · map tiles OK" />
        <Card title="ENDPOINT" body={`viewer Linkpoint 2.0 · ${gridInfo.loginUri || 'custom login URI'}`} />
      </CardList>
    </>
  );
};

export default DiagnosticsScreen;
