/**
 * Linkpoint PWA - Chat Module
 */

import { Utils } from './utils';
import { isFabricatedContact, purgeFabricatedMessages } from './fabricated-data';
import { ChatProtocolAdapter } from './chat-protocol-adapter';
import { ChatType } from './sl-message-types';

export interface AutoReplyConfig {
  enabled: boolean;
  awayMessage: string;
}

export class ChatManager extends Utils.EventEmitter {
  public protocol: any;
  public adapter: ChatProtocolAdapter;
  public auth: any;
  public messages: any[] = [];
  /** Our own outgoing local chat awaiting the simulator's echo, so it is logged once. */
  private pendingEchoes: { text: string; until: number }[] = [];
  public maxMessages: number = 1000;
  private historyLoggingEnabled = true;
  private messageFilter: ((message: any) => boolean) | null = null;

  setMessageFilter(filter: (message: any) => boolean) { this.messageFilter = filter; }
  public autoReplyEnabled: boolean = false;
  public awayMessage: string = 'I am currently away. Your message has been received and I will reply as soon as possible.';
  private autoReplyRecipients: Set<string> = new Set();
  public openSessions: Map<string, { contactId: string; contactName: string; openedAt: number }> = new Map();
  public closedSessions: Set<string> = new Set();

  constructor(protocolManager: any, authManager: any) {
    super();
    this.adapter = protocolManager instanceof ChatProtocolAdapter
      ? protocolManager
      : new ChatProtocolAdapter(protocolManager);
    this.protocol = this.adapter.protocol || protocolManager;
    this.auth = authManager;
  }

  init() {
    if (this.protocol && typeof this.protocol.on === 'function') {
      this.protocol.on('ChatFromSimulator', (data: any) => this.handleIncomingMessage(data));
      this.protocol.on('chat', (data: any) => this.handleIncomingMessage(data));
      this.protocol.on('im', (data: any) => this.handleIncomingMessage({ ...data, type: 'im' }));
    }
    this.loadSessions();
    this.loadChatHistory();
    this.loadAutoReplyConfig();
  }

  loadSessions() {
    try {
      const savedOpen = Utils.storage.get('linkpoint_open_im_sessions', null);
      if (Array.isArray(savedOpen)) {
        const real = savedOpen.filter((s: any) => s && typeof s.contactName === 'string' && !isFabricatedContact(s.contactId, s.contactName));
        this.openSessions = new Map(real.map((s: any) => [s.contactName.toLowerCase().trim(), s]));
        if (real.length !== savedOpen.length) this.saveSessions();
      }
      const savedClosed = Utils.storage.get('linkpoint_closed_im_sessions', null);
      if (Array.isArray(savedClosed)) {
        this.closedSessions = new Set(savedClosed.map((n: string) => n.toLowerCase().trim()));
      }
    } catch {
      // Storage error ignored
    }
  }

  saveSessions() {
    try {
      Utils.storage.set('linkpoint_open_im_sessions', Array.from(this.openSessions.values()));
      Utils.storage.set('linkpoint_closed_im_sessions', Array.from(this.closedSessions.values()));
    } catch {
      // Storage error ignored
    }
  }

  openSession(contactName: string, contactId?: string) {
    if (!contactName) return;
    const cleanName = contactName.trim();
    const key = cleanName.toLowerCase();
    this.closedSessions.delete(key);
    this.openSessions.set(key, {
      contactId: contactId || cleanName,
      contactName: cleanName,
      openedAt: Date.now(),
    });
    this.saveSessions();
    this.emit('sessions_changed');
  }

  closeSession(contactName: string) {
    if (!contactName) return;
    const key = contactName.toLowerCase().trim();
    this.closedSessions.add(key);
    this.openSessions.delete(key);
    this.saveSessions();
    this.emit('sessions_changed');
  }

  isSessionInUse(contactName: string): boolean {
    if (!contactName) return false;
    const key = contactName.toLowerCase().trim();
    if (this.closedSessions.has(key)) return false;
    if (this.openSessions.has(key)) return true;
    return this.messages.some((m) => {
      if (m.type !== 'im') return false;
      const s = (m.sender || '').toLowerCase().trim();
      const r = (m.recipientName || '').toLowerCase().trim();
      return s === key || r === key;
    });
  }

