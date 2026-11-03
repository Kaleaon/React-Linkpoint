/**
 * Linkpoint PWA - Group Administration HTTP Capability Service
 *
 * Implements administrative group actions (role creation, updates, permissions bitmask controls,
 * member role assignments, ejection, and invitations) via Second Life HTTP capability endpoints.
 * All requests serialize LLSD maps and validate schemas prior to transmission.
 */

import { Utils } from '../utils';
import { LLSD } from '../llsd';
import type { CapabilitiesManager } from '../phase2/capabilities';
import type { GroupsManager } from '../phase2/groups';

export type AdminActionType =
  'create_role' | 'update_role' | 'delete_role' | 'assign_roles' | 'eject_member' | 'invite_member';

export interface GroupPowerDef {
  key: string;
  bit: bigint;
  name: string;
  desc: string;
}

/** Standard Second Life 64-bit Group Powers */
export const GROUP_POWERS: Record<string, GroupPowerDef> = {
  MEMBER_INVITE: {
    key: 'MEMBER_INVITE',
    bit: 1n << 1n,
    name: 'Invite Members',
    desc: 'Invite new residents to join the group',
  },
  MEMBER_EJECT: {
    key: 'MEMBER_EJECT',
    bit: 1n << 2n,
    name: 'Eject Members',
    desc: 'Remove members from the group',
  },
  MEMBER_OPTIONS: {
    key: 'MEMBER_OPTIONS',
    bit: 1n << 3n,
    name: 'Toggle Enrollment / Fee',
    desc: 'Change open enrollment and fee settings',
  },
  ROLE_CREATE: {
    key: 'ROLE_CREATE',
    bit: 1n << 4n,
    name: 'Create Roles',
    desc: 'Create new custom roles in the group',
  },
  ROLE_DELETE: {
    key: 'ROLE_DELETE',
    bit: 1n << 5n,
    name: 'Delete Roles',
    desc: 'Delete non-default roles from the group',
  },
  ROLE_PROPERTIES: {
    key: 'ROLE_PROPERTIES',
    bit: 1n << 6n,
    name: 'Change Role Properties',
    desc: 'Change role name, title, and description',
  },
  ROLE_ASSIGN_MEMBER_LIMITED: {
    key: 'ROLE_ASSIGN_MEMBER_LIMITED',
    bit: 1n << 7n,
    name: 'Assign Limited Roles',
    desc: 'Assign members to roles with lower powers',
  },
  ROLE_ASSIGN_MEMBER: {
    key: 'ROLE_ASSIGN_MEMBER',
    bit: 1n << 8n,
    name: 'Assign Any Role',
    desc: 'Assign members to any role in the group',
  },
  ROLE_REMOVE_MEMBER: {
    key: 'ROLE_REMOVE_MEMBER',
    bit: 1n << 9n,
    name: 'Remove Role Members',
    desc: 'Remove members from assigned roles',
  },
  ROLE_CHANGE_ACTIONS: {
    key: 'ROLE_CHANGE_ACTIONS',
    bit: 1n << 10n,
    name: 'Change Role Powers',
    desc: 'Modify permission bitmask assignments for roles',
  },
  ACCOUNTING_VIEW: {
    key: 'ACCOUNTING_VIEW',
    bit: 1n << 11n,
    name: 'View Group Accounting',
    desc: 'View group financials and transaction records',
  },
  NOTICES_SEND: {
    key: 'NOTICES_SEND',
    bit: 1n << 14n,
    name: 'Send Group Notices',
    desc: 'Publish group notices to all members',
  },
  NOTICES_RECEIVE: {
    key: 'NOTICES_RECEIVE',
    bit: 1n << 15n,
    name: 'Receive Notices',
    desc: 'Receive notices sent to this group',
  },
  GROUP_PROPOSALS_VIEW: {
    key: 'GROUP_PROPOSALS_VIEW',
    bit: 1n << 16n,
    name: 'View Proposals',
    desc: 'View active group proposals and voting items',
  },
  GROUP_PROPOSALS_VOTE: {
    key: 'GROUP_PROPOSALS_VOTE',
    bit: 1n << 17n,
    name: 'Vote on Proposals',
    desc: 'Cast votes on group proposals',
  },
  LAND_DEED: {
    key: 'LAND_DEED',
    bit: 1n << 18n,
    name: 'Deed Land',
    desc: 'Deed parcels and land to group',
  },
  LAND_RELEASE: {
    key: 'LAND_RELEASE',
    bit: 1n << 19n,
    name: 'Release Land',
    desc: 'Abandon or sell deeded group land',
  },
};

