/**
 * Linkpoint PWA - Unified Chat Protocol Adapter and Session Dispatcher
 *
 * Centralizes chat packet construction and session dispatching across spatial,
 * group, and direct chat modules according to Linden Lab standards.
 */

import { Utils } from './utils';
import {
  ChatType,
  InstantMessageDialog,
  type InstantMessageDialog as InstantMessageDialogValue,
} from './sl-message-types';

export interface QueuedIM {
  recipientId: string;
  recipientName: string;
  message: string;
  timestamp: number;
}

export interface QueuedGroupMessage {
  groupId: string;
  groupName: string;
  message: string;
  payload: ImprovedInstantMessagePayload;
  timestamp: number;
}

export interface ImprovedInstantMessagePayload {
  dialog: InstantMessageDialogValue;
  id: string; // Group ID or Session ID
  groupId?: string;
  toAgentId: string;
  message: string;
  timestamp: number;
  type?: string;
}

export class ChatProtocolAdapter extends Utils.EventEmitter {
  public protocol: any;
  public maxQueueSize: number;
  public offlineIMQueue: Map<string, QueuedIM[]> = new Map();
  public pendingGroupQueue: Map<string, QueuedGroupMessage[]> = new Map();

  constructor(protocolManager?: any, options?: { maxQueueSize?: number }) {
    super();
    this.protocol = protocolManager;
    this.maxQueueSize = options?.maxQueueSize ?? 50;

    if (this.protocol) {
      this.attachProtocol(this.protocol);
    }
  }

  public setProtocol(protocolManager: any) {
    this.protocol = protocolManager;
    if (this.protocol) {
      this.attachProtocol(this.protocol);
      this.flushAll().catch((err) => {
        console.warn('[ChatProtocolAdapter] Auto-flush failed on protocol set:', err);
      });
    }
  }

  private attachProtocol(protocol: any) {
    if (typeof protocol.on === 'function') {
      protocol.on('connected', () => {
        this.flushAll().catch((err) =>
          console.warn('[ChatProtocolAdapter] Auto-flush failed on connected:', err),
        );
      });
      protocol.on('ready', () => {
        this.flushAll().catch((err) =>
          console.warn('[ChatProtocolAdapter] Auto-flush failed on ready:', err),
        );
      });
    }
  }

  public isTransportAvailable(): boolean {
    if (!this.protocol) return false;
    if (typeof this.protocol.connected === 'boolean') {
      return this.protocol.connected;
    }
    return true;
  }

  /**
   * Spatial Chat Dispatcher
   * Maps spatial range inputs or channels to channel 0 ChatType enums (0=Whisper, 1=Say, 2=Shout).
   */
  async sendSpatialChat(
    message: string,
    channelOrRange: number | string = 0,
    chatType: ChatType = ChatType.NORMAL,
  ): Promise<void> {
    if (!message || !message.trim()) {
      throw new Error('Message cannot be empty');
    }

    let channel = 0;
    let type: ChatType = ChatType.NORMAL;

    if (typeof channelOrRange === 'string') {
      const range = channelOrRange.toLowerCase().trim();
      if (range === 'whisper') {
        channel = 0;
        type = ChatType.WHISPER;
      } else if (range === 'shout') {
        channel = 0;
        type = ChatType.SHOUT;
      } else {
        channel = 0;
        type = ChatType.NORMAL;
      }
    } else {
      channel = channelOrRange;
      type = chatType;
    }

    if (!this.protocol || typeof this.protocol.sendChat !== 'function') {
      throw new Error('Spatial chat protocol handler unavailable');
    }

    await this.protocol.sendChat(message, channel, type);
  }

