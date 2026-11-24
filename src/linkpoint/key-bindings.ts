/**
 * Default key bindings of the official Second Life viewer, by camera mode.
 *
 * Source: `indra/newview/app_settings/key_bindings.xml` in github.com/secondlife/viewer
 * @ 7dd6de6120ce (2026-10-07). All four modes (138 entries) were compared with the raw file entry
 * by entry. Entries are [key, mask, command]; mouse buttons use "LMB" / "MMB".
 * Command behaviour for the agent commands follows `indra/newview/llviewerinput.cpp` at the same
 * commit (see `agent-controls.ts`); camera commands (spin_*, pan_*, move_*) are listed but not
 * implemented here. The file has no run binding; the viewer runs on tap-tap-hold and `toggle_run`.
 */
export type KeyMode = 'first_person' | 'third_person' | 'sitting' | 'edit_avatar';
export type KeyMask = 'NONE' | 'SHIFT' | 'ALT' | 'CTL_ALT' | 'CTL_ALT_SHIFT';
export type KeyBinding = readonly [key: string, mask: KeyMask, command: string];

export const DEFAULT_KEY_BINDINGS: Readonly<Record<KeyMode, readonly KeyBinding[]>> = {
  first_person: [
    ['A', 'NONE', 'slide_left'],
    ['D', 'NONE', 'slide_right'],
    ['W', 'NONE', 'push_forward'],
    ['S', 'NONE', 'push_backward'],
    ['E', 'NONE', 'jump'],
    ['C', 'NONE', 'push_down'],
    ['F', 'NONE', 'toggle_fly'],
    ['LEFT', 'NONE', 'slide_left'],
    ['RIGHT', 'NONE', 'slide_right'],
    ['UP', 'NONE', 'push_forward'],
    ['DOWN', 'NONE', 'push_backward'],
    ['PGUP', 'NONE', 'jump'],
    ['PGDN', 'NONE', 'push_down'],
    ['HOME', 'NONE', 'toggle_fly'],
    ['SPACE', 'NONE', 'stop_moving'],
    ['ENTER', 'NONE', 'start_chat'],
    ['DIVIDE', 'NONE', 'start_gesture'],
    ['MMB', 'NONE', 'toggle_voice'],
    ['LMB', 'NONE', 'script_trigger_lbutton'],
  ],
  third_person: [
    ['A', 'NONE', 'turn_left'],
    ['D', 'NONE', 'turn_right'],
    ['A', 'SHIFT', 'slide_left'],
    ['D', 'SHIFT', 'slide_right'],
    ['W', 'NONE', 'push_forward'],
    ['S', 'NONE', 'push_backward'],
    ['E', 'NONE', 'jump'],
    ['C', 'NONE', 'push_down'],
    ['F', 'NONE', 'toggle_fly'],
    ['SPACE', 'NONE', 'stop_moving'],
    ['ENTER', 'NONE', 'start_chat'],
    ['DIVIDE', 'NONE', 'start_gesture'],
    ['LEFT', 'NONE', 'turn_left'],
    ['LEFT', 'SHIFT', 'slide_left'],
    ['RIGHT', 'NONE', 'turn_right'],
    ['RIGHT', 'SHIFT', 'slide_right'],
    ['UP', 'NONE', 'push_forward'],
    ['DOWN', 'NONE', 'push_backward'],
    ['PGUP', 'NONE', 'jump'],
    ['PGDN', 'NONE', 'push_down'],
    ['HOME', 'NONE', 'toggle_fly'],
    ['LEFT', 'ALT', 'spin_around_cw'],
    ['RIGHT', 'ALT', 'spin_around_ccw'],
    ['UP', 'ALT', 'move_forward'],
    ['DOWN', 'ALT', 'move_backward'],
    ['PGUP', 'ALT', 'spin_over'],
    ['PGDN', 'ALT', 'spin_under'],
    ['A', 'ALT', 'spin_around_cw'],
    ['D', 'ALT', 'spin_around_ccw'],
    ['W', 'ALT', 'move_forward'],
    ['S', 'ALT', 'move_backward'],
    ['E', 'ALT', 'spin_over'],
    ['C', 'ALT', 'spin_under'],
    ['W', 'CTL_ALT', 'spin_over'],
    ['S', 'CTL_ALT', 'spin_under'],
    ['UP', 'CTL_ALT', 'spin_over'],
    ['DOWN', 'CTL_ALT', 'spin_under'],
    ['A', 'CTL_ALT_SHIFT', 'pan_left'],
    ['D', 'CTL_ALT_SHIFT', 'pan_right'],
    ['W', 'CTL_ALT_SHIFT', 'pan_up'],
    ['S', 'CTL_ALT_SHIFT', 'pan_down'],
    ['LEFT', 'CTL_ALT_SHIFT', 'pan_left'],
    ['RIGHT', 'CTL_ALT_SHIFT', 'pan_right'],
    ['UP', 'CTL_ALT_SHIFT', 'pan_up'],
    ['DOWN', 'CTL_ALT_SHIFT', 'pan_down'],
    ['MMB', 'NONE', 'toggle_voice'],
    ['LMB', 'NONE', 'script_trigger_lbutton'],
  ],
  sitting: [
    ['A', 'ALT', 'spin_around_cw'],
    ['D', 'ALT', 'spin_around_ccw'],
    ['W', 'ALT', 'move_forward'],
    ['S', 'ALT', 'move_backward'],
    ['E', 'ALT', 'spin_over_sitting'],
    ['C', 'ALT', 'spin_under_sitting'],
    ['LEFT', 'ALT', 'spin_around_cw'],
    ['RIGHT', 'ALT', 'spin_around_ccw'],
    ['UP', 'ALT', 'move_forward'],
    ['DOWN', 'ALT', 'move_backward'],
    ['PGUP', 'ALT', 'spin_over'],
    ['PGDN', 'ALT', 'spin_under'],
    ['W', 'CTL_ALT', 'spin_over'],
    ['S', 'CTL_ALT', 'spin_under'],
    ['E', 'CTL_ALT', 'spin_over'],
    ['C', 'CTL_ALT', 'spin_under'],
    ['UP', 'CTL_ALT', 'spin_over'],
    ['DOWN', 'CTL_ALT', 'spin_under'],
    ['PGUP', 'CTL_ALT', 'spin_over'],
    ['PGDN', 'CTL_ALT', 'spin_under'],
    ['A', 'NONE', 'spin_around_cw_sitting'],
    ['D', 'NONE', 'spin_around_ccw_sitting'],
    ['W', 'NONE', 'move_forward_sitting'],
    ['S', 'NONE', 'move_backward_sitting'],
    ['E', 'NONE', 'spin_over_sitting'],
    ['C', 'NONE', 'spin_under_sitting'],
    ['LEFT', 'NONE', 'spin_around_cw_sitting'],
    ['RIGHT', 'NONE', 'spin_around_ccw_sitting'],
    ['UP', 'NONE', 'move_forward_sitting'],
    ['DOWN', 'NONE', 'move_backward_sitting'],
    ['PGUP', 'NONE', 'spin_over_sitting'],
    ['PGDN', 'NONE', 'spin_under_sitting'],
    ['A', 'SHIFT', 'slide_left'],
    ['D', 'SHIFT', 'slide_right'],
    ['W', 'SHIFT', 'move_forward_sitting'],
    ['S', 'SHIFT', 'move_backward_sitting'],
    ['E', 'SHIFT', 'spin_over_sitting'],
    ['C', 'SHIFT', 'spin_under_sitting'],
    ['LEFT', 'SHIFT', 'slide_left'],
    ['RIGHT', 'SHIFT', 'slide_right'],
    ['UP', 'SHIFT', 'move_forward_sitting'],
    ['DOWN', 'SHIFT', 'move_backward_sitting'],
    ['PGUP', 'SHIFT', 'spin_over_sitting'],
    ['PGDN', 'SHIFT', 'spin_under_sitting'],
    ['A', 'CTL_ALT_SHIFT', 'pan_left'],
    ['D', 'CTL_ALT_SHIFT', 'pan_right'],
    ['W', 'CTL_ALT_SHIFT', 'pan_up'],
    ['S', 'CTL_ALT_SHIFT', 'pan_down'],
    ['LEFT', 'CTL_ALT_SHIFT', 'pan_left'],
    ['RIGHT', 'CTL_ALT_SHIFT', 'pan_right'],
    ['UP', 'CTL_ALT_SHIFT', 'pan_up'],
    ['DOWN', 'CTL_ALT_SHIFT', 'pan_down'],
    ['ENTER', 'NONE', 'start_chat'],
    ['DIVIDE', 'NONE', 'start_gesture'],
    ['MMB', 'NONE', 'toggle_voice'],
    ['LMB', 'NONE', 'script_trigger_lbutton'],
  ],
  edit_avatar: [
    ['A', 'NONE', 'edit_avatar_spin_cw'],
    ['D', 'NONE', 'edit_avatar_spin_ccw'],
    ['W', 'NONE', 'edit_avatar_move_forward'],
    ['S', 'NONE', 'edit_avatar_move_backward'],
    ['E', 'NONE', 'edit_avatar_spin_over'],
    ['C', 'NONE', 'edit_avatar_spin_under'],
    ['LEFT', 'NONE', 'edit_avatar_spin_cw'],
    ['RIGHT', 'NONE', 'edit_avatar_spin_ccw'],
    ['UP', 'NONE', 'edit_avatar_move_forward'],
    ['DOWN', 'NONE', 'edit_avatar_move_backward'],
    ['PGUP', 'NONE', 'edit_avatar_spin_over'],
    ['PGDN', 'NONE', 'edit_avatar_spin_under'],
    ['ENTER', 'NONE', 'start_chat'],
    ['DIVIDE', 'NONE', 'start_gesture'],
    ['MMB', 'NONE', 'toggle_voice'],
    ['LMB', 'NONE', 'script_trigger_lbutton'],
  ],
};

