import React, { useState } from 'react';
import { Bell, Droplets, Eye, Keyboard, LayoutDashboard, Lock, Mic, Palette, Rows3, Shield, Smartphone, Type, Wifi } from 'lucide-react';
import { useTheme, useThemeContext } from '../theme/ThemeContext';
import { DEVICES, LAYOUTS, PALETTES, PALETTE_FAMILIES, type DeviceKey, type LayoutKey, type PaletteKey } from '../theme/tokens';
import { Card, CardList, SectionLabel, SegTabs, ScreenTitle, Toggle } from '../ui/primitives';
import { merge } from '../ui/styles';
import { useViewer } from '../viewer/ViewerContext';
import { RLV_REASONS, useRlv, type RlvRestriction } from '../viewer/RlvContext';
import { VIEWER_IDENTITY } from '../linkpoint/viewer-identity';

/**
 * Settings.
 *
 * Two halves: the skin browser, which is the whole point of a token system
 * this size, and the viewer preferences a third party viewer is expected to
 * expose — draw distance, chat commands, notifications, privacy and the mute
 * list.
 */
const SettingsScreen: React.FC = () => {
  const t = useTheme();
  const { layout, palette, device, dense, largeType, setLayout, setPalette, setDevice, setDense, setLargeType } = useThemeContext();
  const { drawDistance, setDrawDistance, prefs, setPref } = useViewer();
  const rlv = useRlv();
  const [tab, setTab] = useState('APPEARANCE');

  return (
    <>
      <ScreenTitle title="SETTINGS" subtitle={`> ${t.name}`} />

      <SegTabs tabs={[{ label: 'APPEARANCE' }, { label: 'VIEWER' }, { label: 'PRIVACY' }, { label: 'RLV' }]} value={tab} onChange={setTab} />

      <CardList>
        {tab === 'APPEARANCE' && (
          <>
            <Card
              icon={Palette}
              title="Layout pack"
              right={LAYOUTS[layout].name}
              body={LAYOUTS[layout].note}
              accent={t.v.pri}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '11px' }}>
                {(Object.keys(LAYOUTS) as LayoutKey[]).map((key) => {
                  const L = LAYOUTS[key];
                  const on = key === layout;
                  return (
                    <button key={key} type="button" onClick={() => setLayout(key)} style={pickStyle(t, on)}>
                      {/* The swatch is the pack's own corner radius — the
                          fastest way to read what a layout pack actually does. */}
                      <span
                        style={{
                          width: '22px',
                          height: '22px',
                          flex: 'none',
                          border: `1px solid ${on ? t.v.onpriC : t.v.pri}`,
                          borderRadius: L.s.rs,
                          background: on ? 'transparent' : t.v.surf2,
                        }}
                      />
                      <span style={{ flex: 1, minWidth: 0, font: `500 12px/1.3 ${t.font}`, textAlign: 'left' }}>{L.name}</span>
                      <span style={{ font: `600 8.5px/1 ${t.dfont}`, letterSpacing: '.14em', opacity: 0.6 }}>{L.nav}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card
              icon={Droplets}
              title="Colour pack"
              right={PALETTES[palette].name}
              body={`${Object.keys(PALETTES).length} palettes across ${PALETTE_FAMILIES.length} families. Any pack drops into any layout — ${Object.keys(LAYOUTS).length * Object.keys(PALETTES).length} combinations.`}
            >
              <div style={{ marginTop: '11px' }}>
                {PALETTE_FAMILIES.map((fam) => (
                  <div key={fam.name}>
                    <SectionLabel style={{ margin: '10px 0 5px' }}>{fam.name}</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {(fam.keys as PaletteKey[]).map((key) => {
                        const P = PALETTES[key];
                        const on = key === palette;
                        return (
                          <button key={key} type="button" onClick={() => setPalette(key)} style={pickStyle(t, on)}>
                            <span style={{ display: 'flex', flex: 'none', border: `1px solid ${t.v.outv}`, overflow: 'hidden', borderRadius: '3px' }}>
                              {[P.c.bg, P.c.pri, P.c.sec].map((c, i) => (
                                <span key={i} style={{ width: '11px', height: '20px', background: c }} />
                              ))}
                            </span>
                            <span style={{ flex: 1, minWidth: 0, font: `500 12px/1.3 ${t.font}`, textAlign: 'left' }}>{P.name}</span>
                            {P.light && <span style={{ font: `600 8px/1 ${t.dfont}`, letterSpacing: '.14em', opacity: 0.6 }}>LIGHT</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card icon={Smartphone} title="Form factor" right={DEVICES[device].name} body="Preview how the shell reflows: phones get bottom tabs, split devices get a rail.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '11px' }}>
                {(Object.keys(DEVICES) as DeviceKey[]).map((key) => {
                  const D = DEVICES[key];
                  const on = key === device;
                  return (
                    <button key={key} type="button" onClick={() => setDevice(key)} style={pickStyle(t, on)}>
                      <span style={{ flex: 1, minWidth: 0, font: `500 12px/1.3 ${t.font}`, textAlign: 'left' }}>{D.name}</span>
                      <span style={{ font: `400 9.5px/1 ${t.font}`, opacity: 0.6 }}>{D.dims}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card
              icon={Rows3}
              title="Compact density"
              body={dense ? 'ON · Lumiya-style dense rows' : 'OFF · comfortable rows'}
              toggle={{ on: dense, onChange: setDense }}
            />

            <Card
              icon={Type}
              title="Large type"
              body="Scales body copy to 18px throughout. Pair with the Paper & Ink pack for sunlight."
              toggle={{ on: largeType, onChange: setLargeType }}
            />
          </>
        )}

        {tab === 'VIEWER' && (
          <>
            <Card
              icon={Eye}
              title="Draw distance"
              right={`${drawDistance}m`}
              body="How far the scene streams. Lower it on mobile data to save battery and bandwidth."
            >
              <div style={{ display: 'flex', gap: '5px', marginTop: '11px' }}>
                {[64, 96, 128, 256].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDrawDistance(m)}
                    style={merge(pickStyle(t, m === drawDistance), { justifyContent: 'center', flex: 1 })}
                  >
                    <span style={{ font: `600 11px/1 ${t.dfont}`, letterSpacing: '.1em' }}>{m}m</span>
                  </button>
                ))}
              </div>
            </Card>

            <PrefCard icon={Bell} title="Push notifications" body="IMs, group notices and teleport offers, with quick reply from the shade." on={prefs.pushNotifications} onChange={(v) => setPref('pushNotifications', v)} />
            <PrefCard icon={Mic} title="Voice indicator" body="Show speaking rings in radar and chat. Voice is listen-only on mobile." on={prefs.voiceIndicator} onChange={(v) => setPref('voiceIndicator', v)} />
            <PrefCard icon={Keyboard} title="Chat channel commands" body="/me, /shout and /1 through /999 mapped to compose-bar shortcuts." on={prefs.chatCommands} onChange={(v) => setPref('chatCommands', v)} />
            <PrefCard icon={Wifi} title="Stream over mobile data" body="Off keeps texture and mesh streaming on Wi-Fi only." on={prefs.mobileData} onChange={(v) => setPref('mobileData', v)} />
            <PrefCard icon={LayoutDashboard} title="Keep screen awake in world" body="Prevents the display sleeping while the 3D view is open." on={prefs.keepAwake} onChange={(v) => setPref('keepAwake', v)} />
          </>
        )}

        {tab === 'PRIVACY' && (
          <>
            <PrefCard icon={Eye} title="Show typing indicator" body="Lets others see when you are composing an IM." on={prefs.showTypingIndicator} onChange={(v) => setPref('showTypingIndicator', v)} />
            <PrefCard icon={Bell} title="IM alerts" body="Sound and vibration on a new instant message." on={prefs.imAlerts} onChange={(v) => setPref('imAlerts', v)} />
            <Card icon={Shield} title="Mute & block list" right="6" body="3 residents · 3 objects" actions={[{ label: 'MANAGE LIST' }]} />
            <Card
              icon={Shield}
              title="Scripted object grants"
              body="Two objects hold standing permissions: Aurora Dance HUD (animate, take controls) and ZHAO II (animate)."
              actions={[{ label: 'REVIEW GRANTS' }, { label: 'REVOKE ALL', kind: 'danger' }]}
            />
            <Card
              icon={Shield}
              title="Log out"
              body="Ends the session and clears the saved session token. Saved credentials are kept unless you clear them."
              actions={[{ label: 'LOG OUT', kind: 'danger' }]}
            />
          </>
        )}

        {tab === 'RLV' && (
          <>
            <Card
              icon={Lock}
              title="Restrained Life"
              body={
                rlv.enabled
                  ? 'On. Objects you wear may restrict what this viewer will let you do, and those restrictions are enforced until the object releases them.'
                  : 'Off. No worn object can restrict this viewer. RLV is consensual: nothing is enforced until you turn it on yourself.'
              }
              accent={rlv.enabled ? t.v.warn : undefined}
              toggle={{ on: rlv.enabled, onChange: rlv.setEnabled }}
            />

            {/* The active restriction list is the honest disclosure a resident
                needs: what is being enforced, right now, and by which rule. */}
            <Card
              title="Active restrictions"
              right={rlv.enabled ? `${rlv.active.size}` : 'off'}
              body={
                rlv.enabled
                  ? 'Normally set by a worn object. Listed here so you can always see exactly what is being held.'
                  : 'Turn Restrained Life on to see and simulate restrictions.'
              }
            >
              {rlv.enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                  {(Object.keys(RLV_REASONS) as RlvRestriction[]).map((r) => (
                    <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: `500 11.5px/1.3 ${t.font}`, color: t.v.ink }}>@{r}</div>
                        <div style={{ font: `400 10px/1.4 ${t.font}`, color: t.v.ink2, marginTop: '2px' }}>{RLV_REASONS[r]}</div>
                      </div>
                      <Toggle on={rlv.restricted(r)} onChange={(v) => rlv.setRestriction(r, v)} label={r} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        <Card
          title="Viewer identity"
          body={`${VIEWER_IDENTITY} — the channel and version sent to the grid at login. A viewer must identify itself honestly, so this is fixed and not editable.`}
        />
      </CardList>
    </>
  );
};

const PrefCard: React.FC<{ icon: typeof Bell; title: string; body: string; on: boolean; onChange: (on: boolean) => void }> = ({
  icon,
  title,
  body,
  on,
  onChange,
}) => <Card icon={icon} title={title} body={body} toggle={{ on, onChange }} />;

/** A row in one of the pickers. */
function pickStyle(t: ReturnType<typeof useTheme>, on: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: '44px',
    padding: '0 10px',
    cursor: 'pointer',
    borderRadius: t.v.rs,
    border: `1px solid ${on ? t.v.pri : t.v.outv}`,
    background: on ? t.v.priC : 'transparent',
    color: on ? t.v.onpriC : t.v.ink,
  };
}

export default SettingsScreen;
