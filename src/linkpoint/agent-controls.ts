/**
 * Second Life agent control flags (the `ControlFlags` field of AgentUpdate) and the translation
 * from a movement intent to those flags.
 *
 * Sources, all from the official viewer at github.com/secondlife/viewer @ 7dd6de6120ce (2026-10-07):
 *  - flag values: `indra/llcommon/indra_constants.h` (`AGENT_CONTROL_*`); every value is compared
 *    with that file when this module changes, and with node-metaverse in the tests;
 *  - AgentUpdate flags: `indra/newview/llviewermessage.cpp` (`AU_FLAGS_*`);
 *  - which flags persist between updates: `LLAgent::resetControlFlags` in `llagent.cpp` keeps only
 *    AWAY, FLY and MOUSELOOK; STOP, STAND_UP, SIT_ON_GROUND, FINISH_ANIM and the nudges are transient;
 *  - key handling, timings: `indra/newview/llviewerinput.cpp`.
 * The LSL-facing `CONTROL_*` constants are not in the viewer source and are not defined here.
 */

export const AGENT_CONTROL = {
  AT_POS: 0x1, AT_NEG: 0x2,
  LEFT_POS: 0x4, LEFT_NEG: 0x8,
  UP_POS: 0x10, UP_NEG: 0x20,
  PITCH_POS: 0x40, PITCH_NEG: 0x80,
  YAW_POS: 0x100, YAW_NEG: 0x200,
  FAST_AT: 0x400, FAST_LEFT: 0x800, FAST_UP: 0x1000,
  FLY: 0x2000, STOP: 0x4000, FINISH_ANIM: 0x8000,
  STAND_UP: 0x10000, SIT_ON_GROUND: 0x20000, MOUSELOOK: 0x40000,
  NUDGE_AT_POS: 0x80000, NUDGE_AT_NEG: 0x100000,
  NUDGE_LEFT_POS: 0x200000, NUDGE_LEFT_NEG: 0x400000,
  NUDGE_UP_POS: 0x800000, NUDGE_UP_NEG: 0x1000000,
  TURN_LEFT: 0x2000000, TURN_RIGHT: 0x4000000,
  AWAY: 0x8000000,
  LBUTTON_DOWN: 0x10000000, LBUTTON_UP: 0x20000000,
  ML_LBUTTON_DOWN: 0x40000000, ML_LBUTTON_UP: 0x80000000,
} as const;

/** What the resident is asking the avatar to do right now. Axes are -1..1. */
export interface MovementIntent {
  forward?: number;
  /** Positive is to the avatar's right. */
  right?: number;
  up?: number;
  /** Positive turns right. */
  turn?: number;
  run?: boolean;
  fly?: boolean;
  /** One-shot flags: held for the update that carries them. */
  stop?: boolean;
  standUp?: boolean;
  sitOnGround?: boolean;
  mouselook?: boolean;
  away?: boolean;
  finishAnim?: boolean;
  /** Single-step nudges (key tapped, not held), in the same signs as the axes. */
  nudgeForward?: number;
  nudgeRight?: number;
  nudgeUp?: number;
  leftButton?: boolean;
  mouselookLeftButton?: boolean;
}

const sign = (value: number | undefined) => (value && value > 0 ? 1 : value && value < 0 ? -1 : 0);

/**
 * Turn an intent into AgentUpdate control flags. SL names the strafe flags from the left
 * axis, so moving right sets LEFT_NEG. "Run" only adds FAST_* to axes that are moving.
 */
