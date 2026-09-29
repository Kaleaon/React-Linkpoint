/**
 * Linkpoint PWA - Chat Module
 */

import { Utils } from './utils';

export interface AutoReplyConfig {
  enabled: boolean;
  awayMessage: string;
}

export class ChatManager extends Utils.EventEmitter {
  public protocol: any;
  public auth: any;
  public messages: any[] = [];
  public maxMessages: number = 1000;
  public autoReplyEnabled: boolean = false;
  public awayMessage: string = 'I am currently away. Your message has been received and I will reply as soon as possible.';
  private autoReplyRecipients: Set<string> = new Set();

  constructor(protocolManager: any, authManager: any) {
    super();
    this.protocol = protocolManager;
    this.auth = authManager;
  }

  init() {
    this.protocol.on('ChatFromSimulator', (data: any) => this.handleIncomingMessage(data));
    this.protocol.on('chat', (data: any) => this.handleIncomingMessage(data));
    this.protocol.on('im', (data: any) => this.handleIncomingMessage({ ...data, type: 'im' }));
    this.loadChatHistory();
    this.loadAutoReplyConfig();
  }

  setAutoReplyEnabled(enabled: boolean) {
    this.autoReplyEnabled = Boolean(enabled);
    if (!this.autoReplyEnabled) {
      this.autoReplyRecipients.clear();
    }
    this.saveAutoReplyConfig();
    this.emit('auto_reply_changed', {
      enabled: this.autoReplyEnabled,
      awayMessage: this.awayMessage,
    });
  }

  isAutoReplyEnabled(): boolean {
    return this.autoReplyEnabled;
  }

  setAwayMessage(message: string) {
    const trimmed = typeof message === 'string' ? message.trim() : '';
    this.awayMessage = trimmed || 'I am currently away.';
    this.saveAutoReplyConfig();
    this.emit('auto_reply_changed', {
      enabled: this.autoReplyEnabled,
      awayMessage: this.awayMessage,
    });
  }

  getAwayMessage(): string {
    return this.awayMessage;
  }

  clearAutoReplyRecipients() {
    this.autoReplyRecipients.clear();
  }

  hasAutoRepliedTo(senderId: string): boolean {
    return this.autoReplyRecipients.has(senderId);
  }

  saveAutoReplyConfig() {
    Utils.storage.set('linkpoint_auto_reply_config', {
      enabled: this.autoReplyEnabled,
      awayMessage: this.awayMessage,
    });
  }

  loadAutoReplyConfig() {
    const config = Utils.storage.get('linkpoint_auto_reply_config', null);
    if (config) {
      if (typeof config.enabled === 'boolean') {
        this.autoReplyEnabled = config.enabled;
      }
      if (typeof config.awayMessage === 'string' && config.awayMessage.trim()) {
        this.awayMessage = config.awayMessage;
      }
    }
  }