const CODE_TO_KEY: Record<string, string> = {
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  PageUp: 'PGUP',
  PageDown: 'PGDN',
  Home: 'HOME',
  Space: 'SPACE',
  Enter: 'ENTER',
  NumpadEnter: 'ENTER',
  NumpadDivide: 'DIVIDE',
};

/** Map a DOM `KeyboardEvent.code` to the binding table's key name, or null for keys it never binds. */
export function keyNameFromCode(code: string): string | null {
  if (CODE_TO_KEY[code]) return CODE_TO_KEY[code];
  const letter = /^Key([A-Z])$/.exec(code);
  return letter ? letter[1] : null;
}

/** Reduce modifier state to the table's mask names (Ctrl+Alt+Shift, Ctrl+Alt, Alt, Shift or none). */
export function maskFromModifiers(mod: {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}): KeyMask | null {
  const { ctrl, alt, shift } = mod;
  if (ctrl && alt && shift) return 'CTL_ALT_SHIFT';
  if (ctrl && alt && !shift) return 'CTL_ALT';
  if (alt && !ctrl && !shift) return 'ALT';
  if (shift && !ctrl && !alt) return 'SHIFT';
  if (!ctrl && !alt && !shift) return 'NONE';
  return null;
}

export type KeyOverrides = Partial<Record<KeyMode, readonly KeyBinding[]>>;

