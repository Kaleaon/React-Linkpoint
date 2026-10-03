import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CameraControls } from '../camera-controls';
import { Camera3D } from '../camera-3d';
import { WorldViewer } from '../world';

describe('CameraControls Mobile Touch Gestures (Pinch-to-zoom, Spread-to-zoom, Two-finger Pan, Pan Mode)', () => {
  let canvas: HTMLCanvasElement;
  let camera: Camera3D;
  let changedSpy: any;
  let controls: CameraControls;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    camera = new Camera3D();
    changedSpy = vi.fn();
    controls = new CameraControls(canvas, camera, changedSpy);
  });

  it('zooms in when spreading two fingers apart (distance increases)', () => {
    const zoomSpy = vi.spyOn(camera, 'zoom');

    // Pointer 1 down at (100, 100)
    const p1Down = new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    (p1Down as any).timeStampOverride = 1000;
    canvas.dispatchEvent(p1Down);

    // Pointer 2 down at (200, 100) -> initial distance = 100px
    const p2Down = new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
    (p2Down as any).timeStampOverride = 1000;
    canvas.dispatchEvent(p2Down);

    // Spread fingers: pointer 2 moves outward to (250, 100) -> distance = 150px (> 100px)
    const p2Spread = new PointerEvent('pointermove', { pointerId: 2, clientX: 250, clientY: 100 });
    (p2Spread as any).timeStampOverride = 1050;
    canvas.dispatchEvent(p2Spread);

    expect(zoomSpy).toHaveBeenCalled();
    const zoomArg = zoomSpy.mock.calls[0][0];
    // Distance increased by 50px -> delta > 0 -> zoom in
    expect(zoomArg).toBeGreaterThan(0);
    expect(changedSpy).toHaveBeenCalled();

    controls.destroy();
  });

  it('zooms out when pinching two fingers together (distance decreases)', () => {
    const zoomSpy = vi.spyOn(camera, 'zoom');

    // Pointer 1 down at (100, 100)
    const p1Down = new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    (p1Down as any).timeStampOverride = 1000;
    canvas.dispatchEvent(p1Down);

    // Pointer 2 down at (250, 100) -> initial distance = 150px
    const p2Down = new PointerEvent('pointerdown', { pointerId: 2, clientX: 250, clientY: 100 });
    (p2Down as any).timeStampOverride = 1000;
    canvas.dispatchEvent(p2Down);

    // Pinch fingers together: pointer 2 moves inward to (180, 100) -> distance = 80px (< 150px)
    const p2Pinch = new PointerEvent('pointermove', { pointerId: 2, clientX: 180, clientY: 100 });
    (p2Pinch as any).timeStampOverride = 1050;
    canvas.dispatchEvent(p2Pinch);

    expect(zoomSpy).toHaveBeenCalled();
    const zoomArg = zoomSpy.mock.calls[0][0];
    // Distance decreased -> delta < 0 -> zoom out
    expect(zoomArg).toBeLessThan(0);
    expect(changedSpy).toHaveBeenCalled();

    controls.destroy();
  });

  it('pans camera when dragging both fingers across the screen', () => {
    const panSpy = vi.spyOn(camera, 'pan');

    // Two fingers down at (100, 100) and (200, 100), midpoint = (150, 100)
    const p1Down = new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    (p1Down as any).timeStampOverride = 1000;
    canvas.dispatchEvent(p1Down);

    const p2Down = new PointerEvent('pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
    (p2Down as any).timeStampOverride = 1000;
    canvas.dispatchEvent(p2Down);

    // Drag both fingers rightward by 30px: (130, 100) and (230, 100)
    const p1Move = new PointerEvent('pointermove', { pointerId: 1, clientX: 130, clientY: 100 });
    (p1Move as any).timeStampOverride = 1050;
    canvas.dispatchEvent(p1Move);

    const p2Move = new PointerEvent('pointermove', { pointerId: 2, clientX: 230, clientY: 100 });
    (p2Move as any).timeStampOverride = 1060;
    canvas.dispatchEvent(p2Move);

    expect(panSpy).toHaveBeenCalled();
    controls.destroy();
  });

  it('pans camera with single finger when panMode is enabled', () => {
    const panSpy = vi.spyOn(camera, 'pan');
    const rotateSpy = vi.spyOn(camera, 'rotate');

    controls.setPanMode(true);
    expect(controls.getPanMode()).toBe(true);

    const downEvent = new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
    (downEvent as any).timeStampOverride = 1000;
    canvas.dispatchEvent(downEvent);

    const moveEvent = new PointerEvent('pointermove', { pointerId: 1, clientX: 140, clientY: 120 });
    (moveEvent as any).timeStampOverride = 1020;
    canvas.dispatchEvent(moveEvent);

    expect(panSpy).toHaveBeenCalled();
    expect(rotateSpy).not.toHaveBeenCalled();

    controls.destroy();
  });

  it('toggles panMode via WorldViewer', () => {
    const fakeProtocol: any = { connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn() };
    const world = new WorldViewer(fakeProtocol);
    const panListener = vi.fn();
    world.on('pan_mode_changed', panListener);

    (world as any).cameraControls = controls;
    expect(world.getPanMode()).toBe(false);

    world.setPanMode(true);
    expect(world.getPanMode()).toBe(true);
    expect(panListener).toHaveBeenCalledWith(true);

    world.togglePanMode();
    expect(world.getPanMode()).toBe(false);
    expect(panListener).toHaveBeenCalledWith(false);

    controls.destroy();
  });

  it('prevents default touchmove to eliminate browser pinch-zoom interference', () => {
    const touchMoveEvent = new Event('touchmove', { bubbles: true, cancelable: true });
    const preventSpy = vi.spyOn(touchMoveEvent, 'preventDefault');

    canvas.dispatchEvent(touchMoveEvent);
    expect(preventSpy).toHaveBeenCalled();

    controls.destroy();
  });
});
