// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { PALETTES } from '@linkpoint/design-system/tokens';
import Settings from '../../screens/Settings.jsx';
import { app } from '../app';
import { Utils } from '../utils';
import { saveMfaHash } from '../mfa-store';
import { VIEWER_SETTINGS_KEY } from '../../hooks/viewerSettings.js';
import { KEYBINDINGS_STORAGE_KEY, KeybindingsProvider } from '../../context/KeybindingsContext.tsx';
import { THEME_STORAGE_KEY, themeFromPalette } from '../../theme/customTheme.js';
import {
  MAX_SETTINGS_BACKUP_BYTES,
  SETTINGS_BACKUP_SCHEMA,
  SETTINGS_BACKUP_VERSION,
  createSettingsBackupPayload,
  validateSettingsBackup,
} from '../../services/settingsBackup';
import {
  commandFor,
  getStoredKeyOverrides,
  serializeKeyBindings,
  setCachedKeyOverrides,
} from '../key-bindings';
import { click, flush, mountScreen, typeInto, unmount, type Mounted } from './ui-helpers';

function SettingsWithKeybindings() {
  return (
    <KeybindingsProvider>
      <Settings />
    </KeybindingsProvider>
  );
}

vi.mock('../../services/google.ts', () => ({
  loadGoogle: async () => ({
    auth: { signOutGoogle: vi.fn(), getGoogleToken: () => null, signInWithGoogle: vi.fn() },
    contacts: {},
    calendar: {},
  }),
}));

async function uploadBackupFile(input: HTMLInputElement, file: File) {
  await act(async () => {
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
}

let mounted: Mounted | null = null;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
  setCachedKeyOverrides({});
  Utils.storage.memoryStore.clear();
  app.auth.user = null;
  app.auth.credentials = null;
  app.auth.sessionSnapshot = null;
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  localStorage.clear();
  setCachedKeyOverrides({});
  app.auth.user = null;
  app.auth.credentials = null;
  app.auth.sessionSnapshot = null;
  vi.restoreAllMocks();
});