export const KEY_MODES: readonly KeyMode[] = [
  'first_person',
  'third_person',
  'sitting',
  'edit_avatar',
];

export const KEY_MASKS: readonly KeyMask[] = ['NONE', 'SHIFT', 'ALT', 'CTL_ALT', 'CTL_ALT_SHIFT'];

export const VALID_KEY_NAMES: ReadonlySet<string> = new Set([
  ...Array.from({ length: 26 }, (_, idx) => String.fromCharCode(65 + idx)),
  ...Object.values(CODE_TO_KEY),
  ...Object.values(DEFAULT_KEY_BINDINGS).flatMap((rows) => rows.map(([key]) => key)),
  'END',
  'RMB',
]);

export const VALID_KEY_COMMANDS: ReadonlySet<string> = new Set([
  ...Object.values(DEFAULT_KEY_BINDINGS).flatMap((rows) => rows.map(([, , command]) => command)),
  'toggle_run',
  'voice_follow_key',
]);

export interface SerializedKeyBindings {
  singleCharShortcutsEnabled: boolean;
  customBindings: Record<string, string>;
  modeBindings: Record<KeyMode, [string, KeyMask, string][]>;
}

const ACTION_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const STORAGE_KEY = 'linkpoint_keybindings';

let cachedStorageRaw: string | null | undefined = undefined;
let cachedOverrides: KeyOverrides = {};

export function setCachedKeyOverrides(overrides: KeyOverrides): void {
  cachedOverrides = overrides;
  try {
    cachedStorageRaw =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    cachedStorageRaw = null;
  }
}

export function getStoredKeyOverrides(): KeyOverrides {
  try {
    if (typeof localStorage === 'undefined') return cachedOverrides;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === cachedStorageRaw) return cachedOverrides;
    cachedStorageRaw = raw;
    if (!raw) {
      cachedOverrides = {};
      return cachedOverrides;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      cachedOverrides = sanitizeKeyOverrides(parsed.overrides ?? parsed.modeBindings);
      return cachedOverrides;
    }
  } catch {
    /* storage unavailable */
  }
  cachedOverrides = {};
  return cachedOverrides;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Sanitize action -> shortcut string bindings, keeping only valid entries. */
