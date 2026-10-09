/**
 * Avatar control from a six-axis joystick, ported from the official viewer's `LLViewerJoystick::moveAvatar`
 * (`indra/newview/llviewerjoystick.cpp`; defaults from `app_settings/settings.xml`). The viewer's joystick is a
 * SpaceNavigator-style device with six axes; `hardwareAxes` below are those six, in the order the viewer reads them:
 * [0] slide, [1] push (positive is backward), [2] up/down (negative is up), [3] roll, [4] pitch, [5] yaw.
 *
 * Differences: the viewer's `mPerfScale` (4000 / CPU MHz, "hmm. why?") is 1 here; the pitch it applies to the camera is
 * returned but not applied; turning is the on/off turn flag rather than a proportional yaw.
 */

/** Internal axis indices (`X_I` ... `RZ_I` in the viewer). */
export const AXIS = { Z: 0, X: 1, Y: 2, RZ: 3, RX: 4, RY: 5 } as const;

export interface JoystickSettings {
  /** `JoystickAxis0..5`: which hardware axis feeds each internal axis. */
  axis: readonly number[];
  /** `AvatarAxisScale0..5`. */
  scale: readonly number[];
  /** `AvatarAxisDeadZone0..5`. */
  deadZone: readonly number[];
  /** `AvatarFeathering`: smoothing of the rotations (less is softer). */
  feathering: number;
  /** `JoystickRunThreshold`. */
  runThreshold: number;
  /** `AutomaticFly`. */
  automaticFly: boolean;
  /** `mPerfScale`. */
  perfScale: number;
}

export const DEFAULT_JOYSTICK_SETTINGS: JoystickSettings = {
  axis: [1, 0, 2, 4, 3, 5],
  // settings.xml has 1 for every axis, but the rotations are multiplied by the frame time, so at 30 to 60 frames a second a
  // full stick turn falls under the extra 30% dead zone used while walking. The viewer's own SpaceNavigator defaults for macOS and
  // Linux (`setSNDefaults`: 0.1 * 20) give the rotation axes a scale of 2 and switch roll off; those are used here.
  scale: [1, 1, 1, 0, 2, 2],
  deadZone: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
  feathering: 16,
  runThreshold: 0.25,
  automaticFly: true,
  perfScale: 1,
};

export interface JoystickInput {
  /** Six hardware axes, each in -1..1. */
  hardwareAxes: ArrayLike<number>;
  /** Button 1 of the viewer: a jump on the ground, or lands/toggles flying. */
  button1: boolean;
  /** Seconds since the last step. */
  dt: number;
  flying: boolean;
  canFly: boolean;
}

export interface JoystickOutput {
  /** -1 forward, 1 back. */
  push: number;
  /** -1 left, 1 right. */
  slide: number;
  /** -1 up (and fly, with automatic flying), 1 down. */
  fly: number;
  pitch: number;
  /** Positive turns right. */
  yaw: number;
  run: boolean;
  /** Button 1 on the ground. */
  jump: boolean;
  /** A change of flying the stick asked for: true to take off, false to land, null for none. */
  setFlying: boolean | null;
  idle: boolean;
}

