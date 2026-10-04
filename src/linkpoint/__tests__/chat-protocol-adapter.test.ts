import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ChatProtocolAdapter } from '../chat-protocol-adapter';

describe('ChatProtocolAdapter', () => {
  let mockProtocol: any;

  beforeEach(() => {
    mockProtocol = {
      connected: true,
      sendChat: vi.fn().mockResolvedValue(undefined),
      sendInstantMessage: vi.fn().mockResolvedValue(undefined),
      sendGroupMessage: vi.fn().mockResolvedValue(undefined),
      sendImprovedInstantMessage: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };
  });

  describe('sendSpatialChat', () => {
    it('normalizes spatial whisper to channel 0 with ChatType 0', async () => {
      const adapter = new ChatProtocolAdapter(mockProtocol);
      await adapter.sendSpatialChat('secret whisper', 'whisper');

      expect(mockProtocol.sendChat).toHaveBeenCalledWith('secret whisper', 0, 0);
    });

    it('normalizes spatial shout to channel 0 with ChatType 2', async () => {
      const adapter = new ChatProtocolAdapter(mockProtocol);
      await adapter.sendSpatialChat('loud shout', 'shout');

      expect(mockProtocol.sendChat).toHaveBeenCalledWith('loud shout', 0, 2);
    });

    it('normalizes normal or say range to channel 0 with ChatType 1', async () => {
      const adapter = new ChatProtocolAdapter(mockProtocol);
      await adapter.sendSpatialChat('normal talk', 'normal');

      expect(mockProtocol.sendChat).toHaveBeenCalledWith('normal talk', 0, 1);
    });

    it('supports numeric channel and ChatType enum values', async () => {
      const adapter = new ChatProtocolAdapter(mockProtocol);
      await adapter.sendSpatialChat('script chat', 5, 1);

      expect(mockProtocol.sendChat).toHaveBeenCalledWith('script chat', 5, 1);
    });

    it('suppresses ChatType 4 fallback on spatial chat', async () => {
      const adapter = new ChatProtocolAdapter(mockProtocol);
      await adapter.sendSpatialChat('test', 0, 4);

      expect(mockProtocol.sendChat).toHaveBeenCalledWith('test', 0, 1);
    });

    it('rejects empty messages', async () => {
      const adapter = new ChatProtocolAdapter(mockProtocol);
      await expect(adapter.sendSpatialChat('   ', 0, 1)).rejects.toThrow('cannot be empty');
    });
  });

  describe('sendGroupChat', () => {
    it('constructs ImprovedInstantMessage Dialog 17 payloads for group messages', async () => {
      const adapter = new ChatProtocolAdapter(mockProtocol);
      const groupUuid = 'group-uuid-1234';
      const payload = await adapter.sendGroupChat(groupUuid, 'Hello Group', 'Builders Guild');

      expect(payload).toEqual(expect.objectContaining({
        dialog: 17,
        id: groupUuid,
        groupId: groupUuid,
        toAgentId: groupUuid,
        message: 'Hello Group',
        type: 'group',
      }));
      expect(mockProtocol.sendImprovedInstantMessage).toHaveBeenCalledWith(payload);
    });

    it('queues pending group messages when transport is unavailable or session negotiation is pending', async () => {
      mockProtocol.connected = false;
      const adapter = new ChatProtocolAdapter(mockProtocol);
      const groupUuid = 'pending-group-5678';

      const queuedListener = vi.fn();
      adapter.on('group_message_queued', queuedListener);

      const payload = await adapter.sendGroupChat(groupUuid, 'Pending msg', 'Group X');

      expect(payload.dialog).toBe(17);
      expect(queuedListener).toHaveBeenCalledWith(expect.objectContaining({
        groupId: groupUuid,
        message: 'Pending msg',
      }));

      const queue = adapter.getPendingGroupQueue(groupUuid);
      expect(queue).toHaveLength(1);
      expect(queue[0].message).toBe('Pending msg');
    });

    it('enforces maximum queue size per group', async () => {
      mockProtocol.connected = false;
      const adapter = new ChatProtocolAdapter(mockProtocol, { maxQueueSize: 3 });
      const groupUuid = 'full-group-queue';

      for (let i = 1; i <= 5; i++) {
        await adapter.sendGroupChat(groupUuid, `Msg ${i}`);
      }

      const queue = adapter.getPendingGroupQueue(groupUuid);
      expect(queue).toHaveLength(3);
      expect(queue[0].message).toBe('Msg 3');
      expect(queue[2].message).toBe('Msg 5');
    });
  });

  describe('sendDirectIM', () => {
    it('dispatches direct IM when transport is available', async () => {
      const adapter = new ChatProtocolAdapter(mockProtocol);
      const res = await adapter.sendDirectIM('resident-123', 'Private msg', 'Alice Resident');

      expect(res).toEqual({ sent: true, queued: false });
      expect(mockProtocol.sendInstantMessage).toHaveBeenCalledWith('resident-123', 'Private msg');
      expect(mockProtocol.sendChat).not.toHaveBeenCalled();
    });

    it('buffers offline IMs when transport is unavailable and never executes sendChat(text, 0, 4)', async () => {
      mockProtocol.connected = false;
      const adapter = new ChatProtocolAdapter(mockProtocol);

      const imQueuedListener = vi.fn();
      adapter.on('im_queued', imQueuedListener);

      const res = await adapter.sendDirectIM('offline-resident', 'Offline ping', 'Bob Resident');

      expect(res).toEqual({ sent: false, queued: true });
      expect(mockProtocol.sendChat).not.toHaveBeenCalled();
      expect(imQueuedListener).toHaveBeenCalledWith(expect.objectContaining({
        recipientId: 'offline-resident',
        message: 'Offline ping',
      }));

      const queue = adapter.getOfflineIMQueue('offline-resident');
      expect(queue).toHaveLength(1);
      expect(queue[0].message).toBe('Offline ping');
    });

    it('buffers IM when transport fails/throws without falling back to sendChat', async () => {
      mockProtocol.sendInstantMessage.mockRejectedValue(new Error('Network drop'));
      const adapter = new ChatProtocolAdapter(mockProtocol);

      const res = await adapter.sendDirectIM('resident-err', 'Failed send');

      expect(res).toEqual({ sent: false, queued: true });
      expect(mockProtocol.sendChat).not.toHaveBeenCalled();
      expect(adapter.getOfflineIMQueue('resident-err')).toHaveLength(1);
    });

    it('enforces max queue size for offline IMs per recipient', async () => {
      mockProtocol.connected = false;
      const adapter = new ChatProtocolAdapter(mockProtocol, { maxQueueSize: 2 });

      await adapter.sendDirectIM('rec-1', 'msg 1');
      await adapter.sendDirectIM('rec-1', 'msg 2');
      await adapter.sendDirectIM('rec-1', 'msg 3');

      const queue = adapter.getOfflineIMQueue('rec-1');
      expect(queue).toHaveLength(2);
      expect(queue[0].message).toBe('msg 2');
      expect(queue[1].message).toBe('msg 3');
    });
  });

  describe('Queue Flushing', () => {
    it('flushes offline IMs when transport becomes available', async () => {
      mockProtocol.connected = false;
      const adapter = new ChatProtocolAdapter(mockProtocol);

      await adapter.sendDirectIM('friend-a', 'hello 1');
      await adapter.sendDirectIM('friend-a', 'hello 2');
      expect(adapter.getOfflineIMQueue('friend-a')).toHaveLength(2);

      // Reconnect
      mockProtocol.connected = true;
      const flushedListener = vi.fn();
      adapter.on('queued_messages_flushed', flushedListener);

      const count = await adapter.flushOfflineIMs('friend-a');

      expect(count).toBe(2);
      expect(mockProtocol.sendInstantMessage).toHaveBeenCalledTimes(2);
      expect(adapter.getOfflineIMQueue('friend-a')).toHaveLength(0);
      expect(flushedListener).toHaveBeenCalledWith({ recipientId: 'friend-a', flushedCount: 2 });
    });

    it('flushes pending group chat messages when session is ready', async () => {
      mockProtocol.connected = false;
      const adapter = new ChatProtocolAdapter(mockProtocol);

      await adapter.sendGroupChat('group-100', 'Group msg 1');
      expect(adapter.getPendingGroupQueue('group-100')).toHaveLength(1);

      mockProtocol.connected = true;
      const flushed = await adapter.flushPendingGroupChat('group-100');

      expect(flushed).toBe(1);
      expect(adapter.getPendingGroupQueue('group-100')).toHaveLength(0);
    });

    it('clears queues upon clearQueues()', async () => {
      mockProtocol.connected = false;
      const adapter = new ChatProtocolAdapter(mockProtocol);

      await adapter.sendDirectIM('u1', 'msg');
      await adapter.sendGroupChat('g1', 'msg');

      adapter.clearQueues();

      expect(adapter.getOfflineIMQueue()).toHaveLength(0);
      expect(adapter.getPendingGroupQueue()).toHaveLength(0);
    });
  });
});
