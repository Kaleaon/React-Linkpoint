import { commandFor, keyNameFromCode, maskFromModifiers, type KeyMask, type KeyMode, type KeyOverrides } from './key-bindings';
import { isTypingTarget } from './keyboard-motion';

/** The slice of `VoiceManager` push-to-talk drives. */
export interface PushToTalkTarget {
  getUserPttState(): boolean;
  setUserPttState(talking: boolean): void;
  toggleUserPttState(): void;
}

export interface VoiceInputOptions {
  /** Which binding table applies right now. */
  mode?: () => KeyMode;
  /** The viewer's `isActionAllowed("speak")`: false while not in voice. */
  enabled?: () => boolean;
  overrides?: () => KeyOverrides;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Called after the microphone state was changed by a key, e.g. to play the mic-toggle sound. */
  onChanged?: (talking: boolean) => void;
}

/**
 * The two voice key commands of `llviewerinput.cpp`: `toggle_voice` (default: middle mouse button) flips the
 * push-to-talk state on press, and `voice_follow_key` opens the mic while its key is held (nothing is bound to it by
 * default; bind one in the key overrides).
 */
export class VoiceInput {
  private readonly target: NonNullable<VoiceInputOptions['target']>;

  constructor(private readonly voice: PushToTalkTarget, private readonly options: VoiceInputOptions = {}) {
    this.target = options.target ?? window;
    this.target.addEventListener('keydown', this.onKeyDown as EventListener);
    this.target.addEventListener('keyup', this.onKeyUp as EventListener);
    this.target.addEventListener('mousedown', this.onMouseDown as EventListener);
  }

  destroy() {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    this.target.removeEventListener('mousedown', this.onMouseDown as EventListener);
  }

  private mode(): KeyMode { return this.options.mode?.() ?? 'third_person'; }
  private allowed() { return this.options.enabled ? this.options.enabled() : true; }

  /** `toggle_voice`: flips on press; `voice_follow_key`: open while held. Returns true when the command was handled. */
  private run(command: string | null, down: boolean): boolean {
    if (command === 'toggle_voice') {
      if (!down) return true;
      if (!this.allowed()) return false;
      this.voice.toggleUserPttState();
      this.options.onChanged?.(this.voice.getUserPttState());
      return true;
    }
    if (command === 'voice_follow_key') {
      if (down) {
        if (!this.allowed()) return false;
        if (!this.voice.getUserPttState()) this.options.onChanged?.(true);
        this.voice.setUserPttState(true);
        return true;
      }
      if (this.voice.getUserPttState()) {
        this.voice.setUserPttState(false);
        this.options.onChanged?.(false);
        return true;
      }
    }
    return false;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat || event.metaKey || isTypingTarget(event.target)) return;
    const key = keyNameFromCode(event.code);
    const mask = maskFromModifiers({ ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey });
    if (!key || !mask) return;
    const command = commandFor(this.mode(), key, mask, this.options.overrides?.());
    if (this.run(command, true)) event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent) => {
    const key = keyNameFromCode(event.code);
    if (!key) return;
    // Shift or Alt may be up already when the key is released, so look the key up under every modifier mask.
    const masks: KeyMask[] = ['NONE', 'SHIFT', 'ALT', 'CTL_ALT', 'CTL_ALT_SHIFT'];
    for (const m of masks) {
      if (commandFor(this.mode(), key, m, this.options.overrides?.()) === 'voice_follow_key') { this.run('voice_follow_key', false); return; }
    }
  };

  private onMouseDown = (event: MouseEvent) => {
    if (event.button !== 1 || isTypingTarget(event.target)) return;
    const mask = maskFromModifiers({ ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey });
    if (!mask) return;
    if (this.run(commandFor(this.mode(), 'MMB', mask, this.options.overrides?.()), true)) event.preventDefault();
  };
}