export function sanitizeCustomBindings(
  input: unknown,
  defaults: Record<string, string> = {},
): Record<string, string> {
  const result: Record<string, string> = { ...defaults };
  if (!isPlainRecord(input)) return result;
  for (const key of Object.keys(input)) {
    if (PROTOTYPE_KEYS.has(key) || !ACTION_NAME_PATTERN.test(key)) continue;
    const rawVal = input[key];
    if (typeof rawVal === 'string' && isValidKeyBinding(rawVal)) {
      result[key] = rawVal.trim();
    }
  }
  return result;
}

function areModeRowsEqual(rows: readonly KeyBinding[], defaults: readonly KeyBinding[]): boolean {
  if (rows.length !== defaults.length) return false;
  for (let i = 0; i < rows.length; i++) {
    if (
      rows[i][0] !== defaults[i][0] ||
      rows[i][1] !== defaults[i][1] ||
      rows[i][2] !== defaults[i][2]
    ) {
      return false;
    }
  }
  return true;
}

/** Serialize camera-mode key mappings into plain JSON-ready tuples for all four modes. */
export function serializeModeBindings(
  overrides: KeyOverrides = {},
): Record<KeyMode, [string, KeyMask, string][]> {
  const result = {} as Record<KeyMode, [string, KeyMask, string][]>;
  for (const mode of KEY_MODES) {
    const source = overrides[mode] ?? DEFAULT_KEY_BINDINGS[mode];
    result[mode] = source.map(([key, mask, command]) => [key, mask, command]);
  }
  return result;
}

/** Sanitize camera-mode key overrides from unknown storage input, dropping invalid entries. */
export function sanitizeKeyOverrides(input: unknown): KeyOverrides {
  if (!isPlainRecord(input)) return {};
  const overrides: Partial<Record<KeyMode, KeyBinding[]>> = {};
  for (const mode of KEY_MODES) {
    if (!Object.prototype.hasOwnProperty.call(input, mode)) continue;
    const rawRows = input[mode];
    if (!Array.isArray(rawRows)) continue;
    const seen = new Set<string>();
    const cleanRows: KeyBinding[] = [];
    let validMode = true;
    for (const entry of rawRows) {
      let key: unknown;
      let mask: unknown;
      let command: unknown;
      if (Array.isArray(entry) && entry.length === 3) {
        [key, mask, command] = entry;
      } else if (isPlainRecord(entry)) {
        key = entry.key;
        mask = entry.mask;
        command = entry.command;
      } else {
        validMode = false;
        break;
      }
      if (
        typeof key !== 'string' ||
        typeof mask !== 'string' ||
        typeof command !== 'string' ||
        !VALID_KEY_NAMES.has(key) ||
        !(KEY_MASKS as readonly string[]).includes(mask) ||
        !VALID_KEY_COMMANDS.has(command)
      ) {
        validMode = false;
        break;
      }
      const slot = `${key}/${mask}`;
      if (seen.has(slot)) {
        validMode = false;
        break;
      }
      seen.add(slot);
      cleanRows.push([key, mask as KeyMask, command]);
    }
    if (validMode && !areModeRowsEqual(cleanRows, DEFAULT_KEY_BINDINGS[mode])) {
      overrides[mode] = cleanRows;
    }
  }
  return overrides;
}

/** Serialize custom action keybindings and camera-mode key tables for portable JSON export. */
export function serializeKeyBindings(config?: {
  singleCharShortcutsEnabled?: boolean;
  customBindings?: Record<string, string>;
  overrides?: KeyOverrides;
}): SerializedKeyBindings {
  return {
    singleCharShortcutsEnabled:
      typeof config?.singleCharShortcutsEnabled === 'boolean'
        ? config.singleCharShortcutsEnabled
        : true,
    customBindings: sanitizeCustomBindings(config?.customBindings),
    modeBindings: serializeModeBindings(config?.overrides),
  };
}

