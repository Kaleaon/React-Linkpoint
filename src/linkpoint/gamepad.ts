import { JoystickAvatar, hardwareAxesFromStandardGamepad, type JoystickSettings } from './joystick';

/** What the gamepad drives: the movement controller behind the keyboard controls. */
export interface GamepadTarget {
  setAnalog(
    analog: { forward?: number; right?: number; up?: number; turn?: number; run?: boolean } | null,
  ): void;
  setFlying(flying: boolean): void;
  isFlying(): boolean;
}

export interface GamepadInputOptions {
  /** `JoystickEnabled`: off until the user turns it on. */
  enabled(): boolean;
  /** `JoystickAvatarEnabled` / viewer connected and not in free camera. */
  active?(): boolean;
  canFly?(): boolean;
  settings?: JoystickSettings;
  /** Replaceable for tests. */
  getGamepads?: () => ArrayLike<Gamepad | null>;
  now?: () => number;
  intervalMs?: number;
}

/**
 * Polls a browser gamepad (standard mapping) and moves the avatar with the official joystick algorithm (`joystick.ts`).
 * The viewer has no gamepad support of its own; only the axis processing is the viewer's.
 */
export class GamepadInput {
  private readonly joystick: JoystickAvatar;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private wasActive = false;

  constructor(
    private readonly target: GamepadTarget,
    private readonly options: GamepadInputOptions,
  ) {
    this.joystick = new JoystickAvatar(options.settings);
    this.last = this.now();
  }

  private now() {
    return this.options.now ? this.options.now() : performance.now();
  }

  start() {
    if (this.timer) return;
    this.last = this.now();
    this.timer = setInterval(() => this.poll(), this.options.intervalMs ?? 33);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.release();
  }

  private release() {
    if (this.wasActive) {
      this.target.setAnalog(null);
      this.joystick.reset();
      this.wasActive = false;
    }
  }

  /** The first connected gamepad with the standard layout. */
  private pad(): Gamepad | null {
    const list = this.options.getGamepads
      ? this.options.getGamepads()
      : typeof navigator !== 'undefined' && navigator.getGamepads
        ? navigator.getGamepads()
        : [];
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (g && g.connected && g.mapping === 'standard') return g;
    }
    return null;
  }

  poll() {
    const time = this.now();
    const dt = Math.max(0, (time - this.last) / 1000);
    this.last = time;
    const pad = this.options.enabled() && (this.options.active?.() ?? true) ? this.pad() : null;
    if (!pad) {
      this.release();
      return;
    }
    const flying = this.target.isFlying();
    const out = this.joystick.step({
      hardwareAxes: hardwareAxesFromStandardGamepad(pad.axes, pad.buttons),
      button1: Boolean(pad.buttons[0]?.pressed),
      dt,
      flying,
      canFly: this.options.canFly?.() ?? true,
    });
    this.wasActive = true;
    if (out.setFlying !== null && out.setFlying !== flying) this.target.setFlying(out.setFlying);
    this.target.setAnalog({
      forward: -out.push, // push is negative for forward
      right: out.slide,
      up: out.jump ? 1 : out.fly < 0 ? 1 : out.fly > 0 ? -1 : 0,
      turn: out.yaw === 0 ? 0 : out.yaw > 0 ? 1 : -1,
      run: out.run,
    });
  }
}
