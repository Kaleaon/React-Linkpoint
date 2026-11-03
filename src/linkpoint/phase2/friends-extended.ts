/**
 * Linkpoint PWA - Friends Extensions (Features 46-50)
 *
 * Phase 2: Core Protocol Extensions - Priority 3
 * Roadmap: PWA-demo/ANDROID_PORT_ROADMAP.md (Lines 90-95)
 * Android Source: app/src/main/java/com/lumiyaviewer/lumiya/slproto/users/
 *
 * Extends friend functionality with requests, notifications, permissions, calling cards, and groups.
 */

import { Utils } from '../utils';
import { deltaSelectorStore } from '../delta-selectors';
import { indexedDBStore } from '../indexeddb-store';
import { MessageIDs } from '../sl-message-types';

export interface DeclineTeleportPacketPayload {
  agentId: string;
  sessionId: string;
}

export interface SerializedDeclineTeleportPacket {
  messageName: string;
  messageId: number;
  agentId: string;
  sessionId: string;
  payload: Uint8Array;
}

export const FriendRights = {
  NONE: 0x0,
  CAN_SEE_ONLINE: 0x1,
  CAN_SEE_ON_MAP: 0x2,
  CAN_MODIFY_OBJECTS: 0x4,
} as const;

export type FriendRights = (typeof FriendRights)[keyof typeof FriendRights];

export interface GrantUserRightsPacketPayload {
  agentId: string;
  sessionId: string;
  targetId: string;
  rightsMask: number;
}

export interface SerializedGrantUserRightsPacket {
  messageName: string;
  messageId: number;
  agentId: string;
  sessionId: string;
  targetId: string;
  rightsMask: number;
  payload: Uint8Array;
}

const isValidUuid = (uuidStr: string): boolean => {
  if (typeof uuidStr !== 'string') return false;
  const hex = uuidStr.replace(/[{}]/g, '').replace(/-/g, '');
  return hex.length === 32 && /^[0-9a-fA-F]{32}$/.test(hex);
};

const uuidToBytes = (uuidStr: string): Uint8Array => {
  const hex = uuidStr.replace(/[{}]/g, '').replace(/-/g, '');
  const bytes = new Uint8Array(16);
  if (hex.length === 32) {
    for (let i = 0; i < 16; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16) || 0;
    }
  }
  return bytes;
};

/**
 * Serializes a DeclineTeleport UDP packet according to SL protocol standards.
 * Passes the inviting agent ID and session ID in the packet payload.
 */
export function serializeDeclineTeleportPacket(
  agentId: string,
  sessionId: string,
): SerializedDeclineTeleportPacket {
  const normAgentId = String(agentId || '').trim();
  const normSessionId = String(sessionId || '').trim();

  if (!normAgentId) {
    throw new Error('Valid agent ID required for DeclineTeleport packet');
  }
  if (!normSessionId) {
    throw new Error('Valid session ID required for DeclineTeleport packet');
  }

  const agentIdBytes = uuidToBytes(normAgentId);
  const sessionIdBytes = uuidToBytes(normSessionId);

  const payload = new Uint8Array(32);
  payload.set(agentIdBytes, 0);
  payload.set(sessionIdBytes, 16);

  return {
    messageName: 'DeclineTeleport',
    messageId: MessageIDs.DECLINE_TELEPORT ?? 0xffff007a,
    agentId: normAgentId,
    sessionId: normSessionId,
    payload,
  };
}

/** Alias serializer function for flexible caller usage */
export const serializeDeclineTeleport = serializeDeclineTeleportPacket;

/**
 * Serializes a GrantUserRights UDP packet according to SL protocol standards (0xFFFF0054).
 * Returns a 52-byte payload containing 16-byte AgentID, 16-byte SessionID, 16-byte TargetID,
 * and 4-byte little-endian rights bitmask.
 */
