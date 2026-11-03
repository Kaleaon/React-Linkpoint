import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ObjectEditPipeline,
  MAX_UNDO_STEPS,
  type ObjectTransform,
  type QueuedLinkOperation,
} from '../object-edit-pipeline';

describe('ObjectEditPipeline', () => {
  let pipeline: ObjectEditPipeline;
  let mockWorld: any;
  let mockBridge: any;
  let mockManager: any;

  beforeEach(() => {
    mockWorld = {
      objects: new Map([
        [
          'obj-1',
          {
            id: 'obj-1',
            localId: 101,
            position: [10, 20, 30],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            primParams: { shape: 'box', color: [1, 0, 0] },
          },
        ],
        [
          'obj-2',
          {
            id: 'obj-2',
            localId: 102,
            position: [15, 25, 35],
            rotation: [0, 0, 0, 1],
            scale: [2, 2, 2],
          },
        ],
      ]),
      restoreObjectTransform: vi.fn(),
      scene: {
        setGizmoTarget: vi.fn(),
        applyGizmoTransform: vi.fn(),
      },
    };

    mockBridge = {
      commitObjectTransaction: vi.fn().mockResolvedValue({ success: true, count: 1 }),
    };

    mockManager = {
      commitBatchUpdate: vi.fn().mockReturnValue({
        multipleObjectUpdateMessages: [{}],
        objectLinkMessages: [],
        objectDelinkMessages: [],
      }),
      resolveLocalId: vi.fn((id: string) => (id === 'obj-1' ? 101 : 102)),
    };

    pipeline = new ObjectEditPipeline({
      world: mockWorld,
      bridge: mockBridge,
      objectsManager: mockManager,
    });
  });

  describe('Session Lifecycle and Snapshots', () => {
    it('initializes with inactive session and clean state', () => {
      expect(pipeline.isDirty).toBe(false);
      expect(pipeline.hasActiveSession()).toBe(false);
      expect(pipeline.canUndo()).toBe(false);
      expect(pipeline.canRedo()).toBe(false);
    });

    it('starts session and creates baseline snapshot from world object', () => {
      pipeline.startSession('obj-1');
      expect(pipeline.hasActiveSession()).toBe(true);
      expect(pipeline.activeObjectId).toBe('obj-1');
      expect(pipeline.isDirty).toBe(false);

      const snapshot = pipeline.getSnapshot('obj-1');
      expect(snapshot).toBeDefined();
      expect(snapshot?.position).toEqual([10, 20, 30]);
      expect(snapshot?.rotation).toEqual([0, 0, 0, 1]);
      expect(snapshot?.scale).toEqual([1, 1, 1]);
      expect(snapshot?.localId).toBe(101);
    });

    it('starts session with provided initial data fallback', () => {
      pipeline.startSession('unknown-obj', {
        id: 'unknown-obj',
        localId: 999,
        position: [1, 2, 3],
        rotation: [0, 0, 0, 1],
        scale: [0.5, 0.5, 0.5],
      });
      expect(pipeline.hasActiveSession()).toBe(true);
      const snapshot = pipeline.getSnapshot('unknown-obj');
      expect(snapshot?.position).toEqual([1, 2, 3]);
      expect(snapshot?.localId).toBe(999);
    });
  });

  describe('Modifications and Dirty State Tracking', () => {
    it('marks pipeline dirty when object transform is modified', () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', {
        position: [11, 22, 33],
      });

      expect(pipeline.isDirty).toBe(true);
      const current = pipeline.getSnapshot('obj-1');
      expect(current?.position).toEqual([11, 22, 33]);
      expect(current?.scale).toEqual([1, 1, 1]); // Unmodified attributes preserved
    });

    it('applies transform directly to local scene object', () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', {
        position: [50, 60, 70],
        scale: [3, 3, 3],
      });

      const sceneObj = mockWorld.objects.get('obj-1');
      expect(sceneObj.position).toEqual([50, 60, 70]);
      expect(sceneObj.scale).toEqual([3, 3, 3]);
      expect(mockWorld.scene.applyGizmoTransform).toHaveBeenCalledWith(
        'obj-1',
        expect.objectContaining({
          position: [50, 60, 70],
          scale: [3, 3, 3],
        }),
      );
    });

    it('emits dirty and change events on modification', () => {
      const dirtyListener = vi.fn();
      const changeListener = vi.fn();
      pipeline.on('dirty', dirtyListener);
      pipeline.on('change', changeListener);

      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', { position: [100, 200, 300] });

      expect(dirtyListener).toHaveBeenCalledWith({ isDirty: true, activeObjectId: 'obj-1' });
      expect(changeListener).toHaveBeenCalled();
    });
  });

  describe('Undo / Redo Functionality', () => {
    it('undoes single step and restores previous transform state', () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', { position: [20, 30, 40] });
      expect(pipeline.canUndo()).toBe(true);
      expect(pipeline.canRedo()).toBe(false);

      pipeline.undo();
      expect(pipeline.canUndo()).toBe(false);
      expect(pipeline.canRedo()).toBe(true);

      const current = pipeline.getSnapshot('obj-1');
      expect(current?.position).toEqual([10, 20, 30]); // Restored to initial
      expect(pipeline.isDirty).toBe(false); // Clean again since it matches original snapshot
    });

    it('redoes previously undone step', () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', { position: [20, 30, 40] });
      pipeline.undo();
      expect(pipeline.getSnapshot('obj-1')?.position).toEqual([10, 20, 30]);

      pipeline.redo();
      expect(pipeline.getSnapshot('obj-1')?.position).toEqual([20, 30, 40]);
      expect(pipeline.canUndo()).toBe(true);
      expect(pipeline.canRedo()).toBe(false);
      expect(pipeline.isDirty).toBe(true);
    });

    it('clears redo stack when new modification is applied after undo', () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', { position: [20, 30, 40] });
      pipeline.undo();
      expect(pipeline.canRedo()).toBe(true);

      pipeline.modifyObject('obj-1', { position: [99, 99, 99] });
      expect(pipeline.canRedo()).toBe(false);
    });

    it(`enforces MAX_UNDO_STEPS (${MAX_UNDO_STEPS}) cap on undo history`, () => {
      pipeline.startSession('obj-1');
      for (let i = 1; i <= 60; i++) {
        pipeline.modifyObject('obj-1', { position: [i, i, i] });
      }

      // Can only undo 50 times
      let undoCount = 0;
      while (pipeline.canUndo()) {
        pipeline.undo();
        undoCount++;
      }
      expect(undoCount).toBe(MAX_UNDO_STEPS);
    });
  });

  describe('Link and Delink Queuing', () => {
    it('queues link operations and marks pipeline dirty', () => {
      pipeline.startSession('obj-1');
      pipeline.queueLink('obj-2', 'obj-1');

      expect(pipeline.isDirty).toBe(true);
      const queued = pipeline.getQueuedLinks();
      expect(queued.length).toBe(1);
      expect(queued[0]).toMatchObject({
        type: 'link',
        childId: 'obj-2',
        parentId: 'obj-1',
        childLocalId: 102,
        parentLocalId: 101,
      });
    });

    it('queues delink operations and supports undo/redo for linkset changes', () => {
      pipeline.startSession('obj-1');
      pipeline.queueDelink('obj-2');

      expect(pipeline.isDirty).toBe(true);
      expect(pipeline.getQueuedLinks()[0].type).toBe('delink');

      pipeline.undo();
      expect(pipeline.getQueuedLinks().length).toBe(0);

      pipeline.redo();
      expect(pipeline.getQueuedLinks().length).toBe(1);
      expect(pipeline.getQueuedLinks()[0].type).toBe('delink');
    });
  });

  describe('Discard and Rollback', () => {
    it('reverts all local modifications to original snapshot without network calls', () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', {
        position: [999, 888, 777],
        scale: [10, 10, 10],
      });
      pipeline.queueLink('obj-2', 'obj-1');

      expect(pipeline.isDirty).toBe(true);

      pipeline.discard();

      expect(pipeline.isDirty).toBe(false);
      expect(pipeline.canUndo()).toBe(false);
      expect(pipeline.getQueuedLinks().length).toBe(0);

      // Verify world object transform was restored
      expect(mockWorld.restoreObjectTransform).toHaveBeenCalledWith(
        'obj-1',
        expect.objectContaining({
          position: [10, 20, 30],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
          primParams: { shape: 'box', color: [1, 0, 0] },
        }),
      );

      // Confirm no bridge RPC was sent
      expect(mockBridge.commitObjectTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Disconnect and Region Change Safety Guardrails', () => {
    it('automatically cancels session and rolls back on disconnect event', () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', { position: [500, 500, 500] });

      pipeline.cancelSession('disconnect');

      expect(pipeline.hasActiveSession()).toBe(false);
      expect(pipeline.isDirty).toBe(false);
      expect(mockWorld.restoreObjectTransform).toHaveBeenCalled();
      expect(mockBridge.commitObjectTransaction).not.toHaveBeenCalled();
    });

    it('automatically cancels session and rolls back on region_change event', () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', { position: [777, 888, 999] });

      pipeline.cancelSession('region_change');

      expect(pipeline.hasActiveSession()).toBe(false);
      expect(pipeline.isDirty).toBe(false);
      expect(mockWorld.restoreObjectTransform).toHaveBeenCalled();
      expect(mockBridge.commitObjectTransaction).not.toHaveBeenCalled();
    });
  });

  describe('Commit and Transaction Dispatch', () => {
    it('serializes batched updates and commits via bridge RPC', async () => {
      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', {
        position: [15, 25, 35],
        scale: [2, 2, 2],
      });
      pipeline.queueLink('obj-2', 'obj-1');

      const result = await pipeline.commit();

      expect(result.committed).toBe(true);
      expect(mockBridge.commitObjectTransaction).toHaveBeenCalled();
      const callArgs = mockBridge.commitObjectTransaction.mock.calls[0][0];
      expect(callArgs.updates).toBeDefined();
      expect(callArgs.links).toBeDefined();
      expect(callArgs.updates.length).toBe(1);
      expect(callArgs.updates[0].objectId).toBe('obj-1');
      expect(callArgs.updates[0].position).toEqual([15, 25, 35]);

      expect(pipeline.isDirty).toBe(false);
      expect(pipeline.canUndo()).toBe(false);
    });

    it('handles bridge commit failure gracefully and keeps dirty state', async () => {
      mockBridge.commitObjectTransaction.mockRejectedValue(new Error('Network RPC timeout'));

      pipeline.startSession('obj-1');
      pipeline.modifyObject('obj-1', { position: [20, 20, 20] });

      const result = await pipeline.commit();

      expect(result.committed).toBe(false);
      expect(result.error).toContain('Network RPC timeout');
      expect(pipeline.isDirty).toBe(true); // Retains dirty state so user can retry
    });
  });
});