/**
 * Safely converts string, number, or BigInt power representation to BigInt
 */
export function powersToBigInt(powers: bigint | string | number | undefined | null): bigint {
  if (typeof powers === 'bigint') return powers;
  if (!powers && powers !== 0) return 0n;
  try {
    if (typeof powers === 'number') return BigInt(Math.floor(powers));
    const str = String(powers).trim();
    if (str.startsWith('0x') || str.startsWith('0X')) {
      return BigInt(str);
    }
    return BigInt(str);
  } catch {
    return 0n;
  }
}

/**
 * Converts BigInt powers to decimal string representation for LLSD transport
 */
export function powersToString(powers: bigint | string | number | undefined | null): string {
  return powersToBigInt(powers).toString(10);
}

/**
 * Check if a power bit is enabled
 */
export function hasPower(
  powers: bigint | string | number | undefined | null,
  bit: bigint,
): boolean {
  const mask = powersToBigInt(powers);
  return (mask & bit) === bit;
}

/**
 * Add a power bit
 */
export function addPower(powers: bigint | string | number | undefined | null, bit: bigint): bigint {
  return powersToBigInt(powers) | bit;
}

/**
 * Remove a power bit
 */
export function removePower(
  powers: bigint | string | number | undefined | null,
  bit: bigint,
): bigint {
  return powersToBigInt(powers) & ~bit;
}

/**
 * Toggle a power bit
 */
export function togglePower(
  powers: bigint | string | number | undefined | null,
  bit: bigint,
): bigint {
  return powersToBigInt(powers) ^ bit;
}

export interface RolePayloadData {
  roleId?: string;
  name: string;
  title?: string;
  description?: string;
  powers?: bigint | string | number;
}

export interface RoleUpdateData {
  name?: string;
  title?: string;
  description?: string;
  powers?: bigint | string | number;
}

export class GroupAdminCapabilityService extends Utils.EventEmitter {
  private capabilitiesManager?: CapabilitiesManager;
  private groupsManager?: GroupsManager;
  private requestTimeoutMs: number;

  constructor(
    capabilitiesManager?: CapabilitiesManager,
    groupsManager?: GroupsManager,
    options: { requestTimeoutMs?: number } = {},
  ) {
    super();
    this.capabilitiesManager = capabilitiesManager;
    this.groupsManager = groupsManager;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 15000;

    if (this.groupsManager) {
      this.attachGroupsManager(this.groupsManager);
    }
  }

  setCapabilitiesManager(capabilitiesManager: CapabilitiesManager): void {
    this.capabilitiesManager = capabilitiesManager;
  }

  setGroupsManager(groupsManager: GroupsManager): void {
    this.groupsManager = groupsManager;
    this.attachGroupsManager(groupsManager);
  }