export function serializeGrantUserRightsPacket(
  agentId: string,
  sessionId: string,
  targetId: string,
  rightsMask: number,
): SerializedGrantUserRightsPacket {
  const normAgentId = String(agentId || '').trim();
  const normSessionId = String(sessionId || '').trim();
  const normTargetId = String(targetId || '').trim();

  if (!normAgentId || !isValidUuid(normAgentId)) {
    throw new Error('Valid agent ID required for GrantUserRights packet');
  }
  if (!normSessionId || !isValidUuid(normSessionId)) {
    throw new Error('Valid session ID required for GrantUserRights packet');
  }
  if (!normTargetId || !isValidUuid(normTargetId)) {
    throw new Error('Valid target ID required for GrantUserRights packet');
  }

  const numRights = Number(rightsMask);
  if (!Number.isInteger(numRights) || numRights < 0 || numRights > 0xffffffff) {
    throw new Error('rightsMask must be an unsigned 32-bit integer');
  }
  const validRightsMask = numRights >>> 0;

  const agentIdBytes = uuidToBytes(normAgentId);
  const sessionIdBytes = uuidToBytes(normSessionId);
  const targetIdBytes = uuidToBytes(normTargetId);

  const payload = new Uint8Array(52);
  payload.set(agentIdBytes, 0);
  payload.set(sessionIdBytes, 16);
  payload.set(targetIdBytes, 32);

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  view.setUint32(48, validRightsMask, true);

  return {
    messageName: 'GrantUserRights',
    messageId: MessageIDs.GRANT_USER_RIGHTS ?? 0xffff0054,
    agentId: normAgentId,
    sessionId: normSessionId,
    targetId: normTargetId,
    rightsMask: validRightsMask,
    payload,
  };
}

/** Alias serializer function for flexible caller usage */
export const serializeGrantUserRights = serializeGrantUserRightsPacket;

/** The session says 'Resident' (and the manager 'Friend') when it has no name; those are not names. */
const isRealName = (name: unknown): name is string =>
  typeof name === 'string' &&
  name.trim() !== '' &&
  !['Resident', 'Friend', 'Unknown Friend'].includes(name.trim());

class FriendRequestsMap extends Map<string, any> {
  constructor(private pendingRequestIds: Set<string>) {
    super();
  }

  override set(key: string, value: any): this {
    super.set(key, value);
    if (value && value.status === 'pending') {
      this.pendingRequestIds.add(key);
    } else {
      this.pendingRequestIds.delete(key);
    }
    return this;
  }

  override delete(key: string): boolean {
    this.pendingRequestIds.delete(key);
    return super.delete(key);
  }

  override clear(): void {
    this.pendingRequestIds.clear();
    super.clear();
  }
}

export class FriendsExtended extends Utils.EventEmitter {
  private friends: Map<string, any> = new Map();
  private onlineFriendIds: Set<string> = new Set();
  private pendingRequestIds: Set<string> = new Set();
  private friendRequests: Map<string, any> = new FriendRequestsMap(this.pendingRequestIds);
  private friendGroups: Map<string, any> = new Map();
  private onlineStatusListeners: Set<Function> = new Set();
  private authoritativePresence: Set<string> = new Set();

  constructor(private protocol?: any) {
    super();
  }

  private normalizeId(friendId: string) {
    return String(friendId)
      .trim()
      .replace(/^\{(.+)\}$/, '$1')
      .toLowerCase();
  }

  private normalizeStatus(status: unknown): 'online' | 'offline' {
    if (
      status === true ||
      status === 1 ||
      status === '1' ||
      String(status).toLowerCase() === 'online' ||
      String(status).toLowerCase() === 'true'
    ) {
      return 'online';
    }
    return 'offline';
  }

  /**
   * Feature 46: Friend requests
   * Send friend request
   */
  async sendFriendRequest(userId: string, message: string = '') {
    if (!userId || typeof userId !== 'string') {
      throw new Error('Valid user ID required');
    }

    if (typeof this.protocol?.sendFriendRequest !== 'function') {
      throw new Error('Friend requests are unavailable on this connection');
    }
    await this.protocol.sendFriendRequest(userId, message);
    const request = {
      id: `req-${Date.now()}-${userId}`,
      targetUserId: userId,
      message: message,
      status: 'pending',
      timestamp: Date.now(),
    };

    this.friendRequests.set(request.id, request);
    console.log(`[FriendsExtended] Sent friend request to: ${userId}`);

    return Promise.resolve(request);
  }

  /**
   * Accept friend request
   */
  async acceptFriendRequest(requestId: string) {
    const request = this.friendRequests.get(requestId);
    if (!request) {
      throw new Error(`Friend request not found: ${requestId}`);
    }

    request.status = 'accepted';
    this.pendingRequestIds.delete(requestId);
    // Add to friends list
    this.addFriend(request.targetUserId, {
      accepted: true,
      timestamp: Date.now(),
    });

    console.log(`[FriendsExtended] Accepted friend request: ${requestId}`);
    return Promise.resolve();
  }

