import { Camera3D } from './camera-3d';
import { isMotionKey, isTypingTarget, resolveKeyMotion, TURN_RATE, type KeyMotion } from './keyboard-motion';
import { cameraRates, heldCameraCommands, isCameraKey } from './camera-keyboard';
import type { KeyMode } from './key-bindings';

/** Hooks the viewer gives the controls for the standard Second Life camera shortcuts. */
export interface CameraControlOptions {
  /** Binding table in force (third person, first person, sitting). */
  keyMode?: () => KeyMode;
  /** Esc: put the camera back behind the avatar. */
  resetView?: () => void;
  /** M: switch between the third-person camera and mouselook. */
  toggleMouselook?: () => void;
  /** Alt+click: zoom the camera onto whatever is under the pointer. */
  focusAt?: (x: number, y: number) => void;
}

type PointerSample = { x: number; y: number; time: number };

/**
 * Pointer, touch, wheel and keyboard controls modelled after Firestorm.
 * Keyboard shortcuts listen on the window, not the canvas: on desktop the
 * canvas sits behind floaters and the chrome, so it is rarely the focused
 * element. Typing in any text field still takes priority.
 */
export class CameraControls {
  private pointers = new Map<number, PointerSample>();
  private keys = new Set<string>();
  /** Held keys that drive camera commands (Alt+arrows, Ctrl+Alt+PgUp, ...), by key code. */
  private cameraKeys = new Set<string>();
  private mods = { ctrl: false, alt: false, shift: false };
  private pinchDistance = 0;
  private previousMidpoint: { x: number; y: number } | null = null;
  private lastFrame = 0;
  private frame: number | null = null;
  private pointerStart = new Map<number, PointerSample>();
  private velocityThreshold = 0.05; // px/ms
  private displacementThreshold = 3; // px
  private panMode = false;

