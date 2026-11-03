import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GroupAdminCapabilityService,
  GROUP_POWERS,
  powersToBigInt,
  powersToString,
  hasPower,
  addPower,
  removePower,
  togglePower,
} from '../services/group-admin-capability-service';
import { CapabilitiesManager } from '../phase2/capabilities';
import { GroupsManager } from '../phase2/groups';
import { LLSD } from '../llsd';

describe('GroupAdminCapabilityService', () => {
  let capabilitiesManager: CapabilitiesManager;
  let groupsManager: GroupsManager;
  let service: GroupAdminCapabilityService;

  beforeEach(() => {
    capabilitiesManager = new CapabilitiesManager();
    groupsManager = new GroupsManager();
    service = new GroupAdminCapabilityService(capabilitiesManager, groupsManager);
  });

  describe('Bitmask Operations and Constants', () => {
    it('correctly converts powers between BigInt, number, string, and decimal representations', () => {
      expect(powersToBigInt(0)).toBe(0n);
      expect(powersToBigInt('123456789012345')).toBe(123456789012345n);
      expect(powersToBigInt(1024)).toBe(1024n);
      expect(powersToBigInt(null)).toBe(0n);
      expect(powersToBigInt('0x100')).toBe(256n);
      expect(powersToString(256n)).toBe('256');
    });

    it('manages bitwise powers correctly (has, add, remove, toggle)', () => {
      const inviteBit = GROUP_POWERS.MEMBER_INVITE.bit;
      const ejectBit = GROUP_POWERS.MEMBER_EJECT.bit;

      let mask = 0n;
      expect(hasPower(mask, inviteBit)).toBe(false);

      mask = addPower(mask, inviteBit);
      expect(hasPower(mask, inviteBit)).toBe(true);
      expect(hasPower(mask, ejectBit)).toBe(false);

      mask = togglePower(mask, ejectBit);
      expect(hasPower(mask, inviteBit)).toBe(true);
      expect(hasPower(mask, ejectBit)).toBe(true);

      mask = removePower(mask, inviteBit);
      expect(hasPower(mask, inviteBit)).toBe(false);
      expect(hasPower(mask, ejectBit)).toBe(true);
    });
  });

  describe('LLSD Payload Schema Validation', () => {
    it('rejects missing or invalid payloads', () => {
      expect(() => service.validatePayload('create_role', null as any)).toThrow(
        'LLSD schema validation error: payload must be a non-null object/map',
      );
      expect(() => service.validatePayload('create_role', [] as any)).toThrow(
        'LLSD schema validation error: payload must be a non-null object/map',
      );
    });

    it('rejects payloads without a valid group_id', () => {
      expect(() => service.validatePayload('create_role', { name: 'Test' } as any)).toThrow(
        'LLSD schema validation error: "group_id" must be a non-empty string',
      );
      expect(() =>
        service.validatePayload('create_role', { group_id: '   ', name: 'Test' } as any),
      ).toThrow('LLSD schema validation error: "group_id" must be a non-empty string');
    });

    it('validates create_role requires name', () => {
      expect(() => service.validatePayload('create_role', { group_id: 'grp-1', name: '' })).toThrow(
        'LLSD schema validation error: "name" is required for role creation',
      );
      expect(() =>
        service.validatePayload('create_role', { group_id: 'grp-1', name: 'Officers' }),
      ).not.toThrow();
    });

    it('validates update_role requires role_id', () => {
      expect(() => service.validatePayload('update_role', { group_id: 'grp-1' })).toThrow(
        'LLSD schema validation error: "role_id" is required for role update',
      );
      expect(() =>
        service.validatePayload('update_role', { group_id: 'grp-1', role_id: 'role-1' }),
      ).not.toThrow();
    });

    it('validates delete_role requires role_id', () => {
      expect(() => service.validatePayload('delete_role', { group_id: 'grp-1' })).toThrow(
        'LLSD schema validation error: "role_id" is required for role deletion',
      );
      expect(() =>
        service.validatePayload('delete_role', { group_id: 'grp-1', role_id: 'role-1' }),
      ).not.toThrow();
    });

    it('validates assign_roles requires member_id and array of role_ids', () => {
      expect(() => service.validatePayload('assign_roles', { group_id: 'grp-1' })).toThrow(
        'LLSD schema validation error: "member_id" is required for role assignment',
      );
      expect(() =>
        service.validatePayload('assign_roles', {
          group_id: 'grp-1',
          member_id: 'mem-1',
          role_ids: 'not-array' as any,
        }),
      ).toThrow('LLSD schema validation error: "role_ids" must be an array of role IDs');
      expect(() =>
        service.validatePayload('assign_roles', {
          group_id: 'grp-1',
          member_id: 'mem-1',
          role_ids: ['role-1'],
        }),
      ).not.toThrow();
    });

    it('validates eject_member requires member_id', () => {
      expect(() => service.validatePayload('eject_member', { group_id: 'grp-1' })).toThrow(
        'LLSD schema validation error: "member_id" is required for member ejection',
      );
      expect(() =>
        service.validatePayload('eject_member', { group_id: 'grp-1', member_id: 'mem-1' }),
      ).not.toThrow();
    });

    it('validates invite_member requires agent_id', () => {
      expect(() => service.validatePayload('invite_member', { group_id: 'grp-1' })).toThrow(
        'LLSD schema validation error: "agent_id" is required for group invitation',
      );
      expect(() =>
        service.validatePayload('invite_member', { group_id: 'grp-1', agent_id: 'agent-1' }),
      ).not.toThrow();
    });
  });

  describe('Legacy Grid Capability Guardrail', () => {
    it('throws when capability is missing on a legacy grid without UDP fallback', async () => {
      await expect(service.createRole('grp-1', { name: 'Admins' })).rejects.toThrow(
        'Group administration HTTP capability is not available on this grid circuit',
      );

      await expect(service.updateRole('grp-1', 'role-1', { name: 'Admins' })).rejects.toThrow(
        'Group administration HTTP capability is not available on this grid circuit',
      );

      await expect(service.deleteRole('grp-1', 'role-1')).rejects.toThrow(
        'Group administration HTTP capability is not available on this grid circuit',
      );

      await expect(service.assignMemberRoles('grp-1', 'mem-1', ['role-1'])).rejects.toThrow(
        'Group administration HTTP capability is not available on this grid circuit',
      );

      await expect(service.ejectMember('grp-1', 'mem-1')).rejects.toThrow(
        'Group administration HTTP capability is not available on this grid circuit',
      );

      await expect(service.inviteMember('grp-1', 'agent-1')).rejects.toThrow(
        'Group administration HTTP capability is not available on this grid circuit',
      );
    });
  });

  describe('HTTP Capability Execution & LLSD Serialization', () => {
    beforeEach(() => {
      capabilitiesManager.setCapability('GroupRoleData', 'https://grid.example.com/caps/roles');
      capabilitiesManager.setCapability('GroupMemberData', 'https://grid.example.com/caps/members');
    });

    it('serializes LLSD POST request and parses response for createRole', async () => {
      const responseLLSD =
        '<?xml version="1.0" encoding="UTF-8"?>\n<llsd><map><key>success</key><boolean>true</boolean></map></llsd>';

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(responseLLSD),
      });
      globalThis.fetch = fetchSpy;

      const roleData = {
        roleId: 'custom-role-123',
        name: 'Curators',
        title: 'Curator',
        description: 'Maintains museum exhibits',
        powers: GROUP_POWERS.NOTICES_SEND.bit,
      };

      const result = await service.createRole('grp-test-1', roleData);
      expect(result).toEqual({ success: true });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://grid.example.com/caps/roles',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/llsd+xml',
          },
        }),
      );

      const requestBody = fetchSpy.mock.calls[0][1].body;
      expect(requestBody).toContain('<llsd><map>');
      expect(requestBody).toContain('<key>action</key><string>create_role</string>');
      expect(requestBody).toContain('<key>name</key><string>Curators</string>');
      expect(requestBody).toContain('<key>role_id</key><string>custom-role-123</string>');
      expect(requestBody).toContain(
        `<key>powers</key><string>${GROUP_POWERS.NOTICES_SEND.bit.toString()}</string>`,
      );
    });

    it('handles updateRole with permission bitmask modifications', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve('<llsd><map><key>updated</key><boolean>true</boolean></map></llsd>'),
      });
      globalThis.fetch = fetchSpy;

      const newPowers = GROUP_POWERS.MEMBER_INVITE.bit | GROUP_POWERS.MEMBER_EJECT.bit;
      const res = await service.updateRole('grp-test-1', 'role-123', {
        title: 'Senior Officer',
        powers: newPowers,
      });

      expect(res).toEqual({ updated: true });
      const requestBody = fetchSpy.mock.calls[0][1].body;
      expect(requestBody).toContain('<key>action</key><string>update_role</string>');
      expect(requestBody).toContain('<key>role_id</key><string>role-123</string>');
      expect(requestBody).toContain('<key>title</key><string>Senior Officer</string>');
      expect(requestBody).toContain(`<key>powers</key><string>${newPowers.toString()}</string>`);
    });

    it('handles assignMemberRoles via capability endpoint', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve('<llsd><map><key>assigned</key><boolean>true</boolean></map></llsd>'),
      });
      globalThis.fetch = fetchSpy;

      const res = await service.assignMemberRoles('grp-test-1', 'mem-456', ['role-a', 'role-b']);
      expect(res).toEqual({ assigned: true });
      const requestBody = fetchSpy.mock.calls[0][1].body;
      expect(requestBody).toContain('<key>action</key><string>assign_roles</string>');
      expect(requestBody).toContain('<key>member_id</key><string>mem-456</string>');
      expect(requestBody).toContain(
        '<array><string>role-a</string><string>role-b</string></array>',
      );
    });

    it('handles ejectMember via capability endpoint', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve('<llsd><map><key>ejected</key><boolean>true</boolean></map></llsd>'),
      });
      globalThis.fetch = fetchSpy;

      const res = await service.ejectMember('grp-test-1', 'mem-bad-actor', {
        reason: 'Violated terms',
      });
      expect(res).toEqual({ ejected: true });
      const requestBody = fetchSpy.mock.calls[0][1].body;
      expect(requestBody).toContain('<key>action</key><string>eject_member</string>');
      expect(requestBody).toContain('<key>member_id</key><string>mem-bad-actor</string>');
      expect(requestBody).toContain('<key>reason</key><string>Violated terms</string>');
    });

    it('handles inviteMember via capability endpoint', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve('<llsd><map><key>invited</key><boolean>true</boolean></map></llsd>'),
      });
      globalThis.fetch = fetchSpy;

      const res = await service.inviteMember(
        'grp-test-1',
        'resident-new',
        ['role-welcome'],
        'Welcome to our group!',
      );
      expect(res).toEqual({ invited: true });
      const requestBody = fetchSpy.mock.calls[0][1].body;
      expect(requestBody).toContain('<key>action</key><string>invite_member</string>');
      expect(requestBody).toContain('<key>agent_id</key><string>resident-new</string>');
      expect(requestBody).toContain('<string>role-welcome</string>');
      expect(requestBody).toContain('<key>message</key><string>Welcome to our group!</string>');
    });

    it('throws error when server responds with HTTP error status', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(service.createRole('grp-test-1', { name: 'Denied' })).rejects.toThrow(
        'Group administration capability request failed with HTTP 403: Forbidden',
      );
    });
  });

  describe('Event Emission and GroupsManager Synchronization', () => {
    beforeEach(() => {
      capabilitiesManager.setCapability('GroupRoleData', 'https://grid.example.com/caps/roles');
      capabilitiesManager.setCapability('GroupMemberData', 'https://grid.example.com/caps/members');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve('<llsd><map><key>success</key><boolean>true</boolean></map></llsd>'),
      });
    });

    it('synchronizes role creation into GroupsManager and emits events', async () => {
      const serviceListener = vi.fn();
      const groupsListener = vi.fn();
      service.on('role_created', serviceListener);
      groupsManager.on('roles_updated', groupsListener);

      await service.createRole('grp-sync', {
        roleId: 'role-moderator',
        name: 'Moderators',
        title: 'Moderator',
        powers: '1024',
      });

      expect(serviceListener).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'grp-sync',
          roleId: 'role-moderator',
          roleData: expect.objectContaining({ name: 'Moderators' }),
        }),
      );

      expect(groupsListener).toHaveBeenCalled();
      const roleInManager = groupsManager.getGroupRoles('grp-sync').get('role-moderator');
      expect(roleInManager).toBeDefined();
      expect(roleInManager.name).toBe('Moderators');
      expect(roleInManager.title).toBe('Moderator');
    });

    it('synchronizes role update into GroupsManager and emits events', async () => {
      groupsManager.addGroupRole('grp-sync', 'role-dev', {
        name: 'Developers',
        title: 'Dev',
        powers: '512',
      });

      const roleUpdatedSpy = vi.fn();
      groupsManager.on('role_updated', roleUpdatedSpy);

      await service.updateRole('grp-sync', 'role-dev', {
        title: 'Lead Developer',
        powers: '2048',
      });

      expect(roleUpdatedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          groupId: 'grp-sync',
          roleId: 'role-dev',
          role: expect.objectContaining({
            title: 'Lead Developer',
            powers: '2048',
          }),
        }),
      );

      const updated = groupsManager.getGroupRoles('grp-sync').get('role-dev');
      expect(updated.title).toBe('Lead Developer');
      expect(updated.powers).toBe('2048');
    });

    it('synchronizes role deletion into GroupsManager', async () => {
      groupsManager.addGroupRole('grp-sync', 'role-obsolete', { name: 'Obsolete' });
      expect(groupsManager.getGroupRoles('grp-sync').has('role-obsolete')).toBe(true);

      const rolesUpdatedSpy = vi.fn();
      groupsManager.on('roles_updated', rolesUpdatedSpy);

      await service.deleteRole('grp-sync', 'role-obsolete');

      expect(groupsManager.getGroupRoles('grp-sync').has('role-obsolete')).toBe(false);
      expect(rolesUpdatedSpy).toHaveBeenCalled();
    });

    it('synchronizes member role assignment into GroupsManager', async () => {
      groupsManager.addGroupMember('grp-sync', 'mem-assign', {
        title: 'Member',
        powers: 0,
      });

      const memberRolesSpy = vi.fn();
      groupsManager.on('member_roles_updated', memberRolesSpy);

      await service.assignMemberRoles('grp-sync', 'mem-assign', ['role-officer', 'role-mod']);

      expect(memberRolesSpy).toHaveBeenCalledWith({
        groupId: 'grp-sync',
        memberId: 'mem-assign',
        roleIds: ['role-officer', 'role-mod'],
      });

      const member = groupsManager.getGroupMembers('grp-sync').get('mem-assign');
      expect(member.roleIds).toEqual(['role-officer', 'role-mod']);
    });

    it('synchronizes member ejection into GroupsManager', async () => {
      groupsManager.addGroupMember('grp-sync', 'mem-eject-target', {
        title: 'Member',
      });
      expect(groupsManager.getGroupMembers('grp-sync').has('mem-eject-target')).toBe(true);

      const ejectSpy = vi.fn();
      const membersUpdatedSpy = vi.fn();
      groupsManager.on('member_ejected', ejectSpy);
      groupsManager.on('members_updated', membersUpdatedSpy);

      await service.ejectMember('grp-sync', 'mem-eject-target');

      expect(groupsManager.getGroupMembers('grp-sync').has('mem-eject-target')).toBe(false);
      expect(ejectSpy).toHaveBeenCalledWith({
        groupId: 'grp-sync',
        memberId: 'mem-eject-target',
      });
      expect(membersUpdatedSpy).toHaveBeenCalled();
    });
  });
});
