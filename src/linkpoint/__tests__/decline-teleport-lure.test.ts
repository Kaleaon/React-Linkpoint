import { describe, it, expect, vi } from 'vitest';
import {
  serializeDeclineTeleportPacket,
  serializeDeclineTeleport,
  FriendsExtended,
} from '../phase2/friends-extended';
import { InteractionsManager } from '../interactions';
import { MessageIDs } from '../sl-message-types';

const { serializeLure, declineLure } = require('../../../core/sl-interactions.cjs');

describe('Teleport Lure Decline Packet Specification', () => {
  const TEST_AGENT_ID = '11111111-2222-3333-4444-555555555555';
  const TEST_SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  describe('DeclineTeleport Packet Serializer', () => {
    it('serializes a valid DeclineTeleport packet with agentId and sessionId payload', () => {
      const packet = serializeDeclineTeleportPacket(TEST_AGENT_ID, TEST_SESSION_ID);

      expect(packet.messageName).toBe('DeclineTeleport');
      expect(packet.messageId).toBe(MessageIDs.DECLINE_TELEPORT);
      expect(packet.agentId).toBe(TEST_AGENT_ID);
      expect(packet.sessionId).toBe(TEST_SESSION_ID);
      expect(packet.payload).toBeInstanceOf(Uint8Array);
      expect(packet.payload.length).toBe(32);

      // Verify agent ID in first 16 bytes
      const hexAgent = Array.from(packet.payload.subarray(0, 16), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      expect(hexAgent).toBe(TEST_AGENT_ID.replace(/-/g, ''));

      // Verify session ID in next 16 bytes
      const hexSession = Array.from(packet.payload.subarray(16, 32), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      expect(hexSession).toBe(TEST_SESSION_ID.replace(/-/g, ''));
    });

    it('provides alias serializeDeclineTeleport function matching serializer', () => {
      const p1 = serializeDeclineTeleportPacket(TEST_AGENT_ID, TEST_SESSION_ID);
      const p2 = serializeDeclineTeleport(TEST_AGENT_ID, TEST_SESSION_ID);
      expect(p1).toEqual(p2);
    });

    it('throws error when agentId or sessionId is missing', () => {
      expect(() => serializeDeclineTeleportPacket('', TEST_SESSION_ID)).toThrow(
        /Valid agent ID required/,
      );
      expect(() => serializeDeclineTeleportPacket(TEST_AGENT_ID, '')).toThrow(
        /Valid session ID required/,
      );
    });
  });

  describe('FriendsExtended Teleport Lure Decline Dispatch', () => {
    it('dispatches DeclineTeleport packet via protocol and emits teleport_lure_declined', async () => {
      const mockProtocol = {
        sendDeclineTeleport: vi.fn().mockResolvedValue(true),
      };
      const friends = new FriendsExtended(mockProtocol);
      const listener = vi.fn();
      friends.on('teleport_lure_declined', listener);

      const packet = await friends.declineTeleportLure(TEST_AGENT_ID, TEST_SESSION_ID);

      expect(mockProtocol.sendDeclineTeleport).toHaveBeenCalledWith(
        TEST_AGENT_ID,
        TEST_SESSION_ID,
        packet,
      );
      expect(listener).toHaveBeenCalledWith({
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
        packet,
      });
    });
  });

  describe('InteractionsManager Lure Dismissal & Decline Handling', () => {
    it('updates invitation state to declined locally and dispatches DeclineTeleport packet when declineLure is called', async () => {
      const mockProtocol = {
        on: vi.fn(),
        declineLure: vi.fn().mockResolvedValue({ declined: true }),
        dismissInteraction: vi.fn().mockResolvedValue(true),
      };
      const manager = new InteractionsManager(mockProtocol as any);
      manager.init();

      // Add a pending lure request
      (manager as any).add('lure', {
        id: 'lure-test-1',
        fromId: TEST_AGENT_ID,
        fromName: 'Test Inviter',
        message: 'Come teleport to my region!',
        sessionId: TEST_SESSION_ID,
      });

      const lureBefore = manager.items.find((item) => item.id === 'lure-test-1');
      expect(lureBefore?.kind).toBe('lure');
      expect((lureBefore as any).status).toBe('pending');

      const listener = vi.fn();
      manager.on('lure_declined', listener);

      const success = await manager.declineLure('lure-test-1');
      expect(success).toBe(true);

      expect(mockProtocol.declineLure).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lure-test-1',
          agentId: TEST_AGENT_ID,
          sessionId: TEST_SESSION_ID,
          packet: expect.objectContaining({
            messageName: 'DeclineTeleport',
            agentId: TEST_AGENT_ID,
            sessionId: TEST_SESSION_ID,
          }),
        }),
      );

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          lure: expect.objectContaining({ id: 'lure-test-1', status: 'declined' }),
          packet: expect.objectContaining({ messageName: 'DeclineTeleport' }),
        }),
      );
    });

    it('triggers DeclineTeleport packet dispatch when dismissing a lure popup via dismiss()', async () => {
      const mockProtocol = {
        on: vi.fn(),
        declineLure: vi.fn().mockResolvedValue({ declined: true }),
        dismissInteraction: vi.fn().mockResolvedValue(true),
      };
      const manager = new InteractionsManager(mockProtocol as any);
      manager.init();

      (manager as any).add('lure', {
        id: 'lure-test-2',
        fromId: TEST_AGENT_ID,
        fromName: 'Dismiss Test',
        message: 'Teleport lure',
        sessionId: TEST_SESSION_ID,
      });

      await manager.dismiss('lure-test-2');

      expect(mockProtocol.declineLure).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lure-test-2',
          agentId: TEST_AGENT_ID,
          sessionId: TEST_SESSION_ID,
          packet: expect.objectContaining({
            messageName: 'DeclineTeleport',
          }),
        }),
      );
    });

    it('prevents duplicate packet dispatches on duplicate clicks', async () => {
      const mockProtocol = {
        on: vi.fn(),
        declineLure: vi.fn().mockResolvedValue({ declined: true }),
      };
      const manager = new InteractionsManager(mockProtocol as any);
      manager.init();

      (manager as any).add('lure', {
        id: 'lure-test-3',
        fromId: TEST_AGENT_ID,
        fromName: 'Duplicate Click Test',
        message: 'Teleport lure',
        sessionId: TEST_SESSION_ID,
      });

      // First call
      const p1 = manager.declineLure('lure-test-3');
      // Immediate second call on same lure
      const p2 = manager.declineLure('lure-test-3');

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1).toBe(true);
      expect(res2).toBe(false);
      expect(mockProtocol.declineLure).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch DeclineTeleport for expired or non-pending lure IDs', async () => {
      const mockProtocol = {
        on: vi.fn(),
        declineLure: vi.fn().mockResolvedValue({ declined: true }),
      };
      const manager = new InteractionsManager(mockProtocol as any);
      manager.init();

      const result = await manager.declineLure('non-existent-lure-id');
      expect(result).toBe(false);
      expect(mockProtocol.declineLure).not.toHaveBeenCalled();
    });
  });

  describe('Core SL Interactions Lure Decline Processing', () => {
    it('serializeLure captures sessionId and agentId from LureEvent', () => {
      const lureEvent = {
        from: TEST_AGENT_ID,
        fromName: 'Inviting Resident',
        lureMessage: 'Teleport offer message',
        sessionID: TEST_SESSION_ID,
        regionID: '99999999-9999-9999-9999-999999999999',
      };

      const serialized = serializeLure(lureEvent);
      expect(serialized.fromId).toBe(TEST_AGENT_ID);
      expect(serialized.sessionId).toBe(TEST_SESSION_ID);
    });

    it('core declineLure constructs DeclineTeleport packet, sends IM decline notification and marks status as declined', async () => {
      const sendIM = vi.fn().mockResolvedValue(undefined);
      const sendPacket = vi.fn();
      const mockBot = {
        clientCommands: {
          comms: { sendInstantMessage: sendIM },
        },
        sendPacket: sendPacket,
      };

      const items = new Map();
      items.set('lure-1', {
        kind: 'lure',
        event: {
          from: TEST_AGENT_ID,
          fromName: 'Inviter Resident',
          sessionID: TEST_SESSION_ID,
        },
      });

      const mockPending = {
        get: (kind: string, id: string) => {
          const item = items.get(id);
          if (!item || item.kind !== kind) throw new Error('Not pending');
          return item.event;
        },
        remove: (id: string) => items.delete(id),
      };

      const result = await declineLure(mockBot, mockPending, { id: 'lure-1' });

      expect(result).toEqual({ declined: true });
      expect(sendIM).toHaveBeenCalledWith(TEST_AGENT_ID, 'Teleport offer declined');
      expect(sendPacket).toHaveBeenCalledWith(
        'DeclineTeleport',
        expect.objectContaining({
          messageName: 'DeclineTeleport',
          agentId: TEST_AGENT_ID,
          sessionId: TEST_SESSION_ID,
        }),
      );
      expect(items.has('lure-1')).toBe(false);
    });
  });
});
