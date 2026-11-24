import { LAYOUTS, PALETTES } from '@linkpoint/design-system/tokens';
import {
  readViewerSettings,
  sanitizeViewerSettings,
  VIEWER_OPTIONS,
  VIEWER_TOGGLES,
} from '../hooks/viewerSettings.js';
import { readSavedTheme, sanitizeTheme } from '../theme/customTheme.js';
import {
  serializeKeyBindings,
  validateKeyBindingsPayload,
  type KeyOverrides,
  type SerializedKeyBindings,
} from '../linkpoint/key-bindings';
import { DEFAULT_CUSTOM_BINDINGS, readStoredKeybindings } from '../context/KeybindingsContext';

export const SETTINGS_BACKUP_SCHEMA = 'linkpoint.settings-backup';
export const SETTINGS_BACKUP_VERSION = 1;
export const MAX_SETTINGS_BACKUP_BYTES = 1024 * 1024; // 1 MB

const MAX_OBJECT_DEPTH = 12;
const VALID_VIEW_MODES = ['auto', 'mobile', 'desktop'] as const;
export type BackupViewMode = (typeof VALID_VIEW_MODES)[number];

const ALLOWED_ROOT_KEYS = new Set([
  'schema',
  'version',
  'exportedAt',
  'viewerSettings',
  'keybindings',
  'customTheme',
  'viewMode',
]);

const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Exact normalized property names (lowercased, punctuation stripped) representing
 * authentication credentials, session tokens/identifiers, MFA secrets, or account records.
 */
const PROHIBITED_SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'pass',
  'secret',
  'clientsecret',
  'privatekey',
  'apikey',
  'credential',
  'credentials',
  'linkpointcredentials',
  'session',
  'sessionid',
  'securesessionid',
  'sessionsnapshot',
  'sessiontoken',
  'sessionidentifier',
  'sessionkey',
  'linkpointsession',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authtoken',
  'bearertoken',
  'bearer',
  'jwt',
  'oauth',
  'oauthtoken',
  'mfa',
  'mfatoken',
  'mfahash',
  'mfahashes',
  'mfacode',
  'linkpointmfahashes',
  'totp',
  'otp',
  'twofactor',
  'account',
  'accounts',
  'accountid',
  'agentid',
  'userid',
  'username',
  'residentid',
  'loginpassword',
  'authreply',
  'seedcapability',
  'circuitcode',
  'cookie',
  'cookies',
  'authorization',
]);

const PROHIBITED_KEY_SUBSTRING =
  /(password|passwd|secret|credential|sessionid|securesession|sessiontoken|sessionkey|sessionidentifier|accesstoken|refreshtoken|authtoken|idtoken|mfatoken|mfahash|mfacode|totp|apikey|privatekey|seedcap|circuitcode)/;

const JWT_LIKE_VALUE = /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const BEARER_VALUE = /^\s*Bearer\s+\S+/i;
const CREDENTIAL_URL_VALUE = /^https?:\/\/[^/\s]+:[^/\s]+@/i;

export interface SanitizedCustomTheme {
  version: number;
  active: boolean;
  name: string;
  colors: Record<string, string>;
  layoutMode: 'grid' | 'list' | 'rail' | 'split';
  density: 'compact' | 'standard' | 'comfortable';
  breakpoint: 'mobile' | 'tablet' | 'desktop';
}

export interface SanitizedViewerSettings {
  layout?: string;
  palette?: string;
  dense?: boolean;
  density?: 'compact' | 'standard' | 'comfortable';
  toggles: Record<string, boolean>;
  prefs: Record<string, string | number>;
}

export interface SettingsBackupPayload {
  schema: typeof SETTINGS_BACKUP_SCHEMA;
  version: typeof SETTINGS_BACKUP_VERSION;
  exportedAt: string;
  viewerSettings: SanitizedViewerSettings;
  keybindings: SerializedKeyBindings;
  customTheme: SanitizedCustomTheme | null;
  viewMode?: BackupViewMode;
}

