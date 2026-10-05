import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorldViewer } from '../world';
import { CameraControls } from '../camera-controls';
import { Camera3D } from '../camera-3d';

describe('Camera control mode selector and drag velocity filtering', () => {
  let world: WorldViewer;
  let fakeProtocol: any;

  beforeEach(() => {
    fakeProtocol = {
      connected: true,
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    };
    world = new WorldViewer(fakeProtocol);
  });

  describe('Requirement 1 & Default Viewport State', () => {
    it('defaults to Navigate mode on startup', () => {
      expect(world.getInteractionMode()).toBe('navigate');
      expect(world.interactionMode).toBe('navigate');
    });

    it('toggles and sets interaction mode accurately and emits interaction_mode_changed', () => {
      const modeListener = vi.fn();
      world.on('interaction_mode_changed', modeListener);

      world.setInteractionMode('interact');
      expect(world.getInteractionMode()).toBe('interact');
      expect(modeListener).toHaveBeenCalledWith('interact');

      world.toggleInteractionMode();
      expect(world.getInteractionMode()).toBe('navigate');
      expect(modeListener).toHaveBeenCalledWith('navigate');
    });

    it('does not re-emit if mode is set to the current value', () => {
      const modeListener = vi.fn();
      world.on('interaction_mode_changed', modeListener);

      world.setInteractionMode('navigate');
      expect(modeListener).not.toHaveBeenCalled();
    });
  });

  describe('Requirement 2: Disabling object selection raycasts in Navigate mode', () => {
    it('returns null and emits zero selection events in Navigate mode during picking', () => {
      const selectionListener = vi.fn();
      world.on('selection_changed', selectionListener);

      // Mock canvas and scene3d on world
      world.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as any;
      world.scene3d = {
        pick: vi.fn().mockReturnValue({ id: 'obj-123', point: [1, 2, 3], distance: 5 })
      } as any;

      // In Navigate mode
      world.setInteractionMode('navigate');
      const selection = world.pickObject(100, 100);

      expect(selection).toBeNull();
      expect(world.scene3d!.pick).not.toHaveBeenCalled();
      expect(selectionListener).not.toHaveBeenCalled();
    });

    it('dispatches selection raycasts accurately in Interact mode', () => {
      const selectionListener = vi.fn();
      world.on('selection_changed', selectionListener);

      world.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as any;
      const hitObject = { id: 'obj-123', name: 'Test Box' };
      (world as any).sceneObjects.set('obj-123', hitObject);
      world.scene3d = {
        pick: vi.fn().mockReturnValue({ id: 'obj-123', point: [1, 2, 3], distance: 5 })
      } as any;

      // Switch to Interact mode
      world.setInteractionMode('interact');
      const selection = world.pickObject(100, 100);

      expect(world.scene3d!.pick).toHaveBeenCalledWith(100, 100, 800, 600);
      expect(selection).not.toBeNull();
      expect(selection?.id).toBe('obj-123');
      expect(selectionListener).toHaveBeenCalledWith(expect.objectContaining({ id: 'obj-123' }));
    });
  });

  describe('Requirement 3: Drag velocity filtering in CameraControls', () => {
    it('suppresses camera movement for touch drag gestures below velocity threshold', () => {
      const canvas = document.createElement('canvas');
      const camera = new Camera3D();
      const changedSpy = vi.fn();
      const rotateSpy = vi.spyOn(camera, 'rotate');

      const controls = new CameraControls(canvas, camera, changedSpy);
      controls.setVelocityThreshold(0.2); // 0.2 px/ms threshold
      controls.setDisplacementThreshold(5); // 5 px threshold

      // Simulate pointerdown at t=1000ms at (100, 100)
      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100
      });
      (downEvent as any).timeStampOverride = 1000;
      canvas.dispatchEvent(downEvent);

      // Simulate slow pointermove at t=1100ms (dt=100ms) to (101, 101)
      // dx=1, dy=1 -> stepDistance ~ 1.41px -> velocity ~ 0.014 px/ms (< 0.2 threshold)
      // totalDisplacement ~ 1.41px (< 5 px threshold)
      const slowMoveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 101,
        clientY: 101
      });
      (slowMoveEvent as any).timeStampOverride = 1100;
      canvas.dispatchEvent(slowMoveEvent);

      expect(rotateSpy).not.toHaveBeenCalled();
      expect(changedSpy).not.toHaveBeenCalled();

      controls.destroy();
    });

    it('triggers camera movement when drag velocity exceeds threshold', () => {
      const canvas = document.createElement('canvas');
      const camera = new Camera3D();
      const changedSpy = vi.fn();
      const rotateSpy = vi.spyOn(camera, 'rotate');

      const controls = new CameraControls(canvas, camera, changedSpy);
      controls.setVelocityThreshold(0.05); // 0.05 px/ms threshold
      controls.setDisplacementThreshold(3);

      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100
      });
      (downEvent as any).timeStampOverride = 1000;
      canvas.dispatchEvent(downEvent);

      // Fast movement at t=1010ms (dt=10ms) to (150, 150)
      // dx=50, dy=50 -> stepDistance ~ 70.7px -> velocity ~ 7.07 px/ms (> 0.05)
      const fastMoveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 150,
        clientY: 150
      });
      (fastMoveEvent as any).timeStampOverride = 1010;
      canvas.dispatchEvent(fastMoveEvent);

      expect(rotateSpy).toHaveBeenCalled();
      expect(changedSpy).toHaveBeenCalled();

      controls.destroy();
    });
  });

  describe('WorldViewer threshold forwarding', () => {
    it('gets and sets drag velocity and displacement thresholds correctly', () => {
      world.setDragVelocityThreshold(0.15);
      world.setDragDisplacementThreshold(8);

      expect(world.getDragVelocityThreshold()).toBe(0.15);
      expect(world.getDragDisplacementThreshold()).toBe(8);
    });
  });
});
