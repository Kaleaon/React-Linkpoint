import { AGENT_COMMANDS, AgentController } from './agent-controls';
import { DEFAULT_KEY_BINDINGS, commandFor, keyNameFromCode, maskFromModifiers, type KeyMode, type KeyOverrides } from './key-bindings';
import { isTypingTarget } from './keyboard-motion';

export interface AgentKeyboardOptions {
  /** Receives the full control-flag word whenever it changes. */
  send: (flags: number) => void;
  /** Which binding table applies right now (third person, first person, sitting). */
  mode?: () => KeyMode;
  /** False while the camera is free-flying or the viewer is not connected: keys are left alone. */
  enabled?: () => boolean;
  /** Veto a command, e.g. RLV forbidding flying. Return false to ignore it. */
  allow?: (command: string, down: boolean) => boolean;
  overrides?: () => KeyOverrides;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now?: () => number;
  /** Poll interval while a movement key is held, in ms (nudge→walk transitions need a tick). */
  tickMs?: number;
}

/**
 * Drives the avatar from the official default bindings. Pure DOM glue around `AgentController`:
 * it sends a flag word when the flags change, and ticks while keys are held so a tap that turns
 * into a hold moves from a nudge to a walk.
 */
export class AgentKeyboard {
  readonly controller = new AgentController();
  private last = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly target: NonNullable<AgentKeyboardOptions['target']>;

  constructor(private options: AgentKeyboardOptions) {
    this.target = options.target ?? window;
    this.target.addEventListener('keydown', this.onKeyDown as EventListener);
    this.target.addEventListener('keyup', this.onKeyUp as EventListener);
    this.target.addEventListener('blur', this.release);
  }

  private mode(): KeyMode { return this.options.mode?.() ?? 'third_person'; }
  private now() { return this.options.now ? this.options.now() : performance.now(); }

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.options.enabled && !this.options.enabled()) return;
    if (event.ctrlKey && !event.altKey) return; // leave browser shortcuts alone
    if (event.metaKey || isTypingTarget(event.target)) return;
    const key = keyNameFromCode(event.code);
    const mask = maskFromModifiers({ ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey });
    if (!key || !mask) return;
    const command = commandFor(this.mode(), key, mask, this.options.overrides?.());
    if (!command || !AGENT_COMMANDS.has(command)) return;
    event.preventDefault();
    if (this.options.allow && !this.options.allow(command, true)) return;
    this.controller.command(command, true, this.now());
    this.flush();
    this.startTicking();
  };

  /** Release by key, not by command: Shift may already be up when A or D is released. */
  private onKeyUp = (event: KeyboardEvent) => {
    const key = keyNameFromCode(event.code);
    if (!key) return;
    const table = this.options.overrides?.()[this.mode()] ?? DEFAULT_KEY_BINDINGS[this.mode()];
    for (const [k, , command] of table) {
      if (k === key && AGENT_COMMANDS.has(command)) this.controller.command(command, false, this.now());
    }
    this.flush();
  };

  /** Analog movement from a gamepad, layered over the keys; null stops it. */
  setAnalog(analog: Parameters<AgentController['setAnalog']>[0]): void {
    this.controller.setAnalog(analog);
    this.flush();
  }

  /** Take off or land (a gamepad button or an upward push). */
  setFlying(flying: boolean): void {
    this.controller.setFlying(flying);
    this.flush();
  }

  private release = () => { this.controller.releaseAll(); this.flush(); };

  private flush() {
    const flags = this.controller.nextFlags(this.now());
    if (flags !== this.last) { this.last = flags; this.options.send(flags); }
    if (!this.controller.isMoving() && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private startTicking() {
    if (this.timer) return;
    this.timer = setInterval(() => this.flush(), this.options.tickMs ?? 50);
  }

  destroy() {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.target.removeEventListener('blur', this.release);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.controller.releaseAll();
    if (this.last) { this.last = 0; this.options.send(0); }
  }
}