export interface ValidatedSettingsBackup {
  schema: typeof SETTINGS_BACKUP_SCHEMA;
  version: typeof SETTINGS_BACKUP_VERSION;
  exportedAt?: string;
  hasViewerSettings: boolean;
  viewerSettings: SanitizedViewerSettings;
  hasKeybindings: boolean;
  keybindings: {
    singleCharShortcutsEnabled: boolean;
    customBindings: Record<string, string>;
    overrides: KeyOverrides;
    modeBindings: SerializedKeyBindings['modeBindings'];
  };
  hasCustomTheme: boolean;
  customTheme: SanitizedCustomTheme | null;
  viewMode?: BackupViewMode;
}

export type SettingsBackupValidationResult =
  { ok: true; data: ValidatedSettingsBackup } | { ok: false; error: string };

export interface SettingsExportInput {
  viewerSettings?: Record<string, unknown>;
  customTheme?: Record<string, unknown> | null;
  keybindings?: {
    singleCharShortcutsEnabled?: boolean;
    customBindings?: Record<string, string>;
    overrides?: KeyOverrides;
  };
  viewMode?: string;
  exportedAt?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeKeyName(key: string): string {
  return key.toLowerCase().replace(/[-_\s.]/g, '');
}

function isProhibitedSensitiveKey(key: string): boolean {
  const normalized = normalizeKeyName(key);
  return PROHIBITED_SENSITIVE_KEYS.has(normalized) || PROHIBITED_KEY_SUBSTRING.test(normalized);
}

function scanForProhibitedContent(node: unknown, depth = 0): string | null {
  if (depth > MAX_OBJECT_DEPTH) {
    return 'Backup rejected: JSON structure exceeds maximum allowed nesting depth.';
  }
  if (typeof node === 'string') {
    if (
      JWT_LIKE_VALUE.test(node.trim()) ||
      BEARER_VALUE.test(node) ||
      CREDENTIAL_URL_VALUE.test(node.trim())
    ) {
      return 'Backup rejected: file contains an embedded authentication token or credential URL.';
    }
    return null;
  }
  if (!node || typeof node !== 'object') {
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const nestedErr = scanForProhibitedContent(item, depth + 1);
      if (nestedErr) return nestedErr;
    }
    return null;
  }

  for (const key of Object.getOwnPropertyNames(node)) {
    if (PROTOTYPE_KEYS.has(key)) {
      return `Backup rejected: unauthorized property '${key}' is not permitted.`;
    }
    if (isProhibitedSensitiveKey(key)) {
      return `Backup rejected: file contains prohibited credential, session, or account field '${key}'.`;
    }
    const value = (node as Record<string, unknown>)[key];
    const nestedErr = scanForProhibitedContent(value, depth + 1);
    if (nestedErr) return nestedErr;
  }
  return null;
}

function sanitizeExportTheme(input: unknown): SanitizedCustomTheme | null {
  if (!isPlainObject(input)) return null;
  const sanitized = sanitizeTheme(input) as SanitizedCustomTheme | null;
  if (!sanitized) return null;
  return {
    ...sanitized,
    active: typeof input.active === 'boolean' ? input.active : true,
  };
}

/**
 * Builds a validated, credential-free portable backup object from current viewer preferences,
 * custom theme configuration, and keybindings.
 */
export function createSettingsBackupPayload(
  input: SettingsExportInput = {},
): SettingsBackupPayload {
  const viewerSource = input.viewerSettings ?? readViewerSettings();
  const viewerSettings = sanitizeViewerSettings(viewerSource) as SanitizedViewerSettings;

  const kbSource = input.keybindings ?? readStoredKeybindings();
  const keybindings = serializeKeyBindings({
    singleCharShortcutsEnabled: kbSource.singleCharShortcutsEnabled,
    customBindings: {
      ...DEFAULT_CUSTOM_BINDINGS,
      ...(kbSource.customBindings || {}),
    },
    overrides: kbSource.overrides,
  });

  const rawTheme = input.customTheme !== undefined ? input.customTheme : readSavedTheme();
  const customTheme = sanitizeExportTheme(rawTheme);

  const payload: SettingsBackupPayload = {
    schema: SETTINGS_BACKUP_SCHEMA,
    version: SETTINGS_BACKUP_VERSION,
    exportedAt:
      typeof input.exportedAt === 'string' && input.exportedAt
        ? input.exportedAt
        : new Date().toISOString(),
    viewerSettings,
    keybindings,
    customTheme,
  };

  if (
    typeof input.viewMode === 'string' &&
    (VALID_VIEW_MODES as readonly string[]).includes(input.viewMode)
  ) {
    payload.viewMode = input.viewMode as BackupViewMode;
  }

  return payload;
}

