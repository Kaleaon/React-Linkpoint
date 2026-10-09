/**
 * Linkpoint PWA - Enhanced Chat (Features 36-40)
 *
 * Phase 2: Core Protocol Extensions - Priority 3
 * Roadmap: PWA-demo/ANDROID_PORT_ROADMAP.md (Lines 76-81)
 * Android Source: app/src/main/java/com/lumiyaviewer/lumiya/slproto/users/chatsrc/
 *
 * Extends chat functionality with history, filtering, mute list, range, and typing indicators.
 */

import { ChatProtocolAdapter } from '../chat-protocol-adapter';
import { MuteFlag, MuteType, isLinden, type MuteList } from '../mute-list';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERS_STORAGE_KEY = 'linkpoint_muted_users';
const OBJECTS_STORAGE_KEY = 'linkpoint_muted_objects';

function loadStoredMutes(key: string): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.map((item) => String(item)));
      }
    }
  } catch (e) {
    console.warn(`[ChatExtended] Error reading ${key} from localStorage:`, e);
  }
  return new Set();
}

function saveStoredMutes(key: string, set: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (e) {
    console.warn(`[ChatExtended] Error saving ${key} to localStorage:`, e);
  }
}

export class ChatExtended {
  private protocol: any;
  public adapter: ChatProtocolAdapter;
  private chatHistory: any[] = [];
  private maxHistorySize: number = 1000;
  private filters: Map<string, Function> = new Map();
  private muteList: Set<string> = loadStoredMutes(USERS_STORAGE_KEY);
  private mutedObjects: Set<string> = loadStoredMutes(OBJECTS_STORAGE_KEY);
  private typingUsers: Map<string, number> = new Map();
  private typingTimeout: number = 5000; // milliseconds

  constructor(protocolManager?: any) {
    this.adapter =
      protocolManager instanceof ChatProtocolAdapter
        ? protocolManager
        : new ChatProtocolAdapter(protocolManager);
    this.protocol = this.adapter.protocol || protocolManager;
  }

  /**
   * Feature 36: Chat history persistence
   * Add message to chat history
   */
  addToHistory(message: any) {
    if (!message || typeof message !== 'object') {
      throw new Error('Valid message object required');
    }

    const chatMsg = {
      id: message.id || `msg-${Date.now()}`,
      from: message.from || 'Unknown',
      text: message.text || '',
      type: message.type || 'local', // local, whisper, shout, system
      channel: message.channel || 0,
      timestamp: message.timestamp || Date.now(),
      ...message,
    };

    this.chatHistory.push(chatMsg);

    // Trim history if exceeds max size
    if (this.chatHistory.length > this.maxHistorySize) {
      this.chatHistory.shift();
    }

    console.log(
      `[ChatExtended] Added to history: ${chatMsg.from}: ${chatMsg.text.substring(0, 50)}`,
    );
  }

  /**
   * Get chat history
   */
  getHistory(limit: number = 100) {
    return this.chatHistory.slice(-limit);
  }

  /**
   * Feature 37: Chat filtering
   * Add chat filter rule
   */
  addFilter(filterName: string, filterFn: Function) {
    if (!filterName || typeof filterFn !== 'function') {
      throw new Error('Valid filter name and function required');
    }

    this.filters.set(filterName, filterFn);
    console.log(`[ChatExtended] Added filter: ${filterName}`);
  }

  /**
   * Remove filter
   */
  removeFilter(filterName: string) {
    if (this.filters.delete(filterName)) {
      console.log(`[ChatExtended] Removed filter: ${filterName}`);
    }
  }

  /**
   * Apply filters to message
   */
  applyFilters(message: any): boolean {
    for (const [name, filterFn] of this.filters) {
      try {
        if (!filterFn(message)) {
          console.log(`[ChatExtended] Message blocked by filter: ${name}`);
          return false;
        }
      } catch (error) {
        console.error(`[ChatExtended] Filter error (${name}):`, error);
      }
    }
    return true;
  }

