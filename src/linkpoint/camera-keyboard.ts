import { commandFor, keyNameFromCode, maskFromModifiers, type KeyMode, type KeyOverrides } from './key-bindings';

/**
 * Camera keyboard commands of the official viewer (`spin_*`, `move_*`, `pan_*` in key_bindings.xml).
 * Pure: it maps held keys and modifiers to a per-second camera change, so it can be tested without a DOM.
 */
export const CAMERA_COMMANDS: ReadonlySet<string> = new Set([
  'spin_around_cw', 'spin_around_ccw', 'spin_over', 'spin_under', 'move_forward', 'move_backward',
  'spin_around_cw_sitting', 'spin_around_ccw_sitting', 'spin_over_sitting', 'spin_under_sitting',
  'move_forward_sitting', 'move_backward_sitting',
  'pan_left', 'pan_right', 'pan_up', 'pan_down',
  'edit_avatar_spin_cw', 'edit_avatar_spin_ccw', 'edit_avatar_spin_over', 'edit_avatar_spin_under',
  'edit_avatar_move_forward', 'edit_avatar_move_backward',
]);

/** Camera change per second of holding: orbit angles in radians, zoom as a fraction of distance, pan in metres. */
export interface CameraRates { yaw: number; pitch: number; zoom: number; panX: number; panY: number }

export const SPIN_RATE = 1.5;
export const PITCH_RATE = 1.0;
export const ZOOM_RATE = 1.5;
export const PAN_RATE = 4;

const effect = (command: string): Partial<CameraRates> => {
  const name = command.replace(/^edit_avatar_/, '').replace(/_sitting$/, '');
  switch (name) {
    case 'spin_around_cw': case 'spin_cw': return { yaw: SPIN_RATE };
    case 'spin_around_ccw': case 'spin_ccw': return { yaw: -SPIN_RATE };
    case 'spin_over': return { pitch: PITCH_RATE };
    case 'spin_under': return { pitch: -PITCH_RATE };
    case 'move_forward': return { zoom: ZOOM_RATE };
    case 'move_backward': return { zoom: -ZOOM_RATE };
    case 'pan_left': return { panX: -PAN_RATE };
    case 'pan_right': return { panX: PAN_RATE };
    case 'pan_up': return { panY: PAN_RATE };
    case 'pan_down': return { panY: -PAN_RATE };
    default: return {};
  }
};

/** The camera commands the held key codes trigger under the current modifiers, with the key table of `mode`. */
export function heldCameraCommands(
  codes: Iterable<string>,
  modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean },
  mode: KeyMode,
  overrides?: KeyOverrides,
): string[] {
  const mask = maskFromModifiers(modifiers);
  if (!mask) return [];
  const commands: string[] = [];
  for (const code of codes) {
    const key = keyNameFromCode(code);
    const command = key ? commandFor(mode, key, mask, overrides) : null;
    if (command && CAMERA_COMMANDS.has(command)) commands.push(command);
  }
  return commands;
}

export function cameraRates(commands: Iterable<string>): CameraRates {
  const rates: CameraRates = { yaw: 0, pitch: 0, zoom: 0, panX: 0, panY: 0 };
  for (const command of commands) {
    const change = effect(command);
    for (const key of Object.keys(change) as Array<keyof CameraRates>) rates[key] += change[key] ?? 0;
  }
  return rates;
}

/** True when the key press belongs to a camera command, so the page should not also act on it. */
export function isCameraKey(code: string, modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean }, mode: KeyMode, overrides?: KeyOverrides) {
  return heldCameraCommands([code], modifiers, mode, overrides).length > 0;
}