  markMessagesAsRead(contactName: string) {
    if (!contactName) return;
    const key = contactName.toLowerCase().trim();
    let updated = false;
    for (const m of this.messages) {
      if (m.type === 'im' && (m.sender?.toLowerCase().trim() === key || m.senderId === contactName)) {
        if (m.unread) {
          m.unread = false;
          updated = true;
        }
      }
    }
    if (updated) {
      this.saveChatHistory();
      this.emit('message_received', {});
    }
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

  async sendMessage(message: string, channel: number = 0, type: ChatType = ChatType.NORMAL) {
    if (!message.trim()) throw new Error('Message cannot be empty');
    if (!this.auth.isLoggedIn()) throw new Error('Not connected to a grid');

    const echo = type === ChatType.START ? null : { text: message, until: Date.now() + 15000 };
    if (echo) this.pendingEchoes.push(echo);
    try {
      await this.adapter.sendSpatialChat(message, channel, type);
      
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
      if (echo) this.pendingEchoes = this.pendingEchoes.filter((e) => e !== echo);
      console.error('Error sending message:', error);
      throw error;
    }
  }

  async sendInstantMessage(recipientId: string, message: string, recipientName: string = 'Resident') {
    if (!message.trim()) throw new Error('Message cannot be empty');
    if (!recipientId) throw new Error('Recipient ID required');
    if (!this.auth.isLoggedIn()) throw new Error('Not connected to a grid');

    try {
      const result = await this.adapter.sendDirectIM(recipientId, message, recipientName);

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
        type: 'im',
        queued: result.queued
      };

      this.addMessage(messageData);
      this.emit('message_sent', messageData);
      return messageData;
    } catch (error) {
      console.error('Error sending instant message:', error);
      throw error;
    }
  }

  async sendGroupMessage(groupId: string, message: string, groupName: string = 'Group') {
    if (!message.trim()) throw new Error('Message cannot be empty');
    if (!groupId) throw new Error('Group ID required');
    if (!this.auth.isLoggedIn()) throw new Error('Not connected to a grid');

    try {
      if (typeof this.protocol?.sendGroupMessage !== 'function' &&
          typeof this.protocol?.sendImprovedInstantMessage !== 'function' &&
          !this.adapter.isTransportAvailable()) {
        throw new Error('Group chat is unavailable on this connection');
      }
      await this.adapter.sendGroupChat(groupId, message, groupName);

      const messageData = {
        id: Utils.generateUUID(),
        sender: typeof this.auth.getUserDisplayName === 'function'
          ? this.auth.getUserDisplayName()
          : (this.auth.user?.fullName || this.auth.user?.username || 'Me'),
        senderId: this.auth.user?.id,
        groupId,
        groupName,
        text: message,
        timestamp: Date.now(),
        type: 'group'
      };

      this.addMessage(messageData);
      this.emit('message_sent', messageData);
      return messageData;
    } catch (error) {
      console.error('Error sending group message:', error);
      throw error;
    }
  }

