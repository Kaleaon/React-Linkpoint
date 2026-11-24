import { createRequire } from 'node:module';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { app } from '../app';
import { slBridge } from '../sl-bridge';
import { indexedDBStore } from '../indexeddb-store';
import { GroupsScreen } from '../../screens/LiveScreens.jsx';
import { mountScreen, unmount, click, buttonByText, flush } from './ui-helpers';

const { METHODS, callViewer } = createRequire(import.meta.url)('../../../core/viewer-api.cjs');
const { ViewerSession } = createRequire(import.meta.url)('../../../core/viewer-session.cjs');
const { UUID } = createRequire(import.meta.url)('@caspertech/node-metaverse');

describe('Direct Reliable UDP LeaveGroupRequest with Inline Confirmation', () => {
  const testAgentId = '11111111-1111-1111-1111-111111111111';
  const testSessionId = '22222222-2222-2222-2222-222222222222';
  const groupAlphaId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const groupBetaId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const groupOwnedId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const zeroUuid = '00000000-0000-0000-0000-000000000000';

  beforeEach(() => {
    vi.restoreAllMocks();
    app.groups.replaceGroups([]);
    app.groups.clearActiveGroup();
    app.notices.clear();
    app.groupNoticeSyncEngine.stop();
  });

  describe('Requirement 3 & 4: Backend RPC Whitelist, SLBridge, and UDP LeaveGroupRequest Packet', () => {
    it('exposes leaveGroup in core/viewer-api.cjs METHODS whitelist and SLBridge', async () => {
      expect(METHODS.has('leaveGroup')).toBe(true);
      const session = new ViewerSession(() => undefined);
      expect(typeof session.leaveGroup).toBe('function');
      expect(typeof slBridge.leaveGroup).toBe('function');

      const callSpy = vi
        .spyOn(slBridge, 'call')
        .mockResolvedValue({ success: true, left: true, groupId: groupAlphaId });
      const res = await slBridge.leaveGroup({ groupId: groupAlphaId });
      expect(callSpy).toHaveBeenCalledWith('leaveGroup', { groupId: groupAlphaId });
      expect(res).toEqual({ success: true, left: true, groupId: groupAlphaId });
    });

    it('serializes and transmits a reliable LeaveGroupRequest UDP packet with AgentID, SessionID, and GroupID', async () => {
      const sentEvents: Array<{ type: string; data: unknown }> = [];
      const session = new ViewerSession((type: string, data: unknown) =>
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

      const result = await callViewer(session, 'leaveGroup', {
        groupId: groupAlphaId.toUpperCase(),
      });

      expect(result).toEqual({
        success: true,
        left: true,
        groupId: groupAlphaId,
      });

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const [msg, flags] = sendMessageMock.mock.calls[0];
      expect(msg.name).toBe('LeaveGroupRequest');
      expect(flags).toBe(64); // PacketFlags.Reliable = 0x40
      expect(msg.AgentData.AgentID.toString()).toBe(testAgentId);
      expect(msg.AgentData.SessionID.toString()).toBe(testSessionId);
      expect(msg.GroupData.GroupID.toString()).toBe(groupAlphaId);

      // Verify binary packet serialization (48 bytes: 3x 16-byte UUIDs)
      expect(msg.getSize()).toBe(48);
      const buf = Buffer.alloc(48);
      const written = msg.writeToBuffer(buf, 0);
      expect(written).toBe(48);
      expect(new UUID(buf, 0).toString()).toBe(testAgentId);
      expect(new UUID(buf, 16).toString()).toBe(testSessionId);
      expect(new UUID(buf, 32).toString()).toBe(groupAlphaId);

      expect(sentEvents).toContainEqual({
        type: 'group_left',
        data: {
          groupId: groupAlphaId,
          agentId: testAgentId,
        },
      });
    });

    it('clears simulator active group title and emits active_group_changed when leaving the active group', async () => {
      const sentEvents: Array<{ type: string; data: unknown }> = [];
      const session = new ViewerSession((type: string, data: unknown) =>
        sentEvents.push({ type, data }),
      );
      const sendMessageMock = vi.fn();
      session.bot = {
        agent: { agentID: { toString: () => testAgentId } },
      };
      session.identity = { agentId: testAgentId };
      session.activeGroupId = groupAlphaId;
      session.activeRoleId = '44444444-4444-4444-4444-444444444444';
      vi.spyOn(session, 'currentRegion').mockReturnValue({
        circuit: {
          sessionID: { toString: () => testSessionId },
          sendMessage: sendMessageMock,
        },
      });

      await callViewer(session, 'leaveGroup', { groupId: groupAlphaId });

      expect(session.activeGroupId).toBe(zeroUuid);
      expect(session.activeRoleId).toBe(zeroUuid);
      expect(sendMessageMock).toHaveBeenCalledTimes(3);
      expect(sendMessageMock.mock.calls[0][0].name).toBe('LeaveGroupRequest');
      expect(sendMessageMock.mock.calls[1][0].name).toBe('AgentSetGroupTitle');
      expect(sendMessageMock.mock.calls[1][0].AgentData.GroupID.toString()).toBe(zeroUuid);
      expect(sendMessageMock.mock.calls[2][0].name).toBe('ActivateGroup');
      expect(sendMessageMock.mock.calls[2][0].AgentData.GroupID.toString()).toBe(zeroUuid);

      expect(sentEvents).toContainEqual({
        type: 'active_group_changed',
        data: {
          groupId: zeroUuid,
          roleId: zeroUuid,
          agentId: testAgentId,
        },
      });
    });

    it('validates group UUID syntax and rejects invalid, empty, or null UUIDs before sending packets', async () => {
      const sendMessageMock = vi.fn();
      const session = new ViewerSession(() => undefined);
      session.bot = {
        agent: { agentID: { toString: () => testAgentId } },
        currentRegion: {
          circuit: { sessionID: testSessionId, sendMessage: sendMessageMock },
        },
      };

      await expect(callViewer(session, 'leaveGroup', { groupId: 'not-a-uuid' })).rejects.toThrow(
        /Invalid group ID format/,
      );
      await expect(callViewer(session, 'leaveGroup', { groupId: '' })).rejects.toThrow(
        /Invalid group ID format/,
      );
      await expect(callViewer(session, 'leaveGroup', { groupId: zeroUuid })).rejects.toThrow(
        /Invalid group ID format/,
      );
      expect(sendMessageMock).not.toHaveBeenCalled();

      await expect(app.leaveGroup('invalid-uuid')).rejects.toThrow(/Invalid group ID format/);
      await expect(app.leaveGroup(zeroUuid)).rejects.toThrow(/Invalid group ID format/);
    });

    it('fails closed when disconnected from Second Life', async () => {
      const session = new ViewerSession(() => undefined);
      await expect(callViewer(session, 'leaveGroup', { groupId: groupAlphaId })).rejects.toThrow(
        /Not connected to Second Life/,
      );
    });
  });

  describe('Requirement 5: LinkpointApp & GroupsManager State Cleanup and Cache Eviction', () => {
    it('evicts group info, members, roles, notices, IndexedDB caches, and clears active group state', async () => {
      vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
      const leaveSpy = vi.spyOn(slBridge, 'leaveGroup').mockResolvedValue({
        success: true,
        left: true,
        groupId: groupAlphaId,
      });

      app.groups.replaceGroups([
        { id: groupAlphaId, name: 'Alpha Guild', title: 'Builder' },
        { id: groupBetaId, name: 'Beta Explorers', title: 'Scout' },
      ]);
      app.groups.setActiveGroupId(groupAlphaId, '55555555-5555-5555-5555-555555555555');
      app.groups.addGroupMember(groupAlphaId, testAgentId, { title: 'Builder' });
      app.groups.addGroupRole(groupAlphaId, '55555555-5555-5555-5555-555555555555', {
        name: 'Builders',
      });
      app.groups.addGroupNotice(groupAlphaId, {
        id: 'notice-alpha-1',
        groupId: groupAlphaId,
        subject: 'Meeting tonight',
        message: 'Bring prims',
      });
      await app.notices.setGroupCache(groupAlphaId, [
        {
          id: 'notice-alpha-1',
          groupId: groupAlphaId,
          subject: 'Meeting tonight',
          message: 'Bring prims',
          from: 'Admin',
          timestamp: Date.now(),
          calendar: null,
          attachment: null,
        },
      ]);
      app.groupNoticeSyncEngine.enqueueGroup(groupAlphaId, 'NORMAL');

      const groupsUpdatedSpy = vi.fn();
      const groupLeftSpy = vi.fn();
      const activeChangedSpy = vi.fn();
      app.groups.on('groups_updated', groupsUpdatedSpy);
      app.groups.on('group_left', groupLeftSpy);
      app.groups.on('active_group_changed', activeChangedSpy);

      await app.leaveGroup(groupAlphaId);

      expect(leaveSpy).toHaveBeenCalledWith({ groupId: groupAlphaId });
      expect(app.groups.getGroupInfo(groupAlphaId)).toBeNull();
      expect(app.groups.getGroupMembers(groupAlphaId).size).toBe(0);
      expect(app.groups.getGroupRoles(groupAlphaId).size).toBe(0);
      expect(app.groups.getGroupNotices(groupAlphaId)).toEqual([]);
      expect(app.notices.getGroupCache(groupAlphaId)).toBeNull();
      expect(app.notices.get('notice-alpha-1')).toBeNull();
      const idbNotices = await indexedDBStore.getGroupNotices('local_user', groupAlphaId);
      expect(idbNotices).toEqual([]);

      expect(app.groups.getActiveGroupId()).toBe(zeroUuid);
      expect(app.groups.getActiveGroup()).toBeNull();
      expect(activeChangedSpy).toHaveBeenCalledWith({ groupId: zeroUuid, roleId: zeroUuid });
      expect(groupLeftSpy).toHaveBeenCalledWith({ groupId: groupAlphaId });
      expect(groupsUpdatedSpy).toHaveBeenCalled();
      expect(app.groups.getGroups().map((g) => g.id)).toEqual([groupBetaId]);
    });
  });

  describe('Requirement 1 & 2 & Scenarios: GroupsScreen Leave Button, Warning Styling, Confirmation, and Sole-Owner Guardrail', () => {
    it('Scenario 1: leaves a non-owned group in 2 clicks with inline confirmation and evicts it from the browser', async () => {
      app.groups.replaceGroups([
        { id: groupAlphaId, name: 'Unwanted Sandbox Group', title: 'Visitor' },
        { id: groupBetaId, name: 'Mainland Builders', title: 'Member' },
      ]);
      vi.spyOn(app, 'loadGroups').mockImplementation(async () => app.groups.getGroups());
      vi.spyOn(app, 'loadGroupDetails').mockResolvedValue({});
      vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
      const bridgeLeaveSpy = vi.spyOn(slBridge, 'leaveGroup').mockResolvedValue({
        success: true,
        left: true,
        groupId: groupAlphaId,
      });

      const mounted = await mountScreen(GroupsScreen);
      await flush();

      // Leave Group button is displayed in the group detail header with warning styling
      const leaveBtn = buttonByText(mounted.host, /LEAVE GROUP/i);
      expect(leaveBtn).toBeDefined();
      expect(leaveBtn?.disabled).toBe(false);
      expect(leaveBtn?.style.borderColor).not.toBe('');
      expect(leaveBtn?.style.color).not.toBe('');
      expect(mounted.host.querySelector('.leave-group-confirm')).toBeNull();

      // Click 1: Clicking Leave Group opens inline confirmation prompt without sending RPC yet
      await click(leaveBtn);
      await flush();

      const confirmRegion = mounted.host.querySelector('.leave-group-confirm');
      expect(confirmRegion).not.toBeNull();
      expect(confirmRegion?.textContent).toContain('Leave Unwanted Sandbox Group?');
      expect(bridgeLeaveSpy).not.toHaveBeenCalled();

      // Cancel hides the inline prompt without leaving
      const cancelBtn = buttonByText(mounted.host, /^CANCEL$/i);
      expect(cancelBtn).toBeDefined();
      await click(cancelBtn);
      await flush();
      expect(mounted.host.querySelector('.leave-group-confirm')).toBeNull();
      expect(bridgeLeaveSpy).not.toHaveBeenCalled();

      // Click 1 + Click 2: Leave Group -> Confirm Leave (< 3 clicks total)
      await click(buttonByText(mounted.host, /LEAVE GROUP/i));
      await flush();
      const confirmBtn = buttonByText(mounted.host, /CONFIRM LEAVE/i);
      expect(confirmBtn).toBeDefined();
      await click(confirmBtn);
      await flush();

      expect(bridgeLeaveSpy).toHaveBeenCalledTimes(1);
      expect(bridgeLeaveSpy).toHaveBeenCalledWith({ groupId: groupAlphaId });

      // Departed group disappears from browser and next group is selected
      expect(mounted.host.textContent).not.toContain('Unwanted Sandbox Group');
      expect(mounted.host.querySelector('h2')?.textContent).toBe('Mainland Builders');

      await unmount(mounted);
    });

    it('Scenario 2: leaving the active group clears the active title and selects the next available group', async () => {
      app.groups.replaceGroups([
        { id: groupAlphaId, name: 'Active Yacht Club', title: 'Commodore' },
        { id: groupBetaId, name: 'Next Community', title: 'Member' },
      ]);
      app.groups.setActiveGroupId(groupAlphaId);
      vi.spyOn(app, 'loadGroups').mockImplementation(async () => app.groups.getGroups());
      vi.spyOn(app, 'loadGroupDetails').mockResolvedValue({});
      vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
      const bridgeLeaveSpy = vi.spyOn(slBridge, 'leaveGroup').mockResolvedValue({
        success: true,
        left: true,
        groupId: groupAlphaId,
      });

      const mounted = await mountScreen(GroupsScreen);
      await flush();

      expect(mounted.host.querySelectorAll('.active-badge').length).toBe(1);

      await click(buttonByText(mounted.host, /LEAVE GROUP/i));
      await flush();

      const confirmRegion = mounted.host.querySelector('.leave-group-confirm');
      expect(confirmRegion?.textContent).toContain('active group title will be cleared');

      await click(buttonByText(mounted.host, /CONFIRM LEAVE/i));
      await flush();

      expect(bridgeLeaveSpy).toHaveBeenCalledWith({ groupId: groupAlphaId });
      expect(app.groups.getActiveGroupId()).toBe(zeroUuid);
      expect(mounted.host.querySelectorAll('.active-badge').length).toBe(0);
      expect(mounted.host.querySelector('h2')?.textContent).toBe('Next Community');

      await unmount(mounted);
    });

    it('Constraint 2: disables Leave Group button when the resident is the sole owner, and enables when co-owners exist', async () => {
      app.protocol.agentId = testAgentId;
      app.groups.replaceGroups([
        {
          id: groupOwnedId,
          name: 'Sole Owned Estate Group',
          title: 'Owner',
          isOwner: true,
          founderId: testAgentId,
        },
        {
          id: groupBetaId,
          name: 'Co-Owned Builders Group',
          title: 'Owner',
          isOwner: true,
        },
      ]);
      app.groups.replaceMembers(groupOwnedId, [
        { id: testAgentId, title: 'Owner', isOwner: true },
        { id: '99999999-9999-9999-9999-999999999999', title: 'Member', isOwner: false },
      ]);
      app.groups.replaceMembers(groupBetaId, [
        { id: testAgentId, title: 'Owner', isOwner: true },
        { id: '88888888-8888-8888-8888-888888888888', title: 'Co-Owner', isOwner: true },
      ]);

      vi.spyOn(app, 'loadGroups').mockImplementation(async () => app.groups.getGroups());
      vi.spyOn(app, 'loadGroupDetails').mockResolvedValue({});

      const mounted = await mountScreen(GroupsScreen);
      await flush();

      // Sole owner group -> Leave Group button is disabled
      const soleOwnerLeaveBtn = buttonByText(mounted.host, /LEAVE GROUP/i);
      expect(soleOwnerLeaveBtn).toBeDefined();
      expect(soleOwnerLeaveBtn?.disabled).toBe(true);

      // Select co-owned group -> Leave Group button is enabled because another owner exists
      const coOwnedButton = [...mounted.host.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Co-Owned Builders Group'),
      );
      await click(coOwnedButton);
      await flush();

      const coOwnerLeaveBtn = buttonByText(mounted.host, /LEAVE GROUP/i);
      expect(coOwnerLeaveBtn).toBeDefined();
      expect(coOwnerLeaveBtn?.disabled).toBe(false);

      await unmount(mounted);
    });
  });
});