export function intentToFlags(intent: MovementIntent): number {
  let flags = 0;
  const f = sign(intent.forward), r = sign(intent.right), u = sign(intent.up), t = sign(intent.turn);
  if (f > 0) flags |= AGENT_CONTROL.AT_POS; else if (f < 0) flags |= AGENT_CONTROL.AT_NEG;
  if (r > 0) flags |= AGENT_CONTROL.LEFT_NEG; else if (r < 0) flags |= AGENT_CONTROL.LEFT_POS;
  if (u > 0) flags |= AGENT_CONTROL.UP_POS; else if (u < 0) flags |= AGENT_CONTROL.UP_NEG;
  if (t > 0) flags |= AGENT_CONTROL.TURN_RIGHT; else if (t < 0) flags |= AGENT_CONTROL.TURN_LEFT;
  if (intent.run) {
    if (f) flags |= AGENT_CONTROL.FAST_AT;
    if (r) flags |= AGENT_CONTROL.FAST_LEFT;
    if (u) flags |= AGENT_CONTROL.FAST_UP;
  }
  const nf = sign(intent.nudgeForward), nr = sign(intent.nudgeRight), nu = sign(intent.nudgeUp);
  if (nf > 0) flags |= AGENT_CONTROL.NUDGE_AT_POS; else if (nf < 0) flags |= AGENT_CONTROL.NUDGE_AT_NEG;
  if (nr > 0) flags |= AGENT_CONTROL.NUDGE_LEFT_NEG; else if (nr < 0) flags |= AGENT_CONTROL.NUDGE_LEFT_POS;
  if (nu > 0) flags |= AGENT_CONTROL.NUDGE_UP_POS; else if (nu < 0) flags |= AGENT_CONTROL.NUDGE_UP_NEG;
  if (intent.fly) flags |= AGENT_CONTROL.FLY;
  if (intent.stop) flags |= AGENT_CONTROL.STOP;
  if (intent.standUp) flags |= AGENT_CONTROL.STAND_UP;
  if (intent.sitOnGround) flags |= AGENT_CONTROL.SIT_ON_GROUND;
  if (intent.mouselook) flags |= AGENT_CONTROL.MOUSELOOK;
  if (intent.away) flags |= AGENT_CONTROL.AWAY;
  if (intent.finishAnim) flags |= AGENT_CONTROL.FINISH_ANIM;
  if (intent.leftButton) flags |= AGENT_CONTROL.LBUTTON_DOWN;
  if (intent.mouselookLeftButton) flags |= AGENT_CONTROL.ML_LBUTTON_DOWN;
  return flags >>> 0;
}

/** Flags that are one-shot: the sender clears them after the update that carries them. */
export const ONE_SHOT_FLAGS: number =
  (AGENT_CONTROL.STOP | AGENT_CONTROL.STAND_UP | AGENT_CONTROL.SIT_ON_GROUND | AGENT_CONTROL.FINISH_ANIM |
    AGENT_CONTROL.NUDGE_AT_POS | AGENT_CONTROL.NUDGE_AT_NEG | AGENT_CONTROL.NUDGE_LEFT_POS | AGENT_CONTROL.NUDGE_LEFT_NEG |
    AGENT_CONTROL.NUDGE_UP_POS | AGENT_CONTROL.NUDGE_UP_NEG) >>> 0;

/** AgentUpdate `Flags` bits (`AU_FLAGS_HIDETITLE`, `AU_FLAGS_CLIENT_AUTOPILOT`). */
export const AGENT_UPDATE_FLAGS = { HIDE_TITLE: 0x1, CLIENT_AUTOPILOT: 0x2 } as const;

/** Timing constants from `llviewerinput.cpp` (`NUDGE_TIME` 0.25 s, `FLY_TIME` 0.5 s). */
export const NUDGE_TIME_MS = 250;
export const FLY_TIME_MS = 500;

/** Keyboard commands (from key_bindings.xml) that act on the agent rather than the camera. */
export type AgentCommand =
  | 'push_forward' | 'push_backward' | 'slide_left' | 'slide_right' | 'turn_left' | 'turn_right'
  | 'jump' | 'push_down' | 'toggle_fly' | 'toggle_run' | 'stop_moving';

export const AGENT_COMMANDS: ReadonlySet<string> = new Set<AgentCommand>([
  'push_forward', 'push_backward', 'slide_left', 'slide_right', 'turn_left', 'turn_right',
  'jump', 'push_down', 'toggle_fly', 'toggle_run', 'stop_moving',
]);

const MOVE_AXIS: Record<string, string> = {
  push_forward: 'forward', push_backward: 'back', slide_left: 'left', slide_right: 'right',
  turn_left: 'turnLeft', turn_right: 'turnRight', jump: 'up', push_down: 'down',
};

