import { createRequire } from 'node:module';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { app } from '../app';
import { slBridge } from '../sl-bridge';
import { Utils } from '../utils';
import { GROUP_POWERS, parseGroupPowers, hasGroupPower } from '../phase2/groups';
import {
  GroupsScreen,
  InviteMemberModal,
  EjectConfirmModal,
  EditMemberRolesModal,
  sanitizeModerationError,
} from '../../screens/LiveScreens.jsx';
import { mountScreen, unmount, click, buttonByText, flush } from './ui-helpers';

const { METHODS, callViewer } = createRequire(import.meta.url)('../../../core/viewer-api.cjs');
const { ViewerSession } = createRequire(import.meta.url)('../../../core/viewer-session.cjs');

describe('Group Moderation RPC Protocol Pipeline & In-Client UI Controls', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    app.groups.replaceGroups([]);
    app.groups.clearActiveGroup();
  });

  describe('Requirement 1 & 2: Backend RPC Registration & Security Table', () => {
    it('registers group moderation RPC methods in viewer-api.cjs METHODS whitelist', () => {
      expect(METHODS.has('inviteGroupMember')).toBe(true);
      expect(METHODS.has('ejectGroupMember')).toBe(true);
      expect(METHODS.has('modifyGroupRole')).toBe(true);
    });

    it('ensures ViewerSession defines valid handler functions for all moderation RPCs', () => {
      const session = new ViewerSession(() => undefined);
      expect(typeof session.inviteGroupMember).toBe('function');
      expect(typeof session.ejectGroupMember).toBe('function');
      expect(typeof session.modifyGroupRole).toBe('function');
    });

    it('rejects unlisted internal or forbidden method execution', async () => {
      const session = new ViewerSession(() => undefined);
      await expect(callViewer(session, 'eval', {})).rejects.toThrow(/Unknown viewer call/);
      await expect(callViewer(session, 'requireBot', {})).rejects.toThrow(/Unknown viewer call/);
    });
  });

  describe('Requirement 3 & 4: Packet Dispatch & UDP Buffer Batching in ViewerSession', () => {
    const testAgentId = '11111111-1111-1111-1111-111111111111';
    const testSessionId = '22222222-2222-2222-2222-222222222222';
    const testGroupId = '33333333-3333-3333-3333-333333333333';
    const testInviteeId = '44444444-4444-4444-4444-444444444444';
    const testRoleId = '55555555-5555-5555-5555-555555555555';

    function setupMockSession() {
      const sentEvents: any[] = [];
      const session = new ViewerSession((type: string, data: any) =>
        sentEvents.push({ type, data }),
      );
      const sendMessageMock = vi.fn();
      session.bot = {
        agent: { agentID: { toString: () => testAgentId } },
      };
      session.identity = { agentId: testAgentId };
      vi.spyOn(session, 'currentRegion').mockReturnValue({
        circuit: {
          sessionID: { toString: () => testSessionId },
          sendMessage: sendMessageMock,
        },
      });
      return { session, sendMessageMock, sentEvents };
    }

    it('dispatches InviteGroupRequestMessage with reliable flag and emits group_member_invited', async () => {
      const { session, sendMessageMock, sentEvents } = setupMockSession();

      const result = await callViewer(session, 'inviteGroupMember', {
        groupId: testGroupId,
        avatarId: testInviteeId,
        roleId: testRoleId,
      });

      expect(result).toEqual({
        success: true,
        groupId: testGroupId,
        avatarId: testInviteeId,
        roleId: testRoleId,
      });

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const [msg, flags] = sendMessageMock.mock.calls[0];
      expect(msg.name).toBe('InviteGroupRequest');
      expect(flags).toBe(64); // PacketFlags.Reliable = 0x40
      expect(msg.AgentData.AgentID.toString()).toBe(testAgentId);
      expect(msg.AgentData.SessionID.toString()).toBe(testSessionId);
      expect(msg.GroupData.GroupID.toString()).toBe(testGroupId);
      expect(msg.InviteData[0].InviteeID.toString()).toBe(testInviteeId);
      expect(msg.InviteData[0].RoleID.toString()).toBe(testRoleId);

      expect(sentEvents).toContainEqual({
        type: 'group_member_invited',
        data: {
          groupId: testGroupId,
          avatarId: testInviteeId,
          roleId: testRoleId,
        },
      });
    });

    it('dispatches EjectGroupMemberRequestMessage with reliable flag and emits group_member_ejected', async () => {
      const { session, sendMessageMock, sentEvents } = setupMockSession();

      const result = await callViewer(session, 'ejectGroupMember', {
        groupId: testGroupId,
        memberId: testInviteeId,
      });

      expect(result).toEqual({
        success: true,
        groupId: testGroupId,
        memberId: testInviteeId,
      });

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const [msg, flags] = sendMessageMock.mock.calls[0];
      expect(msg.name).toBe('EjectGroupMemberRequest');
      expect(flags).toBe(64); // PacketFlags.Reliable = 0x40
      expect(msg.AgentData.AgentID.toString()).toBe(testAgentId);
      expect(msg.AgentData.SessionID.toString()).toBe(testSessionId);
      expect(msg.GroupData.GroupID.toString()).toBe(testGroupId);
      expect(msg.EjectData[0].EjecteeID.toString()).toBe(testInviteeId);

      expect(sentEvents).toContainEqual({
        type: 'group_member_ejected',
        data: {
          groupId: testGroupId,
          memberId: testInviteeId,
        },
      });
    });

    it('dispatches GroupRoleChangesMessage with single change', async () => {
      const { session, sendMessageMock, sentEvents } = setupMockSession();

      const result = await callViewer(session, 'modifyGroupRole', {
        groupId: testGroupId,
        roleId: testRoleId,
        memberId: testInviteeId,
        change: 0,
      });

      expect(result.success).toBe(true);
      expect(result.groupId).toBe(testGroupId);
      expect(result.changes.length).toBe(1);

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const [msg, flags] = sendMessageMock.mock.calls[0];
      expect(msg.name).toBe('GroupRoleChanges');
      expect(flags).toBe(64); // PacketFlags.Reliable = 0x40
      expect(msg.AgentData.AgentID.toString()).toBe(testAgentId);
      expect(msg.AgentData.GroupID.toString()).toBe(testGroupId);
      expect(msg.RoleChange.length).toBe(1);
      expect(msg.RoleChange[0].RoleID.toString()).toBe(testRoleId);
      expect(msg.RoleChange[0].MemberID.toString()).toBe(testInviteeId);
      expect(msg.RoleChange[0].Change).toBe(0);

      expect(sentEvents).toContainEqual({
        type: 'group_roles_modified',
        data: {
          groupId: testGroupId,
          changes: [
            {
              roleId: testRoleId,
              memberId: testInviteeId,
              change: 0,
            },
          ],
        },
      });
    });

    it('batches bulk role changes exceeding 100 items into sequential chunks of <= 100', async () => {
      const { session, sendMessageMock } = setupMockSession();

      // Create 235 bulk role changes (e.g., assigning a role to 235 members)
      const bulkChanges = Array.from({ length: 235 }, (_, i) => {
        const hex = i.toString(16).padStart(12, '0');
        return {
          roleId: testRoleId,
          memberId: `00000000-0000-0000-0000-${hex}`,
          change: 0,
        };
      });

      const result = await callViewer(session, 'modifyGroupRole', {
        groupId: testGroupId,
        changes: bulkChanges,
      });

      expect(result.changes.length).toBe(235);
      // 235 items with chunk limit of 100 should result in 3 packets: 100 + 100 + 35
      expect(sendMessageMock).toHaveBeenCalledTimes(3);

      const [batch1] = sendMessageMock.mock.calls[0];
      const [batch2] = sendMessageMock.mock.calls[1];
      const [batch3] = sendMessageMock.mock.calls[2];

      expect(batch1.RoleChange.length).toBe(100);
      expect(batch2.RoleChange.length).toBe(100);
      expect(batch3.RoleChange.length).toBe(35);
    });

    it('rejects invalid UUID formats before packet construction', async () => {
      const { session } = setupMockSession();

      await expect(
        callViewer(session, 'inviteGroupMember', {
          groupId: 'not-a-valid-uuid',
          avatarId: testInviteeId,
        }),
      ).rejects.toThrow(/Invalid group ID format/);

      await expect(
        callViewer(session, 'ejectGroupMember', {
          groupId: testGroupId,
          memberId: 'not-a-valid-uuid',
        }),
      ).rejects.toThrow(/Invalid member ID format/);

      await expect(
        callViewer(session, 'modifyGroupRole', {
          groupId: testGroupId,
          roleId: 'invalid-role',
          memberId: testInviteeId,
        }),
      ).rejects.toThrow(/Invalid role ID format/);
    });
  });

  describe('Requirement 5: Bitmask Power Helpers & GroupsManager State Synchronization', () => {
    it('evaluates BigInt group power bitmasks correctly', () => {
      expect(GROUP_POWERS.Invite).toBe(2n);
      expect(GROUP_POWERS.Eject).toBe(4n);
      expect(GROUP_POWERS.AssignMemberLimited).toBe(128n);
      expect(GROUP_POWERS.AssignMember).toBe(256n);

      // Stringified BigInt from simulator (e.g. '6' = Invite (2) + Eject (4))
      expect(hasGroupPower('6', GROUP_POWERS.Invite)).toBe(true);
      expect(hasGroupPower('6', GROUP_POWERS.Eject)).toBe(true);
      expect(hasGroupPower('6', GROUP_POWERS.AssignMember)).toBe(false);

      // All powers (Owner)
      expect(hasGroupPower(GROUP_POWERS.All, GROUP_POWERS.Invite)).toBe(true);
      expect(hasGroupPower(GROUP_POWERS.All, GROUP_POWERS.Eject)).toBe(true);
      expect(hasGroupPower('-1', GROUP_POWERS.Invite)).toBe(true);
    });

    it('parses invalid power strings gracefully without throwing', () => {
      expect(parseGroupPowers('')).toBe(0n);
      expect(parseGroupPowers('not-a-number')).toBe(0n);
      expect(parseGroupPowers(null)).toBe(0n);
      expect(parseGroupPowers(undefined)).toBe(0n);
      expect(parseGroupPowers(100)).toBe(100n);
    });

    it('GroupsManager removeGroupMember removes member from group and associated role caches', () => {
      const groupId = '11111111-0000-0000-0000-000000000000';
      const memberId = '22222222-0000-0000-0000-000000000000';
      const roleId = '33333333-0000-0000-0000-000000000000';

      app.groups.addGroupMember(groupId, memberId, { name: 'Target Avatar' });
      app.groups.replaceRoles(groupId, [
        { id: roleId, name: 'Officer', members: [memberId, 'other-member'] },
      ]);

      expect(app.groups.getGroupMembers(groupId).has(memberId)).toBe(true);

      const removed = app.groups.removeGroupMember(groupId, memberId);
      expect(removed).toBe(true);
      expect(app.groups.getGroupMembers(groupId).has(memberId)).toBe(false);

      const roles = Array.from(app.groups.getGroupRoles(groupId).values());
      expect(roles[0].members).toEqual(['other-member']);
    });

    it('app.ejectGroupMember invokes bridge and cleans up local store', async () => {
      vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
      const groupId = '11111111-1111-1111-1111-111111111111';
      const memberId = '22222222-2222-2222-2222-222222222222';

      app.groups.addGroupMember(groupId, memberId, { name: 'Eject Target' });
      const bridgeSpy = vi.spyOn(slBridge, 'ejectGroupMember').mockResolvedValue({
        success: true,
        groupId,
        memberId,
      });

      const memberRemovedSpy = vi.fn();
      app.groups.on('member_removed', memberRemovedSpy);

      await app.ejectGroupMember(groupId, memberId);

      expect(bridgeSpy).toHaveBeenCalledWith({ groupId, memberId });
      expect(app.groups.getGroupMembers(groupId).has(memberId)).toBe(false);
      expect(memberRemovedSpy).toHaveBeenCalledWith({ groupId, memberId });
    });
  });

  describe('Requirement 6: Error Sanitization and Live Region Screen Reader Announcements', () => {
    it('sanitizes raw network and UUID protocol errors to friendly user messages', () => {
      expect(sanitizeModerationError(new Error('Invalid group ID format: not-a-uuid'))).toMatch(
        /Invalid avatar ID format/,
      );
      expect(sanitizeModerationError('Circuit not connected')).toMatch(
        /Simulator connection unavailable/,
      );
      expect(sanitizeModerationError('Permission denied: lacking powers')).toMatch(
        /do not have the required group powers/,
      );
      expect(sanitizeModerationError('Packet buffer overflow 0x0023')).toMatch(
        /Simulator protocol error occurred/,
      );
      expect(sanitizeModerationError(null, 'Custom fallback')).toBe('Custom fallback');
    });

    it('Utils.showToast dispatches live region announcements with appropriate politeness', () => {
      const announceSpy = vi.spyOn(Utils, 'showToast');

      Utils.showToast('Invitation dispatched', 'success');
      expect(announceSpy).toHaveBeenCalledWith('Invitation dispatched', 'success');

      Utils.showToast('Ejection failed', 'error');
      expect(announceSpy).toHaveBeenCalledWith('Ejection failed', 'error');
    });
  });

  describe('Requirement 7 & 8: UI Modal Dialogs, Confirmation Guardrails, and Permission Badging', () => {
    const testThemeV = {
      pri: '#6366f1',
      onpri: '#ffffff',
      priC: 'rgba(99, 102, 241, 0.15)',
      onpriC: '#6366f1',
      bg: '#18181b',
      surf: '#27272a',
      outv: '#3f3f46',
      ink: '#f4f4f5',
      ink2: '#a1a1aa',
      err: '#ef4444',
      rs: '6px',
    };
    const testThemeT = { font: 'sans-serif' };

    it('renders InviteMemberModal with role="dialog", FocusTrap, and handles invitation submission', async () => {
      const inviteSpy = vi.spyOn(app, 'inviteGroupMember').mockResolvedValue({
        success: true,
        groupId: '11111111-1111-1111-1111-111111111111',
        avatarId: '22222222-2222-2222-2222-222222222222',
        roleId: 'role-1',
      });
      const onInviteSuccess = vi.fn();
      const onClose = vi.fn();

      const roles = [{ id: 'role-1', name: 'Scout' }];

      const mounted = await mountScreen(() => (
        <InviteMemberModal
          isOpen={true}
          onClose={onClose}
          groupId="11111111-1111-1111-1111-111111111111"
          groupName="Space Explorers"
          roles={roles}
          onInviteSuccess={onInviteSuccess}
          V={testThemeV}
          t={testThemeT}
        />
      ));
      await flush();

      const dialog = mounted.host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.getAttribute('aria-labelledby')).toBe('invite-member-dialog-title');

      const avatarInput = mounted.host.querySelector('#invite-avatar-id') as HTMLInputElement;
      expect(avatarInput).not.toBeNull();

      // Enter valid UUID
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(avatarInput, '22222222-2222-2222-2222-222222222222');
        avatarInput.dispatchEvent(new Event('input', { bubbles: true }));
        avatarInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      const form = mounted.host.querySelector('form')!;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await flush();

      expect(inviteSpy).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        undefined,
      );
      expect(onInviteSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();

      await unmount(mounted);
    });

    it('renders EjectConfirmModal with destructive action confirmation guardrail (WCAG 2.2 SC 3.3.4)', async () => {
      const ejectSpy = vi.spyOn(app, 'ejectGroupMember').mockResolvedValue({
        success: true,
        groupId: '11111111-1111-1111-1111-111111111111',
        memberId: '22222222-2222-2222-2222-222222222222',
      });
      const onEjectSuccess = vi.fn();
      const onClose = vi.fn();

      const member = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Griefer Avatar',
      };

      const mounted = await mountScreen(() => (
        <EjectConfirmModal
          isOpen={true}
          onClose={onClose}
          groupId="11111111-1111-1111-1111-111111111111"
          groupName="Builders Guild"
          member={member}
          onEjectSuccess={onEjectSuccess}
          V={testThemeV}
          t={testThemeT}
        />
      ));
      await flush();

      const dialog = mounted.host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.textContent).toContain('Confirm Member Ejection');
      expect(dialog?.textContent).toContain('Griefer Avatar');

      const confirmBtn = buttonByText(mounted.host, /Confirm Eject/i);
      expect(confirmBtn).toBeDefined();

      await click(confirmBtn);
      await flush();

      expect(ejectSpy).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', member.id);
      expect(onEjectSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();

      await unmount(mounted);
    });

    it('renders EditMemberRolesModal and saves toggled role changes', async () => {
      const modifyRoleSpy = vi.spyOn(app, 'modifyGroupRole').mockResolvedValue({
        success: true,
        groupId: '11111111-1111-1111-1111-111111111111',
        roleId: 'role-officer',
        memberId: '22222222-2222-2222-2222-222222222222',
        change: 'add',
      });
      const onRolesSuccess = vi.fn();
      const onClose = vi.fn();

      const member = {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Cadet Avatar',
        roles: ['role-everyone'],
      };
      const roles = [
        { id: 'role-everyone', name: 'Everyone' },
        { id: 'role-officer', name: 'Officer' },
      ];

      const mounted = await mountScreen(() => (
        <EditMemberRolesModal
          isOpen={true}
          onClose={onClose}
          groupId="11111111-1111-1111-1111-111111111111"
          groupName="Fleet Command"
          member={member}
          roles={roles}
          onRolesSuccess={onRolesSuccess}
          V={testThemeV}
          t={testThemeT}
        />
      ));
      await flush();

      const dialog = mounted.host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();

      const checkboxes = mounted.host.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(2);

      // Toggle 'Officer' role checkbox
      await click(checkboxes[1]);
      await flush();

      const saveBtn = buttonByText(mounted.host, /Save Roles/i);
      expect(saveBtn).toBeDefined();

      await click(saveBtn);
      await flush();

      expect(modifyRoleSpy).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', [
        { roleId: 'role-officer', memberId: member.id, change: 0 },
      ]);
      expect(onRolesSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();

      await unmount(mounted);
    });

    it('GroupsScreen shows OFFICER ACCESS and INVITE button when agent has invite powers, and hides for read-only member', async () => {
      const groupId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const myAgentId = '11111111-1111-1111-1111-111111111111';
      app.protocol.agentId = myAgentId;

      // Group where user has officer powers (Invite = 2, Eject = 4)
      const officerGroup = {
        id: groupId,
        name: 'Officer Group',
        powers: (GROUP_POWERS.Invite | GROUP_POWERS.Eject).toString(),
      };
      app.groups.replaceGroups([officerGroup]);

      const testMembers = [
        { id: myAgentId, name: 'Officer Me', title: 'Officer' },
        { id: '22222222-2222-2222-2222-222222222222', name: 'Regular Member', title: 'Member' },
      ];
      app.groups.replaceMembers(groupId, testMembers);

      vi.spyOn(app, 'loadGroups').mockResolvedValue([officerGroup]);
      vi.spyOn(app, 'loadGroupDetails').mockResolvedValue(testMembers);

      const mounted = await mountScreen(GroupsScreen);
      await flush();

      // Switch to MEMBERS tab
      const membersTabBtn = buttonByText(mounted.host, /MEMBERS/i);
      expect(membersTabBtn).toBeDefined();
      await click(membersTabBtn);
      await flush();

      // Verify OFFICER ACCESS badge and INVITE MEMBER button are rendered
      expect(mounted.host.textContent).toContain('OFFICER ACCESS');
      const inviteBtn = buttonByText(mounted.host, /INVITE MEMBER/i);
      expect(inviteBtn).toBeDefined();

      // Verify eject button exists for member and is disabled for self
      const ejectBtns = [...mounted.host.querySelectorAll('button')].filter((b) =>
        b.textContent?.includes('Eject'),
      );
      expect(ejectBtns.length).toBe(2);

      // Self eject button is disabled
      const selfEjectBtn = mounted.host.querySelector(
        'button[title="Cannot eject yourself"]',
      ) as HTMLButtonElement;
      expect(selfEjectBtn).not.toBeNull();
      expect(selfEjectBtn?.disabled).toBe(true);

      // Other member eject button is enabled
      const otherEjectBtn = mounted.host.querySelector(
        'button[title="Eject member from group"]',
      ) as HTMLButtonElement;
      expect(otherEjectBtn).not.toBeNull();
      expect(otherEjectBtn?.disabled).toBe(false);

      await unmount(mounted);
    });
  });
});