  /**
   * Synchronize administrative events directly into GroupsManager local state cache
   */
  attachGroupsManager(groupsManager: GroupsManager): void {
    this.groupsManager = groupsManager;

    this.on('role_created', ({ groupId, roleId, roleData }: any) => {
      if (typeof (this.groupsManager as any)?.updateGroupRole === 'function') {
        (this.groupsManager as any).updateGroupRole(groupId, roleId, { id: roleId, ...roleData });
      } else {
        this.groupsManager?.addGroupRole(groupId, roleId, roleData);
      }
    });

    this.on('role_updated', ({ groupId, roleId, updates }: any) => {
      if (typeof (this.groupsManager as any)?.updateGroupRole === 'function') {
        (this.groupsManager as any).updateGroupRole(groupId, roleId, updates);
      }
    });

    this.on('role_deleted', ({ groupId, roleId }: any) => {
      if (typeof (this.groupsManager as any)?.removeGroupRole === 'function') {
        (this.groupsManager as any).removeGroupRole(groupId, roleId);
      }
    });

    this.on('role_assigned', ({ groupId, memberId, roleIds }: any) => {
      if (typeof (this.groupsManager as any)?.updateMemberRoles === 'function') {
        (this.groupsManager as any).updateMemberRoles(groupId, memberId, roleIds);
      }
    });

    this.on('member_ejected', ({ groupId, memberId }: any) => {
      if (typeof (this.groupsManager as any)?.ejectGroupMember === 'function') {
        (this.groupsManager as any).ejectGroupMember(groupId, memberId);
      }
    });
  }

  /**
   * Resolves the capability URL from candidate capability names
   */
  resolveCapabilityUrl(candidateNames: string[]): string | null {
    if (!this.capabilitiesManager) return null;
    for (const name of candidateNames) {
      const url = this.capabilitiesManager.resolveCapability(name);
      if (url) return url;
    }
    return null;
  }

  /**
   * Checks whether the required capability is available
   */
  hasCapability(action: AdminActionType): boolean {
    const candidates = this.getCandidateCapabilityNames(action);
    return Boolean(this.resolveCapabilityUrl(candidates));
  }

  private getCandidateCapabilityNames(action: AdminActionType): string[] {
    switch (action) {
      case 'create_role':
      case 'update_role':
      case 'delete_role':
        return ['GroupRoleData', 'GroupRoleChanges', 'GroupRoles', 'GroupAdmin'];
      case 'assign_roles':
        return [
          'GroupMemberData',
          'GroupMemberRoles',
          'GroupRoleChanges',
          'GroupRoles',
          'GroupAdmin',
        ];
      case 'eject_member':
        return [
          'GroupMemberData',
          'GroupMemberEject',
          'GroupEject',
          'EjectGroupMember',
          'GroupAdmin',
        ];
      case 'invite_member':
        return [
          'GroupMemberData',
          'GroupInvitation',
          'SendGroupInvitation',
          'GroupInvite',
          'GroupAdmin',
        ];
      default:
        return ['GroupAdmin'];
    }
  }

  /**
   * Validates the schema of an LLSD map payload prior to transmission
   */
  validatePayload(action: AdminActionType, payload: Record<string, any>): void {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('LLSD schema validation error: payload must be a non-null object/map');
    }

    if (!payload.group_id || typeof payload.group_id !== 'string' || !payload.group_id.trim()) {
      throw new Error('LLSD schema validation error: "group_id" must be a non-empty string');
    }