  /**
   * Group Chat Dispatcher
   * Formats group messages as ImprovedInstantMessage session payloads (Dialog=17).
   * Buffers unnegotiated group messages in pending queue.
   */
  async sendGroupChat(
    groupId: string,
    message: string,
    groupName: string = 'Group',
  ): Promise<ImprovedInstantMessagePayload> {
    if (!message || !message.trim()) {
      throw new Error('Message cannot be empty');
    }
    if (!groupId) {
      throw new Error('Group ID required');
    }

    const payload: ImprovedInstantMessagePayload = {
      dialog: InstantMessageDialog.SESSION_SEND,
      id: groupId,
      groupId: groupId,
      toAgentId: groupId,
      message: message,
      timestamp: Date.now(),
      type: 'group',
    };

    if (!this.isTransportAvailable()) {
      this.queueGroupMessage(groupId, message, groupName, payload);
      return payload;
    }

    if (typeof this.protocol?.sendImprovedInstantMessage === 'function') {
      try {
        await this.protocol.sendImprovedInstantMessage(payload);
        return payload;
      } catch (error) {
        console.warn(
          `[ChatProtocolAdapter] Group chat dispatch failed, queueing message for group ${groupId}:`,
          error,
        );
        this.queueGroupMessage(groupId, message, groupName, payload);
        return payload;
      }
    } else if (typeof this.protocol?.sendGroupMessage === 'function') {
      try {
        await this.protocol.sendGroupMessage(groupId, message);
        return payload;
      } catch (error) {
        console.warn(
          `[ChatProtocolAdapter] Group chat dispatch failed, queueing message for group ${groupId}:`,
          error,
        );
        this.queueGroupMessage(groupId, message, groupName, payload);
        return payload;
      }
    } else {
      throw new Error('Group chat is unavailable on this connection');
    }
  }

  /**
   * Direct IM Dispatcher
   * Tries direct IM dispatch, buffering undelivered messages in offline queue when transport is unavailable.
   * Suppresses sendChat(text, 0, 4) fallback calls.
   */
  async sendDirectIM(
    recipientId: string,
    message: string,
    recipientName: string = 'Resident',
  ): Promise<{ sent: boolean; queued: boolean }> {
    if (!message || !message.trim()) {
      throw new Error('Message cannot be empty');
    }
    if (!recipientId) {
      throw new Error('Recipient ID required');
    }

    const isAvailable = this.isTransportAvailable();
    if (isAvailable) {
      try {
        if (typeof this.protocol?.sendInstantMessage === 'function') {
          await this.protocol.sendInstantMessage(recipientId, message);
          return { sent: true, queued: false };
        } else if (typeof this.protocol?.sendImprovedInstantMessage === 'function') {
          await this.protocol.sendImprovedInstantMessage({
            dialog: 0,
            id: recipientId,
            toAgentId: recipientId,
            message: message,
            timestamp: Date.now(),
            type: 'im',
          });
          return { sent: true, queued: false };
        } else {
          // Protocol lacks IM dispatch method - queue message rather than calling sendChat(..., 0, 4)
          this.queueOfflineIM(recipientId, recipientName, message);
          return { sent: false, queued: true };
        }
      } catch (error) {
        console.warn(
          `[ChatProtocolAdapter] Direct IM dispatch failed, buffering offline for ${recipientId}:`,
          error,
        );
        this.queueOfflineIM(recipientId, recipientName, message);
        return { sent: false, queued: true };
      }
    } else {
      this.queueOfflineIM(recipientId, recipientName, message);
      return { sent: false, queued: true };
    }
  }

  private queueOfflineIM(recipientId: string, recipientName: string, message: string) {
    let queue = this.offlineIMQueue.get(recipientId);
    if (!queue) {
      queue = [];
      this.offlineIMQueue.set(recipientId, queue);
    }

    queue.push({
      recipientId,
      recipientName,
      message,
      timestamp: Date.now(),
    });

    if (queue.length > this.maxQueueSize) {
      queue.shift(); // Evict oldest to enforce max queue size
    }

    const queuedMsg = queue[queue.length - 1];
    this.emit('im_queued', queuedMsg);
    this.emit('offline_queue_updated', { recipientId, queueSize: queue.length });
  }

  private queueGroupMessage(
    groupId: string,
    message: string,
    groupName: string,
    payload: ImprovedInstantMessagePayload,
  ) {
    let queue = this.pendingGroupQueue.get(groupId);
    if (!queue) {
      queue = [];
      this.pendingGroupQueue.set(groupId, queue);
    }

    queue.push({
      groupId,
      groupName,
      message,
      payload,
      timestamp: Date.now(),
    });

    if (queue.length > this.maxQueueSize) {
      queue.shift(); // Evict oldest
    }

    const queuedMsg = queue[queue.length - 1];
    this.emit('group_message_queued', queuedMsg);
    this.emit('pending_group_queue_updated', { groupId, queueSize: queue.length });
  }