  /**
   * Decline friend request
   */
  declineFriendRequest(requestId: string) {
    const request = this.friendRequests.get(requestId);
    if (request) {
      request.status = 'declined';
      this.pendingRequestIds.delete(requestId);
      console.log(`[FriendsExtended] Declined friend request: ${requestId}`);
    }
  }

  /**
   * Add friend to list
   */
  addFriend(friendId: string, friendData: any = {}) {
    if (!friendId || typeof friendId !== 'string') {
      throw new Error('Valid friend ID required');
    }

    const normalizedId = this.normalizeId(friendId);
    const existing = this.friends.get(normalizedId);
    // A presence packet can carry no name, or the placeholder the session uses when it has none yet;
    // neither may replace a name we already know.
    const { name: givenName, ...otherData } = friendData;
    const realName = isRealName(givenName) ? givenName : undefined;
    const friend = {
      ...existing,
      name: realName ?? existing?.name ?? 'Friend',
      permissions: friendData.permissions ?? existing?.permissions ?? {},
      group: friendData.group ?? existing?.group ?? null,
      notes: friendData.notes ?? existing?.notes ?? '',
      timestamp: friendData.timestamp ?? existing?.timestamp ?? Date.now(),
      ...otherData,
      id: normalizedId,
      onlineStatus: this.normalizeStatus(
        friendData.onlineStatus ?? friendData.online ?? existing?.onlineStatus,
      ),
    };

    this.friends.set(normalizedId, friend);
    if (friend.onlineStatus === 'online') {
      this.onlineFriendIds.add(normalizedId);
    } else {
      this.onlineFriendIds.delete(normalizedId);
    }
    deltaSelectorStore.emitDelta(
      'contact',
      normalizedId,
      existing ? 'update' : 'add',
      friend,
      existing,
    );
    this.emit(existing ? 'friend_updated' : 'friend_added', { ...friend });
    console.log(`[FriendsExtended] ${existing ? 'Updated' : 'Added'} friend: ${friend.name}`);
  }

  /** Replace a server snapshot and remove contacts that are no longer friends. */
  replaceFriends(friends: any[]) {
    const currentIds = new Set<string>();
    for (const friend of friends || []) {
      if (!friend?.id) continue;
      const id = this.normalizeId(String(friend.id));
      currentIds.add(id);
      const liveStatus = this.authoritativePresence.has(id)
        ? this.friends.get(id)?.onlineStatus
        : undefined;
      this.addFriend(id, liveStatus ? { ...friend, onlineStatus: liveStatus } : friend);
    }
    for (const id of [...this.friends.keys()]) {
      if (!currentIds.has(id)) this.removeFriend(id);
    }
  }

  removeFriend(friendId: string) {
    const normalizedId = this.normalizeId(friendId);
    const friend = this.friends.get(normalizedId);
    if (!friend) return false;
    this.friends.delete(normalizedId);
    this.onlineFriendIds.delete(normalizedId);
    this.authoritativePresence.delete(normalizedId);
    for (const group of this.friendGroups.values()) {
      group.members = group.members.filter((id: string) => this.normalizeId(id) !== normalizedId);
    }
    this.emit('friend_removed', { ...friend });
    return true;
  }

  clear() {
    for (const id of [...this.friends.keys()]) this.removeFriend(id);
    this.friendRequests.clear();
    this.onlineFriendIds.clear();
    this.pendingRequestIds.clear();
  }

  /**
   * Feature 47: Online notifications
   * Update friend online status
   */
  updateFriendStatus(friendId: string, status: string, friendData: any = {}) {
    if (!friendId || !status) {
      throw new Error('Valid friend ID and status required');
    }

    const normalizedId = this.normalizeId(friendId);
    const normalizedStatus = this.normalizeStatus(status);
    this.authoritativePresence.add(normalizedId);
    let friend = this.friends.get(normalizedId);
    // Presence packets can arrive before the initial buddy-list request has
    // completed. Keep that authoritative event instead of silently dropping it.
    if (!friend) {
      this.addFriend(normalizedId, { ...friendData, onlineStatus: normalizedStatus });
      friend = this.friends.get(normalizedId);
    }
    if (friend) {
      const oldStatus = friend.onlineStatus;
      friend.onlineStatus = normalizedStatus;
      if (normalizedStatus === 'online') {
        this.onlineFriendIds.add(normalizedId);
      } else {
        this.onlineFriendIds.delete(normalizedId);
      }
      if (isRealName(friendData.name)) friend.name = friendData.name;

      // Notify listeners
      if (oldStatus !== normalizedStatus) {
        this.notifyStatusChange(normalizedId, normalizedStatus, oldStatus);
        deltaSelectorStore.emitDelta(
          'contact',
          normalizedId,
          'presence',
          { ...friend, onlineStatus: normalizedStatus },
          { ...friend, onlineStatus: oldStatus },
        );
        this.emit('friend_updated', { ...friend });
      }

      console.log(`[FriendsExtended] Friend ${normalizedId} status: ${normalizedStatus}`);
    }
  }

