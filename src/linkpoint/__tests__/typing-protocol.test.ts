import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentTypingMessage } from '@caspertech/node-metaverse/dist/lib/classes/messages/AgentTyping';
import { Message } from '@caspertech/node-metaverse/dist/lib/enums/Message';
import { ChatProtocolAdapter } from '../chat-protocol-adapter';
import { ChatManager } from '../chat';
import { WorldViewer } from '../world';
import { ChatType } from '../sl-message-types';

describe('Typing Protocol Parity Suite', () => {
  describe('AgentTyping UDP Packet Serialization & Deserialization', () => {
    it('registers AgentTyping message ID correctly as 4294901782 (0xffff0016)', () => {
      const msg = new AgentTypingMessage();
      expect(msg.id).toBe(Message.AgentTyping);
      expect(msg.id).toBe(4294901782);
    });

    it('serializes and deserializes AgentTyping UDP packet buffer (33 bytes)', () => {
      const msg = new AgentTypingMessage();
      const agentId = '11223344-5566-7788-9900-aabbccddeeff';
      const sessionId = 'aabbccdd-eeff-1122-3344-556677889900';

      msg.AgentData = {
        AgentID: agentId,
        SessionID: sessionId,
      };
      msg.Data = {
        Typing: true,
      };

      const buffer = Buffer.alloc(100);
      const writtenBytes = msg.writeToBuffer(buffer, 0);

      expect(writtenBytes).toBe(33);

      const readMsg = new AgentTypingMessage();
      readMsg.readFromBuffer(buffer, 0);

      expect(readMsg.AgentData.AgentID.toString().toLowerCase()).toBe(agentId.toLowerCase());
      expect(readMsg.AgentData.SessionID.toString().toLowerCase()).toBe(sessionId.toLowerCase());
      expect(readMsg.Data.Typing).toBe(true);
    });

    it('handles false typing state (TYPING_STOP)', () => {
      const msg = new AgentTypingMessage();
      msg.AgentData = {
        AgentID: '00000000-0000-0000-0000-000000000001',
        SessionID: '00000000-0000-0000-0000-000000000002',
      };
      msg.Data = {
        Typing: false,
      };

      const buffer = Buffer.alloc(33);
      msg.writeToBuffer(buffer, 0);

      const readMsg = new AgentTypingMessage();
      readMsg.readFromBuffer(buffer, 0);

      expect(readMsg.Data.Typing).toBe(false);
    });
  });

  describe('ChatProtocolAdapter Typing Dispatches', () => {
    it('dispatches spatial typing start (ChatType 4) and stop (ChatType 5)', async () => {
      const sendChatSpy = vi.fn().mockResolvedValue(undefined);
      const mockProtocol = { sendChat: sendChatSpy };
      const adapter = new ChatProtocolAdapter(mockProtocol);

      await adapter.sendTypingState(true);
      expect(sendChatSpy).toHaveBeenLastCalledWith('', 0, ChatType.START);

      await adapter.sendTypingState(false);
      expect(sendChatSpy).toHaveBeenLastCalledWith('', 0, ChatType.STOP);
    });

    it('dispatches IM typing start (41) and stop (42) signals', async () => {
      const sendIMSpy = vi.fn().mockResolvedValue(undefined);
      const mockProtocol = { sendImprovedInstantMessage: sendIMSpy };
      const adapter = new ChatProtocolAdapter(mockProtocol);
      const recipientId = '11111111-2222-3333-4444-555555555555';

      await adapter.sendIMTypingState(recipientId, true);
      expect(sendIMSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ dialog: 41, type: 'im_typing', toAgentId: recipientId }),
      );

      await adapter.sendIMTypingState(recipientId, false);
      expect(sendIMSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ dialog: 42, type: 'im_typing', toAgentId: recipientId }),
      );
    });
  });

  describe('ChatManager Typing Event Wiring & History Protection', () => {
    let mockProtocol: any;
    let mockAuth: any;
    let chatManager: ChatManager;

    beforeEach(() => {
      mockProtocol = {
        on: vi.fn(),
        off: vi.fn(),
        sendChat: vi.fn().mockResolvedValue(undefined),
        sendImprovedInstantMessage: vi.fn().mockResolvedValue(undefined),
      };
      mockAuth = {
        isLoggedIn: () => true,
        user: { id: 'self-agent-id', fullName: 'Self Resident' },
        getUserDisplayName: () => 'Self Resident',
      };
      chatManager = new ChatManager(mockProtocol, mockAuth);
      chatManager.init();
    });

    it('emits user_typing and typing_updated when typing events arrive', () => {
      const typingSpy = vi.fn();
      chatManager.on('user_typing', typingSpy);

      chatManager.handleTypingEvent({
        agentId: 'typing-agent-1',
        fromName: 'Alice Resident',
        isTyping: true,
      });

      expect(typingSpy).toHaveBeenCalledWith({
        userId: 'typing-agent-1',
        name: 'Alice Resident',
        isTyping: true,
      });

      expect(chatManager.getTypingUsers()).toContainEqual({
        userId: 'typing-agent-1',
        name: 'Alice Resident',
      });
    });

    it('does NOT save protocol typing start (4) / stop (5) packets in chat transcript history', async () => {
      await chatManager.handleIncomingMessage({
        fromId: 'typing-agent-2',
        fromName: 'Bob Resident',
        chatType: 4, // START typing
        message: '',
      });

      expect(chatManager.messages).toHaveLength(0);
      expect(chatManager.getTypingUsers()).toContainEqual({
        userId: 'typing-agent-2',
        name: 'Bob Resident',
      });
    });

    it('does NOT save IM typing start (dialog 41) / stop (dialog 42) in chat history', async () => {
      await chatManager.handleIncomingMessage({
        fromId: 'typing-agent-3',
        fromName: 'Charlie Resident',
        dialog: 41, // IM TYPING START
        message: '',
      });

      expect(chatManager.messages).toHaveLength(0);
      expect(chatManager.getTypingUsers()).toContainEqual({
        userId: 'typing-agent-3',
        name: 'Charlie Resident',
      });
    });

    it('clears typing state when a real message is received from the user', async () => {
      chatManager.handleTypingEvent({
        agentId: 'typing-agent-4',
        fromName: 'Dave Resident',
        isTyping: true,
      });
      expect(chatManager.getTypingUsers()).toHaveLength(1);

      await chatManager.handleIncomingMessage({
        fromId: 'typing-agent-4',
        fromName: 'Dave Resident',
        chatType: 1, // Normal chat
        message: 'Hello world!',
      });

      expect(chatManager.messages).toHaveLength(1);
      expect(chatManager.getTypingUsers()).toHaveLength(0);
    });

    it('does NOT notify world.setTyping for IM typing events (dialog 41/42)', async () => {
      const setTypingSpy = vi.fn();
      mockAuth.app = { world: { setTyping: setTypingSpy } };

      await chatManager.handleIncomingMessage({
        fromId: 'im-typing-agent',
        fromName: 'Remote Resident',
        dialog: 41,
        message: '',
      });

      expect(setTypingSpy).not.toHaveBeenCalled();

      // But spatial chat typing DOES notify world.setTyping
      await chatManager.handleIncomingMessage({
        fromId: 'spatial-typing-agent',
        fromName: 'Local Resident',
        chatType: 4,
        message: '',
      });

      expect(setTypingSpy).toHaveBeenCalledWith('spatial-typing-agent', true);
    });
  });

  describe('WorldViewer Overhead Typing Indicator & Timeout Handling', () => {
    let mockProtocol: any;

    beforeEach(() => {
      vi.useFakeTimers();
      mockProtocol = {
        on: vi.fn(),
        off: vi.fn(),
      };
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('updates nearby users typing state and automatically expires after 5 seconds', () => {
      const world = new WorldViewer(mockProtocol);
      world.nearbyUsers = [{ id: 'avatar-uuid-1', name: 'Eve Resident', typing: false }];

      const nearbySpy = vi.fn();
      world.on('nearby_changed', nearbySpy);

      world.setTyping('avatar-uuid-1', true);

      expect(world.nearbyUsers[0].typing).toBe(true);
      expect(nearbySpy).toHaveBeenCalled();

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);

      expect(world.nearbyUsers[0].typing).toBe(false);
    });
  });
});