describe('Settings JSON backup & restore', () => {
  it('renders Export Backup and Restore Backup controls under Storage & network and matches search', async () => {
    mounted = await mountScreen(SettingsWithKeybindings);
    const storageSection = mounted.host.querySelector(
      'section[aria-labelledby="storage-heading"]',
    ) as HTMLElement;
    expect(storageSection).not.toBeNull();
    expect(storageSection.querySelector('#settings-export-backup-btn')?.textContent).toBe(
      'Export Backup',
    );
    expect(storageSection.querySelector('#settings-restore-backup-btn')?.textContent).toBe(
      'Restore Backup',
    );
    expect(storageSection.querySelector('#settings-restore-backup-input')).not.toBeNull();

    const searchInput = mounted.host.querySelector(
      'input[aria-label="Search settings"]',
    ) as HTMLInputElement;
    await typeInto(searchInput, 'backup');
    expect(storageSection.hidden).toBe(false);
  });

  it('exports preferences, custom theme, and keybindings to JSON while excluding all credentials and session data', async () => {
    // Seed sensitive auth, MFA, and session state to verify none of it leaks into the backup
    Utils.storage.set('linkpoint_credentials', {
      username: 'Alice Avatar',
      grid: 'agni',
      password: 'super-secret-password',
      rememberMe: true,
    });
    saveMfaHash('agni', 'Alice Avatar', 'mfa-device-hash-999');
    app.auth.user = {
      id: '00000000-1111-2222-3333-444444444444',
      firstName: 'Alice',
      lastName: 'Avatar',
      fullName: 'Alice Avatar',
      grid: 'agni',
    };
    app.auth.sessionSnapshot = {
      mode: 'grid',
      grid: 'agni',
      username: 'Alice Avatar',
      user: app.auth.user,
      sessionId: 'secret-session-uuid',
      agentId: '00000000-1111-2222-3333-444444444444',
      lastLoginAt: '2026-11-23T00:00:00.000Z',
    };

    const customAero = {
      ...themeFromPalette(PALETTES.aero, 'Starlight Custom'),
      active: true,
      layoutMode: 'split',
      density: 'comfortable',
      breakpoint: 'tablet',
    };
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(customAero));
    localStorage.setItem(
      KEYBINDINGS_STORAGE_KEY,
      JSON.stringify({
        singleCharShortcutsEnabled: false,
        customBindings: {
          toggleMouselook: 'Alt+M',
          toggleOverlays: 'Ctrl+Shift+H',
        },
        overrides: {
          third_person: [['Z', 'NONE', 'toggle_run']],
        },
      }),
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let capturedBlob: Blob | null = null;
    const createUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((obj: Blob | MediaSource) => {
        capturedBlob = obj as Blob;
        return 'blob:linkpoint-backup-test';
      });
    const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    mounted = await mountScreen(SettingsWithKeybindings);

    await typeInto(
      mounted.host.querySelector('#settings-layout-select') as HTMLSelectElement,
      'tiles',
    );
    await typeInto(mounted.host.querySelector('#settings-fov-select') as HTMLSelectElement, '80');
    await typeInto(
      mounted.host.querySelector('#settings-draw-distance-select') as HTMLSelectElement,
      '192 m',
    );

    const exportBtn = mounted.host.querySelector(
      '#settings-export-backup-btn',
    ) as HTMLButtonElement;
    await click(exportBtn);

    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:linkpoint-backup-test');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(capturedBlob).not.toBeNull();

    const exportedText = await capturedBlob!.text();
    expect(exportedText).not.toContain('super-secret-password');
    expect(exportedText).not.toContain('mfa-device-hash-999');
    expect(exportedText).not.toContain('secret-session-uuid');
    expect(exportedText).not.toContain('00000000-1111-2222-3333-444444444444');
    expect(exportedText).not.toContain('Alice Avatar');

    const parsed = JSON.parse(exportedText);
    expect(parsed.schema).toBe(SETTINGS_BACKUP_SCHEMA);
    expect(parsed.version).toBe(SETTINGS_BACKUP_VERSION);
    expect(parsed.viewerSettings.layout).toBe('tiles');
    expect(parsed.viewerSettings.prefs.fov).toBe(80);
    expect(parsed.viewerSettings.prefs.draw).toBe('192 m');
    expect(parsed.customTheme.active).toBe(true);
    expect(parsed.customTheme.name).toBe('Starlight Custom');
    expect(parsed.customTheme.layoutMode).toBe('split');
    expect(parsed.keybindings.singleCharShortcutsEnabled).toBe(false);
    expect(parsed.keybindings.customBindings.toggleMouselook).toBe('Alt+M');
    expect(parsed.keybindings.customBindings.toggleOverlays).toBe('Ctrl+Shift+H');
    expect(parsed.keybindings.modeBindings.third_person).toEqual([['Z', 'NONE', 'toggle_run']]);
    expect(parsed.keybindings.modeBindings.first_person.length).toBeGreaterThan(10);
  });

  it('restores preferences, custom theme, and keybindings live without refreshing the page', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mounted = await mountScreen(SettingsWithKeybindings);

    // Verify initial defaults before restore
    expect(mounted.ctx.current.state.layout).toBe('terminal');
    expect(mounted.ctx.current.state.palette).toBe('ink');
    expect(mounted.ctx.current.state.prefs.fov).toBe(60);

    const customTheme = {
      ...themeFromPalette(PALETTES.aero, 'Restored Nebula'),
      active: true,
      layoutMode: 'rail',
      density: 'compact',
      breakpoint: 'mobile',
    };

    const backupPayload = createSettingsBackupPayload({
      viewerSettings: {
        layout: 'tiles',
        palette: 'aero',
        dense: true,
        density: 'compact',
        toggles: {
          largeType: true,
          timestamps: false,
          notifyIM: false,
        },
        prefs: {
          draw: '256 m',
          fov: 100,
          fps: '30 fps',
          volume: '25%',
        },
      },
      customTheme,
      keybindings: {
        singleCharShortcutsEnabled: false,
        customBindings: {
          toggleMouselook: 'Alt+K',
          toggleOverlays: 'Ctrl+J',
        },
        overrides: {
          sitting: [['Z', 'SHIFT', 'toggle_voice']],
        },
      },
      viewMode: 'mobile',
    });

    const fileInput = mounted.host.querySelector(
      '#settings-restore-backup-input',
    ) as HTMLInputElement;
    const file = new File([JSON.stringify(backupPayload, null, 2)], 'backup.json', {
      type: 'application/json',
    });

    await uploadBackupFile(fileInput, file);

    // Verify live React state updated without remount/reload
    expect(mounted.ctx.current.state.layout).toBe('tiles');
    expect(mounted.ctx.current.state.palette).toBe('aero');
    expect(mounted.ctx.current.state.dense).toBe(true);
    expect(mounted.ctx.current.state.viewMode).toBe('mobile');
    expect(mounted.ctx.current.state.toggles.largeType).toBe(true);
    expect(mounted.ctx.current.state.toggles.timestamps).toBe(false);
    expect(mounted.ctx.current.state.toggles.notifyIM).toBe(false);
    expect(mounted.ctx.current.state.prefs.draw).toBe('256 m');
    expect(mounted.ctx.current.state.prefs.fov).toBe(100);
    expect(mounted.ctx.current.state.prefs.fps).toBe('30 fps');
    expect(mounted.ctx.current.state.prefs.volume).toBe('25%');
    expect(mounted.ctx.current.state.customTheme.active).toBe(true);
    expect(mounted.ctx.current.state.customTheme.name).toBe('Restored Nebula');
    expect(mounted.ctx.current.state.customTheme.layoutMode).toBe('rail');
    expect(mounted.ctx.current.state.customTheme.density).toBe('compact');

    // Verify rendered Settings UI controls reflect restored preferences & keybindings immediately
    expect((mounted.host.querySelector('#settings-layout-select') as HTMLSelectElement).value).toBe(
      'tiles',
    );
    expect((mounted.host.querySelector('#settings-theme-select') as HTMLSelectElement).value).toBe(
      'aero',
    );
    expect((mounted.host.querySelector('#settings-fov-select') as HTMLSelectElement).value).toBe(
      '100',
    );

    const singleCharSwitch = mounted.host
      .querySelector('#single-char-shortcuts-label')
      ?.closest('.settings-switch-row')
      ?.querySelector('[role="switch"]');
    expect(singleCharSwitch?.getAttribute('aria-checked')).toBe('false');
    expect(mounted.host.textContent).toContain('Alt+K');
    expect(mounted.host.textContent).toContain('Ctrl+J');

    // Verify status message, runtime override cache, and localStorage persistence
    const statusBanner = mounted.host.querySelector(
      'section[aria-labelledby="storage-heading"] [role="status"]',
    );
    expect(statusBanner?.textContent).toContain('restored from backup');

    const storedViewer = JSON.parse(localStorage.getItem(VIEWER_SETTINGS_KEY) || '{}');
    expect(storedViewer.layout).toBe('tiles');
    expect(storedViewer.prefs.fov).toBe(100);

    const storedTheme = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || '{}');
    expect(storedTheme.name).toBe('Restored Nebula');

    const storedKeys = JSON.parse(localStorage.getItem(KEYBINDINGS_STORAGE_KEY) || '{}');
    expect(storedKeys.singleCharShortcutsEnabled).toBe(false);
    expect(storedKeys.customBindings.toggleMouselook).toBe('Alt+K');
    expect(commandFor('sitting', 'Z', 'SHIFT', storedKeys.overrides)).toBe('toggle_voice');
    expect(commandFor('sitting', 'Z', 'SHIFT', getStoredKeyOverrides())).toBe('toggle_voice');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid or corrupted files, preserves existing settings, and displays an error alert', async () => {
    mounted = await mountScreen(SettingsWithKeybindings);
    await typeInto(
      mounted.host.querySelector('#settings-theme-select') as HTMLSelectElement,
      'aero',
    );
    await typeInto(mounted.host.querySelector('#settings-fov-select') as HTMLSelectElement, '80');

    const savedViewerBefore = localStorage.getItem(VIEWER_SETTINGS_KEY);
    const fileInput = mounted.host.querySelector(
      '#settings-restore-backup-input',
    ) as HTMLInputElement;

    const invalidCases = [
      '{not-valid-json',
      JSON.stringify({ schema: 'wrong.schema', version: 1, viewerSettings: {} }),
      JSON.stringify({ schema: SETTINGS_BACKUP_SCHEMA, version: 99, viewerSettings: {} }),
      JSON.stringify({
        schema: SETTINGS_BACKUP_SCHEMA,
        version: 1,
        viewerSettings: { prefs: { fov: 99999 } },
      }),
      JSON.stringify({
        schema: SETTINGS_BACKUP_SCHEMA,
        version: 1,
        customTheme: { name: 'Bad', colors: { pri: 'not-a-hex' } },
      }),
      JSON.stringify({
        schema: SETTINGS_BACKUP_SCHEMA,
        version: 1,
        customTheme: { ...themeFromPalette(PALETTES.aero, 'Bad'), name: 12345 },
      }),
      JSON.stringify({
        schema: SETTINGS_BACKUP_SCHEMA,
        version: 1,
        keybindings: { customBindings: { toggleMouselook: 'Ctrl' } },
      }),
    ];

    for (const badContent of invalidCases) {
      const badFile = new File([badContent], 'corrupt.json', { type: 'application/json' });
      await uploadBackupFile(fileInput, badFile);

      const alertEl = mounted.host.querySelector(
        'section[aria-labelledby="storage-heading"] [role="alert"]',
      );
      expect(alertEl).not.toBeNull();
      expect(alertEl?.textContent?.length).toBeGreaterThan(5);

      // Existing settings and storage must remain completely preserved
      expect(mounted.ctx.current.state.palette).toBe('aero');
      expect(mounted.ctx.current.state.prefs.fov).toBe(80);
      expect(localStorage.getItem(VIEWER_SETTINGS_KEY)).toBe(savedViewerBefore);
    }
  });

  it('rejects files containing credentials, passwords, MFA hashes, session tokens, or account fields', async () => {
    const baseValid = createSettingsBackupPayload({
      viewerSettings: { palette: 'aero', toggles: {}, prefs: { fov: 80 } },
    });

    const credentialPayloads = [
      { ...baseValid, password: 'secret' },
      { ...baseValid, sessionId: 'sess-1234' },
      { ...baseValid, mfa_hash: 'hash-abc' },
      { ...baseValid, totp_token: '123456' },
      { ...baseValid, credentials: { user: 'alice' } },
      {
        ...baseValid,
        viewerSettings: {
          ...baseValid.viewerSettings,
          prefs: { ...baseValid.viewerSettings.prefs, accessToken: 'tok-xyz' },
        },
      },
      {
        ...baseValid,
        keybindings: {
          ...baseValid.keybindings,
          customBindings: {
            ...baseValid.keybindings.customBindings,
            accountPassword: 'KeyP',
          },
        },
      },
      {
        ...baseValid,
        exportedAt:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc1234567890',
      },
    ];

    for (const payload of credentialPayloads) {
      const res = validateSettingsBackup(JSON.stringify(payload));
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/prohibited|token|credential|session|account/i);
      }
    }
  });

  it('rejects files larger than 1 MB before reading file contents to prevent memory exhaustion', async () => {
    mounted = await mountScreen(SettingsWithKeybindings);
    const fileInput = mounted.host.querySelector(
      '#settings-restore-backup-input',
    ) as HTMLInputElement;

    const oversizedFile = new File(['{}'], 'huge.json', { type: 'application/json' });
    Object.defineProperty(oversizedFile, 'size', { value: MAX_SETTINGS_BACKUP_BYTES + 1 });
    const textSpy = vi.spyOn(oversizedFile, 'text');

    await uploadBackupFile(fileInput, oversizedFile);

    expect(textSpy).not.toHaveBeenCalled();
    const alertEl = mounted.host.querySelector(
      'section[aria-labelledby="storage-heading"] [role="alert"]',
    );
    expect(alertEl?.textContent).toContain('1 MB');

    // Direct validator also enforces byte-level 1 MB cap
    const bigRaw = JSON.stringify({
      schema: SETTINGS_BACKUP_SCHEMA,
      version: 1,
      exportedAt: 'x'.repeat(MAX_SETTINGS_BACKUP_BYTES + 10),
      viewerSettings: {},
    });
    const directRes = validateSettingsBackup(bigRaw);
    expect(directRes.ok).toBe(false);
    if (!directRes.ok) {
      expect(directRes.error).toContain('1 MB');
    }
  });

  it('rejects unauthorized root/prototype properties and strips unrecognized sub-properties during schema sanitization', () => {
    // Unauthorized root property -> rejected
    const withUnauthorizedRoot = {
      ...createSettingsBackupPayload({ viewerSettings: { palette: 'aero' } }),
      unexpectedRootProperty: true,
    };
    const rootRes = validateSettingsBackup(JSON.stringify(withUnauthorizedRoot));
    expect(rootRes.ok).toBe(false);

    // Prototype pollution property in raw JSON -> rejected
    const protoJson =
      '{"schema":"linkpoint.settings-backup","version":1,"viewerSettings":{"__proto__":{"polluted":true}}}';
    const protoRes = validateSettingsBackup(protoJson);
    expect(protoRes.ok).toBe(false);

    // Unrecognized non-sensitive sub-properties inside sections -> stripped cleanly
    const theme = themeFromPalette(PALETTES.aero, 'Clean Theme');
    const payloadWithExtraSubProps = {
      schema: SETTINGS_BACKUP_SCHEMA,
      version: SETTINGS_BACKUP_VERSION,
      viewerSettings: {
        palette: 'aero',
        unrecognizedViewerProp: 'strip-me',
        toggles: {
          largeType: true,
          unrecognizedToggle: true,
        },
        prefs: {
          fov: 80,
          unrecognizedPref: 'strip-me-too',
        },
      },
      customTheme: {
        ...theme,
        active: true,
        unrecognizedThemeProp: 42,
        colors: {
          ...theme.colors,
          unrecognizedColor: '#123456',
        },
      },
      keybindings: {
        ...serializeKeyBindings({
          singleCharShortcutsEnabled: false,
          customBindings: { toggleMouselook: 'Alt+M' },
        }),
        unrecognizedKeybindingsProp: 'strip-me',
      },
    };

    const res = validateSettingsBackup(JSON.stringify(payloadWithExtraSubProps));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.viewerSettings).not.toHaveProperty('unrecognizedViewerProp');
      expect(res.data.viewerSettings.toggles).not.toHaveProperty('unrecognizedToggle');
      expect(res.data.viewerSettings.prefs).not.toHaveProperty('unrecognizedPref');
      expect(res.data.customTheme).not.toHaveProperty('unrecognizedThemeProp');
      expect(res.data.customTheme?.colors).not.toHaveProperty('unrecognizedColor');
      expect(res.data.keybindings).not.toHaveProperty('unrecognizedKeybindingsProp');
      expect(res.data.viewerSettings.palette).toBe('aero');
      expect(res.data.viewerSettings.toggles.largeType).toBe(true);
      expect(res.data.viewerSettings.prefs.fov).toBe(80);
      expect(res.data.keybindings.customBindings.toggleMouselook).toBe('Alt+M');
    }
  });
});
