import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { NAV_ALL } from '../data/content.js';
import useGoogleEnabled from '../hooks/useGoogleEnabled.js';
import Toggle from '../components/Toggle.jsx';
import AccessibleButton from '../components/AccessibleButton.jsx';
import ThemeStudio from '../components/ThemeStudio.jsx';
import FormField from '../components/FormField.jsx';
import { loadGoogle } from '../services/google.ts';
import { useApp } from '../context/AppContext.jsx';
import { app } from '../linkpoint/app.ts';
import Icon from '../components/Icon.jsx';
import VoiceDevices from '../components/VoiceDevices.jsx';
import { LAYOUTS, PALETTES, PALETTE_FAMILIES as FAMILIES } from '@linkpoint/design-system/tokens';
import {
  CAPABILITY_STATES,
  getFeatureCapability,
  isFeatureVisible,
} from '../config/featureCapabilities.js';

function CapabilityBadge({ capability, size = 'small' }) {
  if (!capability || capability === CAPABILITY_STATES.SUPPORTED) return null;
  const isSmall = size === 'small';
  return (
    <span
      className="capability-badge"
      style={{
        marginLeft: isSmall ? '6px' : '8px',
        fontSize: isSmall ? '9px' : '11px',
        padding: isSmall ? '1px 5px' : '2px 6px',
        borderRadius: isSmall ? '3px' : '4px',
        background: 'var(--settings-accent, #3b82f6)',
        color: '#fff',
        textTransform: 'uppercase',
        fontWeight: '600',
      }}
    >
      {capability}
    </span>
  );
}

function SwitchSetting({ id, title, description, on, onClick, devMode }) {
  if (!isFeatureVisible(id, devMode)) return null;
  const capability = getFeatureCapability(id);
  const isExperimental = capability !== CAPABILITY_STATES.SUPPORTED;

  return (
    <div className="settings-switch-row">
      <div>
        <strong id={`${id}-label`}>
          {title}
          <CapabilityBadge capability={capability} size="medium" />
        </strong>
        {isExperimental ? (
          <small>Experimental preview — requires viewer backend support.</small>
        ) : description ? (
          <small>{description}</small>
        ) : null}
      </div>
      <AccessibleButton as="span" role="none" aria-labelledby={`${id}-label`}>
        <Toggle
          aria-labelledby={`${id}-label`}
          on={on}
          onClick={onClick}
          disabled={isExperimental}
        />
      </AccessibleButton>
    </div>
  );
}

