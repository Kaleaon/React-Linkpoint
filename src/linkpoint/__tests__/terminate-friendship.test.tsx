// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import ContactsScreen from '../../screens/ContactsScreen.jsx';
import {
  FriendsExtended,
  serializeTerminateFriendship,
  serializeTerminateFriendshipPacket,
} from '../phase2/friends-extended';
import { MessageIDs } from '../sl-message-types';
import { slBridge } from '../sl-bridge';
import { SLConnectionFull } from '../sl-connection-full';
import { app } from '../app';
import { buttonByText, click, flush, mountScreen, unmount, type Mounted } from './ui-helpers';

const { METHODS, callViewer } = require('../../../core/viewer-api.cjs');
const { ViewerSession, TerminateFriendshipMessage } = require('../../../core/viewer-session.cjs');
const { UUID } = require('@caspertech/node-metaverse');
const { PacketFlags } = require('@caspertech/node-metaverse/dist/lib/enums/PacketFlags');
const { MessageFlags } = require('@caspertech/node-metaverse/dist/lib/enums/MessageFlags');

vi.mock('../../services/google.ts', () => ({
  loadGoogle: async () => ({
    auth: { getGoogleToken: () => null, signInWithGoogle: vi.fn(), signOutGoogle: vi.fn() },
    contacts: { fetchSlContacts: vi.fn(), pushContact: vi.fn() },
    calendar: {},
  }),
}));

