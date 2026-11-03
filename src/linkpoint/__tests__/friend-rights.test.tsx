// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  serializeGrantUserRightsPacket,
  serializeGrantUserRights,
  FriendRights,
  FriendsExtended,
} from '../phase2/friends-extended';
import { MessageIDs } from '../sl-message-types';
import { slBridge } from '../sl-bridge';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { FriendContactInspector } from '../../screens/LiveScreens.jsx';
import ContactsScreen from '../../screens/ContactsScreen.jsx';
import { app } from '../app';

const { METHODS, callViewer } = require('../../../core/viewer-api.cjs');
const { ViewerSession } = require('../../../core/viewer-session.cjs');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Friend Rights Synchronization Protocol & Bridge RPC', () => {
  const TEST_AGENT_ID = '11111111-2222-3333-4444-555555555555';
  const TEST_SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const TEST_TARGET_ID = '99999999-8888-7777-6666-555555555555';

  let mounted: { host: HTMLElement; root: Root } | null = null;

  async function mount(ui: React.ReactNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
    });
    mounted = { host, root };
    return host;
  }

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
  });

  describe('GrantUserRights Packet Serializer', () => {
    it('serializes GrantUserRights packet with low-frequency message ID 0xFFFF0054', () => {
      const packet = serializeGrantUserRightsPacket(
        TEST_AGENT_ID,
        TEST_SESSION_ID,
        TEST_TARGET_ID,
        FriendRights.CAN_SEE_ONLINE | FriendRights.CAN_SEE_ON_MAP,
      );

      expect(packet.messageName).toBe('GrantUserRights');
      expect(packet.messageId).toBe(0xffff0054);
      expect(packet.messageId).toBe(MessageIDs.GRANT_USER_RIGHTS);
      expect(packet.agentId).toBe(TEST_AGENT_ID);
      expect(packet.sessionId).toBe(TEST_SESSION_ID);
      expect(packet.targetId).toBe(TEST_TARGET_ID);
      expect(packet.rightsMask).toBe(0x3);
      expect(packet.payload).toBeInstanceOf(Uint8Array);
      expect(packet.payload.length).toBe(52);
    });

    it('serializes 16-byte AgentID, 16-byte SessionID, 16-byte TargetID, and 4-byte LE rights bitmask', () => {
      // 0x7 = CAN_SEE_ONLINE (0x1) | CAN_SEE_ON_MAP (0x2) | CAN_MODIFY_OBJECTS (0x4)
      const packet = serializeGrantUserRightsPacket(
        TEST_AGENT_ID,
        TEST_SESSION_ID,
        TEST_TARGET_ID,
        0x7,
      );

      // Verify AgentID at bytes 0..15
      const hexAgent = Array.from(packet.payload.subarray(0, 16), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      expect(hexAgent).toBe(TEST_AGENT_ID.replace(/-/g, ''));

      // Verify SessionID at bytes 16..31
      const hexSession = Array.from(packet.payload.subarray(16, 32), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      expect(hexSession).toBe(TEST_SESSION_ID.replace(/-/g, ''));

      // Verify TargetID at bytes 32..47
      const hexTarget = Array.from(packet.payload.subarray(32, 48), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      expect(hexTarget).toBe(TEST_TARGET_ID.replace(/-/g, ''));

      // Verify 4-byte little-endian rights bitmask at bytes 48..51
      expect(packet.payload[48]).toBe(0x07);
      expect(packet.payload[49]).toBe(0x00);
      expect(packet.payload[50]).toBe(0x00);
      expect(packet.payload[51]).toBe(0x00);

      const view = new DataView(
        packet.payload.buffer,
        packet.payload.byteOffset,
        packet.payload.byteLength,
      );
      expect(view.getUint32(48, true)).toBe(0x7);
    });

    it('provides alias serializeGrantUserRights matching serializer', () => {
      const p1 = serializeGrantUserRightsPacket(
        TEST_AGENT_ID,
        TEST_SESSION_ID,
        TEST_TARGET_ID,
        FriendRights.CAN_MODIFY_OBJECTS,
      );
      const p2 = serializeGrantUserRights(
        TEST_AGENT_ID,
        TEST_SESSION_ID,
        TEST_TARGET_ID,
        FriendRights.CAN_MODIFY_OBJECTS,
      );
      expect(p1).toEqual(p2);
    });

    it('enforces 32-bit unsigned integer values and validates UUIDs', () => {
      expect(() =>
        serializeGrantUserRightsPacket('', TEST_SESSION_ID, TEST_TARGET_ID, 0x1),
      ).toThrow(/Valid agent ID required/);
      expect(() =>
        serializeGrantUserRightsPacket('invalid-agent', TEST_SESSION_ID, TEST_TARGET_ID, 0x1),
      ).toThrow(/Valid agent ID required/);
      expect(() => serializeGrantUserRightsPacket(TEST_AGENT_ID, '', TEST_TARGET_ID, 0x1)).toThrow(
        /Valid session ID required/,
      );
      expect(() =>
        serializeGrantUserRightsPacket(TEST_AGENT_ID, TEST_SESSION_ID, 'invalid-target', 0x1),
      ).toThrow(/Valid target ID required/);

      // Invalid rightsMask values
      expect(() =>
        serializeGrantUserRightsPacket(TEST_AGENT_ID, TEST_SESSION_ID, TEST_TARGET_ID, -1),
      ).toThrow(/rightsMask must be an unsigned 32-bit integer/);
      expect(() =>
        serializeGrantUserRightsPacket(TEST_AGENT_ID, TEST_SESSION_ID, TEST_TARGET_ID, 1.5),
      ).toThrow(/rightsMask must be an unsigned 32-bit integer/);
      expect(() =>
        serializeGrantUserRightsPacket(TEST_AGENT_ID, TEST_SESSION_ID, TEST_TARGET_ID, 0x100000000),
      ).toThrow(/rightsMask must be an unsigned 32-bit integer/);
    });
  });

  describe('FriendsExtended Permission Mutation & Event Emission', () => {
    it('accepts bitmask flags and dispatches GrantUserRights packet', async () => {
      const mockProtocol = {
        grantUserRights: vi.fn().mockResolvedValue({ success: true }),
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
      };
      const friends = new FriendsExtended(mockProtocol);
      friends.addFriend(TEST_TARGET_ID, { name: 'Bob Resident' });

      const rightsListener = vi.fn();
      friends.on('friend_rights_updated', rightsListener);

      const packet = await friends.setFriendPermissions(TEST_TARGET_ID, 0x3);

      expect(packet).not.toBeNull();
      expect(packet?.rightsMask).toBe(0x3);
      expect(mockProtocol.grantUserRights).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: TEST_TARGET_ID,
          rightsMask: 0x3,
          packet,
        }),
      );

      expect(rightsListener).toHaveBeenCalledWith(
        expect.objectContaining({
          friendId: TEST_TARGET_ID,
          rightsMask: 0x3,
          permissions: expect.objectContaining({
            canSeeOnline: true,
            canSeeOnMap: true,
            canModifyObjects: false,
          }),
        }),
      );

      const updated = friends.getFriendPermissions(TEST_TARGET_ID);
      expect(updated?.canSeeOnline).toBe(true);
      expect(updated?.canSeeOnMap).toBe(true);
      expect(updated?.canModifyObjects).toBe(false);
    });

    it('accepts permission objects and calculates correct bitmask flags', async () => {
      const mockProtocol = {
        sendPacket: vi.fn().mockResolvedValue(true),
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
      };
      const friends = new FriendsExtended(mockProtocol);
      friends.addFriend(TEST_TARGET_ID, { name: 'Carol Resident' });

      const packet = await friends.setFriendPermissions(TEST_TARGET_ID, {
        canSeeOnline: true,
        canSeeOnMap: false,
        canModifyObjects: true,
      });

      expect(packet?.rightsMask).toBe(0x5); // 0x1 | 0x4
      expect(mockProtocol.sendPacket).toHaveBeenCalledWith(packet);

      const perms = friends.getFriendPermissions(TEST_TARGET_ID);
      expect(perms?.canSeeOnline).toBe(true);
      expect(perms?.canSeeOnMap).toBe(false);
      expect(perms?.canModifyObjects).toBe(true);
    });

    it('handles transient network latency without unhandled exceptions', async () => {
      const mockProtocol = {
        grantUserRights: vi.fn().mockRejectedValue(new Error('Network timeout')),
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
      };
      const friends = new FriendsExtended(mockProtocol);
      friends.addFriend(TEST_TARGET_ID, { name: 'Dave Resident' });

      await expect(friends.setFriendPermissions(TEST_TARGET_ID, 0x1)).resolves.not.toThrow();

      const perms = friends.getFriendPermissions(TEST_TARGET_ID);
      expect(perms?.canSeeOnline).toBe(true);
    });
  });

  describe('Core Viewer API & Session RPC Endpoint', () => {
    it('registers grantUserRights in viewer-api.cjs METHODS', () => {
      expect(METHODS.has('grantUserRights')).toBe(true);
    });

    it('dispatches grantUserRights through callViewer and invokes bot.sendPacket', async () => {
      const sendPacket = vi.fn();
      const mockBot = {
        agent: { agentID: { toString: () => TEST_AGENT_ID } },
        circuit: { sessionID: { toString: () => TEST_SESSION_ID } },
        sendPacket,
      };
      const session = new ViewerSession();
      session.bot = mockBot;

      const result = await callViewer(session, 'grantUserRights', {
        targetId: TEST_TARGET_ID,
        rightsMask: 0x3,
      });

      expect(result.success).toBe(true);
      expect(result.rightsMask).toBe(0x3);
      expect(sendPacket).toHaveBeenCalledWith(
        'GrantUserRights',
        expect.objectContaining({
          messageName: 'GrantUserRights',
          messageId: 0xffff0054,
          agentId: TEST_AGENT_ID,
          sessionId: TEST_SESSION_ID,
          targetId: TEST_TARGET_ID,
          rightsMask: 0x3,
        }),
      );
    });

    it('throws error when targetId is missing in grantUserRights RPC call', async () => {
      const session = new ViewerSession();
      session.bot = { sendPacket: vi.fn() };

      await expect(callViewer(session, 'grantUserRights', {})).rejects.toThrow(
        /Valid target friend ID required/,
      );
    });
  });

  describe('Client Bridge Typed Method', () => {
    it('exposes typed grantUserRights calling viewer session', async () => {
      const mockResult = {
        success: true,
        targetId: TEST_TARGET_ID,
        rightsMask: 0x2,
      };
      const callSpy = vi.spyOn(slBridge, 'call').mockResolvedValue(mockResult);

      const response = await slBridge.grantUserRights({
        targetId: TEST_TARGET_ID,
        rightsMask: 0x2,
      });

      expect(callSpy).toHaveBeenCalledWith('grantUserRights', {
        targetId: TEST_TARGET_ID,
        rightsMask: 0x2,
      });
      expect(response.success).toBe(true);
      callSpy.mockRestore();
    });
  });

  describe('User Interface Accessible Checkboxes', () => {
    it('FriendContactInspector renders accessible checkboxes for canSeeOnline, canSeeOnMap, and canModifyObjects', async () => {
      const setPermsSpy = vi.spyOn(app.friends, 'setFriendPermissions');

      const dummyFriend = {
        id: TEST_TARGET_ID,
        name: 'Eve Resident',
        onlineStatus: 'online',
        permissions: {
          canSeeOnline: true,
          canSeeOnMap: false,
          canModifyObjects: false,
        },
      };
      app.friends.addFriend(TEST_TARGET_ID, dummyFriend);

      const host = await mount(
        <FriendContactInspector
          friend={dummyFriend}
          onClose={() => {}}
          onStartIm={() => {}}
          V={{
            surf: '#111',
            outv: '#333',
            rs: '4px',
            ink: '#fff',
            ink2: '#ccc',
            pri: '#00f',
            onpri: '#fff',
          }}
          t={{ font: 'sans-serif' }}
        />,
      );

      const onlineCheckbox = host.querySelector('input[name="canSeeOnline"]') as HTMLInputElement;
      const mapCheckbox = host.querySelector('input[name="canSeeOnMap"]') as HTMLInputElement;
      const modifyCheckbox = host.querySelector(
        'input[name="canModifyObjects"]',
      ) as HTMLInputElement;

      expect(onlineCheckbox).not.toBeNull();
      expect(mapCheckbox).not.toBeNull();
      expect(modifyCheckbox).not.toBeNull();

      expect(onlineCheckbox.checked).toBe(true);
      expect(mapCheckbox.checked).toBe(false);
      expect(modifyCheckbox.checked).toBe(false);

      // Toggle canSeeOnMap checkbox
      await act(async () => {
        mapCheckbox.click();
      });

      expect(setPermsSpy).toHaveBeenCalledWith(
        TEST_TARGET_ID,
        expect.objectContaining({
          canSeeOnline: true,
          canSeeOnMap: true,
          canModifyObjects: false,
        }),
      );

      setPermsSpy.mockRestore();
    });

    it('ContactsScreen renders accessible checkboxes in contact details panel', async () => {
      const setPermsSpy = vi.spyOn(app.friends, 'setFriendPermissions');

      app.contacts.saveFriends([
        {
          id: TEST_TARGET_ID,
          name: 'Frank Resident',
        },
      ]);
      app.friends.addFriend(TEST_TARGET_ID, {
        name: 'Frank Resident',
        permissions: {
          canSeeOnline: false,
          canSeeOnMap: true,
          canModifyObjects: false,
        },
      });

      const host = await mount(<ContactsScreen />);

      // Select contact Frank Resident
      const contactButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Frank Resident'),
      );
      expect(contactButton).toBeDefined();

      await act(async () => {
        contactButton?.click();
      });

      const onlineCheckbox = host.querySelector('input[name="canSeeOnline"]') as HTMLInputElement;
      const mapCheckbox = host.querySelector('input[name="canSeeOnMap"]') as HTMLInputElement;
      const modifyCheckbox = host.querySelector(
        'input[name="canModifyObjects"]',
      ) as HTMLInputElement;

      expect(onlineCheckbox).not.toBeNull();
      expect(mapCheckbox).not.toBeNull();
      expect(modifyCheckbox).not.toBeNull();

      expect(mapCheckbox.checked).toBe(true);

      // Toggle canModifyObjects checkbox
      await act(async () => {
        modifyCheckbox.click();
      });

      expect(setPermsSpy).toHaveBeenCalledWith(
        TEST_TARGET_ID,
        expect.objectContaining({
          canModifyObjects: true,
        }),
      );

      setPermsSpy.mockRestore();
    });
  });
});