/**
 * Tracks held movement commands the way the official viewer does, so a UI layer only reports
 * command edges with a timestamp:
 *  - a walk key tapped for less than 250 ms is a single-step "nudge", not a walk;
 *  - pressing the same walk key again within 250 ms (tap-tap-hold) runs until it is released;
 *  - jump held for 500 ms starts flying when `automaticFly` is on;
 *  - toggle_fly and toggle_run act on the key-down edge only; stop_moving is held.
 * It holds no timers; callers pass the event time.
 */
export class AgentController {
  flying = false;
  alwaysRun = false;
  automaticFly = true;
  allowTapTapHoldRun = true;
  mouselook = false;
  away = false;

  private pressedAt = new Map<string, number>();
  private lastWalkTap: { axis: string; at: number } | null = null;
  private tempRunAxis: string | null = null;
  private stopHeld = false;
  private pendingOneShots = 0;

  command(command: string, down: boolean, time: number): boolean {
    if (!AGENT_COMMANDS.has(command)) return false;
    if (command === 'toggle_fly') { if (down) this.flying = !this.flying; return true; }
    if (command === 'toggle_run') { if (down) this.alwaysRun = !this.alwaysRun; return true; }
    if (command === 'stop_moving') { this.stopHeld = down; return true; }
    const axis = MOVE_AXIS[command];
    if (down) this.press(axis, time); else this.release(axis);
    return true;
  }

  private press(axis: string, time: number): void {
    if (this.pressedAt.has(axis)) return; // key repeat
    this.pressedAt.set(axis, time);
    const walk = ['forward', 'back', 'left', 'right'].includes(axis);
    if (!walk) return;
    const running = this.alwaysRun || this.tempRunAxis !== null;
    if (this.allowTapTapHoldRun && !running && this.lastWalkTap?.axis === axis && time - this.lastWalkTap.at < NUDGE_TIME_MS) {
      this.tempRunAxis = axis;
    }
    this.lastWalkTap = { axis, at: time };
  }

  private release(axis: string): void {
    this.pressedAt.delete(axis);
    if (this.tempRunAxis === axis) this.tempRunAxis = null;
  }

  releaseAll(): void { this.pressedAt.clear(); this.tempRunAxis = null; this.stopHeld = false; }

  setFlying(on: boolean): void { this.flying = on; }
  setMouselook(on: boolean): void { this.mouselook = on; }
  setAway(on: boolean): void { this.away = on; }
  standUp(): void { this.pendingOneShots |= AGENT_CONTROL.STAND_UP; }
  sitOnGround(): void { this.pendingOneShots |= AGENT_CONTROL.SIT_ON_GROUND; }

  isMoving(): boolean { return this.pressedAt.size > 0; }

  /** Flags for the next AgentUpdate at `time`; consumes one-shot flags. */
  nextFlags(time: number): number {
    const held = (axis: string) => this.pressedAt.has(axis);
    const age = (axis: string) => time - (this.pressedAt.get(axis) ?? time);
    const run = this.alwaysRun || this.tempRunAxis !== null;
    const intent: MovementIntent = { run, fly: this.flying, mouselook: this.mouselook, away: this.away, stop: this.stopHeld };
    const walk = (pos: string, neg: string, key: 'forward' | 'right', nudge: 'nudgeForward' | 'nudgeRight') => {
      const dir = Number(held(pos)) - Number(held(neg));
      if (!dir) return;
      const axis = dir > 0 ? pos : neg;
      if (age(axis) < NUDGE_TIME_MS) intent[nudge] = dir; else intent[key] = dir;
    };
    walk('forward', 'back', 'forward', 'nudgeForward');
    walk('right', 'left', 'right', 'nudgeRight');
    intent.up = Number(held('up')) - Number(held('down'));
    intent.turn = Number(held('turnRight')) - Number(held('turnLeft'));
    if (held('up') && !this.flying && this.automaticFly && age('up') >= FLY_TIME_MS) { this.flying = true; intent.fly = true; }
    const flags = (intentToFlags(intent) | this.pendingOneShots) >>> 0;
    this.pendingOneShots = 0;
    return flags;
  }
}