  /**
   * Register online status listener
   */
  addStatusListener(listener: Function) {
    if (typeof listener === 'function') {
      this.onlineStatusListeners.add(listener);
    }
  }

  removeStatusListener(listener: Function) {
    this.onlineStatusListeners.delete(listener);
  }

  /**
   * Notify all listeners of status change
   */
  private notifyStatusChange(friendId: string, newStatus: string, oldStatus: string) {
    for (const listener of this.onlineStatusListeners) {
      try {
        listener(friendId, newStatus, oldStatus);
      } catch (error) {
        console.error('[FriendsExtended] Status listener error:', error);
      }
    }
  }

  /**
   * Feature 48: Friend permissions
   * Set friend permissions and dispatch GrantUserRights packet
   */
  async setFriendPermissions(
    friendId: string,
    permissions: any,
    agentId?: string,
    sessionId?: string,
  ) {
    if (!friendId || permissions === undefined || permissions === null) {
      throw new Error('Valid friend ID and permissions required');
    }

    const isNumber = typeof permissions === 'number';
    const bitmask = isNumber
      ? permissions >>> 0
      : ((permissions.canSeeOnline ? 0x1 : 0) |
          (permissions.canSeeOnMap ? 0x2 : 0) |
          (permissions.canModifyObjects ? 0x4 : 0) |
          (typeof permissions.rightsMask === 'number' ? permissions.rightsMask : 0) |
          (typeof permissions.rights === 'number' ? permissions.rights : 0)) >>>
        0;

    const permObj = isNumber
      ? {
          canSeeOnline: Boolean(bitmask & 0x1),
          canSeeOnMap: Boolean(bitmask & 0x2),
          canModifyObjects: Boolean(bitmask & 0x4),
          rightsMask: bitmask,
        }
      : {
          canSeeOnline: Boolean(permissions.canSeeOnline),
          canSeeOnMap: Boolean(permissions.canSeeOnMap),
          canModifyObjects: Boolean(permissions.canModifyObjects),
          ...permissions,
          rightsMask: bitmask,
        };

    const normalizedId = this.normalizeId(friendId);
    const friend = this.friends.get(normalizedId) || this.friends.get(friendId);
    const previous = friend ? { ...friend } : undefined;
    if (friend) {
      friend.permissions = permObj;
      deltaSelectorStore.emitDelta('contact', normalizedId, 'update', friend, previous);
      console.log(`[FriendsExtended] Updated permissions for: ${friendId}`);
    }

    const resolvedAgentId =
      agentId ||
      this.protocol?.agentId ||
      this.protocol?.circuitContext?.agentId ||
      '00000000-0000-0000-0000-000000000000';
    const resolvedSessionId =
      sessionId ||
      this.protocol?.sessionId ||
      this.protocol?.circuitContext?.sessionId ||
      '00000000-0000-0000-0000-000000000000';

    let packet: SerializedGrantUserRightsPacket | null = null;
    const targetUuid = isValidUuid(friendId)
      ? friendId
      : isValidUuid(normalizedId)
        ? normalizedId
        : null;

    if (targetUuid && isValidUuid(resolvedAgentId) && isValidUuid(resolvedSessionId)) {
      packet = serializeGrantUserRightsPacket(
        resolvedAgentId,
        resolvedSessionId,
        targetUuid,
        bitmask,
      );
    }

    try {
      if (typeof this.protocol?.grantUserRights === 'function') {
        await this.protocol.grantUserRights({
          agentId: resolvedAgentId,
          sessionId: resolvedSessionId,
          targetId: targetUuid || normalizedId,
          rightsMask: bitmask,
          packet,
        });
      } else if (typeof this.protocol?.sendGrantUserRights === 'function') {
        await this.protocol.sendGrantUserRights(
          resolvedAgentId,
          resolvedSessionId,
          targetUuid || normalizedId,
          bitmask,
          packet,
        );
      } else if (typeof this.protocol?.sendPacket === 'function') {
        await this.protocol.sendPacket(packet);
      }
    } catch (error) {
      console.warn('[FriendsExtended] grantUserRights network dispatch failed:', error);
    }

    this.emit('friend_rights_updated', {
      friendId: normalizedId,
      targetId: targetUuid || normalizedId,
      permissions: permObj,
      rightsMask: bitmask,
      packet,
    });

    return packet;
  }