  getIMThreads(): Array<{ contactId: string; contactName: string; lastMessage: string; timestamp: number; unreadCount: number }> {
    const threadMap = new Map<string, { contactId: string; contactName: string; lastMessage: string; timestamp: number; unreadCount: number }>();
    const myId = this.auth?.user?.id;

    for (const msg of this.messages) {
      if (msg.type !== 'im') continue;
      const isOutgoing = Boolean(myId && msg.senderId === myId);
      const contactId = isOutgoing ? (msg.recipientId || msg.recipientName || 'unknown') : (msg.senderId || msg.sender || 'unknown');
      const contactName = isOutgoing ? (msg.recipientName || 'Resident') : (msg.sender || 'Resident');
      const key = contactName.toLowerCase().trim();

      if (this.closedSessions.has(key)) continue;

      const isUnread = Boolean(!isOutgoing && msg.unread);
      const existing = threadMap.get(key);
      if (!existing) {
        threadMap.set(key, {
          contactId,
          contactName,
          lastMessage: msg.text || '',
          timestamp: msg.timestamp || Date.now(),
          unreadCount: isUnread ? 1 : 0,
        });
      } else {
        if ((msg.timestamp || 0) >= existing.timestamp) {
          existing.lastMessage = msg.text || '';
          existing.timestamp = msg.timestamp || existing.timestamp;
        }
        if (isUnread) {
          existing.unreadCount = (existing.unreadCount || 0) + 1;
        }
      }
    }

    // Also include explicitly opened sessions that haven't exchanged messages yet
    for (const [key, session] of this.openSessions.entries()) {
      if (this.closedSessions.has(key)) continue;
      if (!threadMap.has(key)) {
        threadMap.set(key, {
          contactId: session.contactId,
          contactName: session.contactName,
          lastMessage: 'Active conversation session',
          timestamp: session.openedAt,
          unreadCount: 0,
        });
      }
    }

    return Array.from(threadMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getIMMessages(contactId?: string): any[] {
    const myId = this.auth?.user?.id;
    return this.messages.filter((m) => {
      if (m.type !== 'im') return false;
      if (!contactId) return true;
      const cid = contactId.toLowerCase().trim();
      const sender = (m.sender || '').toLowerCase().trim();
      const rec = (m.recipientName || '').toLowerCase().trim();
      return (m.senderId === contactId && m.senderId !== myId) ||
        (m.recipientId === contactId) ||
        sender === cid ||
        rec === cid;
    });
  }

  async handleIncomingMessage(data: any): Promise<void> {
    const isGroup = data.type === 'group' || data.chatType === 'group' || data.chatType === 9;
    const isIM = !isGroup && (data.type === 'im' || data.chatType === 'im' || data.chatType === 4 || data.dialog !== undefined);
    const senderId = data.fromId || data.from || data.OwnerID || data.senderId;
    const msgText = data.message || data.Message || data.text || '';
    const senderName = data.fromName || data.FromName || data.sender || 'Unknown';
    const isScriptError = Boolean(
      data.isScriptError ||
      data.chatType === 6 ||
      data.channel === 2147483647 ||
      msgText.includes('Script run-time error') ||
      msgText.includes('Stack-Heap Collision')
    );
    const isObject = Boolean(
      data.sourceType === 2 ||
      data.sourceType === 'object' ||
      isScriptError ||
      senderName.startsWith('[') ||
      senderName.includes('HUD') ||
      senderName === 'av'
    );

    // The simulator echoes our own local chat back, possibly before sendMessage has returned.
    const myId = this.auth?.user?.id;
    if (!isIM && !isGroup && myId && senderId === myId) {
      const now = Date.now();
      this.pendingEchoes = this.pendingEchoes.filter((e) => e.until > now);
      const at = this.pendingEchoes.findIndex((e) => e.text === msgText);
      if (at !== -1) {
        this.pendingEchoes.splice(at, 1);
        return;
      }
    }

    const messageData = {
      id: data.id || Utils.generateUUID(),
      sender: senderName,
      senderId,
      groupId: data.groupId,
      groupName: data.groupName,
      text: msgText,
      timestamp: data.timestamp || Date.now(),
      type: isGroup ? 'group' : isIM ? 'im' : (data.chatType || data.type || 'local'),
      isObject,
      isScriptError,
      sourceType: isObject ? 2 : (data.sourceType || 1),
      channel: data.channel ?? 0,
    };

    if (this.messageFilter && !this.messageFilter(messageData)) return;
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
      await this.adapter.sendDirectIM(recipientId, replyText, recipientName);

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
    if (messageData.type === 'im') {
      const myId = this.auth?.user?.id;
      const isOutgoing = Boolean(myId && messageData.senderId === myId);
      const contactName = isOutgoing ? messageData.recipientName : messageData.sender;
      if (contactName) {
        const clean = contactName.trim();
        this.closedSessions.delete(clean.toLowerCase());
        this.openSessions.set(clean.toLowerCase(), {
          contactId: isOutgoing ? (messageData.recipientId || clean) : (messageData.senderId || clean),
          contactName: clean,
          openedAt: messageData.timestamp || Date.now(),
        });
        this.saveSessions();
      }
    }
    this.messages.push(messageData);
    if (this.messages.length > this.maxMessages) this.messages.shift();
    this.saveChatHistory();
  }

  setHistoryLoggingEnabled(enabled: boolean) {
    this.historyLoggingEnabled = Boolean(enabled);
    if (!this.historyLoggingEnabled) Utils.storage.remove('linkpoint_chat_history');
  }

  saveChatHistory() {
    if (!this.historyLoggingEnabled) return;
    Utils.storage.set('linkpoint_chat_history', this.messages.slice(-150));
  }

  loadChatHistory() {
    const saved = Utils.storage.get('linkpoint_chat_history', null);
    if (!Array.isArray(saved)) return;
    const { messages, removed } = purgeFabricatedMessages(saved);
    this.messages = messages;
    // Earlier builds seeded invented conversations into the saved history.
    // Drop them from storage too, so they cannot come back on the next load.
    if (removed) this.saveChatHistory();
  }

  clearHistory() {
    this.messages = [];
    this.openSessions.clear();
    this.closedSessions.clear();
    this.saveSessions();
    this.saveChatHistory();
    this.emit('history_cleared');
    this.emit('sessions_changed');
  }
}
