/**
 * Default key bindings of the official Second Life viewer, by camera mode.
 *
 * Source: `indra/newview/app_settings/key_bindings.xml` in github.com/secondlife/viewer (main),
 * fetched 2026-10-05. Entries are [key, mask, command]. Mouse buttons use "LMB" / "MMB".
 * The viewer's own `llviewerkeyboard` source (command semantics, double-tap timing) could not be
 * fetched, so command behaviour is implemented in `agent-controls.ts` from the command names and
 * the documented behaviour of each, not copied from that source. "Run" has no binding in this
 * file; the viewer handles it separately.
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
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN',
  PageUp: 'PGUP', PageDown: 'PGDN', Home: 'HOME', Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'ENTER', NumpadDivide: 'DIVIDE',
};

/** Map a DOM `KeyboardEvent.code` to the binding table's key name, or null for keys it never binds. */
export function keyNameFromCode(code: string): string | null {
  if (CODE_TO_KEY[code]) return CODE_TO_KEY[code];
  const letter = /^Key([A-Z])$/.exec(code);
  return letter ? letter[1] : null;
}

/** Reduce modifier state to the table's mask names (Ctrl+Alt+Shift, Ctrl+Alt, Alt, Shift or none). */
export function maskFromModifiers(mod: { ctrl?: boolean; alt?: boolean; shift?: boolean }): KeyMask | null {
  const { ctrl, alt, shift } = mod;
  if (ctrl && alt && shift) return 'CTL_ALT_SHIFT';
  if (ctrl && alt && !shift) return 'CTL_ALT';
  if (alt && !ctrl && !shift) return 'ALT';
  if (shift && !ctrl && !alt) return 'SHIFT';
  if (!ctrl && !alt && !shift) return 'NONE';
  return null;
}

export type KeyOverrides = Partial<Record<KeyMode, readonly KeyBinding[]>>;

/** Look up the command for a key press. Overrides replace a mode's table wholesale. */
export function commandFor(mode: KeyMode, key: string, mask: KeyMask, overrides: KeyOverrides = {}): string | null {
  const table = overrides[mode] ?? DEFAULT_KEY_BINDINGS[mode];
  return table.find(([k, m]) => k === key && m === mask)?.[2] ?? null;
}

/** The distinct commands a mode binds, for a controls/help screen. */
export function commandsFor(mode: KeyMode): string[] {
  return [...new Set(DEFAULT_KEY_BINDINGS[mode].map(([, , command]) => command))];
}