/** Strictly validate and normalize an imported keybindings configuration block. */
export function validateKeyBindingsPayload(
  input: unknown,
  defaultCustomBindings: Record<string, string> = {},
):
  | {
      ok: true;
      singleCharShortcutsEnabled: boolean;
      customBindings: Record<string, string>;
      overrides: KeyOverrides;
      modeBindings: Record<KeyMode, [string, KeyMask, string][]>;
    }
  | { ok: false; error: string } {
  if (!isPlainRecord(input)) {
    return { ok: false, error: 'Invalid keybindings section: expected an object.' };
  }

  let singleCharShortcutsEnabled = true;
  if (input.singleCharShortcutsEnabled !== undefined) {
    if (typeof input.singleCharShortcutsEnabled !== 'boolean') {
      return {
        ok: false,
        error: 'Invalid keybindings: singleCharShortcutsEnabled must be a boolean.',
      };
    }
    singleCharShortcutsEnabled = input.singleCharShortcutsEnabled;
  }

  const customBindings: Record<string, string> = { ...defaultCustomBindings };
  if (input.customBindings !== undefined) {
    if (!isPlainRecord(input.customBindings)) {
      return { ok: false, error: 'Invalid keybindings: customBindings must be an object.' };
    }
    for (const [action, rawVal] of Object.entries(input.customBindings)) {
      if (PROTOTYPE_KEYS.has(action) || !ACTION_NAME_PATTERN.test(action)) {
        return {
          ok: false,
          error: `Invalid keybinding action name '${action}'.`,
        };
      }
      if (typeof rawVal !== 'string' || !isValidKeyBinding(rawVal)) {
        return {
          ok: false,
          error: `Invalid key combination for action '${action}'.`,
        };
      }
      customBindings[action] = rawVal.trim();
    }
  }

  const rawModes = input.modeBindings !== undefined ? input.modeBindings : input.overrides;
  const overrides: Partial<Record<KeyMode, KeyBinding[]>> = {};
  if (rawModes !== undefined) {
    if (!isPlainRecord(rawModes)) {
      return { ok: false, error: 'Invalid keybindings: modeBindings must be an object.' };
    }
    for (const [modeKey, rawRows] of Object.entries(rawModes)) {
      if (!(KEY_MODES as readonly string[]).includes(modeKey)) {
        return { ok: false, error: `Unknown camera key mode '${modeKey}' in keybindings.` };
      }
      if (!Array.isArray(rawRows)) {
        return {
          ok: false,
          error: `Invalid key mappings for mode '${modeKey}': expected an array.`,
        };
      }
      const mode = modeKey as KeyMode;
      const seen = new Set<string>();
      const cleanRows: KeyBinding[] = [];
      for (const entry of rawRows) {
        let key: unknown;
        let mask: unknown;
        let command: unknown;
        if (Array.isArray(entry) && entry.length === 3) {
          [key, mask, command] = entry;
        } else if (isPlainRecord(entry)) {
          key = entry.key;
          mask = entry.mask;
          command = entry.command;
        } else {
          return {
            ok: false,
            error: `Invalid key mapping entry in mode '${mode}': expected [key, mask, command].`,
          };
        }
        if (
          typeof key !== 'string' ||
          !VALID_KEY_NAMES.has(key) ||
          typeof mask !== 'string' ||
          !(KEY_MASKS as readonly string[]).includes(mask) ||
          typeof command !== 'string' ||
          !VALID_KEY_COMMANDS.has(command)
        ) {
          return {
            ok: false,
            error: `Invalid key mapping '${String(key)}/${String(mask)} -> ${String(command)}' in mode '${mode}'.`,
          };
        }
        const slot = `${key}/${mask}`;
        if (seen.has(slot)) {
          return {
            ok: false,
            error: `Duplicate key mapping '${slot}' in mode '${mode}'.`,
          };
        }
        seen.add(slot);
        cleanRows.push([key, mask as KeyMask, command]);
      }
      if (!areModeRowsEqual(cleanRows, DEFAULT_KEY_BINDINGS[mode])) {
        overrides[mode] = cleanRows;
      }
    }
  }

  return {
    ok: true,
    singleCharShortcutsEnabled,
    customBindings,
    overrides,
    modeBindings: serializeModeBindings(overrides),
  };
}

/** Look up the command for a key press. Overrides replace a mode's table wholesale. */
export function commandFor(
  mode: KeyMode,
  key: string,
  mask: KeyMask,
  overrides: KeyOverrides = {},
): string | null {
  const table = overrides[mode] ?? DEFAULT_KEY_BINDINGS[mode];
  return table.find(([k, m]) => k === key && m === mask)?.[2] ?? null;
}