const sgn = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export class JoystickAvatar {
  private readonly sDelta = [0, 0, 0, 0, 0, 0];
  private runCounter = 0;
  private buttonHeld = false;

  constructor(public settings: JoystickSettings = DEFAULT_JOYSTICK_SETTINGS) {}

  reset() {
    this.sDelta.fill(0);
    this.runCounter = 0;
    this.buttonHeld = false;
  }

  /** `handleRun`: run above a threshold, with one frame of hysteresis each way. */
  private handleRun(inc: number): boolean {
    if (inc > this.settings.runThreshold) {
      if (this.runCounter === 1) this.runCounter++;
      else if (this.runCounter === 0) this.runCounter++;
    } else if (this.runCounter > 0) {
      this.runCounter--;
    }
    return this.runCounter >= 2;
  }

  step(input: JoystickInput): JoystickOutput {
    const s = this.settings;
    const out: JoystickOutput = {
      push: 0,
      slide: 0,
      fly: 0,
      pitch: 0,
      yaw: 0,
      run: false,
      jump: false,
      setFlying: null,
      idle: true,
    };
    let isZero = true;

    // Button 1: with automatic flying it jumps on the ground and lands when flying; otherwise it toggles flying.
    if (input.button1) {
      if (s.automaticFly) {
        if (!input.flying) out.jump = true;
        else if (!this.buttonHeld) {
          this.buttonHeld = true;
          out.setFlying = false;
        }
      } else if (!this.buttonHeld) {
        this.buttonHeld = true;
        out.setFlying = !input.flying;
      }
      isZero = false;
    } else {
      this.buttonHeld = false;
    }

    // avoid making ridiculously big movements if there's a big drop in fps
    const time = Math.min(input.dt, 0.2);

    const cur = new Array<number>(6).fill(0);
    let domMov = 0;
    let domAxis: number = AXIS.Z;
    for (let i = 0; i < 6; i++) {
      cur[i] = -(input.hardwareAxes[s.axis[i]] ?? 0);
      cur[i] =
        cur[i] > 0 ? Math.max(cur[i] - s.deadZone[i], 0) : Math.min(cur[i] + s.deadZone[i], 0);
      // we don't care about Roll (RZ) and Z is calculated after the loop
      if (i !== AXIS.Z && i !== AXIS.RZ) {
        const value = Math.abs(cur[i]);
        if (value > domMov) {
          domAxis = i;
          domMov = value;
        }
      }
      isZero = isZero && cur[i] === 0;
    }
    out.idle = isZero;

    // forward|backward movements overrule the real dominant movement if they're bigger than its 20%; walking while
    // pitching and turning is allowed with an even more lenient 5%
    if (
      Math.abs(cur[AXIS.Z]) > 0.2 * domMov ||
      ((domAxis === AXIS.RX || domAxis === AXIS.RY) && Math.abs(cur[AXIS.Z]) > 0.05 * domMov)
    ) {
      domAxis = AXIS.Z;
    }

    const d = this.sDelta;
    d[AXIS.X] = -cur[AXIS.X] * s.scale[AXIS.X];
    d[AXIS.Y] = -cur[AXIS.Y] * s.scale[AXIS.Y];
    d[AXIS.Z] = -cur[AXIS.Z] * s.scale[AXIS.Z];
    cur[AXIS.RX] *= -s.scale[AXIS.RX] * s.perfScale;
    cur[AXIS.RY] *= -s.scale[AXIS.RY] * s.perfScale;
    cur[AXIS.RX] *= time;
    cur[AXIS.RY] *= time;
    d[AXIS.RX] += (cur[AXIS.RX] - d[AXIS.RX]) * time * s.feathering;
    d[AXIS.RY] += (cur[AXIS.RY] - d[AXIS.RY]) * time * s.feathering;

    out.run = this.handleRun(Math.hypot(d[AXIS.Z], d[AXIS.X]));

    const push = (inc: number) => (inc < 0 ? -1 : inc > 0 ? 1 : 0);
    const slide = (inc: number) => (inc < 0 ? -1 : inc > 0 ? 1 : 0);
    if (domAxis === AXIS.Z) {
      // Allow forward/backward movement some priority
      out.push = push(d[AXIS.Z]);
      if (Math.abs(d[AXIS.X]) > 0.1) out.slide = slide(d[AXIS.X]);
      if (Math.abs(d[AXIS.Y]) > 0.1) out.fly = sgn(d[AXIS.Y]);
      // too many rotations during walking can be confusing: apply the dead zones once more, at 30% power
      let effRx = 0.3 * s.deadZone[AXIS.RX];
      let effRy = 0.3 * s.deadZone[AXIS.RY];
      effRx = d[AXIS.RX] > 0 ? Math.max(d[AXIS.RX] - effRx, 0) : Math.min(d[AXIS.RX] + effRx, 0);
      effRy = d[AXIS.RY] > 0 ? Math.max(d[AXIS.RY] - effRy, 0) : Math.min(d[AXIS.RY] + effRy, 0);
      if (Math.abs(effRx) > 0 || Math.abs(effRy) > 0) {
        out.pitch = effRx;
        out.yaw = input.flying ? effRy : 2 * effRy;
      }
    } else {
      out.slide = slide(d[AXIS.X]);
      out.fly = sgn(d[AXIS.Y]);
      out.push = push(d[AXIS.Z]);
      out.pitch = d[AXIS.RX];
      out.yaw = d[AXIS.RY];
    }

    // agentFly: moving up with automatic flying takes off when allowed
    if (out.fly < 0 && s.automaticFly && !input.flying && input.canFly) out.setFlying = true;
    return out;
  }
}

/**
 * The six hardware axes from a browser gamepad with the "standard" mapping. This mapping is ours, not the viewer's (it has
 * no gamepad support): left stick slides and pushes, the triggers go up (right) and down (left), the right stick yaws and pitches.
 */
export function hardwareAxesFromStandardGamepad(
  axes: ArrayLike<number>,
  buttons: ArrayLike<{ value: number }>,
): number[] {
  const leftX = axes[0] ?? 0,
    leftY = axes[1] ?? 0,
    rightX = axes[2] ?? 0,
    rightY = axes[3] ?? 0;
  const leftTrigger = buttons[6]?.value ?? 0,
    rightTrigger = buttons[7]?.value ?? 0;
  return [leftX, leftY, leftTrigger - rightTrigger, 0, rightY, rightX];
}
