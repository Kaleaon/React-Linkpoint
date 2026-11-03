import { describe, expect, it, vi, beforeEach } from 'vitest';
import actions from '../../../core/sl-actions.cjs';

describe('sl-actions building controls', () => {
  let mockBot: any;
  let sentMessages: any[];

  beforeEach(() => {
    sentMessages = [];
    mockBot = {
      agent: {
        agentID: '11111111-1111-1111-1111-111111111111',
        activeGroupID: '22222222-2222-2222-2222-222222222222',
      },
      currentRegion: {
        circuit: {
          sendMessage: vi.fn((msg: any) => {
            sentMessages.push(msg);
          }),
        },
        parcels: {
          '0,0': {
            canIRez: vi.fn(() => true),
            TotalPrims: 10,
            MaxPrims: 100,
          },
        },
      },
      clientCommands: {
        region: {},
      },
    };
  });

  describe('addObject', () => {
    it('successfully sends ObjectAddMessage when parcel allows rez and limits not exceeded', async () => {
      const res = await actions.addObject(mockBot, {
        shape: 'box',
        position: [128, 128, 30],
        scale: [1, 1, 1],
      });

      expect(res.created).toBe(true);
      expect(res.shape).toBe('box');
      expect(sentMessages.length).toBe(1);
      const msg = sentMessages[0];
      expect(msg.constructor.name).toBe('ObjectAddMessage');
      expect(msg.ObjectData.RayEnd.x).toBe(128);
      expect(msg.ObjectData.Scale.x).toBe(1);
    });

    it('rejects rez when parcel canIRez returns false', async () => {
      mockBot.currentRegion.parcels['0,0'].canIRez = vi.fn(() => false);

      await expect(
        actions.addObject(mockBot, {
          shape: 'box',
          position: [10, 10, 20],
          parcel: mockBot.currentRegion.parcels['0,0'],
        }),
      ).rejects.toThrow(/Rezzing is not permitted/);
      expect(sentMessages.length).toBe(0);
    });

    it('rejects rez when parcel prim limit is exceeded', async () => {
      mockBot.currentRegion.parcels['0,0'].TotalPrims = 150;
      mockBot.currentRegion.parcels['0,0'].MaxPrims = 100;

      await expect(
        actions.addObject(mockBot, {
          shape: 'sphere',
          position: [10, 10, 20],
          parcel: mockBot.currentRegion.parcels['0,0'],
        }),
      ).rejects.toThrow(/Parcel prim limit reached/);
      expect(sentMessages.length).toBe(0);
    });

    it('handles all supported shapes (cylinder, prism, sphere, torus, tube, ring)', async () => {
      const shapes = ['cylinder', 'prism', 'sphere', 'torus', 'tube', 'ring'] as const;
      for (const shape of shapes) {
        sentMessages = [];
        const res = await actions.addObject(mockBot, { shape, position: [100, 100, 25] });
        expect(res.created).toBe(true);
        expect(sentMessages.length).toBe(1);
      }
    });

    it('rejects invalid position coordinate', async () => {
      await expect(
        actions.addObject(mockBot, {
          shape: 'box',
          position: [NaN, 100, 25],
        }),
      ).rejects.toThrow(/must be a number/);
    });
  });

  describe('linkObjects', () => {
    it('enforces selection safety (minimum 2 objects)', async () => {
      await expect(actions.linkObjects(mockBot, { objectLocalIds: [100] })).rejects.toThrow(
        /Linking requires at least two selected objects/,
      );
      expect(sentMessages.length).toBe(0);
    });

    it('dispatches ObjectLinkMessage with last object as root parent', async () => {
      const res = await actions.linkObjects(mockBot, { objectLocalIds: [101, 102, 103] });
      expect(res.linked).toBe(true);
      expect(res.objectLocalIds.length).toBe(3);
      expect(res.rootLocalId).toBe(103);
      expect(res.childLocalIds).toEqual([101, 102]);
      expect(sentMessages.length).toBe(1);

      const msg = sentMessages[0];
      expect(msg.constructor.name).toBe('ObjectLinkMessage');
      expect(msg.ObjectData.length).toBe(3);
      expect(msg.ObjectData[0].ObjectLocalID).toBe(101);
      expect(msg.ObjectData[2].ObjectLocalID).toBe(103);
    });
  });

  describe('delinkObjects', () => {
    it('dispatches ObjectDelinkMessage for given objectLocalIds', async () => {
      const res = await actions.delinkObjects(mockBot, { objectLocalIds: [101, 102] });
      expect(res.delinked).toBe(true);
      expect(res.objectLocalIds.length).toBe(2);
      expect(sentMessages.length).toBe(1);

      const msg = sentMessages[0];
      expect(msg.constructor.name).toBe('ObjectDelinkMessage');
      expect(msg.ObjectData.length).toBe(2);
      expect(msg.ObjectData[0].ObjectLocalID).toBe(101);
      expect(msg.ObjectData[1].ObjectLocalID).toBe(102);
    });

    it('rejects empty object list', async () => {
      await expect(actions.delinkObjects(mockBot, { objectLocalIds: [] })).rejects.toThrow(
        /Delinking requires at least one object local ID/,
      );
    });
  });

  describe('updatePrimParams', () => {
    it('dispatches ObjectShapeMessage with modified shape params', async () => {
      const res = await actions.updatePrimParams(mockBot, {
        objectLocalId: 555,
        pathBegin: 5000,
        profileHollow: 2500,
      });

      expect(res.updated).toBe(true);
      expect(res.objectLocalIds).toEqual([555]);
      expect(sentMessages.length).toBe(1);

      const msg = sentMessages[0];
      expect(msg.constructor.name).toBe('ObjectShapeMessage');
      expect(msg.ObjectData[0].ObjectLocalID).toBe(555);
      expect(msg.ObjectData[0].PathBegin).toBe(5000);
      expect(msg.ObjectData[0].ProfileHollow).toBe(2500);
    });

    it('rejects missing objectLocalId', async () => {
      await expect(actions.updatePrimParams(mockBot, {})).rejects.toThrow(
        /Target object local ID is required/,
      );
    });
  });

  describe('deleteObject / derezObject', () => {
    it('dispatches DeRezObjectMessage to take/delete object', async () => {
      const res = await actions.deleteObject(mockBot, {
        objectLocalIds: [999],
      });

      expect(res.deleted).toBe(true);
      expect(res.objectLocalIds).toEqual([999]);
      expect(sentMessages.length).toBe(1);

      const msg = sentMessages[0];
      expect(msg.constructor.name).toBe('DeRezObjectMessage');
      expect(msg.AgentBlock.GroupID.toString()).toBe('22222222-2222-2222-2222-222222222222');
      expect(msg.ObjectData[0].ObjectLocalID).toBe(999);
    });
  });
});