  /**
   * Feature 38: Mute list
   * Add user to mute list
   */
  muteUser(userId: string) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid user ID required');
    }
    const clean = userId.trim();
    this.muteList.add(clean);
    saveStoredMutes(USERS_STORAGE_KEY, this.muteList);

    if (this.grid) {
      // The account's mute list lives on the grid: a UUID mutes that resident, anything else is a legacy mute by name.
      if (UUID_PATTERN.test(clean))
        this.grid.add({ id: clean, name: this.resolveName(clean) || clean, type: MuteType.AGENT });
      else this.grid.add({ name: clean, type: MuteType.BY_NAME });
      return;
    }

    console.log(`[ChatExtended] Muted user: ${userId}`);
  }

  /**
   * Remove user from mute list
   */
  unmuteUser(userId: string) {
    if (!userId || typeof userId !== 'string') return;
    const clean = userId.trim();
    let removed = this.muteList.delete(clean);
    for (const id of Array.from(this.muteList)) {
      if (id.trim().toLowerCase() === clean.toLowerCase()) {
        this.muteList.delete(id);
        removed = true;
      }
    }
    saveStoredMutes(USERS_STORAGE_KEY, this.muteList);

    if (this.grid) {
      this.grid.remove(UUID_PATTERN.test(clean) ? { id: clean } : { name: clean });
      return;
    }
    if (removed) {
      console.log(`[ChatExtended] Unmuted user: ${userId}`);
    }
  }

  /**
   * Check if user is muted
   */
  isUserMuted(userId: string): boolean {
    if (!userId) return false;
    if (this.grid) return this.grid.isMuted(userId, userId) || this.grid.isMutedByName(userId);
    const clean = userId.trim().toLowerCase();
    return Array.from(this.muteList).some((id) => id.trim().toLowerCase() === clean);
  }

  /**
   * Check if a chat/IM message should be displayed according to the mute list and filters
   */
  shouldDisplayMessage(message: any): boolean {
    if (!message) return false;
    const fromId = message.fromId || message.senderId || message.from;
    const fromName = message.fromName || message.sender || message.from;
    if (this.grid) {
      // `process_chat_from_simulator` / IM handling: muted speakers, muted owners of objects, muted groups.
      const name = typeof fromName === 'string' ? fromName : '';
      if (fromId && this.grid.isMuted(fromId, name, MuteFlag.TEXT_CHAT) && !isLinden(name))
        return false;
      if (message.ownerId && this.grid.isMuted(message.ownerId, '', MuteFlag.TEXT_CHAT))
        return false;
      if (message.groupId && this.grid.isMuted(message.groupId)) return false;
      return this.applyFilters(message);
    }
    if (fromId && (this.isUserMuted(fromId) || this.isObjectMuted(fromId))) return false;
    if (fromName && (this.isUserMuted(fromName) || this.isObjectMuted(fromName))) return false;
    return this.applyFilters(message);
  }

  getMutedUsers() {
    if (this.grid) {
      const { mutes, legacy } = this.grid.snapshot();
      return [
        ...mutes
          .filter((m) => m.type === MuteType.AGENT || m.type === MuteType.GROUP)
          .map((m) => m.id),
        ...legacy,
      ];
    }
    return Array.from(this.muteList);
  }

  /** Use the account's grid-backed mute list instead of the in-memory sets. `resolveName` gives the stored name for an id. */
  attachGridMuteList(
    list: MuteList | null,
    resolveName: (id: string) => string | undefined = () => undefined,
  ) {
    this.grid = list;
    this.resolveName = resolveName;
  }
  private grid: MuteList | null = null;
  private resolveName: (id: string) => string | undefined = () => undefined;

  muteObject(nameOrId: string) {
    if (!nameOrId || typeof nameOrId !== 'string') return;
    const clean = nameOrId.trim();
    this.mutedObjects.add(clean);
    saveStoredMutes(OBJECTS_STORAGE_KEY, this.mutedObjects);

    if (this.grid) {
      if (UUID_PATTERN.test(clean))
        this.grid.add({ id: clean, name: this.resolveName(clean) || clean, type: MuteType.OBJECT });
      else this.grid.add({ name: clean, type: MuteType.BY_NAME });
      return;
    }
    console.log(`[ChatExtended] Muted object: ${nameOrId}`);
  }

  unmuteObject(nameOrId: string) {
    if (!nameOrId || typeof nameOrId !== 'string') return;
    const clean = nameOrId.trim();
    let removed = this.mutedObjects.delete(clean);
    for (const obj of Array.from(this.mutedObjects)) {
      if (obj.trim().toLowerCase() === clean.toLowerCase()) {
        this.mutedObjects.delete(obj);
        removed = true;
      }
    }
    saveStoredMutes(OBJECTS_STORAGE_KEY, this.mutedObjects);

    if (this.grid) {
      this.grid.remove(UUID_PATTERN.test(clean) ? { id: clean } : { name: clean });
      return;
    }
    if (removed) {
      console.log(`[ChatExtended] Unmuted object: ${nameOrId}`);
    }
  }

  isObjectMuted(nameOrId: string): boolean {
    if (!nameOrId) return false;
    if (this.grid) return this.grid.isMuted(nameOrId, nameOrId);
    const clean = nameOrId.trim();
    return (
      this.mutedObjects.has(clean) ||
      Array.from(this.mutedObjects).some((m) => clean.toLowerCase() === m.toLowerCase())
    );
  }

  getMutedObjects() {
    if (this.grid)
      return this.grid
        .snapshot()
        .mutes.filter((m) => m.type === MuteType.OBJECT)
        .map((m) => m.id);
    return Array.from(this.mutedObjects);
  }

  /**
   * Feature 39: Chat range (whisper/shout)
   * Send message with specific range
   */
  async sendWithRange(text: string, range: string = 'normal') {
    if (!text || typeof text !== 'string') {
      throw new Error('Valid message text required');
    }

    const validRanges = ['whisper', 'normal', 'shout'];
    if (!validRanges.includes(range)) {
      throw new Error(`Invalid range. Must be one of: ${validRanges.join(', ')}`);
    }

    const chatType = range === 'whisper' ? 0 : range === 'shout' ? 2 : 1;
    const message = {
      text: text,
      range: range,
      channel: 0,
      chatType: chatType,
      timestamp: Date.now(),
    };

    console.log(`[ChatExtended] Sending ${range} message: ${text}`);
    try {
      await this.adapter.sendSpatialChat(text, range);
    } catch (error) {
      console.error('[ChatExtended] Failed to send message:', error);
      throw error;
    }

    return Promise.resolve(message);
  }

  /**
   * Feature 40: Typing indicators
   * Update typing indicator for user
   */
  setUserTyping(userId: string, isTyping: boolean = true) {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid user ID required');
    }

    if (isTyping) {
      this.typingUsers.set(userId, Date.now());
      console.log(`[ChatExtended] User typing: ${userId}`);

      // Auto-clear after timeout
      setTimeout(() => {
        const lastUpdate = this.typingUsers.get(userId);
        if (lastUpdate && Date.now() - lastUpdate >= this.typingTimeout) {
          this.typingUsers.delete(userId);
          console.log(`[ChatExtended] User stopped typing (timeout): ${userId}`);
        }
      }, this.typingTimeout);
    } else {
      this.typingUsers.delete(userId);
      console.log(`[ChatExtended] User stopped typing: ${userId}`);
    }
  }

  /**
   * Get currently typing users
   */
  getTypingUsers(): string[] {
    // Clean up expired typing indicators
    const now = Date.now();
    for (const [userId, timestamp] of this.typingUsers) {
      if (now - timestamp > this.typingTimeout) {
        this.typingUsers.delete(userId);
      }
    }

    return Array.from(this.typingUsers.keys());
  }

  clearHistory() {
    this.chatHistory = [];
  }

  getStats() {
    return {
      historySize: this.chatHistory.length,
      maxHistorySize: this.maxHistorySize,
      activeFilters: this.filters.size,
      mutedUsers: this.muteList.size,
      typingUsers: this.typingUsers.size,
    };
  }
}