describe('TerminateFriendship Protocol, Session RPC & Dual-Scope Confirmation Modal', () => {
  const TEST_AGENT_ID = '11111111-2222-3333-4444-555555555555';
  const TEST_SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const TEST_TARGET_ID = '99999999-8888-7777-6666-555555555555';
  const TEST_OTHER_FRIEND_ID = '77777777-6666-5555-4444-333333333333';
  const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

  let mounted: Mounted | null = null;

  beforeEach(() => {
    localStorage.clear();
    app.contacts.clear();
    app.friends.replaceFriends([]);
    app.preferences.set('integrations', 'google', false);
  });

  afterEach(async () => {
    await unmount(mounted);
    mounted = null;
    vi.restoreAllMocks();
  });

  describe('TerminateFriendshipMessage Class & Binary Wire Format (0xFFFF012C)', () => {
    it('defines TerminateFriendshipMessage with ID 0xFFFF012C, FrequencyLow, and 48-byte payload', () => {
      const msg = new TerminateFriendshipMessage();
      expect(msg.name).toBe('TerminateFriendship');
      expect(msg.id).toBe(0xffff012c >>> 0);
      expect(msg.id).toBe(MessageIDs.TERMINATE_FRIENDSHIP);
      expect(msg.messageFlags).toBe(MessageFlags.FrequencyLow);
      expect(msg.getSize()).toBe(48);

      msg.AgentData = {
        AgentID: new UUID(TEST_AGENT_ID),
        SessionID: new UUID(TEST_SESSION_ID),
      };
      msg.ExBlock = {
        OtherID: new UUID(TEST_TARGET_ID),
      };

      const buf = Buffer.alloc(48);
      const written = msg.writeToBuffer(buf, 0);
      expect(written).toBe(48);

      expect(buf.subarray(0, 16).toString('hex')).toBe(TEST_AGENT_ID.replace(/-/g, ''));
      expect(buf.subarray(16, 32).toString('hex')).toBe(TEST_SESSION_ID.replace(/-/g, ''));
      expect(buf.subarray(32, 48).toString('hex')).toBe(TEST_TARGET_ID.replace(/-/g, ''));

      const decoded = new TerminateFriendshipMessage();
      const read = decoded.readFromBuffer(buf, 0);
      expect(read).toBe(48);
      expect(decoded.AgentData.AgentID.toString()).toBe(TEST_AGENT_ID);
      expect(decoded.AgentData.SessionID.toString()).toBe(TEST_SESSION_ID);
      expect(decoded.ExBlock.OtherID.toString()).toBe(TEST_TARGET_ID);
    });

    it('serializes client TerminateFriendship packet and validates UUIDs before buffer allocation', () => {
      const packet = serializeTerminateFriendshipPacket(
        TEST_AGENT_ID,
        TEST_SESSION_ID,
        TEST_TARGET_ID,
      );

      expect(packet.messageName).toBe('TerminateFriendship');
      expect(packet.messageId).toBe(0xffff012c);
      expect(packet.agentId).toBe(TEST_AGENT_ID);
      expect(packet.sessionId).toBe(TEST_SESSION_ID);
      expect(packet.otherId).toBe(TEST_TARGET_ID);
      expect(packet.payload).toBeInstanceOf(Uint8Array);
      expect(packet.payload.byteLength).toBe(48);
      expect(serializeTerminateFriendship(TEST_AGENT_ID, TEST_SESSION_ID, TEST_TARGET_ID)).toEqual(
        packet,
      );

      expect(() => serializeTerminateFriendshipPacket('', TEST_SESSION_ID, TEST_TARGET_ID)).toThrow(
        /Valid agent ID required/,
      );
      expect(() =>
        serializeTerminateFriendshipPacket(TEST_AGENT_ID, 'bad-session', TEST_TARGET_ID),
      ).toThrow(/Valid session ID required/);
      expect(() =>
        serializeTerminateFriendshipPacket(TEST_AGENT_ID, TEST_SESSION_ID, 'not-a-uuid'),
      ).toThrow(/Valid target friend ID required/);
      expect(() =>
        serializeTerminateFriendshipPacket(TEST_AGENT_ID, TEST_SESSION_ID, ZERO_UUID),
      ).toThrow(/Valid target friend ID required/);
    });
  });

  describe('Viewer API & Session Reliable UDP Dispatch', () => {
    it('registers terminateFriendship in viewer-api.cjs METHODS', () => {
      expect(METHODS.has('terminateFriendship')).toBe(true);
    });

    it('transmits TerminateFriendship with PacketFlags.Reliable and purges session buddyList so friend does not reappear', async () => {
      const sendMessage = vi.fn();
      const friendsMap = new Map<string, { getName: () => string; online: boolean }>();
      friendsMap.set(TEST_TARGET_ID, { getName: () => 'Pat Resident', online: true });
      friendsMap.set(TEST_OTHER_FRIEND_ID, { getName: () => 'Sam Linden', online: false });

      const session = new ViewerSession(() => {});
      session.friendPresence.set(TEST_TARGET_ID, true);
      session.bot = {
        agent: {
          agentID: new UUID(TEST_AGENT_ID),
          buddyList: [
            { buddyID: new UUID(TEST_TARGET_ID), buddyRightsGiven: 1, buddyRightsHas: 1 },
            { buddyID: new UUID(TEST_OTHER_FRIEND_ID), buddyRightsGiven: 1, buddyRightsHas: 1 },
          ],
        },
        currentRegion: {
          circuit: {
            sessionID: new UUID(TEST_SESSION_ID),
            sendMessage,
          },
        },
        clientCommands: {
          friends: {
            friendsList: friendsMap,
            getFriend: (key: { toString: () => string }) => friendsMap.get(key.toString()),
          },
        },
      };

      const result = await callViewer(session, 'terminateFriendship', {
        targetId: TEST_TARGET_ID,
      });

      expect(result).toMatchObject({
        success: true,
        terminated: true,
        targetId: TEST_TARGET_ID,
        otherId: TEST_TARGET_ID,
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
        messageId: '0xFFFF012C',
      });

      expect(sendMessage).toHaveBeenCalledTimes(1);
      const [dispatchedMsg, dispatchedFlags] = sendMessage.mock.calls[0];
      expect(dispatchedFlags).toBe(PacketFlags.Reliable);
      expect(dispatchedMsg).toBeInstanceOf(TerminateFriendshipMessage);
      expect(dispatchedMsg.id).toBe(0xffff012c >>> 0);
      expect(dispatchedMsg.AgentData.AgentID.toString()).toBe(TEST_AGENT_ID);
      expect(dispatchedMsg.AgentData.SessionID.toString()).toBe(TEST_SESSION_ID);
      expect(dispatchedMsg.ExBlock.OtherID.toString()).toBe(TEST_TARGET_ID);

      // Verify target resident does not reappear on subsequent getFriends() calls
      const remainingFriends = await callViewer(session, 'getFriends');
      expect(remainingFriends).toHaveLength(1);
      expect(remainingFriends[0].id).toBe(TEST_OTHER_FRIEND_ID);
      expect(session.friendPresence.has(TEST_TARGET_ID)).toBe(false);
    });

    it('rejects invalid target UUIDs and offline circuits before dispatching packets', async () => {
      const disconnectedSession = new ViewerSession(() => {});
      await expect(
        callViewer(disconnectedSession, 'terminateFriendship', { targetId: TEST_TARGET_ID }),
      ).rejects.toThrow(/Not connected to Second Life/);

      const offlineCircuitSession = new ViewerSession(() => {});
      offlineCircuitSession.bot = {
        agent: { agentID: new UUID(TEST_AGENT_ID) },
        currentRegion: { circuit: null },
      };
      await expect(
        callViewer(offlineCircuitSession, 'terminateFriendship', { targetId: TEST_TARGET_ID }),
      ).rejects.toThrow(/Simulator circuit is offline/);

      const sendMessage = vi.fn();
      const activeSession = new ViewerSession(() => {});
      activeSession.bot = {
        agent: { agentID: new UUID(TEST_AGENT_ID) },
        currentRegion: {
          circuit: { sessionID: new UUID(TEST_SESSION_ID), sendMessage },
        },
      };
      await expect(
        callViewer(activeSession, 'terminateFriendship', { targetId: 'invalid-uuid' }),
      ).rejects.toThrow(/Target friend ID must be a valid UUID/);
      await expect(
        callViewer(activeSession, 'terminateFriendship', { targetId: ZERO_UUID }),
      ).rejects.toThrow(/Target friend ID must be a valid UUID/);
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('SLBridge, SLConnectionFull & FriendsExtended Propagation', () => {
    it('propagates terminateFriendship through SLConnectionFull and SLBridge to active session', async () => {
      const callSpy = vi.spyOn(slBridge, 'call').mockResolvedValue({
        success: true,
        terminated: true,
        targetId: TEST_TARGET_ID,
        messageId: '0xFFFF012C',
      });

      const connection = new SLConnectionFull();
      await expect(connection.terminateFriendship(TEST_TARGET_ID)).rejects.toThrow(
        /Not connected to a grid/,
      );

      connection.connected = true;
      connection.agentId = TEST_AGENT_ID;
      connection.sessionId = TEST_SESSION_ID;

      const reply = await connection.terminateFriendship({ targetId: TEST_TARGET_ID });
      expect(reply.terminated).toBe(true);
      expect(callSpy).toHaveBeenCalledWith('terminateFriendship', {
        targetId: TEST_TARGET_ID,
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
      });
    });

    it('removes friend from internal maps, groups, and notifies UI/status listeners on dispatch', async () => {
      const terminateFriendship = vi.fn().mockResolvedValue({
        success: true,
        terminated: true,
        targetId: TEST_TARGET_ID,
      });
      const manager = new FriendsExtended({
        terminateFriendship,
        agentId: TEST_AGENT_ID,
        sessionId: TEST_SESSION_ID,
      });

      manager.addFriend(TEST_TARGET_ID, { name: 'Pat Resident', onlineStatus: 'online' });
      const group = manager.createFriendGroup('VIP');
      manager.addFriendToGroup(TEST_TARGET_ID, group.id);

      const removedEvents: Array<{ id: string }> = [];
      const terminatedEvents: Array<{ friendId: string }> = [];
      const statusNotifications: Array<[string, string, string]> = [];

      manager.on('friend_removed', (f: { id: string }) => removedEvents.push(f));
      manager.on('friendship_terminated', (e: { friendId: string }) => terminatedEvents.push(e));
      manager.addStatusListener((id: string, next: string, prev: string) => {
        statusNotifications.push([id, next, prev]);
      });

      const packet = await manager.terminateFriendship(TEST_TARGET_ID);
      expect(packet?.messageId).toBe(0xffff012c);
      expect(packet?.payload.byteLength).toBe(48);
      expect(terminateFriendship).toHaveBeenCalledTimes(1);

      expect(manager.hasFriend(TEST_TARGET_ID)).toBe(false);
      expect(manager.getStats().totalFriends).toBe(0);
      expect(manager.getStats().onlineFriends).toBe(0);
      expect(manager.getFriendsByGroup(group.id)).toEqual([]);
      expect(removedEvents).toHaveLength(1);
      expect(removedEvents[0].id).toBe(TEST_TARGET_ID);
      expect(terminatedEvents).toHaveLength(1);
      expect(terminatedEvents[0].friendId).toBe(TEST_TARGET_ID);
      expect(statusNotifications).toEqual([[TEST_TARGET_ID, 'offline', 'online']]);
    });
  });

  describe('ContactsScreen Dual-Scope Confirmation Modal & Guardrails', () => {
    const selectContactRow = async (host: HTMLElement, name: string) => {
      const targetRow = [...host.querySelectorAll('ul[aria-label="Saved contacts"] button')].find(
        (btn) => (btn.textContent || '').includes(name),
      );
      expect(targetRow).toBeDefined();
      await click(targetRow);
    };

    it('Scenario 1: End Friendship dispatches reliable UDP termination and removes from both friends and contacts', async () => {
      const terminateSpy = vi
        .spyOn(app.protocol, 'terminateFriendship')
        .mockResolvedValue({ success: true, terminated: true, targetId: TEST_TARGET_ID });

      await act(async () => {
        app.protocol.emit('friends_loaded', [
          { id: TEST_TARGET_ID, name: 'Pat Resident', onlineStatus: 'online' },
          { id: TEST_OTHER_FRIEND_ID, name: 'Sam Linden', onlineStatus: 'offline' },
        ]);
      });

      mounted = await mountScreen(ContactsScreen);
      await selectContactRow(mounted.host, 'Pat Resident');

      expect(buttonByText(mounted.host, 'REMOVE FRIEND')).toBeDefined();
      expect(buttonByText(mounted.host, 'REMOVE CONTACT')).toBeUndefined();

      await click(buttonByText(mounted.host, 'REMOVE FRIEND'));

      const dialog = mounted.host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(buttonByText(mounted.host, 'END FRIENDSHIP')).toBeDefined();
      expect(buttonByText(mounted.host, 'REMOVE FROM ADDRESS BOOK ONLY')).toBeDefined();
      expect(buttonByText(mounted.host, 'KEEP')).toBeDefined();

      // Non-blocking check: background friend_status updates for other friends still apply while modal is open
      await act(async () => {
        app.protocol.emit('friend_status', {
          id: TEST_OTHER_FRIEND_ID,
          name: 'Sam Linden',
          online: true,
        });
      });
      expect(
        app.friends.getFriends().find((f: { id: string }) => f.id === TEST_OTHER_FRIEND_ID)
          ?.onlineStatus,
      ).toBe('online');

      await click(buttonByText(mounted.host, 'END FRIENDSHIP'));
      await flush();

      expect(terminateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: TEST_TARGET_ID,
          otherId: TEST_TARGET_ID,
        }),
      );
      expect(app.friends.hasFriend(TEST_TARGET_ID)).toBe(false);
      expect(app.contacts.has(TEST_TARGET_ID)).toBe(false);
      expect(mounted.host.querySelector('[role="dialog"]')).toBeNull();

      // Subsequent login snapshot without terminated friend keeps them absent
      await act(async () => {
        app.protocol.emit('friends_loaded', [
          { id: TEST_OTHER_FRIEND_ID, name: 'Sam Linden', onlineStatus: 'online' },
        ]);
      });
      expect(app.friends.hasFriend(TEST_TARGET_ID)).toBe(false);
      expect(app.contacts.has(TEST_TARGET_ID)).toBe(false);
    });

    it('Scenario 2: Local-only removal purges address book record while preserving grid friendship, presence updates, and export schema', async () => {
      const terminateSpy = vi.spyOn(app.protocol, 'terminateFriendship');

      await act(async () => {
        app.protocol.emit('friends_loaded', [
          { id: TEST_TARGET_ID, name: 'Pat Resident', onlineStatus: 'offline' },
          { id: TEST_OTHER_FRIEND_ID, name: 'Sam Linden', onlineStatus: 'online' },
        ]);
        app.contacts.setNote(TEST_OTHER_FRIEND_ID, 'Builder friend');
      });

      mounted = await mountScreen(ContactsScreen);
      await selectContactRow(mounted.host, 'Pat Resident');
      await click(buttonByText(mounted.host, 'REMOVE FRIEND'));
      await click(buttonByText(mounted.host, 'REMOVE FROM ADDRESS BOOK ONLY'));
      await flush();

      expect(terminateSpy).not.toHaveBeenCalled();
      expect(app.contacts.has(TEST_TARGET_ID)).toBe(false);
      expect(app.friends.hasFriend(TEST_TARGET_ID)).toBe(true);

      // Presence updates continue for the retained Second Life friend
      await act(async () => {
        app.protocol.emit('friend_status', {
          id: TEST_TARGET_ID,
          name: 'Pat Resident',
          online: true,
        });
      });
      expect(
        app.friends.getFriends().find((f: { id: string }) => f.id === TEST_TARGET_ID)?.onlineStatus,
      ).toBe('online');

      // Exported JSON remains valid without schema alterations
      const exported = JSON.parse(app.contacts.exportJson());
      expect(Object.keys(exported).sort()).toEqual(['contacts', 'exportedAt', 'version']);
      expect(exported.version).toBe(1);
      expect(exported.contacts).toHaveLength(1);
      expect(exported.contacts[0]).toMatchObject({
        id: TEST_OTHER_FRIEND_ID,
        name: 'Sam Linden',
        note: 'Builder friend',
      });
    });

    it('Constraint 3: deleting a non-friend saved contact never dispatches TerminateFriendship', async () => {
      const terminateSpy = vi.spyOn(app.protocol, 'terminateFriendship');
      app.contacts.saveFriends([{ id: TEST_TARGET_ID, name: 'Former Friend' }]);
      app.contacts.setNote(TEST_TARGET_ID, 'Old address book note');

      mounted = await mountScreen(ContactsScreen);
      await selectContactRow(mounted.host, 'Former Friend');

      expect(buttonByText(mounted.host, 'REMOVE CONTACT')).toBeDefined();
      expect(buttonByText(mounted.host, 'REMOVE FRIEND')).toBeUndefined();

      await click(buttonByText(mounted.host, 'REMOVE CONTACT'));
      await click(buttonByText(mounted.host, 'REMOVE'));

      expect(terminateSpy).not.toHaveBeenCalled();
      expect(app.contacts.has(TEST_TARGET_ID)).toBe(false);
    });

    it('Criterion 4: displays an error notification and preserves records when circuit is offline', async () => {
      vi.spyOn(app.protocol, 'terminateFriendship').mockRejectedValue(
        new Error('Simulator circuit is offline'),
      );

      await act(async () => {
        app.protocol.emit('friends_loaded', [
          { id: TEST_TARGET_ID, name: 'Pat Resident', onlineStatus: 'online' },
        ]);
        app.contacts.setNote(TEST_TARGET_ID, 'Keep safe when offline');
      });

      mounted = await mountScreen(ContactsScreen);
      await selectContactRow(mounted.host, 'Pat Resident');
      await click(buttonByText(mounted.host, 'REMOVE FRIEND'));
      await click(buttonByText(mounted.host, 'END FRIENDSHIP'));
      await flush();

      const alert = mounted.host.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent).toContain('Simulator circuit is offline');

      // Both friend and local contact + note remain intact
      expect(app.friends.hasFriend(TEST_TARGET_ID)).toBe(true);
      expect(app.contacts.has(TEST_TARGET_ID)).toBe(true);
      expect(app.contacts.get(TEST_TARGET_ID)?.note).toBe('Keep safe when offline');
    });
  });
});
