import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import { ViewerProvider, SCREENS, type ScreenId } from '../viewer/ViewerContext';
import { RlvProvider } from '../viewer/RlvContext';
import { LAYOUTS, PALETTES } from '../theme/tokens';
import { Shell } from '../components/Shell';
import LoginScreen from '../screens/LoginScreen';

/**
 * A smoke test over the whole surface.
 *
 * Thirteen screens crossed with six layout packs is more than anyone will click
 * through by hand after a change, and the failure mode that matters — a screen
 * that throws under one skin because of a token it assumed — is invisible until
 * someone opens exactly that combination.
 */

const STORAGE_KEY = 'linkpoint_theme';

function renderShellWith(screen: ScreenId, layout: string, palette: string): string {
  // The provider reads its initial skin from storage, which is also the only
  // way to choose one without reaching into its internals.
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout, palette, device: 'ios', dense: false, largeType: false }));

  // The screen is chosen up front: a server render runs once, so setting it
  // from inside the tree would leave every case rendering the default.
  return renderToString(
    <ThemeProvider>
      <ViewerProvider initialScreen={screen}>
        <RlvProvider>
          <Shell />
        </RlvProvider>
      </ViewerProvider>
    </ThemeProvider>,
  );
}

/** A string that only appears when that screen really is the one rendered. */
const FINGERPRINTS: Record<ScreenId, string> = {
  Chat: 'LOCAL',
  Friends: 'Filter by name',
  Radar: 'WHISPER 10m',
  Map: 'Find a region by name',
  World: 'ORBIT',
  Inventory: 'Filter 1,284 items',
  Profile: 'Rez day',
  Groups: 'slots',
  Notices: 'Autoresponse',
  Teleport: 'Paste a SLURL',
  Settings: 'Layout pack',
  Diagnostics: 'LATENCY',
};

describe('every screen renders', () => {
  it.each(SCREENS)('%s renders its own content', (screen) => {
    const html = renderShellWith(screen, 'terminal', 'ink');
    expect(html.length).toBeGreaterThan(100);
    // Without this the suite would happily pass while rendering Chat twelve
    // times over, which is exactly what it did before the fingerprint existed.
    expect(html, `${screen} did not render its own content`).toContain(FINGERPRINTS[screen]);
  });

  it('renders a different document for each screen', () => {
    const rendered = SCREENS.map((s) => renderShellWith(s, 'terminal', 'ink'));
    expect(new Set(rendered).size).toBe(SCREENS.length);
  });

  it('renders the login screen', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ layout: 'terminal', palette: 'ink', device: 'ios' }));
    const html = renderToString(
      <ThemeProvider>
        <LoginScreen onLoginSuccess={() => {}} />
      </ThemeProvider>,
    );
    expect(html).toContain('LINKPOINT');
  });
});

describe('every layout pack renders every screen', () => {
  // The navigation model, card treatment and header grammar all change per
  // pack, so this is where a pack-specific assumption shows up.
  for (const layout of Object.keys(LAYOUTS)) {
    it.each(SCREENS)(`${layout} / %s`, (screen) => {
      expect(() => renderShellWith(screen, layout, 'ink')).not.toThrow();
    });
  }
});

describe('every colour pack renders', () => {
  it.each(Object.keys(PALETTES))('%s paints the chat screen', (palette) => {
    expect(() => renderShellWith('Chat', 'terminal', palette)).not.toThrow();
  });

  it.each(Object.keys(PALETTES))('%s paints the in-world view', (palette) => {
    // The 3D view is the one screen that reads the sky and ground tokens.
    expect(() => renderShellWith('World', 'terminal', palette)).not.toThrow();
  });
});
