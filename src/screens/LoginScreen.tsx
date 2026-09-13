import React, { useState } from 'react';
import { AlertTriangle, Loader } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { Button, SectionLabel } from '../ui/primitives';
import { app } from '../linkpoint/app';
import { GRIDS, START_LOCATIONS } from '../data/slData';

/**
 * Login.
 *
 * A third party viewer's login panel has an expected shape: pick a grid (with
 * a custom login URI for OpenSim), give an avatar name and password, choose a
 * start location, and optionally remember the credentials. The name field
 * accepts both the legacy "First Last" form and the modern single username,
 * which resolves to "<name> Resident" on the wire.
 */
interface LoginScreenProps {
  onLoginSuccess: () => void;
}

type Status = 'idle' | 'connecting' | 'error';

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const t = useTheme();
  const [grid, setGrid] = useState('agni');
  const [customUri, setCustomUri] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [startLocation, setStartLocation] = useState('last');
  const [typedRegion, setTypedRegion] = useState('');
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter both an avatar name and a password.');
      setStatus('error');
      return;
    }
    if (grid === 'custom' && !customUri.trim()) {
      setError('Enter the login URI for the grid you want to reach.');
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setError(null);

    // "last" and "home" are the literal tokens the login service expects;
    // anything else is a region name, sent as a start-location URI.
    const location =
      startLocation === 'typed' && typedRegion.trim()
        ? `uri:${typedRegion.trim()}&128&128&0`
        : startLocation === 'home'
          ? 'home'
          : 'last';

    try {
      const gridId = grid === 'custom' ? customUri.trim() : grid;
      await app.auth.login(gridId, username.trim(), password, remember, location);
      onLoginSuccess();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Login failed. Check your credentials and try again.');
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ marginBottom: '22px' }}>
        <div style={{ font: `700 26px/1.1 ${t.dfont}`, letterSpacing: t.v.tls, color: t.v.ink }}>LINKPOINT</div>
        <div style={{ font: `400 11.5px/1.5 ${t.font}`, color: t.v.ink2, marginTop: '7px' }}>
          A Second Life viewer for the phone in your pocket.
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '9px',
            marginBottom: '16px',
            padding: '10px 12px',
            border: `1px solid ${t.v.err}`,
            borderRadius: t.v.rs,
            font: `400 11.5px/1.5 ${t.font}`,
            color: t.v.err,
          }}
        >
          <AlertTriangle size={15} strokeWidth={1.9} style={{ flex: 'none', marginTop: '1px' }} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <Field label="Grid">
          <select value={grid} onChange={(e) => setGrid(e.target.value)} style={controlStyle(t)} aria-label="Grid">
            {GRIDS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>

        {grid === 'custom' && (
          <Field label="Login URI" hint="The grid's XML-RPC login endpoint, as its operator publishes it.">
            <input
              value={customUri}
              onChange={(e) => setCustomUri(e.target.value)}
              placeholder="http://login.example-grid.org"
              style={controlStyle(t)}
              aria-label="Login URI"
            />
          </Field>
        )}

        <Field label="Avatar name" hint='Legacy "First Last", or a single username.'>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Ruth Resident"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            style={controlStyle(t)}
            aria-label="Avatar name"
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={controlStyle(t)}
            aria-label="Password"
          />
        </Field>

        <Field label="Start at">
          <select value={startLocation} onChange={(e) => setStartLocation(e.target.value)} style={controlStyle(t)} aria-label="Start location">
            {START_LOCATIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>

        {startLocation === 'typed' && (
          <Field label="Region">
            <input
              value={typedRegion}
              onChange={(e) => setTypedRegion(e.target.value)}
              placeholder="Da Boom"
              style={controlStyle(t)}
              aria-label="Region name"
            />
          </Field>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer', font: `400 12px/1.4 ${t.font}`, color: t.v.ink2 }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ width: '17px', height: '17px', accentColor: t.v.pri, flex: 'none' }}
          />
          Remember my name and grid
        </label>

        <Button type="submit" kind="primary" disabled={status === 'connecting'} style={{ minHeight: '50px', marginTop: '4px' }}>
          {status === 'connecting' ? (
            <>
              <Loader size={14} strokeWidth={2.2} style={{ marginRight: '9px', animation: 'lp-spin 1.2s linear infinite' }} />
              CONNECTING…
            </>
          ) : (
            'LOG IN'
          )}
        </Button>
      </form>

      <div style={{ font: `400 10px/1.6 ${t.font}`, color: t.v.ink2, marginTop: '18px' }}>
        Your password is sent to the grid's login service and is never stored — only your name and grid are remembered.
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => {
  const t = useTheme();
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div style={{ marginTop: '6px' }}>{children}</div>
      {hint && <div style={{ font: `400 10px/1.5 ${t.font}`, color: t.v.ink2, marginTop: '5px' }}>{hint}</div>}
    </div>
  );
};

function controlStyle(t: ReturnType<typeof useTheme>): React.CSSProperties {
  return {
    width: '100%',
    minHeight: '46px',
    boxSizing: 'border-box',
    padding: '0 12px',
    border: `1px solid ${t.v.outv}`,
    borderRadius: t.v.rs,
    background: t.v.surf,
    color: t.v.ink,
    font: `400 16px/1.4 ${t.font}`,
    outline: 'none',
  };
}

export default LoginScreen;