  async sendMessage(message: string, channel: number = 0, type: number = 1) {
    if (!message.trim()) throw new Error('Message cannot be empty');
    if (!this.auth.isLoggedIn()) throw new Error('Not connected to a grid');

    try {
      await this.protocol.sendChat(message, channel, type);
      
      const messageData = {
        id: Utils.generateUUID(),
        sender: typeof this.auth.getUserDisplayName === 'function'
          ? this.auth.getUserDisplayName()
          : (this.auth.user?.fullName || this.auth.user?.username || 'Me'),
        senderId: this.auth.user?.id,
        text: message,
        timestamp: Date.now(),
        type: type === 4 ? 'im' : 'local'
      };

      this.addMessage(messageData);
      this.emit('message_sent', messageData);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async sendInstantMessage(recipientId: string, message: string, recipientName: string = 'Resident') {
    if (!message.trim()) throw new Error('Message cannot be empty');
    if (!recipientId) throw new Error('Recipient ID required');
    if (!this.auth.isLoggedIn()) throw new Error('Not connected to a grid');

    try {
      if (typeof this.protocol?.sendInstantMessage === 'function') {
        await this.protocol.sendInstantMessage(recipientId, message);
      } else {
        await this.protocol.sendChat(message, 0, 4);
      }

      const messageData = {
        id: Utils.generateUUID(),
        sender: typeof this.auth.getUserDisplayName === 'function'
          ? this.auth.getUserDisplayName()
          : (this.auth.user?.fullName || this.auth.user?.username || 'Me'),
        senderId: this.auth.user?.id,
        recipientId,
        recipientName,
        text: message,
        timestamp: Date.now(),
        type: 'im'
      };

      this.addMessage(messageData);
      this.emit('message_sent', messageData);
      return messageData;
    } catch (error) {
      console.error('Error sending instant message:', error);
      throw error;
    }
  }

  getIMThreads(): Array<{ contactId: string; contactName: string; lastMessage: string; timestamp: number }> {
    const threadMap = new Map<string, any>();
    const myId = this.auth?.user?.id;

    for (const msg of this.messages) {
      if (msg.type !== 'im') continue;
      const isOutgoing = myId && msg.senderId === myId;
      const contactId = isOutgoing ? (msg.recipientId || 'unknown') : (msg.senderId || 'unknown');
      const contactName = isOutgoing ? (msg.recipientName || 'Resident') : (msg.sender || 'Resident');

      threadMap.set(contactId, {
        contactId,
        contactName,
        lastMessage: msg.text,
        timestamp: msg.timestamp,
      });
    }

    return Array.from(threadMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getIMMessages(contactId?: string): any[] {
    const myId = this.auth?.user?.id;
    return this.messages.filter((m) => {
      if (m.type !== 'im') return false;
      if (!contactId) return true;
      return (m.senderId === contactId && m.senderId !== myId) || (m.recipientId === contactId) || (m.senderId === myId && !m.recipientId);
    });
  }

  async handleIncomingMessage(data: any): Promise<void> {
    const isIM = data.type === 'im' || data.chatType === 'im' || data.chatType === 4 || data.dialog !== undefined;
    const senderId = data.fromId || data.from || data.OwnerID || data.senderId;
    const messageData = {
      id: data.id || Utils.generateUUID(),
      sender: data.fromName || data.FromName || data.sender || 'Unknown',
      senderId,
      text: data.message || data.Message || data.text,
      timestamp: data.timestamp || Date.now(),
      type: isIM ? 'im' : (data.chatType || data.type || 'local')
    };

    this.addMessage(messageData);
    this.emit('message_received', messageData);

    // Auto-reply logic for incoming IMs
    if (isIM && this.autoReplyEnabled && this.awayMessage && senderId) {
      const myId = this.auth?.user?.id;
      // Do not reply to messages sent by our own avatar
      if (!myId || senderId !== myId) {
        await this.triggerAutoReply(senderId, messageData.sender);
      }
    }
  }

  async triggerAutoReply(recipientId: string, recipientName: string) {
    if (!recipientId || this.autoReplyRecipients.has(recipientId)) {
      return;
    }

    this.autoReplyRecipients.add(recipientId);

    const replyText = `[Auto-Response] ${this.awayMessage}`;
    try {
      if (typeof this.protocol?.sendInstantMessage === 'function') {
        await this.protocol.sendInstantMessage(recipientId, replyText);
      } else if (typeof this.protocol?.sendChat === 'function') {
        await this.protocol.sendChat(replyText, 0, 4);
      }

      const autoReplyMessage = {
        id: Utils.generateUUID(),
        sender: typeof this.auth?.getUserDisplayName === 'function'
          ? this.auth.getUserDisplayName()
          : (this.auth?.user?.fullName || this.auth?.user?.username || 'Me'),
        senderId: this.auth?.user?.id,
        recipientId,
        recipientName,
        text: replyText,
        timestamp: Date.now(),
        type: 'im',
        isAutoReply: true
      };

      this.addMessage(autoReplyMessage);
      this.emit('auto_reply_sent', autoReplyMessage);
      this.emit('message_sent', autoReplyMessage);
    } catch (error) {
      console.warn('[ChatManager] Failed to dispatch auto-reply:', error);
    }
  }

  addMessage(messageData: any) {
    this.messages.push(messageData);
    if (this.messages.length > this.maxMessages) this.messages.shift();
    this.saveChatHistory();
  }

  saveChatHistory() {
    Utils.storage.set('linkpoint_chat_history', this.messages.slice(-100));
  }

  loadChatHistory() {
    this.messages = Utils.storage.get('linkpoint_chat_history', []);
  }

  clearHistory() {
    this.messages = [];
    this.saveChatHistory();
    this.emit('history_cleared');
  }
}