/** Serializes the portable settings backup to formatted JSON. */
export function serializeSettingsBackup(input: SettingsExportInput = {}): string {
  return JSON.stringify(createSettingsBackupPayload(input), null, 2);
}

/** Triggers a purely client-side JSON file download in the browser. */
export function downloadSettingsBackupFile(
  input: SettingsExportInput = {},
  filename?: string,
): { json: string; filename: string } {
  const payload = createSettingsBackupPayload(input);
  const json = JSON.stringify(payload, null, 2);
  const dateStamp = payload.exportedAt.slice(0, 10);
  const resolvedFilename =
    filename ||
    `linkpoint-settings-backup-${/^\d{4}-\d{2}-\d{2}$/.test(dateStamp) ? dateStamp : 'export'}.json`;

  if (typeof document !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    const blob = new Blob([json], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = resolvedFilename;
    link.style.display = 'none';
    document.body?.appendChild(link);
    link.click();
    link.remove();
    if (typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(objectUrl);
    }
  }

  return { json, filename: resolvedFilename };
}

function validateViewerSettingsSection(
  raw: unknown,
): { ok: true; value: SanitizedViewerSettings } | { ok: false; error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Invalid viewerSettings section: expected an object.' };
  }

  if (raw.layout !== undefined) {
    if (typeof raw.layout !== 'string' || !Object.hasOwn(LAYOUTS, raw.layout)) {
      return { ok: false, error: `Invalid layout '${String(raw.layout)}' in viewerSettings.` };
    }
  }

  if (raw.palette !== undefined) {
    if (typeof raw.palette !== 'string' || !Object.hasOwn(PALETTES, raw.palette)) {
      return {
        ok: false,
        error: `Invalid colour theme '${String(raw.palette)}' in viewerSettings.`,
      };
    }
  }

  if (raw.dense !== undefined && typeof raw.dense !== 'boolean') {
    return { ok: false, error: 'Invalid viewerSettings: dense must be a boolean.' };
  }

  if (
    raw.density !== undefined &&
    (typeof raw.density !== 'string' ||
      !['compact', 'standard', 'comfortable'].includes(raw.density))
  ) {
    return {
      ok: false,
      error: `Invalid density '${String(raw.density)}' in viewerSettings.`,
    };
  }

  if (raw.toggles !== undefined) {
    if (!isPlainObject(raw.toggles)) {
      return { ok: false, error: 'Invalid viewerSettings.toggles: expected an object.' };
    }
    for (const toggleKey of VIEWER_TOGGLES as readonly string[]) {
      if (Object.hasOwn(raw.toggles, toggleKey) && typeof raw.toggles[toggleKey] !== 'boolean') {
        return {
          ok: false,
          error: `Invalid toggle value for '${toggleKey}': expected a boolean.`,
        };
      }
    }
  }

  if (raw.prefs !== undefined) {
    if (!isPlainObject(raw.prefs)) {
      return { ok: false, error: 'Invalid viewerSettings.prefs: expected an object.' };
    }
    for (const [prefKey, allowed] of Object.entries(
      VIEWER_OPTIONS as Record<string, readonly (string | number)[]>,
    )) {
      if (Object.hasOwn(raw.prefs, prefKey)) {
        const val = raw.prefs[prefKey];
        if (!allowed.includes(val as string | number)) {
          return {
            ok: false,
            error: `Invalid preference value for '${prefKey}'.`,
          };
        }
      }
    }
  }

  // Run through canonical sanitizer so any unrecognized sub-properties are stripped.
  const sanitized = sanitizeViewerSettings(raw) as SanitizedViewerSettings;
  return { ok: true, value: sanitized };
}