  /**
   * Get friend permissions
   */
  getFriendPermissions(friendId: string) {
    const normalizedId = this.normalizeId(friendId);
    return (
      this.friends.get(normalizedId)?.permissions || this.friends.get(friendId)?.permissions || null
    );
  }

  /**
   * Feature 49: Calling cards
   * Create calling card for friend
   */
  createCallingCard(friendId: string) {
    const friend = this.friends.get(friendId);
    if (!friend) {
      throw new Error(`Friend not found: ${friendId}`);
    }

    const callingCard = {
      id: `card-${friendId}`,
      targetId: friendId,
      targetName: friend.name,
      created: Date.now(),
      type: 'calling_card',
    };

    console.log(`[FriendsExtended] Created calling card for: ${friend.name}`);
    return callingCard;
  }

  /**
   * Feature 50: Friend groups
   * Create friend group/folder
   */
  createFriendGroup(groupName: string) {
    if (!groupName || typeof groupName !== 'string') {
      throw new Error('Valid group name required');
    }

    const groupId = `group-${Date.now()}`;
    const group = {
      id: groupId,
      name: groupName,
      members: [],
      created: Date.now(),
    };

    this.friendGroups.set(groupId, group);
    console.log(`[FriendsExtended] Created friend group: ${groupName}`);

    return group;
  }

  /**
   * Add friend to group
   */
  addFriendToGroup(friendId: string, groupId: string) {
    const friend = this.friends.get(friendId);
    const group = this.friendGroups.get(groupId);

    if (!friend || !group) {
      throw new Error('Friend or group not found');
    }

    if (!group.members.includes(friendId)) {
      group.members.push(friendId);
      friend.group = groupId;
      console.log(`[FriendsExtended] Added ${friendId} to group ${group.name}`);
    }
  }

  /**
   * Get friends by group
   */
  getFriendsByGroup(groupId: string) {
    const group = this.friendGroups.get(groupId);
    if (!group) {
      return [];
    }

    return group.members.map((id: string) => this.friends.get(id)).filter(Boolean);
  }

  /**
   * Get online friends
   */
  getOnlineFriends() {
    const online: any[] = [];
    for (const id of this.onlineFriendIds) {
      const friend = this.friends.get(id);
      if (friend) {
        online.push(friend);
      }
    }
    return online;
  }

  /** Snapshot for UI rendering; callers cannot mutate the backing map. */
  getFriends() {
    return Array.from(this.friends.values()).map((friend) => ({ ...friend }));
  }

  /** Paged friends query method directly from IndexedDB transactional store */
  async getFriendsPage(page = 1, pageSize = 50, filter?: string, agentId = 'current') {
    return indexedDBStore.getFriendsPage(agentId, page, pageSize, filter);
  }

  getStats() {
    return {
      totalFriends: this.friends.size,
      onlineFriends: this.onlineFriendIds.size,
      pendingRequests: this.pendingRequestIds.size,
      friendGroups: this.friendGroups.size,
    };
  }

  /**
   * Feature: Teleport Lure Decline
   * Serialize and dispatch DeclineTeleport UDP packet for a teleport lure
   */
  async declineTeleportLure(agentId: string, sessionId: string) {
    const packet = serializeDeclineTeleportPacket(agentId, sessionId);

    if (typeof this.protocol?.sendDeclineTeleport === 'function') {
      await this.protocol.sendDeclineTeleport(agentId, sessionId, packet);
    } else if (typeof this.protocol?.sendPacket === 'function') {
      await this.protocol.sendPacket(packet);
    } else if (typeof this.protocol?.declineLure === 'function') {
      await this.protocol.declineLure({ agentId, sessionId, packet });
    }

    this.emit('teleport_lure_declined', { agentId, sessionId, packet });
    console.log(`[FriendsExtended] Dispatched DeclineTeleport packet for agent: ${agentId}`);
    return packet;
  }
}
