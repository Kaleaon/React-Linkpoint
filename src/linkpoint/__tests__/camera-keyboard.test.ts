// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Camera3D } from '../camera-3d';
import { CameraControls } from '../camera-controls';
import { cameraRates, heldCameraCommands, PAN_RATE, SPIN_RATE } from '../camera-keyboard';

describe('camera keyboard commands', () => {
  it('maps the official Alt, Ctrl+Alt and Ctrl+Alt+Shift bindings', () => {
    const third = (codes: string[], mods: any) => heldCameraCommands(codes, mods, 'third_person');
    expect(third(['ArrowLeft'], { alt: true })).toEqual(['spin_around_cw']);
    expect(third(['ArrowRight'], { alt: true })).toEqual(['spin_around_ccw']);
    expect(third(['KeyW'], { alt: true })).toEqual(['move_forward']);
    expect(third(['PageUp'], { alt: true })).toEqual(['spin_over']);
    expect(third(['KeyS'], { alt: true, ctrl: true })).toEqual(['spin_under']);
    expect(third(['KeyA'], { alt: true, ctrl: true, shift: true })).toEqual(['pan_left']);
    expect(third(['KeyW'], {})).toEqual([]); // walking is the avatar's, not the camera's
  });

  it('turns commands into rates and cancels opposites', () => {
    expect(cameraRates(['spin_around_cw']).yaw).toBe(SPIN_RATE);
    expect(cameraRates(['spin_around_cw', 'spin_around_ccw']).yaw).toBe(0);
    expect(cameraRates(['pan_right']).panX).toBe(PAN_RATE);
  });
});

describe('CameraControls with the standard viewer shortcuts', () => {
  let canvas: HTMLCanvasElement;
  let camera: Camera3D;
  let controls: CameraControls;
  let mode: 'third_person' | 'sitting' = 'third_person';
  const hooks: any = {
    keyMode: () => mode,
    resetView: vi.fn(),
    toggleMouselook: vi.fn(),
    focusAt: vi.fn(),
  };
  const picked = vi.fn();
  let frame = 0;
  let pending: Array<(t: number) => void> = [];
  const runFrames = (count: number, step = 100) => {
    for (let i = 0; i < count; i++) {
      const run = pending;
      pending = [];
      frame += step;
      run.forEach((f) => f(frame));
    }
  };
  const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(
      new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init }),
    );

  beforeEach(() => {
    mode = 'third_person';
    vi.stubGlobal('requestAnimationFrame', (f: (t: number) => void) => {
      pending.push(f);
      return pending.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    Object.values(hooks).forEach((h: any) => h.mockClear?.());
    picked.mockClear();
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    camera = new Camera3D();
    camera.setMode('orbit');
    camera.setOrbitTarget(10, 10, 20);
    controls = new CameraControls(
      canvas,
      camera,
      () => undefined,
      picked,
      () => true,
      hooks,
    );
  });
  afterEach(() => {
    controls.destroy();
    canvas.remove();
    pending = [];
    vi.unstubAllGlobals();
  });

  it('Alt+Left/Right orbit the camera around the avatar', () => {
    const yaw = camera.rotation[1];
    key('keydown', 'ArrowLeft', { altKey: true });
    runFrames(5);
    key('keyup', 'ArrowLeft');
    const after = camera.rotation[1];
    expect(after).not.toBeCloseTo(yaw, 3);
    key('keydown', 'ArrowRight', { altKey: true });
    runFrames(5);
    key('keyup', 'ArrowRight');
    expect(Math.abs(camera.rotation[1] - yaw)).toBeLessThan(Math.abs(after - yaw));
  });

  it('Alt+W/S move the camera in and out; Alt+PageUp/Down spin over and under', () => {
    const distance = camera.orbitDistance;
    key('keydown', 'KeyW', { altKey: true });
    runFrames(3);
    key('keyup', 'KeyW');
    expect(camera.orbitDistance).toBeLessThan(distance);
    const pitch = camera.rotation[0];
    key('keydown', 'PageUp', { altKey: true });
    runFrames(3);
    key('keyup', 'PageUp');
    expect(camera.rotation[0]).not.toBeCloseTo(pitch, 3);
  });

  it('while sitting, plain movement keys drive the camera, and while standing they do not', () => {
    const yaw = camera.rotation[1];
    key('keydown', 'ArrowLeft');
    runFrames(4);
    key('keyup', 'ArrowLeft');
    expect(camera.rotation[1]).toBeCloseTo(yaw, 5); // standing: left arrow turns the avatar, not the camera
    mode = 'sitting';
    key('keydown', 'ArrowLeft');
    runFrames(4);
    key('keyup', 'ArrowLeft');
    expect(camera.rotation[1]).not.toBeCloseTo(yaw, 3);
  });

  it('Ctrl+Alt+Shift+arrows pan the camera target', () => {
    const before = [...camera.orbitTarget];
    key('keydown', 'ArrowUp', { altKey: true, ctrlKey: true, shiftKey: true });
    runFrames(3);
    key('keyup', 'ArrowUp');
    expect(camera.orbitTarget[2]).toBeGreaterThan(before[2]);
  });

  it('Esc resets the view and M toggles mouselook, but not while typing or in a dialog', () => {
    key('keydown', 'Escape');
    expect(hooks.resetView).toHaveBeenCalledTimes(1);
    key('keydown', 'KeyM');
    expect(hooks.toggleMouselook).toHaveBeenCalledTimes(1);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));
    expect(hooks.toggleMouselook).toHaveBeenCalledTimes(1);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    expect(hooks.resetView).toHaveBeenCalledTimes(1);
    input.remove();
    dialog.remove();
  });

  const pointer = (type: string, init: any) => {
    const e: any = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      button: 0,
      buttons: 1,
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      timeStampOverride: 0,
      ...init,
    });
    canvas.dispatchEvent(e);
  };

  it('Alt+click focuses instead of selecting; a plain click selects', () => {
    pointer('pointerdown', { clientX: 5, clientY: 5, altKey: true });
    pointer('pointerup', { clientX: 5, clientY: 5, altKey: true });
    expect(hooks.focusAt).toHaveBeenCalledTimes(1);
    expect(picked).not.toHaveBeenCalled();
    pointer('pointerdown', { clientX: 5, clientY: 5 });
    pointer('pointerup', { clientX: 5, clientY: 5 });
    expect(picked).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Alt+drag pans while a plain drag orbits', () => {
    const target = [...camera.orbitTarget];
    const yaw = camera.rotation[1];
    pointer('pointerdown', { clientX: 0, clientY: 0, ctrlKey: true, altKey: true });
    pointer('pointermove', {
      clientX: 40,
      clientY: 0,
      ctrlKey: true,
      altKey: true,
      timeStampOverride: 10,
    });
    pointer('pointerup', { clientX: 40, clientY: 0, ctrlKey: true, altKey: true });
    expect(camera.orbitTarget).not.toEqual(target);
    expect(camera.rotation[1]).toBeCloseTo(yaw, 5);

    pointer('pointerdown', { clientX: 0, clientY: 0 });
    pointer('pointermove', { clientX: 40, clientY: 0, timeStampOverride: 10 });
    pointer('pointerup', { clientX: 40, clientY: 0 });
    expect(camera.rotation[1]).not.toBeCloseTo(yaw, 3);
  });
});