  public async flushOfflineIMs(recipientId?: string): Promise<number> {
    if (!this.isTransportAvailable()) return 0;

    let flushed = 0;
    const recipients = recipientId ? [recipientId] : Array.from(this.offlineIMQueue.keys());

    for (const rId of recipients) {
      const queue = this.offlineIMQueue.get(rId);
      if (!queue || queue.length === 0) continue;

      const remaining: QueuedIM[] = [];
      for (const item of queue) {
        try {
          if (typeof this.protocol?.sendInstantMessage === 'function') {
            await this.protocol.sendInstantMessage(item.recipientId, item.message);
            flushed++;
          } else if (typeof this.protocol?.sendImprovedInstantMessage === 'function') {
            await this.protocol.sendImprovedInstantMessage({
              dialog: 0,
              id: item.recipientId,
              toAgentId: item.recipientId,
              message: item.message,
              timestamp: item.timestamp,
            });
            flushed++;
          } else {
            remaining.push(item);
          }
        } catch {
          remaining.push(item);
        }
      }

      if (remaining.length === 0) {
        this.offlineIMQueue.delete(rId);
      } else {
        this.offlineIMQueue.set(rId, remaining);
      }

      this.emit('queued_messages_flushed', { recipientId: rId, flushedCount: flushed });
      this.emit('offline_queue_updated', { recipientId: rId, queueSize: remaining.length });
    }

    return flushed;
  }

  public async flushPendingGroupChat(groupId?: string): Promise<number> {
    if (!this.isTransportAvailable()) return 0;

    let flushed = 0;
    const groups = groupId ? [groupId] : Array.from(this.pendingGroupQueue.keys());

    for (const gId of groups) {
      const queue = this.pendingGroupQueue.get(gId);
      if (!queue || queue.length === 0) continue;

      const remaining: QueuedGroupMessage[] = [];
      for (const item of queue) {
        try {
          if (typeof this.protocol?.sendImprovedInstantMessage === 'function') {
            await this.protocol.sendImprovedInstantMessage(item.payload);
            flushed++;
          } else if (typeof this.protocol?.sendGroupMessage === 'function') {
            await this.protocol.sendGroupMessage(item.groupId, item.message);
            flushed++;
          } else {
            remaining.push(item);
          }
        } catch {
          remaining.push(item);
        }
      }

      if (remaining.length === 0) {
        this.pendingGroupQueue.delete(gId);
      } else {
        this.pendingGroupQueue.set(gId, remaining);
      }

      this.emit('group_messages_flushed', { groupId: gId, flushedCount: flushed });
      this.emit('pending_group_queue_updated', { groupId: gId, queueSize: remaining.length });
    }

    return flushed;
  }

  public async flushAll(): Promise<{ imFlushed: number; groupFlushed: number }> {
    const imFlushed = await this.flushOfflineIMs();
    const groupFlushed = await this.flushPendingGroupChat();
    return { imFlushed, groupFlushed };
  }

  public getOfflineIMQueue(recipientId?: string): QueuedIM[] {
    if (recipientId) {
      return [...(this.offlineIMQueue.get(recipientId) || [])];
    }
    const all: QueuedIM[] = [];
    for (const queue of this.offlineIMQueue.values()) {
      all.push(...queue);
    }
    return all;
  }

  public getPendingGroupQueue(groupId?: string): QueuedGroupMessage[] {
    if (groupId) {
      return [...(this.pendingGroupQueue.get(groupId) || [])];
    }
    const all: QueuedGroupMessage[] = [];
    for (const queue of this.pendingGroupQueue.values()) {
      all.push(...queue);
    }
    return all;
  }

  public clearQueues() {
    this.offlineIMQueue.clear();
    this.pendingGroupQueue.clear();
    this.emit('offline_queue_updated', { recipientId: '*', queueSize: 0 });
    this.emit('pending_group_queue_updated', { groupId: '*', queueSize: 0 });
  }
}
