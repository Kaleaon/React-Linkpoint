import { describe, it, expect, beforeEach } from 'vitest';
import {
  ObjectManagerExtended,
  MAX_UDP_PACKET_SIZE,
  type BatchUpdatePayload,
} from '../objects-extended';
import { UpdateType } from '@caspertech/node-metaverse/dist/lib/enums/UpdateType';

describe('ObjectManagerExtended - commitBatchUpdate', () => {
  let manager: ObjectManagerExtended;

  beforeEach(() => {
    manager = new ObjectManagerExtended();
  });

  describe('Basic Batch Update and MultipleObjectUpdate Encoding', () => {
    it('serializes position, rotation, and scale into MultipleObjectUpdateMessage', () => {
      const payload: BatchUpdatePayload = {
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        objects: [
          {
            id: 'prim-1',
            localId: 1001,
            position: [128.5, 64.25, 25.0],
            rotation: [0, 0, 0, 1],
            scale: [1.5, 2.0, 0.5],
            primParams: { shape: 'cylinder', material: 'metal' },
          },
        ],
      };

      const result = manager.commitBatchUpdate(payload);

      expect(result.objectsUpdated).toBe(1);
      expect(result.multipleObjectUpdateMessages.length).toBe(1);

      const msg = result.multipleObjectUpdateMessages[0];
      expect(msg.AgentData.AgentID.toString()).toBe('11111111-2222-3333-4444-555555555555');
      expect(msg.AgentData.SessionID.toString()).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

      // 3 entries: Position, Rotation, Scale
      expect(msg.ObjectData.length).toBe(3);

      const posEntry = msg.ObjectData.find((e) => (e.Type & UpdateType.Position) !== 0);
      expect(posEntry).toBeDefined();
      expect(posEntry?.ObjectLocalID).toBe(1001);
      expect(posEntry?.Data.length).toBe(12);

      const rotEntry = msg.ObjectData.find((e) => (e.Type & UpdateType.Rotation) !== 0);
      expect(rotEntry).toBeDefined();
      expect(rotEntry?.ObjectLocalID).toBe(1001);
      expect(rotEntry?.Data.length).toBe(12);

      const scaleEntry = msg.ObjectData.find((e) => (e.Type & UpdateType.Scale) !== 0);
      expect(scaleEntry).toBeDefined();
      expect(scaleEntry?.ObjectLocalID).toBe(1001);
      expect(scaleEntry?.Data.length).toBe(12);

      // Verify primParams stored in manager
      const primParams = manager.getPrimParams('prim-1');
      expect(primParams?.shape).toBe('cylinder');
      expect(primParams?.material).toBe('metal');
    });

    it('sets UpdateType.Linked flag when wholeLinkset is true', () => {
      const payload: BatchUpdatePayload = {
        wholeLinkset: true,
        objects: [
          {
            id: 'prim-root',
            localId: 501,
            position: [10, 20, 30],
          },
        ],
      };

      const result = manager.commitBatchUpdate(payload);
      expect(result.multipleObjectUpdateMessages.length).toBe(1);
      const entry = result.multipleObjectUpdateMessages[0].ObjectData[0];
      expect(entry.Type & UpdateType.Linked).toBe(UpdateType.Linked);
    });
  });

  describe('ObjectLink and ObjectDelink Serialization', () => {
    it('serializes link operations into ObjectLinkMessage', () => {
      const payload: BatchUpdatePayload = {
        agentId: '11111111-2222-3333-4444-555555555555',
        sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        links: [
          {
            parentId: 'root-prim',
            parentLocalId: 200,
            childId: 'child-prim',
            childLocalId: 201,
          },
        ],
      };

      const result = manager.commitBatchUpdate(payload);
      expect(result.linksUpdated).toBe(1);
      expect(result.objectLinkMessages.length).toBe(1);

      const linkMsg = result.objectLinkMessages[0];
      expect(linkMsg.AgentData.AgentID.toString()).toBe('11111111-2222-3333-4444-555555555555');
      const localIds = linkMsg.ObjectData.map((d) => d.ObjectLocalID);
      expect(localIds).toContain(200);
      expect(localIds).toContain(201);

      // Verify manager parent-child hierarchy updated
      const children = manager.getChildren('root-prim');
      expect(children).toContain('child-prim');
    });

    it('serializes delink operations into ObjectDelinkMessage', () => {
      // First link child
      manager.linkChild('root-prim', 'child-prim');
      expect(manager.getChildren('root-prim')).toContain('child-prim');

      const payload: BatchUpdatePayload = {
        delinks: [
          {
            childId: 'child-prim',
            localId: 201,
          },
        ],
      };

      const result = manager.commitBatchUpdate(payload);
      expect(result.linksUpdated).toBe(1);
      expect(result.objectDelinkMessages.length).toBe(1);

      const delinkMsg = result.objectDelinkMessages[0];
      expect(delinkMsg.ObjectData[0].ObjectLocalID).toBe(201);

      // Verify child unlinked in manager
      expect(manager.getChildren('root-prim')).not.toContain('child-prim');
    });
  });

  describe('UDP Limit Enforcement and Chunking (<= 1200 Bytes)', () => {
    it('chunks updates into multiple MultipleObjectUpdateMessages when exceeding UDP threshold', () => {
      // 80 prims with 3 entries each = 240 entries.
      // 72 bytes header + 240 * 18 = 4392 bytes > 1200 bytes limit.
      const objects = [];
      for (let i = 1; i <= 80; i++) {
        objects.push({
          id: `prim-${i}`,
          localId: 1000 + i,
          position: [i, i, i],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        });
      }

      const result = manager.commitBatchUpdate({ objects });

      // Must be chunked into multiple packets
      expect(result.multipleObjectUpdateMessages.length).toBeGreaterThan(1);

      // Verify every chunk fits within 1200 byte UDP limit
      for (const msg of result.multipleObjectUpdateMessages) {
        const estimatedSize = 72 + msg.ObjectData.length * 18;
        expect(estimatedSize).toBeLessThanOrEqual(MAX_UDP_PACKET_SIZE);
      }

      // Verify all entries across chunks add up to total 240 entries
      const totalEntries = result.multipleObjectUpdateMessages.reduce(
        (sum, msg) => sum + msg.ObjectData.length,
        0,
      );
      expect(totalEntries).toBe(80 * 3);
    });

    it('respects custom maxPacketSize option for chunking boundaries', () => {
      const objects = [
        { id: 'p1', localId: 1, position: [1, 1, 1] },
        { id: 'p2', localId: 2, position: [2, 2, 2] },
        { id: 'p3', localId: 3, position: [3, 3, 3] },
        { id: 'p4', localId: 4, position: [4, 4, 4] },
      ];

      // With maxPacketSize: 100 bytes (72 base + 18 per entry -> max 1 entry per message)
      const result = manager.commitBatchUpdate({ objects }, { maxPacketSize: 100 });
      expect(result.multipleObjectUpdateMessages.length).toBe(4);
      for (const msg of result.multipleObjectUpdateMessages) {
        expect(msg.ObjectData.length).toBe(1);
      }
    });

    it('chunks large batch of link operations into multiple ObjectLinkMessages', () => {
      const links = [];
      for (let i = 1; i <= 600; i++) {
        links.push({
          parentLocalId: 1000,
          childLocalId: 2000 + i,
        });
      }

      const result = manager.commitBatchUpdate({ links });
      expect(result.objectLinkMessages.length).toBeGreaterThan(1);
      for (const msg of result.objectLinkMessages) {
        const estimatedSize = 72 + msg.ObjectData.length * 4;
        expect(estimatedSize).toBeLessThanOrEqual(MAX_UDP_PACKET_SIZE);
      }
    });
  });
});
