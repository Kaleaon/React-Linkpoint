import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ObjectManagerExtended } from '../phase2/objects-extended';

describe('ObjectManagerExtended building controls', () => {
  let mockBridge: any;
  let manager: ObjectManagerExtended;

  beforeEach(() => {
    mockBridge = {
      addObject: vi.fn(async (params: any) => ({
        created: true,
        shape: params.shape || 'box',
        position: params.position || [128, 128, 25],
      })),
      linkObjects: vi.fn(async (params: any) => ({
        linked: true,
        rootLocalId: 300,
        childLocalIds: [100, 200],
        objectLocalIds: [100, 200, 300],
      })),
      delinkObjects: vi.fn(async (params: any) => ({
        delinked: true,
        objectLocalIds: params.objectLocalIds || [100],
      })),
      updatePrimParams: vi.fn(async (params: any) => ({
        updated: true,
        objectLocalIds: [params.objectLocalId || 100],
        shapeParams: params,
      })),
      deleteObject: vi.fn(async (params: any) => ({
        deleted: true,
        objectLocalIds: params.objectLocalIds || [100],
      })),
    };

    manager = new ObjectManagerExtended(mockBridge);
  });

  describe('addObject', () => {
    it('calls bridge.addObject and emits object_added event', async () => {
      const addedSpy = vi.fn();
      manager.on('object_added', addedSpy);

      const res = await manager.addObject({ shape: 'sphere', position: [10, 20, 30] });

      expect(mockBridge.addObject).toHaveBeenCalledWith({
        shape: 'sphere',
        position: [10, 20, 30],
      });
      expect(res.created).toBe(true);
      expect(addedSpy).toHaveBeenCalledTimes(1);
      expect(addedSpy.mock.calls[0][0].result.shape).toBe('sphere');
    });
  });

  describe('linkObjects', () => {
    it('calls bridge.linkObjects, links children to root, and emits objects_linked and link events', async () => {
      const linkedSpy = vi.fn();
      const linkSpy = vi.fn();
      manager.on('objects_linked', linkedSpy);
      manager.on('link', linkSpy);

      const res = await manager.linkObjects({ objectLocalIds: [100, 200, 300] });

      expect(mockBridge.linkObjects).toHaveBeenCalled();
      expect(res.linked).toBe(true);
      expect(linkedSpy).toHaveBeenCalledTimes(1);
      expect(linkSpy).toHaveBeenCalledTimes(1);

      // Check parent-child hierarchy in manager
      const children = manager.getChildren('300');
      expect(children.has('100')).toBe(true);
      expect(children.has('200')).toBe(true);
    });
  });

  describe('delinkObjects', () => {
    it('unlinks children from parent and emits objects_delinked event', async () => {
      manager.linkChild('300', '100');
      expect(manager.getChildren('300').has('100')).toBe(true);

      const delinkedSpy = vi.fn();
      manager.on('objects_delinked', delinkedSpy);

      const res = await manager.delinkObjects({ objectLocalIds: [100] });

      expect(res.delinked).toBe(true);
      expect(delinkedSpy).toHaveBeenCalledTimes(1);
      expect(manager.getChildren('300').has('100')).toBe(false);
    });
  });

  describe('updatePrimParams', () => {
    it('updates prim parameters and emits prim_params_updated', async () => {
      const updatedSpy = vi.fn();
      manager.on('prim_params_updated', updatedSpy);

      const res = await manager.updatePrimParams({
        objectLocalId: 100,
        shape: 'cylinder',
        scale: [1, 2, 3],
      });

      expect(res.updated).toBe(true);
      expect(updatedSpy).toHaveBeenCalledTimes(1);
      const params = manager.getPrimParams('100');
      expect(params?.shape).toBe('cylinder');
      expect(params?.scale).toEqual([1, 2, 3]);
    });
  });

  describe('deleteObject', () => {
    it('removes object from selection, maps, and emits object_deleted', async () => {
      manager.selectObject('100', true);
      expect(manager.getSelectedObjects().has('100')).toBe(true);

      const deletedSpy = vi.fn();
      manager.on('object_deleted', deletedSpy);

      const res = await manager.deleteObject({ objectLocalIds: [100] });

      expect(res.deleted).toBe(true);
      expect(deletedSpy).toHaveBeenCalledTimes(1);
      expect(manager.getSelectedObjects().has('100')).toBe(false);
    });
  });
});