function validateCustomThemeSection(
  raw: unknown,
): { ok: true; value: SanitizedCustomTheme | null } | { ok: false; error: string } {
  if (raw === null) {
    return { ok: true, value: null };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'Invalid customTheme section: expected an object or null.' };
  }
  if (raw.version !== undefined && raw.version !== 1) {
    return {
      ok: false,
      error: `Unsupported customTheme version '${String(raw.version)}'. Expected version 1.`,
    };
  }
  if (raw.name !== undefined && typeof raw.name !== 'string') {
    return { ok: false, error: 'Invalid customTheme: name must be a string.' };
  }
  if (raw.active !== undefined && typeof raw.active !== 'boolean') {
    return { ok: false, error: 'Invalid customTheme: active must be a boolean.' };
  }
  if (
    raw.layoutMode !== undefined &&
    (typeof raw.layoutMode !== 'string' ||
      !['grid', 'list', 'rail', 'split'].includes(raw.layoutMode))
  ) {
    return { ok: false, error: `Invalid customTheme layoutMode '${String(raw.layoutMode)}'.` };
  }
  if (
    raw.density !== undefined &&
    (typeof raw.density !== 'string' ||
      !['compact', 'standard', 'comfortable'].includes(raw.density))
  ) {
    return { ok: false, error: `Invalid customTheme density '${String(raw.density)}'.` };
  }
  if (
    raw.breakpoint !== undefined &&
    (typeof raw.breakpoint !== 'string' ||
      !['mobile', 'tablet', 'desktop'].includes(raw.breakpoint))
  ) {
    return { ok: false, error: `Invalid customTheme breakpoint '${String(raw.breakpoint)}'.` };
  }

  const sanitized = sanitizeTheme(raw) as SanitizedCustomTheme | null;
  if (!sanitized) {
    return {
      ok: false,
      error: 'Invalid customTheme: all editable theme colour tokens must be 6-digit hex values.',
    };
  }

  return {
    ok: true,
    value: {
      ...sanitized,
      active: typeof raw.active === 'boolean' ? raw.active : true,
    },
  };
}

/**
 * Validates raw JSON text (or an unverified object) against the versioned Linkpoint
 * backup schema, enforcing size limits, rejecting credentials/tokens/sessions/unauthorized
 * root keys, and sanitizing nested configuration sections.
 */
