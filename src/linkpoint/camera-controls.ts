import { Camera3D } from './camera-3d';

type PointerSample = { x: number; y: number };

/** Pointer, touch, wheel and keyboard controls modelled after Firestorm. */
export class CameraControls {
  private pointers = new Map<number, PointerSample>();
  private keys = new Set<string>();
  private pinchDistance = 0;
  private lastFrame = 0;
  private frame: number | null = null;

  constructor(private canvas: HTMLCanvasElement, private camera: Camera3D, private changed: () => void = () => undefined) {
    canvas.style.touchAction = 'none';
    canvas.tabIndex = 0;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.preventMenu);
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('blur', this.onBlur);
  }

  private preventMenu = (event: Event) => event.preventDefault();
  private onPointerDown = (event: PointerEvent) => {
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.pinchDistance = this.distance();
  };
  private onPointerMove = (event: PointerEvent) => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size > 1) {
      const distance = this.distance();
      if (this.pinchDistance) this.camera.zoom((distance - this.pinchDistance) / 240);
      this.pinchDistance = distance;
      this.camera.pan(-dx * .012, dy * .012);
    } else if (event.shiftKey || event.button === 1 || event.buttons === 4) {
      this.camera.pan(-dx * .012, dy * .012);
    } else {
      this.camera.rotate(-dy * this.camera.rotateSpeed, -dx * this.camera.rotateSpeed);
    }
    this.changed();
  };
  private onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.pinchDistance = this.distance();
  };
  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.camera.zoom(-event.deltaY / 700);
    this.changed();
  };
  private onKeyDown = (event: KeyboardEvent) => {
    if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) {
      event.preventDefault(); this.keys.add(event.code); this.startKeys();
    }
  };
  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  private onBlur = () => this.keys.clear();
  private distance() {
    const points = [...this.pointers.values()];
    return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
  private startKeys() {
    if (this.frame !== null) return;
    const tick = (time: number) => {
      const step = Math.min((time - (this.lastFrame || time)) / 1000, .05) * this.camera.moveSpeed;
      this.lastFrame = time;
      const forward = Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) - Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'));
      const right = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      const up = Number(this.keys.has('KeyE')) - Number(this.keys.has('KeyQ'));
      if (forward || right || up) { this.camera.move(forward * step, right * step, up * step); this.changed(); }
      if (this.keys.size) this.frame = requestAnimationFrame(tick);
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
    this.canvas.removeEventListener('keydown', this.onKeyDown);
    this.canvas.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('blur', this.onBlur);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
  }
}