/** The distinct commands a mode binds, for a controls/help screen. */
export function commandsFor(mode: KeyMode): string[] {
  return [...new Set(DEFAULT_KEY_BINDINGS[mode].map(([, , command]) => command))];
}

export interface ParsedKeyBinding {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  baseKey: string;
  isSingleCharacter: boolean;
}

/** Parse a key string like 'Alt+M', 'Ctrl+KeyH', 'Shift+M', or 'M' into its modifier and base key parts. */
export function parseKeyString(binding: string): ParsedKeyBinding | null {
  if (!binding || typeof binding !== 'string') return null;
  const parts = binding
    .trim()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;
  let baseKey = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      ctrl = true;
    } else if (lower === 'alt' || lower === 'option') {
      alt = true;
    } else if (lower === 'shift') {
      shift = true;
    } else if (lower === 'meta' || lower === 'cmd' || lower === 'command') {
      meta = true;
    } else {
      baseKey = part;
    }
  }

  if (!baseKey) return null;

  const isSingleCharacter = !ctrl && !alt && !shift && !meta;

  return {
    ctrl,
    alt,
    shift,
    meta,
    baseKey,
    isSingleCharacter,
  };
}

/** Formats a parsed key binding or key string into a standard display string e.g. "Alt+M", "Ctrl+H", "M". */
export function formatKeyString(binding: string | ParsedKeyBinding): string {
  const parsed = typeof binding === 'string' ? parseKeyString(binding) : binding;
  if (!parsed) return '';
  const parts: string[] = [];
  if (parsed.ctrl) parts.push('Ctrl');
  if (parsed.alt) parts.push('Alt');
  if (parsed.shift) parts.push('Shift');
  if (parsed.meta) parts.push('Cmd');

  let keyDisplay = parsed.baseKey;
  if (/^Key[A-Z]$/i.test(keyDisplay)) {
    keyDisplay = keyDisplay.slice(3);
  }
  parts.push(keyDisplay.toUpperCase());
  return parts.join('+');
}

/** Validates if a key string represents a valid, non-empty binding with a base key. */
export function isValidKeyBinding(binding: string): boolean {
  const parsed = parseKeyString(binding);
  if (!parsed || !parsed.baseKey) return false;
  const lowerBase = parsed.baseKey.toLowerCase();
  if (['ctrl', 'control', 'alt', 'option', 'shift', 'meta', 'cmd', 'command'].includes(lowerBase)) {
    return false;
  }
  return true;
}

/**
 * Evaluates whether a keyboard event matches a given key binding string, taking into account
 * modifier keys and whether single-character shortcuts are enabled.
 */
export function matchesKeyBinding(
  event:
    | KeyboardEvent
    | {
        key?: string;
        code?: string;
        ctrlKey?: boolean;
        altKey?: boolean;
        shiftKey?: boolean;
        metaKey?: boolean;
      },
  bindingString: string,
  singleCharShortcutsEnabled = true,
): boolean {
  const parsed = parseKeyString(bindingString);
  if (!parsed) return false;

  const eventCtrl = Boolean(event.ctrlKey);
  const eventAlt = Boolean(event.altKey);
  const eventShift = Boolean(event.shiftKey);
  const eventMeta = Boolean(event.metaKey);

  if (
    parsed.ctrl !== eventCtrl ||
    parsed.alt !== eventAlt ||
    parsed.shift !== eventShift ||
    parsed.meta !== eventMeta
  ) {
    return false;
  }

  if (parsed.isSingleCharacter && !singleCharShortcutsEnabled) {
    return false;
  }

  const code = event.code || '';
  const key = event.key || '';
  const targetBase = parsed.baseKey;

  if (/^Key[A-Z]$/i.test(code)) {
    const letterFromCode = code.slice(3);
    if (
      targetBase.toUpperCase() === letterFromCode.toUpperCase() ||
      targetBase.toUpperCase() === `KEY${letterFromCode.toUpperCase()}` ||
      targetBase.toUpperCase() === key.toUpperCase()
    ) {
      return true;
    }
  }

  if (
    targetBase.toUpperCase() === code.toUpperCase() ||
    targetBase.toUpperCase() === key.toUpperCase()
  ) {
    return true;
  }

  if (/^Key[A-Z]$/i.test(targetBase)) {
    const letter = targetBase.slice(3).toUpperCase();
    if (code.toUpperCase() === `KEY${letter}` || key.toUpperCase() === letter) {
      return true;
    }
  }

  return false;
}