    switch (action) {
      case 'create_role': {
        if (!payload.name || typeof payload.name !== 'string' || !payload.name.trim()) {
          throw new Error('LLSD schema validation error: "name" is required for role creation');
        }
        if (payload.role_id !== undefined && typeof payload.role_id !== 'string') {
          throw new Error('LLSD schema validation error: "role_id" must be a string');
        }
        break;
      }
      case 'update_role': {
        if (!payload.role_id || typeof payload.role_id !== 'string' || !payload.role_id.trim()) {
          throw new Error('LLSD schema validation error: "role_id" is required for role update');
        }
        break;
      }
      case 'delete_role': {
        if (!payload.role_id || typeof payload.role_id !== 'string' || !payload.role_id.trim()) {
          throw new Error('LLSD schema validation error: "role_id" is required for role deletion');
        }
        break;
      }
      case 'assign_roles': {
        if (
          !payload.member_id ||
          typeof payload.member_id !== 'string' ||
          !payload.member_id.trim()
        ) {
          throw new Error(
            'LLSD schema validation error: "member_id" is required for role assignment',
          );
        }
        if (!Array.isArray(payload.role_ids)) {
          throw new Error('LLSD schema validation error: "role_ids" must be an array of role IDs');
        }
        break;
      }
      case 'eject_member': {
        if (
          !payload.member_id ||
          typeof payload.member_id !== 'string' ||
          !payload.member_id.trim()
        ) {
          throw new Error(
            'LLSD schema validation error: "member_id" is required for member ejection',
          );
        }
        break;
      }
      case 'invite_member': {
        if (!payload.agent_id || typeof payload.agent_id !== 'string' || !payload.agent_id.trim()) {
          throw new Error(
            'LLSD schema validation error: "agent_id" is required for group invitation',
          );
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Executes HTTP capability POST request using LLSD XML serialization
   */
  async executeCapabilityRequest(
    action: AdminActionType,
    payload: Record<string, any>,
    options: { capabilityUrl?: string } = {},
  ): Promise<any> {
    const candidateNames = this.getCandidateCapabilityNames(action);
    const url = options.capabilityUrl || this.resolveCapabilityUrl(candidateNames);

    if (!url) {
      throw new Error('Group administration HTTP capability is not available on this grid circuit');
    }

    // 1. Schema Validation
    this.validatePayload(action, payload);

    // 2. Build LLSD XML Payload
    const xmlBody = LLSD.buildXML(payload);

    // 3. Dispatch HTTP capability request
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this.requestTimeoutMs)
      : null;

    let response: Response;
    try {
      if (
        this.capabilitiesManager &&
        typeof this.capabilitiesManager.fetchWithRetry === 'function'
      ) {
        response = await this.capabilitiesManager.fetchWithRetry(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/llsd+xml',
          },
          body: xmlBody,
          signal: controller?.signal,
        });
      } else {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/llsd+xml',
          },
          body: xmlBody,
          signal: controller?.signal,
        });
      }
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new Error(
          `Group administration capability request timed out after ${this.requestTimeoutMs / 1000}s`,
        );
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        `Group administration capability request failed with HTTP ${response.status}: ${response.statusText}`,
      );
    }

    // 4. Parse LLSD response
    const rawText = await response.text();
    let parsedResult: any = { success: true };

    if (rawText && rawText.trim()) {
      const trimmed = rawText.trim();
      if (trimmed.startsWith('<llsd') || trimmed.startsWith('<?xml')) {
        try {
          parsedResult = LLSD.parseXML(trimmed);
        } catch (parseErr) {
          console.warn('[GroupAdmin] XML parse warning:', parseErr);
          parsedResult = { success: true, raw: trimmed };
        }
      } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          parsedResult = JSON.parse(trimmed);
        } catch {
          parsedResult = { success: true, raw: trimmed };
        }
      }
    }

    return parsedResult;
  }

  /**
   * Create a new role in the group
   */
  async createRole(
    groupId: string,
    roleData: RolePayloadData,
    options: { capabilityUrl?: string } = {},
  ): Promise<any> {
    const roleId = roleData.roleId || Utils.generateUUID();
    const payload = {
      action: 'create_role',
      group_id: groupId,
      role_id: roleId,
      name: roleData.name,
      title: roleData.title || '',
      description: roleData.description || '',
      powers: powersToString(roleData.powers ?? 0n),
    };

    const result = await this.executeCapabilityRequest('create_role', payload, options);

    const emittedData = {
      groupId,
      roleId,
      roleData: {
        id: roleId,
        name: roleData.name,
        title: roleData.title || '',
        description: roleData.description || '',
        powers: powersToString(roleData.powers ?? 0n),
      },
      response: result,
    };

    this.emit('role_created', emittedData);
    this.emit('admin_action_success', { action: 'create_role', ...emittedData });
    return result;
  }

  /**
   * Update an existing role in the group (name, title, description, and permission bitmask)
   */
  async updateRole(
    groupId: string,
    roleId: string,
    roleData: RoleUpdateData,
    options: { capabilityUrl?: string } = {},
  ): Promise<any> {
    const payload: Record<string, any> = {
      action: 'update_role',
      group_id: groupId,
      role_id: roleId,
    };

    if (roleData.name !== undefined) payload.name = roleData.name;
    if (roleData.title !== undefined) payload.title = roleData.title;
    if (roleData.description !== undefined) payload.description = roleData.description;
    if (roleData.powers !== undefined) payload.powers = powersToString(roleData.powers);

    const result = await this.executeCapabilityRequest('update_role', payload, options);

    const emittedData = {
      groupId,
      roleId,
      updates: {
        ...(roleData.name !== undefined ? { name: roleData.name } : {}),
        ...(roleData.title !== undefined ? { title: roleData.title } : {}),
        ...(roleData.description !== undefined ? { description: roleData.description } : {}),
        ...(roleData.powers !== undefined ? { powers: powersToString(roleData.powers) } : {}),
      },
      response: result,
    };

    this.emit('role_updated', emittedData);
    this.emit('admin_action_success', { action: 'update_role', ...emittedData });
    return result;
  }

  /**
   * Delete a role from the group
   */
  async deleteRole(
    groupId: string,
    roleId: string,
    options: { capabilityUrl?: string } = {},
  ): Promise<any> {
    const payload = {
      action: 'delete_role',
      group_id: groupId,
      role_id: roleId,
    };

    const result = await this.executeCapabilityRequest('delete_role', payload, options);

    const emittedData = {
      groupId,
      roleId,
      response: result,
    };

    this.emit('role_deleted', emittedData);
    this.emit('admin_action_success', { action: 'delete_role', ...emittedData });
    return result;
  }

  /**
   * Assign or replace roles for a group member
   */
  async assignMemberRoles(
    groupId: string,
    memberId: string,
    roleIds: string[],
    options: { capabilityUrl?: string } = {},
  ): Promise<any> {
    const payload = {
      action: 'assign_roles',
      group_id: groupId,
      member_id: memberId,
      role_ids: roleIds,
    };

    const result = await this.executeCapabilityRequest('assign_roles', payload, options);

    const emittedData = {
      groupId,
      memberId,
      roleIds,
      response: result,
    };

    this.emit('role_assigned', emittedData);
    this.emit('admin_action_success', { action: 'assign_roles', ...emittedData });
    return result;
  }

  /**
   * Eject a member from the group
   */
  async ejectMember(
    groupId: string,
    memberId: string,
    options: { reason?: string; capabilityUrl?: string } = {},
  ): Promise<any> {
    const payload = {
      action: 'eject_member',
      group_id: groupId,
      member_id: memberId,
      reason: options.reason || '',
    };

    const result = await this.executeCapabilityRequest('eject_member', payload, options);

    const emittedData = {
      groupId,
      memberId,
      reason: options.reason || '',
      response: result,
    };

    this.emit('member_ejected', emittedData);
    this.emit('admin_action_success', { action: 'eject_member', ...emittedData });
    return result;
  }

  /**
   * Send a group invitation to a resident
   */
  async inviteMember(
    groupId: string,
    agentId: string,
    roleIds: string[] = [],
    message: string = '',
    options: { capabilityUrl?: string } = {},
  ): Promise<any> {
    const payload = {
      action: 'invite_member',
      group_id: groupId,
      agent_id: agentId,
      role_ids: roleIds,
      message: message || 'You have been invited to join the group',
    };

    const result = await this.executeCapabilityRequest('invite_member', payload, options);

    const emittedData = {
      groupId,
      agentId,
      roleIds,
      message,
      response: result,
    };

    this.emit('invitation_sent', emittedData);
    this.emit('admin_action_success', { action: 'invite_member', ...emittedData });
    return result;
  }
}
