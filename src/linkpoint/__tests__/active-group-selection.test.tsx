import { createRequire } from 'node:module';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { app } from '../app';
import { slBridge } from '../sl-bridge';
import { GroupsScreen } from '../../screens/LiveScreens.jsx';
import { mountScreen, unmount, click, buttonByText, flush } from './ui-helpers';

const { METHODS, callViewer } = createRequire(import.meta.url)('../../../core/viewer-api.cjs');
const { ViewerSession } = createRequire(import.meta.url)('../../../core/viewer-session.cjs');

describe('Active Group Selection and AgentSetGroupTitle Protocol Synchronization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    app.groups.replaceGroups([]);
    app.groups.clearActiveGroup();
  });

  it('Requirement 2 & Acceptance Criteria 4: Registers activateGroup RPC method in viewer-api.cjs', async () => {
    expect(METHODS.has('activateGroup')).toBe(true);
    const session = new ViewerSession(() => undefined);
    expect(typeof session.activateGroup).toBe('function');
  });

  it('Requirement 3 & Acceptance Criteria 1 & 3: ViewerSession constructs and dispatches AgentSetGroupTitle packet', async () => {
    const sentEvents: any[] = [];
    const session = new ViewerSession((type: string, data: any) => sentEvents.push({ type, data }));

    const sendMessageMock = vi.fn();
    session.bot = {
      agent: { agentID: { toString: () => '11111111-1111-1111-1111-111111111111' } },
    };
    session.identity = { agentId: '11111111-1111-1111-1111-111111111111' };
    vi.spyOn(session, 'currentRegion').mockReturnValue({
      circuit: {
        sessionID: { toString: () => '22222222-2222-2222-2222-222222222222' },
        sendMessage: sendMessageMock,
      },
    });

    const groupId = '33333333-3333-3333-3333-333333333333';
    const roleId = '44444444-4444-4444-4444-444444444444';

    const result = await callViewer(session, 'activateGroup', { groupId, roleId });

    expect(result).toEqual({
      success: true,
      groupId,
      roleId,
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(2);
    const setGroupTitleMsg = sendMessageMock.mock.calls[0][0];
    expect(setGroupTitleMsg.name).toBe('AgentSetGroupTitle');
    expect(setGroupTitleMsg.AgentData.GroupID.toString()).toBe(groupId);
    expect(setGroupTitleMsg.AgentData.RoleID.toString()).toBe(roleId);

    const activateGroupMsg = sendMessageMock.mock.calls[1][0];
    expect(activateGroupMsg.name).toBe('ActivateGroup');
    expect(activateGroupMsg.AgentData.GroupID.toString()).toBe(groupId);

    expect(sentEvents).toContainEqual({
      type: 'active_group_changed',
      data: {
        groupId,
        roleId,
        agentId: '11111111-1111-1111-1111-111111111111',
      },
    });
  });

  it('Requirement 5 & Acceptance Criteria 3: Clearing active group sends zero UUIDs', async () => {
    const sentEvents: any[] = [];
    const session = new ViewerSession((type: string, data: any) => sentEvents.push({ type, data }));

    const sendMessageMock = vi.fn();
    session.bot = {
      agent: { agentID: { toString: () => '11111111-1111-1111-1111-111111111111' } },
    };
    session.identity = { agentId: '11111111-1111-1111-1111-111111111111' };
    vi.spyOn(session, 'currentRegion').mockReturnValue({
      circuit: {
        sessionID: { toString: () => '22222222-2222-2222-2222-222222222222' },
        sendMessage: sendMessageMock,
      },
    });

    const zeroUuid = '00000000-0000-0000-0000-000000000000';
    const result = await callViewer(session, 'activateGroup', { groupId: zeroUuid });

    expect(result.groupId).toBe(zeroUuid);
    const setGroupTitleMsg = sendMessageMock.mock.calls[0][0];
    expect(setGroupTitleMsg.AgentData.GroupID.toString()).toBe(zeroUuid);
    expect(setGroupTitleMsg.AgentData.RoleID.toString()).toBe(zeroUuid);
  });

  it('Guardrail 1: Validates group UUID syntax before processing', async () => {
    const session = new ViewerSession(() => undefined);
    await expect(
      callViewer(session, 'activateGroup', { groupId: 'invalid-uuid-format' }),
    ).rejects.toThrow(/Invalid group ID format/);
  });

  it('Guardrail 2: Falls back to local values when grid connection is offline', async () => {
    vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(false);
    app.groups.replaceGroups([
      { id: '11111111-1111-1111-1111-111111111111', name: 'Offline Group 1' },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Offline Group 2' },
    ]);

    const target = '22222222-2222-2222-2222-222222222222';
    const res = await app.activateGroup(target);

    expect(res.groupId).toBe(target);
    expect(app.groups.getActiveGroupId()).toBe(target);
    expect(app.groups.getActiveGroup()?.name).toBe('Offline Group 2');
  });

  it('Requirement 4 & Acceptance Criteria 5: Emits active_group_changed events over slBridge and updates GroupsManager', async () => {
    const activeHandler = vi.fn();
    app.groups.on('active_group_changed', activeHandler);

    slBridge.emit('active_group_changed', {
      groupId: '55555555-5555-5555-5555-555555555555',
      roleId: '00000000-0000-0000-0000-000000000000',
    });

    expect(app.groups.getActiveGroupId()).toBe('55555555-5555-5555-5555-555555555555');
    expect(activeHandler).toHaveBeenCalledWith({
      groupId: '55555555-5555-5555-5555-555555555555',
      roleId: '00000000-0000-0000-0000-000000000000',
    });
  });

  it('Requirement 1 & Acceptance Criteria 2 & Guardrail 3: GroupsScreen displays ACTIVE badge and enforces rate-limiting on activation controls', async () => {
    const activeGroupId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const otherGroupId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    const testGroups = [
      { id: activeGroupId, name: 'Alpha Builders', title: 'Officer' },
      { id: otherGroupId, name: 'Beta Explorers', title: 'Scout' },
    ];

    app.groups.replaceGroups(testGroups);
    app.groups.setActiveGroupId(activeGroupId);

    vi.spyOn(app, 'loadGroups').mockResolvedValue(app.groups.getGroups());
    vi.spyOn(app, 'loadGroupDetails').mockResolvedValue({});
    const activateSpy = vi.spyOn(app, 'activateGroup').mockResolvedValue({
      success: true,
      groupId: otherGroupId,
      roleId: '00000000-0000-0000-0000-000000000000',
    });

    const mounted = await mountScreen(GroupsScreen);
    await flush();

    const activeBadges = mounted.host.querySelectorAll('.active-badge');
    expect(activeBadges.length).toBeGreaterThan(0);
    expect(activeBadges[0].textContent).toBe('ACTIVE');

    const groupButtons = mounted.host.querySelectorAll('button');
    const betaButton = [...groupButtons].find((b) => b.textContent?.includes('Beta Explorers'));
    expect(betaButton).toBeDefined();

    await click(betaButton!);
    await flush();

    const activateBtn = buttonByText(mounted.host, /ACTIVATE GROUP/i);
    expect(activateBtn).toBeDefined();

    await click(activateBtn);
    await click(activateBtn); // Rapid click test for rate-limiting

    expect(activateSpy).toHaveBeenCalledTimes(1);
    expect(activateSpy).toHaveBeenCalledWith(otherGroupId);

    await unmount(mounted);
  });
});