export default function Settings() {
  const { state, actions } = useApp();
  const { V, t, LK } = useTheme();
  const contentRef = useRef(null);
  const browserRef = useRef(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = browserRef.current;
    if (!element) return;
    const resize = () => setCompact(element.getBoundingClientRect().width <= 600);
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(element);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [matches, setMatches] = useState(11);
  const categories = [
    ['all', 'All preferences'],
    ['session', 'Connection'],
    ['appearance', 'Appearance'],
    ['graphics', 'Graphics'],
    ['sound-voice', 'Sound & voice'],
    ['chat-im', 'Chat & IM'],
    ['notifications', 'Notifications'],
    ['privacy', 'Privacy & RLV'],
    ['storage', 'Storage & network'],
    ['integrations', 'Integrations'],
    ['about', 'About'],
  ];
  const devMode = Boolean(state.toggles.devMode);

  useEffect(() => {
    let count = 0;
    for (const section of contentRef.current?.querySelectorAll(':scope > section') || []) {
      const id = section.getAttribute('aria-labelledby')?.replace('-heading', '') || '';
      const matchesCategory = category === 'all' || id === category;
      const query = search.trim().toLowerCase();
      const matchesSearch = !query || section.textContent.toLowerCase().includes(query);
      const isVisible = matchesCategory && matchesSearch;
      section.hidden = !isVisible;
      if (isVisible) count++;
    }
    setMatches(count);
  }, [category, search, devMode]);
  const [disconnecting, setDisconnecting] = useState(false);
  const googleEnabled = useGoogleEnabled();
  const [googleNote, setGoogleNote] = useState('');
  const user = app.auth.user;
  const region = app.world.region;

  const setVolume = (value) => {
    actions.setPref('volume', value);
    app.audio.setVolume(Number.parseInt(value, 10) / 100 || 0);
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await app.auth.logout();
      actions.setScreen('Login');
    } finally {
      setDisconnecting(false);
    }
  };

  // Turning Google off also signs out and forgets this session's access, so nothing stays connected in the background.
  const toggleGoogle = async () => {
    const next = !googleEnabled;
    app.preferences.set('integrations', 'google', next);
    setGoogleNote('');
    if (!next) {
      try {
        const google = await loadGoogle();
        await google.auth.signOutGoogle();
        setGoogleNote('Google is off and you have been signed out of it.');
      } catch {
        setGoogleNote(
          "Google is off. Sign-out could not be confirmed; clear this site's data to be sure.",
        );
      }
    }
  };

  return (
    <div
      ref={browserRef}
      data-layout={t.nav === 'SWEEP' ? 'sweep' : state.layout}
      className={`settings-browser${compact ? ' settings-browser-compact' : ''}`}
      style={{
        color: V.ink,
        background: V.bg,
        fontFamily: t.font,
        '--settings-surface': V.surf,
        '--settings-border': V.outv,
        '--settings-radius': t.nav === 'SWEEP' ? '0px' : V.rp,
        '--control-radius': t.nav === 'SWEEP' ? '0px' : V.rs,
        '--settings-card-border':
          LK.card === 'quiet' || LK.card === 'rule' ? 'transparent' : V.outv,
        '--settings-rail': V.sec2,
        '--surf': V.surf,
        '--surf2': V.surf2,
        '--settings-accent': V.pri,
      }}
    >
      <aside className="settings-categories">
        <FormField label="Search settings">
          <input
            type="search"
            aria-label="Search settings"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCategory('all');
            }}
            placeholder="Camera, chat, cache…"
          />
        </FormField>
        <nav aria-label="Preference categories">
          {categories.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
              style={{
                color: category === id ? V.onpriC : V.ink,
                background: category === id ? V.priC : V.surf,
              }}
            >
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="tool-page settings-content" ref={contentRef}>
        <nav aria-label="Viewer tools" className="settings-tools">
          {NAV_ALL.filter((item) => !['Settings', 'Screens'].includes(item.id)).map((item) => (
            <button key={item.id} type="button" onClick={() => actions.setScreen(item.id)}>
              {item.id}
            </button>
          ))}
        </nav>
        {!matches ? <p role="status">No settings match your search.</p> : null}
        {/* Current Session */}
        <section className="runtime-card" aria-labelledby="session-heading">
          <Icon name="plug" size={22} />
          <h2 id="session-heading">Current session</h2>
          <dl>
            <dt>Status</dt>
            <dd>{app.auth.isLoggedIn() ? 'Connected' : 'Disconnected'}</dd>
            <dt>Resident</dt>
            <dd>{user?.fullName || '—'}</dd>
            <dt>Grid</dt>
            <dd>{user?.grid || state.loginGrid || '—'}</dd>
            <dt>Region</dt>
            <dd>{region?.name || app.protocol.authReply?.sim_name || 'Not supplied'}</dd>
            <dt>Account ID</dt>
            <dd>{app.protocol.agentId || 'Not supplied'}</dd>
          </dl>
          <div className="inline-tool" style={{ gap: '8px', marginTop: '12px' }}>
            <button type="button" onClick={() => actions.reconnect()} disabled={state.reconnecting}>
              {state.reconnecting ? 'Reconnecting…' : 'Reconnect to Grid'}
            </button>
            {app.auth.isLoggedIn() ? (
              <button type="button" disabled={disconnecting} onClick={() => void disconnect()}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : null}
          </div>
        </section>

        {/* Optional Integrations */}
        <section className="runtime-card" aria-labelledby="integrations-heading">
          <Icon name="plug" size={22} />
          <h2 id="integrations-heading">Optional integrations</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <strong id="google-label">Google Contacts &amp; Calendar</strong>
              <p style={{ margin: '4px 0 0', opacity: 0.8 }}>
                Off by default. When on, you can copy saved contacts to Google Contacts and add
                group notices to Google Calendar. You sign in with Google only when you use one of
                those, and Linkpoint asks for just the access that feature needs. Contacts and
                notices work without it.
              </p>
            </div>
            <AccessibleButton as="span" role="none" aria-labelledby="google-label">
              <Toggle
                aria-labelledby="google-label"
                on={googleEnabled}
                onClick={() => void toggleGoogle()}
              />
            </AccessibleButton>
          </div>
          {googleNote ? <p role="status">{googleNote}</p> : null}
        </section>

        {/* Appearance, Themes & Palettes */}
        <section className="runtime-card" aria-labelledby="appearance-heading">
          <Icon name="palette" size={22} />
          <h2 id="appearance-heading">Appearance &amp; format</h2>
          <div className="settings-field-grid">
            <FormField label="Layout">
              <select
                id="settings-layout-select"
                aria-label="Layout"
                value={state.layout}
                onChange={(event) => actions.setLayout(event.target.value)}
              >
                {Object.entries(LAYOUTS).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Colour theme">
              <select
                id="settings-theme-select"
                aria-label="Colour theme"
                value={state.palette}
                onChange={(event) => actions.setPalette(event.target.value)}
              >
                {FAMILIES
                  ? FAMILIES.map((family) => (
                      <optgroup key={family.name} label={family.name}>
                        {family.keys
                          .filter((key) => PALETTES[key])
                          .map((key) => (
                            <option key={key} value={key}>
                              {PALETTES[key].name}
                            </option>
                          ))}
                      </optgroup>
                    ))
                  : Object.entries(PALETTES).map(([k, x]) => (
                      <option key={k} value={k}>
                        {x.name}
                      </option>
                    ))}
              </select>
            </FormField>
            <FormField label="App format">
              <select
                id="settings-format-select"
                aria-label="App format"
                value={state.viewMode}
                onChange={(event) => actions.setViewMode(event.target.value)}
              >
                <option value="auto">Automatic</option>
                <option value="mobile">Mobile touch</option>
                <option value="desktop">Desktop windows</option>
              </select>
            </FormField>
            <FormField label="Content density">
              <select
                id="settings-density-select"
                aria-label="Content density"
                value={state.customTheme.density}
                onChange={(event) => actions.setDensity(event.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </FormField>
          </div>
          <SwitchSetting
            id="large-type"
            title="Large text"
            description="Increase interface text for easier touch-screen reading."
            on={state.toggles.largeType}
            onClick={() => actions.toggleSetting('largeType')}
            devMode={devMode}
          />
          <ThemeStudio />
        </section>

        {/* Graphics & Performance / Viewer Preferences */}
        <section className="runtime-card" aria-labelledby="graphics-heading">
          <Icon name="eye" size={22} />
          <h2 id="graphics-heading">Graphics &amp; performance</h2>
          <div className="settings-field-grid">
            <FormField label="Draw distance">
              <select
                id="settings-draw-distance-select"
                aria-label="Draw distance"
                value={state.prefs.draw}
                onChange={(event) => actions.setPref('draw', event.target.value)}
              >
                {['20 m', '32 m', '64 m', '96 m', '128 m', '192 m', '256 m'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Camera field of view">
              <select
                id="settings-fov-select"
                aria-label="Camera field of view"
                value={state.prefs.fov}
                onChange={(event) => actions.setPref('fov', Number(event.target.value))}
              >
                {[40, 60, 80, 100].map((value) => (
                  <option key={value} value={value}>
                    {value}°
                  </option>
                ))}
              </select>
            </FormField>
            {isFeatureVisible('quality', devMode) && (
              <FormField
                label={
                  <span>
                    Graphics quality
                    <CapabilityBadge capability={getFeatureCapability('quality')} />
                  </span>
                }
              >
                <select
                  id="settings-graphics-quality-select"
                  aria-label="Graphics quality"
                  disabled
                  title="Requires backend support; preview mode only"
                  value={state.prefs.quality}
                  onChange={(event) => actions.setPref('quality', event.target.value)}
                >
                  {['Low', 'Balanced', 'High', 'Ultra'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField label="Frame rate cap">
              <select
                id="settings-frame-rate-select"
                aria-label="Frame rate cap"
                value={state.prefs.fps}
                onChange={(event) => actions.setPref('fps', event.target.value)}
              >
                {['30 fps', '45 fps', '60 fps', 'Uncapped'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </FormField>
            {isFeatureVisible('complexity', devMode) && (
              <FormField
                label={
                  <span>
                    Avatar complexity
                    <CapabilityBadge capability={getFeatureCapability('complexity')} />
                  </span>
                }
              >
                <select
                  id="settings-avatar-complexity-select"
                  aria-label="Avatar complexity"
                  disabled
                  title="Requires backend support; preview mode only"
                  value={state.prefs.complexity}
                  onChange={(event) => actions.setPref('complexity', event.target.value)}
                >
                  {['20 000', '40 000', '80 000', '160 000', 'No limit'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </FormField>
            )}
            {isFeatureVisible('bandwidth', devMode) && (
              <FormField
                label={
                  <span>
                    Bandwidth limit
                    <CapabilityBadge capability={getFeatureCapability('bandwidth')} />
                  </span>
                }
              >
                <select
                  id="settings-bandwidth-limit-select"
                  aria-label="Bandwidth limit"
                  disabled
                  title="Requires backend support; preview mode only"
                  value={state.prefs.bandwidth}
                  onChange={(event) => actions.setPref('bandwidth', event.target.value)}
                >
                  {['500 kbps', '1 500 kbps', '3 000 kbps', 'Unlimited'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </FormField>
            )}
          </div>
          <SwitchSetting
            id="shadows"
            title="Render shadows"
            description="Dynamic shadows and deferred lighting pipeline."
            on={state.toggles.shadows}
            onClick={() => actions.toggleSetting('shadows')}
            devMode={devMode}
          />
          <SwitchSetting
            id="battery"
            title="Battery saver"
            description="Reduce background rendering on mobile."
            on={state.toggles.battery}
            onClick={() => actions.toggleSetting('battery')}
            devMode={devMode}
          />
        </section>

        {/* Sound & Audio (Microphone controls moved to 3D View and IM calls) */}
        <section className="runtime-card" aria-labelledby="sound-voice-heading">
          <Icon name="volume-2" size={22} />
          <h2 id="sound-voice-heading">Sound &amp; audio</h2>
          <div className="settings-field-grid">
            <FormField label="Master volume">
              <select
                id="settings-master-volume-select"
                aria-label="Master volume"
                value={state.prefs.volume}
                onChange={(event) => setVolume(event.target.value)}
              >
                {['Muted', '25%', '50%', '70%', '100%'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </FormField>
            {[
              ['voiceVolume', 'Voice volume'],
              ['sfxVolume', 'Object sounds'],
              ['uiVolume', 'Interface sounds'],
              ['ambientVolume', 'Ambient sounds'],
            ].map(([key, label]) => (
              <FormField key={key} label={label}>
                <select
                  id={`settings-${key}`}
                  aria-label={label}
                  value={state.prefs[key]}
                  onChange={(event) => actions.setPref(key, event.target.value)}
                >
                  {['Muted', '25%', '50%', '70%', '100%'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </FormField>
            ))}
          </div>
          <VoiceDevices />
          <SwitchSetting
            id="voice-indicator"
            title="Voice indicator"
            description="Show speaking rings in radar and chat logs."
            on={state.toggles.voice}
            onClick={() => actions.toggleSetting('voice')}
            devMode={devMode}
          />
          <SwitchSetting
            id="gamepad"
            title="Gamepad movement"
            description="Move with a connected gamepad: left stick walks and strafes, right stick turns, triggers fly up and down, A jumps. The stick processing is the viewer's joystick code; the gamepad layout is Linkpoint's."
            on={state.toggles.gamepad}
            onClick={() => actions.toggleSetting('gamepad')}
            devMode={devMode}
          />
          <SwitchSetting
            id="ptt-use"
            title="Push-to-talk"
            description="The microphone is open only while you hold the talk key, or after you press it in toggle mode. The microphone button and the middle mouse button toggle it."
            on={state.toggles.pttUse}
            onClick={() => actions.toggleSetting('pttUse')}
            devMode={devMode}
          />
          <SwitchSetting
            id="ptt-toggle"
            title="Push-to-talk toggle mode"
            description="Press once to open the microphone and again to close it, instead of holding."
            on={state.toggles.pttToggle}
            onClick={() => actions.toggleSetting('pttToggle')}
            devMode={devMode}
          />
          <SwitchSetting
            id="media-auto"
            title="Autoplay parcel media"
            description="Automatically start parcel audio streams and MOAP media."
            on={state.toggles.mediaAuto}
            onClick={() => actions.toggleSetting('mediaAuto')}
            devMode={devMode}
          />
          <p style={{ fontSize: '12px', opacity: 0.8, marginTop: '8px' }}>
            Simulator audio uses positional HRTF sound. Live microphone and voice call controls are
            located directly in the 3D World View and IM Calls.
          </p>
        </section>

        {/* Chat & IM */}
        <section className="runtime-card" aria-labelledby="chat-im-heading">
          <Icon name="message-square" size={22} />
          <h2 id="chat-im-heading">Chat, language &amp; privacy</h2>
          <div className="settings-field-grid">
            {isFeatureVisible('translate', devMode) && (
              <FormField
                label={
                  <span>
                    Translate incoming chat
                    <CapabilityBadge capability={getFeatureCapability('translate')} />
                  </span>
                }
              >
                <select
                  id="settings-translation-select"
                  aria-label="Translate incoming chat"
                  disabled
                  title="Requires backend support; preview mode only"
                  value={state.prefs.translate}
                  onChange={(event) => actions.setPref('translate', event.target.value)}
                >
                  {['Off', 'English', 'Spanish', 'French', 'German', 'Japanese', 'Português'].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </FormField>
            )}
            {isFeatureVisible('maturity', devMode) && (
              <FormField
                label={
                  <span>
                    Maturity rating
                    <CapabilityBadge capability={getFeatureCapability('maturity')} />
                  </span>
                }
              >
                <select
                  id="settings-maturity-select"
                  aria-label="Maturity rating"
                  disabled
                  title="Requires backend support; preview mode only"
                  value={state.prefs.maturity}
                  onChange={(event) => actions.setPref('maturity', event.target.value)}
                >
                  {['General', 'Moderate', 'Adult'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </FormField>
            )}
          </div>
          <SwitchSetting
            id="chat-cmds"
            title="Chat channel commands"
            description="Enable /1 gesture shortcuts and chat channel commands."
            on={state.toggles.chatCmds}
            onClick={() => actions.toggleSetting('chatCmds')}
            devMode={devMode}
          />
          <SwitchSetting
            id="timestamps"
            title="Message timestamps"
            description="Show the device’s local time alongside messages."
            on={state.toggles.timestamps}
            onClick={() => actions.toggleSetting('timestamps')}
            devMode={devMode}
          />
          <SwitchSetting
            id="im-logs"
            title="Keep chat logs on device"
            description="Save conversation history locally in device storage."
            on={state.toggles.imLogs}
            onClick={() => actions.toggleSetting('imLogs')}
            devMode={devMode}
          />
          <SwitchSetting
            id="typing"
            title="Send typing status"
            description="Notify contacts when you are composing a reply."
            on={state.toggles.typingSent}
            onClick={() => actions.toggleSetting('typingSent')}
            devMode={devMode}
          />
          <SwitchSetting
            id="autoresponse"
            title="Autoresponse while away"
            description="Send auto-reply message on incoming IMs while away."
            on={state.toggles.autoresponse}
            onClick={() => actions.toggleSetting('autoresponse')}
            devMode={devMode}
          />
        </section>

        {/* Notifications */}
        <section className="runtime-card" aria-labelledby="notifications-heading">
          <Icon name="bell" size={22} />
          <h2 id="notifications-heading">Notifications</h2>
          <SwitchSetting
            id="notify-local"
            title="Local notification popups"
            on={state.toggles.notifyLocal}
            onClick={() => actions.toggleSetting('notifyLocal')}
            devMode={devMode}
          />
          <SwitchSetting
            id="notify-im"
            title="Private message notification popups"
            on={state.toggles.notifyIM}
            onClick={() => actions.toggleSetting('notifyIM')}
            devMode={devMode}
          />
          <SwitchSetting
            id="notify-group"
            title="Group notice popups"
            description="Notices remain available in the notification list when popups are off."
            on={state.toggles.notifyGroup}
            onClick={() => actions.toggleSetting('notifyGroup')}
            devMode={devMode}
          />
          <SwitchSetting
            id="push"
            title="Push notifications"
            description="Receive IMs, group notices, and teleport offers in system shade."
            on={state.toggles.push}
            onClick={() => actions.toggleSetting('push')}
            devMode={devMode}
          />
        </section>

        {/* Privacy & Safety */}
        <section className="runtime-card" aria-labelledby="privacy-heading">
          <Icon name="shield" size={22} />
          <h2 id="privacy-heading">Privacy &amp; safety</h2>
          <div className="inline-tool" style={{ marginBottom: '12px' }}>
            <button type="button" onClick={() => actions.setScreen('Mute List')}>
              Open Mute &amp; Block List
            </button>
          </div>
          <SwitchSetting
            id="show-online"
            title="Show me as online"
            description="When off, friends see you offline and map position is hidden."
            on={state.toggles.showOnline}
            onClick={() => actions.toggleSetting('showOnline')}
            devMode={devMode}
          />
          <SwitchSetting
            id="rlv"
            title="RestrainedLove (RLV)"
            description="Lets worn scripted items restrict you (chat, IMs, names, flying, teleports) as in RLV viewers. Outfit and attachment locks are not supported yet. Turning this off clears every restriction."
            on={state.toggles.rlv}
            onClick={() => actions.toggleSetting('rlv')}
            devMode={devMode}
          />
          <div style={{ marginTop: '8px' }}>
            <strong>Scripted object permissions</strong>
            <p style={{ margin: '2px 0 10px', opacity: 0.8, fontSize: '12px' }}>
              Manage object animation, attachment, and control grants.
            </p>
            <div className="inline-tool" style={{ gap: '8px' }}>
              <button type="button" onClick={() => actions.setScreen('Notices')}>
                Review incoming requests
              </button>
              <button type="button" disabled title="Simulator grant revocation is not implemented">
                Revoke All Grants
              </button>
            </div>
          </div>
        </section>

        {/* Storage & Network */}
        <section className="runtime-card" aria-labelledby="storage-heading">
          <Icon name="database" size={22} />
          <h2 id="storage-heading">Storage &amp; network</h2>
          <div className="settings-field-grid">
            {isFeatureVisible('cacheLimit', devMode) && (
              <FormField
                label={
                  <span>
                    Cache size
                    <CapabilityBadge capability={getFeatureCapability('cacheLimit')} />
                  </span>
                }
              >
                <select
                  id="settings-cache-limit-select"
                  aria-label="Cache size"
                  disabled
                  title="Requires backend support; preview mode only"
                  value={state.prefs.cacheLimit}
                  onChange={(event) => actions.setPref('cacheLimit', Number(event.target.value))}
                >
                  {[256, 512, 1024, 2048].map((value) => (
                    <option key={value} value={value}>
                      {value >= 1024 ? `${value / 1024} GB` : `${value} MB`}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            {isFeatureVisible('cacheLoc', devMode) && (
              <FormField
                label={
                  <span>
                    Cache location
                    <CapabilityBadge capability={getFeatureCapability('cacheLoc')} />
                  </span>
                }
              >
                <select
                  id="settings-cache-location-select"
                  aria-label="Cache location"
                  disabled
                  title="Requires backend support; preview mode only"
                  value={state.prefs.cacheLoc}
                  onChange={(event) => actions.setPref('cacheLoc', event.target.value)}
                >
                  <option>Internal storage</option>
                  <option>Removable storage</option>
                </select>
              </FormField>
            )}
          </div>
          <SwitchSetting
            id="cache-exit"
            title="Clear cache on sign out"
            on={state.toggles.cacheOnExit}
            onClick={() => actions.toggleSetting('cacheOnExit')}
            devMode={devMode}
          />
          <div className="inline-tool" style={{ gap: '8px', marginTop: '12px' }}>
            <button type="button" onClick={actions.clearAllCache}>
              Clear cached assets
            </button>
            <button type="button" onClick={() => actions.setScreen('Cache')}>
              Open Cache &amp; Storage Manager
            </button>
            <button type="button" onClick={() => actions.setScreen('Diagnostics')}>
              Run Connection Diagnostics
            </button>
          </div>
        </section>

        {/* About Linkpoint */}
        <section className="runtime-card" aria-labelledby="about-heading">
          <Icon name="info" size={22} />
          <h2 id="about-heading">About Linkpoint</h2>
          <p style={{ margin: '0 0 12px', opacity: 0.85, fontSize: '13px' }}>
            Linkpoint Mobile &amp; Desktop Viewer · Open Source AGPL-3.0 License.
          </p>
          <SwitchSetting
            id="devMode"
            title="Developer / Experimental Mode"
            description="Display preview controls and capability tags for experimental viewer capabilities."
            on={state.toggles.devMode}
            onClick={() => actions.toggleSetting('devMode')}
            devMode={devMode}
          />
          <div className="inline-tool" style={{ gap: '8px', marginTop: '12px' }}>
            <a
              href="https://github.com/Kaleaon/React-Linkpoint/releases"
              target="_blank"
              rel="noreferrer"
            >
              Release Notes
            </a>
            <a
              href="https://github.com/Kaleaon/React-Linkpoint/issues/new"
              target="_blank"
              rel="noreferrer"
            >
              Report a Bug
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