  constructor(private canvas: HTMLCanvasElement, private camera: Camera3D, private changed: () => void = () => undefined, private picked: (x: number, y: number) => void = () => undefined, private avatarMotion: (motion: KeyMotion, run: boolean) => boolean = () => false, private options: CameraControlOptions = {}) {
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.preventMenu);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('gesturestart', this.preventMenu);
    canvas.addEventListener('gesturechange', this.preventMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onBlur);
  }

  public setVelocityThreshold(threshold: number) { this.velocityThreshold = Math.max(0, threshold); }
  public getVelocityThreshold() { return this.velocityThreshold; }
  public setDisplacementThreshold(threshold: number) { this.displacementThreshold = Math.max(0, threshold); }
  public getDisplacementThreshold() { return this.displacementThreshold; }
  public setPanMode(enabled: boolean) { this.panMode = enabled; }
  public getPanMode() { return this.panMode; }
  public togglePanMode() { this.panMode = !this.panMode; return this.panMode; }

  private preventMenu = (event: Event) => event.preventDefault();
  private onTouchStart = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  };
  private onTouchMove = (event: TouchEvent) => {
    // Prevent mobile browser page zoom / pull-to-refresh during 3D touch interaction
    event.preventDefault();
  };

  private sampleTime(event: PointerEvent) {
    if ((event as any).timeStampOverride !== undefined) return (event as any).timeStampOverride;
    return event.timeStamp && event.timeStamp > 0
      ? event.timeStamp
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  private onPointerDown = (event: PointerEvent) => {
    this.canvas.focus({ preventScroll: true });
    try { this.canvas.setPointerCapture?.(event.pointerId); } catch { /* ignore */ }
    const time = this.sampleTime(event);
    const sample = { x: event.clientX, y: event.clientY, time };
    this.pointers.set(event.pointerId, sample);
    this.pointerStart.set(event.pointerId, sample);
    if (this.pointers.size > 1) {
      this.pinchDistance = this.distance();
      this.previousMidpoint = this.midpoint();
    }
  };

  private onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const time = this.sampleTime(event);
    const dt = Math.max(time - previous.time, 0.001);
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    const stepDistance = Math.hypot(dx, dy);
    const velocity = stepDistance / dt;

    const start = this.pointerStart.get(event.pointerId);
    const totalDisplacement = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) : stepDistance;

    // Filter touch/pointer drag gestures using velocity and displacement thresholds for single pointer
    if (this.pointers.size === 1 && velocity < this.velocityThreshold && totalDisplacement < this.displacementThreshold) {
      return;
    }

    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time });

    if (this.pointers.size > 1) {
      // Multi-touch: Pinch-to-zoom (pinch to zoom out, spread to zoom in) & Two-finger Panning
      const currentDistance = this.distance();
      const currentMidpoint = this.midpoint();

      // 1. Pinch to zoom out, spread fingers to zoom in
      if (this.pinchDistance > 0 && currentDistance > 0) {
        const delta = currentDistance - this.pinchDistance;
        // Spreading fingers (delta > 0) zooms in; pinching fingers (delta < 0) zooms out
        this.camera.zoom(delta / 180);
        this.pinchDistance = currentDistance;
      } else {
        this.pinchDistance = currentDistance;
      }

      // 2. Two-finger Panning: moving both fingers together pans the camera smoothly
      if (this.previousMidpoint && currentMidpoint) {
        const midDx = currentMidpoint.x - this.previousMidpoint.x;
        const midDy = currentMidpoint.y - this.previousMidpoint.y;
        if (Math.hypot(midDx, midDy) > 0.5) {
          this.camera.pan(-midDx * 0.015, midDy * 0.015);
        }
        this.previousMidpoint = currentMidpoint;
      } else {
        this.previousMidpoint = currentMidpoint;
      }
    } else if (this.panMode || event.shiftKey || (event.altKey && event.ctrlKey) || event.button === 1 || event.buttons === 4) {
      // Single-pointer Pan: Pan mode on mobile, Shift-drag, Ctrl+Alt-drag (the viewer's pan) or middle-drag on desktop.
      this.camera.pan(-dx * 0.015, dy * 0.015);
    } else {
      // Single-pointer Orbit / Rotate
      this.camera.rotate(-dy * this.camera.rotateSpeed, -dx * this.camera.rotateSpeed);
    }
    this.changed();
  };

  private onPointerUp = (event: PointerEvent) => {
    const start = this.pointerStart.get(event.pointerId);
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) {
      const bounds = this.canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      // Alt+click zooms onto the object under the pointer instead of selecting it, as in the official viewer.
      if (event.altKey && this.options.focusAt) this.options.focusAt(x, y);
      else this.picked(x, y);
    }
    try { this.canvas.releasePointerCapture?.(event.pointerId); } catch { /* ignore */ }
    this.pointers.delete(event.pointerId);
    this.pointerStart.delete(event.pointerId);
    if (this.pointers.size > 1) {
      this.pinchDistance = this.distance();
      this.previousMidpoint = this.midpoint();
    } else {
      this.pinchDistance = 0;
      this.previousMidpoint = null;
    }
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.camera.zoom(-event.deltaY / 700);
    this.changed();
  };
  private shift = false;
  private keyMode(): KeyMode { return this.options.keyMode?.() ?? 'third_person'; }
  private onKeyDown = (event: KeyboardEvent) => {
    this.shift = event.shiftKey;
    this.mods = { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
    if (event.metaKey || isTypingTarget(event.target)) return;
    // Esc puts the camera back behind the avatar; M toggles mouselook. Neither fires with a modifier held.
    if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.repeat) {
      if (event.code === 'Escape' && this.options.resetView && !this.escapeBelongsToPage(event.target)) { this.options.resetView(); this.changed(); return; }
      if (event.code === 'KeyM' && this.options.toggleMouselook) { event.preventDefault(); this.options.toggleMouselook(); this.changed(); return; }
    }
    // Camera commands from the official bindings (Alt+arrows orbit, Alt+W/S zoom, Ctrl+Alt+Shift pan...).
    if ((event.altKey || event.ctrlKey) && isCameraKey(event.code, this.mods, this.keyMode())) {
      event.preventDefault();
      this.cameraKeys.add(event.code);
      this.startKeys();
      return;
    }
    if (!isMotionKey(event.code)) return;
    // Leave browser/OS shortcuts alone.
    if (event.ctrlKey || event.altKey) return;
    // A focused button or link would otherwise also activate on Space.
    event.preventDefault();
    this.keys.add(event.code);
    this.startKeys();
  };
  private onKeyUp = (event: KeyboardEvent) => {
    this.shift = event.shiftKey;
    this.mods = { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
    this.keys.delete(event.code);
    this.cameraKeys.delete(event.code);
  };
  private onBlur = () => { this.keys.clear(); this.cameraKeys.clear(); this.shift = false; this.mods = { ctrl: false, alt: false, shift: false }; };
  /** Esc closes dialogs and menus first; only a press that reaches the page itself resets the camera. */
  private escapeBelongsToPage(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    return Boolean(element?.closest?.('[role="dialog"], [role="menu"], [aria-modal="true"], dialog'));
  }

  private distance(): number {
    const points = [...this.pointers.values()];
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  private midpoint(): { x: number; y: number } | null {
    const points = [...this.pointers.values()];
    if (points.length < 2) return null;
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  private startKeys() {
    if (this.frame !== null) return;
    const tick = (time: number) => {
      const seconds = Math.min((time - (this.lastFrame || time)) / 1000, .05);
      this.lastFrame = time;
      if (this.cameraKeys.size) {
        const rates = cameraRates(heldCameraCommands(this.cameraKeys, this.mods, this.keyMode()));
        if (rates.yaw || rates.pitch) this.camera.rotate(rates.pitch * seconds, rates.yaw * seconds);
        if (rates.zoom) this.camera.zoom(rates.zoom * seconds);
        if (rates.panX || rates.panY) this.camera.pan(rates.panX * seconds, rates.panY * seconds);
        if (rates.yaw || rates.pitch || rates.zoom || rates.panX || rates.panY) this.changed();
      }
      const motion = resolveKeyMotion(this.keys, this.shift);
      const avatarMoved = this.avatarMotion(motion, this.shift);
      const step = seconds * this.camera.moveSpeed;
      let moved = false;
      if (!avatarMoved && motion.turn) { this.camera.turn(motion.turn * TURN_RATE * seconds); moved = true; }
      if (!avatarMoved && (motion.forward || motion.right || motion.up)) {
        this.camera.move(motion.forward * step, motion.right * step, motion.up * step);
        moved = true;
      }
      if (moved) this.changed();
      if (this.keys.size || this.cameraKeys.size) this.frame = requestAnimationFrame(tick);
      else { this.frame = null; this.lastFrame = 0; }
    };
    this.frame = requestAnimationFrame(tick);
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.preventMenu);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('gesturestart', this.preventMenu);
    this.canvas.removeEventListener('gesturechange', this.preventMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onBlur);
    this.keys.clear();
    this.cameraKeys.clear();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }
}