export function validateSettingsBackup(rawInput: unknown): SettingsBackupValidationResult {
  let parsed: unknown;

  if (typeof rawInput === 'string') {
    const byteLength = new TextEncoder().encode(rawInput).byteLength;
    if (byteLength > MAX_SETTINGS_BACKUP_BYTES) {
      return {
        ok: false,
        error: 'Backup file exceeds the 1 MB maximum size limit.',
      };
    }
    if (!rawInput.trim()) {
      return {
        ok: false,
        error: 'Backup file is empty.',
      };
    }
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      return {
        ok: false,
        error: 'Invalid JSON: the selected backup file could not be parsed.',
      };
    }
  } else if (isPlainObject(rawInput)) {
    const serialized = JSON.stringify(rawInput);
    if (new TextEncoder().encode(serialized).byteLength > MAX_SETTINGS_BACKUP_BYTES) {
      return {
        ok: false,
        error: 'Backup file exceeds the 1 MB maximum size limit.',
      };
    }
    parsed = rawInput;
  } else {
    return {
      ok: false,
      error: 'Invalid backup format: expected a JSON object.',
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      error: 'Invalid backup format: root value must be a JSON object.',
    };
  }

  // 1. Reject any credential, password, session token, MFA secret, account record, or prototype key at any depth.
  const prohibitedError = scanForProhibitedContent(parsed);
  if (prohibitedError) {
    return { ok: false, error: prohibitedError };
  }

  // 2. Reject unauthorized top-level properties.
  for (const rootKey of Object.getOwnPropertyNames(parsed)) {
    if (!ALLOWED_ROOT_KEYS.has(rootKey)) {
      return {
        ok: false,
        error: `Backup rejected: unauthorized property '${rootKey}' is not allowed in settings backup.`,
      };
    }
  }

  // 3. Validate versioned schema metadata.
  if (parsed.schema !== SETTINGS_BACKUP_SCHEMA) {
    return {
      ok: false,
      error: `Unsupported backup schema: expected '${SETTINGS_BACKUP_SCHEMA}'.`,
    };
  }

  if (typeof parsed.version !== 'number' || !Number.isInteger(parsed.version)) {
    return {
      ok: false,
      error: 'Invalid backup file: missing or non-integer schema version.',
    };
  }

  if (parsed.version !== SETTINGS_BACKUP_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup schema version (${parsed.version}). Expected version ${SETTINGS_BACKUP_VERSION}.`,
    };
  }

  if (
    parsed.exportedAt !== undefined &&
    (typeof parsed.exportedAt !== 'string' || parsed.exportedAt.length > 128)
  ) {
    return {
      ok: false,
      error: 'Invalid backup metadata: exportedAt must be an ISO date string.',
    };
  }

  let viewMode: BackupViewMode | undefined;
  if (parsed.viewMode !== undefined) {
    if (
      typeof parsed.viewMode !== 'string' ||
      !(VALID_VIEW_MODES as readonly string[]).includes(parsed.viewMode)
    ) {
      return {
        ok: false,
        error: `Invalid viewMode '${String(parsed.viewMode)}' in backup file.`,
      };
    }
    viewMode = parsed.viewMode as BackupViewMode;
  }

  const hasViewerSettings =
    Object.hasOwn(parsed, 'viewerSettings') && parsed.viewerSettings !== undefined;
  const hasKeybindings = Object.hasOwn(parsed, 'keybindings') && parsed.keybindings !== undefined;
  const hasCustomTheme = Object.hasOwn(parsed, 'customTheme') && parsed.customTheme !== undefined;

  if (!hasViewerSettings && !hasKeybindings && !hasCustomTheme) {
    return {
      ok: false,
      error:
        'Backup file contains no viewerSettings, keybindings, or customTheme sections to restore.',
    };
  }

  // 4. Validate and sanitize each present configuration section.
  let viewerSettings: SanitizedViewerSettings = { toggles: {}, prefs: {} };
  if (hasViewerSettings) {
    const vsResult = validateViewerSettingsSection(parsed.viewerSettings);
    if (!vsResult.ok) return vsResult;
    viewerSettings = vsResult.value;
  }

  let keybindings: ValidatedSettingsBackup['keybindings'] = {
    singleCharShortcutsEnabled: true,
    customBindings: { ...DEFAULT_CUSTOM_BINDINGS },
    overrides: {},
    modeBindings: serializeKeyBindings().modeBindings,
  };
  if (hasKeybindings) {
    const kbResult = validateKeyBindingsPayload(parsed.keybindings, DEFAULT_CUSTOM_BINDINGS);
    if (!kbResult.ok) return kbResult;
    keybindings = {
      singleCharShortcutsEnabled: kbResult.singleCharShortcutsEnabled,
      customBindings: kbResult.customBindings,
      overrides: kbResult.overrides,
      modeBindings: kbResult.modeBindings,
    };
  }

  let customTheme: SanitizedCustomTheme | null = null;
  if (hasCustomTheme) {
    const themeResult = validateCustomThemeSection(parsed.customTheme);
    if (!themeResult.ok) return themeResult;
    customTheme = themeResult.value;
  }

  return {
    ok: true,
    data: {
      schema: SETTINGS_BACKUP_SCHEMA,
      version: SETTINGS_BACKUP_VERSION,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
      hasViewerSettings,
      viewerSettings,
      hasKeybindings,
      keybindings,
      hasCustomTheme,
      customTheme,
      viewMode,
    },
  };
}
