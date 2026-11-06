// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { app } from '../app';
import { slBridge } from '../sl-bridge';
import { Utils } from '../utils';
import { GROUP_POWERS } from '../phase2/groups';
import { NoticeStore } from '../notices';
import { indexedDBStore } from '../indexeddb-store';
import { GroupsScreen, CreateGroupNoticeModal } from '../../screens/LiveScreens.jsx';
import { mountScreen, unmount, click, buttonByText, flush } from './ui-helpers';

const { METHODS, callViewer } = createRequire(import.meta.url)('../../../core/viewer-api.cjs');
const { ViewerSession } = createRequire(import.meta.url)('../../../core/viewer-session.cjs');

describe('Group Notice Composer & ImprovedInstantMessage Dispatch', () => {
  const testThemeV = {
    pri: '#2563eb',
    onpri: '#ffffff',
    bg: '#ffffff',
    surf: '#f8fafc',
    ink: '#0f172a',
    ink2: '#64748b',
    outv: '#cbd5e1',
    err: '#ef4444',
    rs: '6px',
  };
  const testThemeT = { font: 'sans-serif' };

  const testAgentId = '11111111-1111-1111-1111-111111111111';
  const testSessionId = '22222222-2222-2222-2222-222222222222';
  const testGroupId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    vi.restoreAllMocks();
    app.groups.replaceGroups([]);
    app.groups.clearActiveGroup();
    (app.groups as any).groupNotices.clear();
    app.inventory.items.clear();
    (app.notices as any).notices.clear();
    (app.notices as any).groupCaches.clear();
  });

  describe('Requirement 4 & 5: Backend RPC & ImprovedInstantMessage Dialog 32 Dispatch', () => {
    function setupMockSession() {
      const sentEvents: any[] = [];
      const session = new ViewerSession((type: string, data: any) =>
        sentEvents.push({ type, data }),
      );
      const sendMessageMock = vi.fn();
      session.bot = {
        agent: {
          agentID: testAgentId,
          firstName: 'Officer',
          lastName: 'Tester',
        },
      };
      session.identity = { agent_id: testAgentId, username: 'Officer Tester' };
      vi.spyOn(session, 'currentRegion').mockReturnValue({
        circuit: {
          sessionID: testSessionId,
          sendMessage: sendMessageMock,
          waitForAck: vi.fn().mockResolvedValue(true),
        },
      });
      return { session, sendMessageMock, sentEvents };
    }

    it('registers sendGroupNotice in viewer-api.cjs METHODS whitelist', () => {
      expect(METHODS.has('sendGroupNotice')).toBe(true);
    });

    it('ViewerSession implements sendGroupNotice method', () => {
      const session = new ViewerSession(() => undefined);
      expect(typeof session.sendGroupNotice).toBe('function');
    });

    it('rejects invalid UUID, empty subject, or empty message', async () => {
      const { session } = setupMockSession();
      await expect(
        session.sendGroupNotice({
          groupId: 'not-a-uuid',
          subject: 'Hello',
          message: 'World',
        }),
      ).rejects.toThrow(/Valid group ID required/);

      await expect(
        session.sendGroupNotice({
          groupId: testGroupId,
          subject: '',
          message: 'World',
        }),
      ).rejects.toThrow(/Subject is required/);

      await expect(
        session.sendGroupNotice({
          groupId: testGroupId,
          subject: 'Hello',
          message: '',
        }),
      ).rejects.toThrow(/Message is required/);
    });

    it('enforces subject <= 63 bytes and message <= 512 bytes constraints', async () => {
      const { session } = setupMockSession();
      const longSubject = 'A'.repeat(64);
      await expect(
        session.sendGroupNotice({
          groupId: testGroupId,
          subject: longSubject,
          message: 'Short message',
        }),
      ).rejects.toThrow(/Subject must not exceed 63 bytes/);

      const longMessage = 'M'.repeat(513);
      await expect(
        session.sendGroupNotice({
          groupId: testGroupId,
          subject: 'Valid Subject',
          message: longMessage,
        }),
      ).rejects.toThrow(/Message must not exceed 512 bytes/);
    });

    it('formats and transmits ImprovedInstantMessage packet with Dialog 32, group UUID, and empty binary bucket without attachment', async () => {
      const { session, sendMessageMock } = setupMockSession();

      const result = await callViewer(session, 'sendGroupNotice', {
        groupId: testGroupId,
        subject: 'Weekly Meeting',
        message: 'Join us in the sim tonight at 8 PM SLT.',
      });

      expect(result.success).toBe(true);
      expect(result.groupId).toBe(testGroupId);
      expect(result.subject).toBe('Weekly Meeting');
      expect(result.hasAttachment).toBe(false);

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const [msg, flags] = sendMessageMock.mock.calls[0];
      expect(msg.name).toBe('ImprovedInstantMessage');
      expect(flags).toBe(64); // PacketFlags.Reliable
      expect(msg.MessageBlock.Dialog).toBe(32); // InstantMessageDialog.GroupNotice = 32
      expect(msg.MessageBlock.ToAgentID.toString().toLowerCase()).toBe(testGroupId.toLowerCase());
      expect(msg.MessageBlock.Message.toString().replace(/\0+$/, '')).toBe(
        'Weekly Meeting|Join us in the sim tonight at 8 PM SLT.',
      );
      expect(msg.MessageBlock.BinaryBucket.length).toBe(0);
    });

    it('formats ImprovedInstantMessage with binary attachment bucket (18 bytes) when attachment is present', async () => {
      const { session, sendMessageMock } = setupMockSession();
      const testItemId = '44444444-4444-4444-4444-444444444444';

      const result = await callViewer(session, 'sendGroupNotice', {
        groupId: testGroupId,
        subject: 'Club Party',
        message: 'Teleport with the attached landmark!',
        attachment: {
          itemId: testItemId,
          itemName: 'Club Landmark',
          itemType: 3, // Landmark = 3
        },
      });

      expect(result.success).toBe(true);
      expect(result.hasAttachment).toBe(true);

      expect(sendMessageMock).toHaveBeenCalledTimes(1);
      const [msg] = sendMessageMock.mock.calls[0];
      expect(msg.MessageBlock.Dialog).toBe(32);

      const bucket = msg.MessageBlock.BinaryBucket;
      expect(bucket.length).toBe(18);
      expect(bucket[0]).toBe(1); // Has attachment flag
      expect(bucket[1]).toBe(3); // Item type (Landmark = 3)

      // Bytes 2..17 contain item UUID
      const readUuid = bucket.slice(2, 18).toString('hex');
      expect(readUuid).toBe(testItemId.replace(/-/g, ''));
    });
  });

  describe('Requirement 4 & 6: GroupsManager & NoticeStore Integration', () => {
    it('GroupsManager.sendGroupNotice writes notice to NoticeStore and IndexedDB storage', async () => {
      const noticeStore = new NoticeStore(null, null);
      noticeStore.setAgentId(testAgentId);
      app.groups.setNoticeStore(noticeStore);

      vi.spyOn(slBridge, 'connected', 'get').mockReturnValue(true);
      const bridgeSpy = vi.spyOn(slBridge, 'sendGroupNotice').mockResolvedValue({
        success: true,
        id: 'notice-abc-123',
        groupId: testGroupId,
        subject: 'Test Subject',
        message: 'Test Message',
        from: 'Officer Test',
        timestamp: 1700000000000,
      });

      const idbSaveSpy = vi.spyOn(indexedDBStore, 'saveGroupNotices').mockResolvedValue();

      const notice = await app.groups.sendGroupNotice(testGroupId, {
        subject: 'Test Subject',
        message: 'Test Message',
        attachment: {
          itemId: '55555555-5555-5555-5555-555555555555',
          itemName: 'Free Notecard',
          itemType: 7, // Notecard
        },
      });

      expect(bridgeSpy).toHaveBeenCalled();
      expect(notice.subject).toBe('Test Subject');
      expect(notice.hasAttachment).toBe(true);
      expect(notice.attachment?.attachmentName).toBe('Free Notecard');

      // Check NoticeStore list
      const storeList = noticeStore.list();
      expect(storeList.some((n) => n.subject === 'Test Subject')).toBe(true);

      // Check in-memory group notices
      const groupNotices = app.groups.getGroupNotices(testGroupId);
      expect(groupNotices.some((n) => n.subject === 'Test Subject')).toBe(true);

      // Check IndexedDB store invocation
      expect(idbSaveSpy).toHaveBeenCalled();
    });
  });

  describe('Requirement 2 & 3: CreateGroupNoticeModal UI & Accessibility', () => {
    it('renders modal with role="dialog", FocusTrap, character counters, and attachment selector', async () => {
      app.inventory.items.set('item-1', {
        id: 'item-1',
        name: 'Club Entrance LM',
        assetType: 3, // Landmark
      });
      app.inventory.items.set('item-2', {
        id: 'item-2',
        name: 'Club Rules Notecard',
        assetType: 7, // Notecard
      });
      app.inventory.items.set('item-3', {
        id: 'item-3',
        name: 'Party Hat',
        assetType: 5, // Clothing
      });
      app.inventory.items.set('item-4', {
        id: 'item-4',
        name: 'Unusable Sound',
        assetType: 1, // Sound (not eligible)
      });

      const onClose = vi.fn();
      const onNoticeSuccess = vi.fn();

      const mounted = await mountScreen(() => (
        <CreateGroupNoticeModal
          isOpen={true}
          onClose={onClose}
          groupId={testGroupId}
          groupName="Nightclub VIPs"
          onNoticeSuccess={onNoticeSuccess}
          V={testThemeV}
          t={testThemeT}
        />
      ));
      await flush();

      const dialog = mounted.host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.getAttribute('aria-labelledby')).toBe('create-notice-dialog-title');

      // Verify character counters initially 0/63 and 0/512
      expect(mounted.host.textContent).toContain('0/63');
      expect(mounted.host.textContent).toContain('0/512');

      // Verify attachment dropdown contains eligible items (Landmark, Notecard, Clothing) and excludes Sound
      const select = mounted.host.querySelector('#notice-attachment') as HTMLSelectElement;
      expect(select).not.toBeNull();
      const options = Array.from(select.options).map((o) => o.textContent);
      expect(options.some((o) => o?.includes('Club Entrance LM'))).toBe(true);
      expect(options.some((o) => o?.includes('Club Rules Notecard'))).toBe(true);
      expect(options.some((o) => o?.includes('Party Hat'))).toBe(true);
      expect(options.some((o) => o?.includes('Unusable Sound'))).toBe(false);

      await unmount(mounted);
    });

    it('surfaces inline validation errors on empty subject or empty message submission', async () => {
      const mounted = await mountScreen(() => (
        <CreateGroupNoticeModal
          isOpen={true}
          onClose={vi.fn()}
          groupId={testGroupId}
          groupName="Nightclub VIPs"
          V={testThemeV}
          t={testThemeT}
        />
      ));
      await flush();

      const form = mounted.host.querySelector('form')!;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await flush();

      // Inline error for subject
      const alert1 = mounted.host.querySelector('[role="alert"]');
      expect(alert1).not.toBeNull();
      expect(alert1?.textContent).toContain('Subject is required');

      // Fill subject, leaving message empty
      const subjectInput = mounted.host.querySelector('#notice-subject') as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(subjectInput, 'Valid Subject');
        subjectInput.dispatchEvent(new Event('input', { bubbles: true }));
        subjectInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await flush();

      // Inline error for message
      const alert2 = mounted.host.querySelector('[role="alert"]');
      expect(alert2).not.toBeNull();
      expect(alert2?.textContent).toContain('Message is required');

      await unmount(mounted);
    });

    it('submits valid notice with attachment and prevents duplicate submission while dispatch is active', async () => {
      const sendSpy = vi.spyOn(app, 'sendGroupNotice').mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: 'notice-sent-1',
                  groupId: testGroupId,
                  subject: 'Grand Opening',
                  message: 'Doors open at 9 PM!',
                  hasAttachment: true,
                  attachment: {
                    hasAttachment: true,
                    attachmentName: 'Venue LM',
                    attachmentItemId: 'lm-1',
                    attachmentType: 3,
                    attachmentOwnerId: null,
                    savedToInventoryAt: null,
                  },
                  from: 'Club Owner',
                  timestamp: Date.now(),
                  calendar: null,
                }),
              50,
            ),
          ),
      );

      app.inventory.items.set('lm-1', {
        id: 'lm-1',
        name: 'Venue LM',
        assetType: 3,
      });

      const onNoticeSuccess = vi.fn();
      const onClose = vi.fn();

      const mounted = await mountScreen(() => (
        <CreateGroupNoticeModal
          isOpen={true}
          onClose={onClose}
          groupId={testGroupId}
          groupName="Nightclub VIPs"
          onNoticeSuccess={onNoticeSuccess}
          V={testThemeV}
          t={testThemeT}
        />
      ));
      await flush();

      const subjectInput = mounted.host.querySelector('#notice-subject') as HTMLInputElement;
      const messageInput = mounted.host.querySelector('#notice-message') as HTMLTextAreaElement;
      const select = mounted.host.querySelector('#notice-attachment') as HTMLSelectElement;

      await act(async () => {
        const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setVal.call(subjectInput, 'Grand Opening');
        subjectInput.dispatchEvent(new Event('input', { bubbles: true }));
        subjectInput.dispatchEvent(new Event('change', { bubbles: true }));

        const setText = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )!.set!;
        setText.call(messageInput, 'Doors open at 9 PM!');
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        messageInput.dispatchEvent(new Event('change', { bubbles: true }));

        const setSelect = Object.getOwnPropertyDescriptor(
          HTMLSelectElement.prototype,
          'value',
        )!.set!;
        setSelect.call(select, 'lm-1');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      // Verify character counters updated
      expect(mounted.host.textContent).toContain('13/63');
      expect(mounted.host.textContent).toContain('19/512');

      const submitBtn = buttonByText(mounted.host, /Send Notice/i) as HTMLButtonElement;
      expect(submitBtn).not.toBeNull();
      expect(submitBtn.disabled).toBe(false);

      const form = mounted.host.querySelector('form')!;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      // While dispatch is active, submit button is disabled
      expect(submitBtn.disabled).toBe(true);

      // Subsequent submit attempt is ignored (Constraint 4: duplicate submission blocked)
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(sendSpy).toHaveBeenCalledTimes(1);

      // Wait for dispatch promise to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });
      await flush();

      expect(sendSpy).toHaveBeenCalledWith(testGroupId, {
        subject: 'Grand Opening',
        message: 'Doors open at 9 PM!',
        attachment: {
          itemId: 'lm-1',
          itemName: 'Venue LM',
          itemType: 3,
          ownerId: '',
        },
      });
      expect(onNoticeSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();

      await unmount(mounted);
    });
  });

  describe('Requirement 1 & Acceptance Criteria 1 & 5: GroupsScreen UI Permission Gating & Live Update', () => {
    it('officer with NOTICES_SEND power sees CREATE NOTICE button in NOTICES tab and can publish a notice that appears immediately', async () => {
      app.protocol.agentId = testAgentId;

      // Group where user has NOTICES_SEND power (1n << 14n = 16384n)
      const officerGroup = {
        id: testGroupId,
        name: 'Officer Group',
        powers: (1n << 14n).toString(),
      };
      app.groups.replaceGroups([officerGroup]);

      const testMembers = [{ id: testAgentId, name: 'Officer User', title: 'Officer' }];
      app.groups.replaceMembers(testGroupId, testMembers);

      vi.spyOn(app, 'loadGroups').mockResolvedValue([officerGroup]);
      vi.spyOn(app, 'loadGroupDetails').mockResolvedValue([]);

      const mounted = await mountScreen(GroupsScreen);
      await flush();

      // Click on NOTICES tab
      const noticesTabBtn = buttonByText(mounted.host, /NOTICES/i);
      expect(noticesTabBtn).toBeDefined();
      await click(noticesTabBtn);
      await flush();

      // Verify CREATE NOTICE button is rendered (Criterion 1)
      const createNoticeBtn = buttonByText(mounted.host, /CREATE NOTICE/i);
      expect(createNoticeBtn).toBeDefined();

      // Click CREATE NOTICE to open composer dialog (Criterion 2)
      await click(createNoticeBtn);
      await flush();

      const dialog = mounted.host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain('Create Group Notice');

      // Mock successful dispatch
      const newNotice = {
        id: 'notice-live-99',
        groupId: testGroupId,
        subject: 'Urgent Announcement',
        message: 'All members please read.',
        from: 'Officer User',
        timestamp: Date.now(),
        hasAttachment: false,
        attachment: null,
      };
      vi.spyOn(app, 'sendGroupNotice').mockImplementation(async () => {
        app.groups.addGroupNotice(testGroupId, newNotice);
        app.notices.receive(newNotice);
        return newNotice as any;
      });

      // Fill form and submit
      const subjectInput = mounted.host.querySelector('#notice-subject') as HTMLInputElement;
      const messageInput = mounted.host.querySelector('#notice-message') as HTMLTextAreaElement;

      expect(subjectInput).not.toBeNull();
      expect(messageInput).not.toBeNull();

      const inputProto = Object.getPrototypeOf(subjectInput);
      const textProto = Object.getPrototypeOf(messageInput);

      await act(async () => {
        const setVal = (Object.getOwnPropertyDescriptor(inputProto, 'value') ||
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value'))!.set!;
        setVal.call(subjectInput, 'Urgent Announcement');
        subjectInput.dispatchEvent(new Event('input', { bubbles: true }));
        subjectInput.dispatchEvent(new Event('change', { bubbles: true }));

        const setText = (Object.getOwnPropertyDescriptor(textProto, 'value') ||
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'))!.set!;
        setText.call(messageInput, 'All members please read.');
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        messageInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flush();

      const form = mounted.host.querySelector('form')!;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await flush();

      // Dialog is closed
      expect(mounted.host.querySelector('[role="dialog"]')).toBeNull();

      // Criterion 5: The new notice appears immediately in the notices list
      expect(mounted.host.textContent).toContain('Urgent Announcement');
      expect(mounted.host.textContent).toContain('1 NOTICE');

      await unmount(mounted);
    });

    it('restricted member lacking NOTICES_SEND power does not see CREATE NOTICE button in NOTICES tab', async () => {
      app.protocol.agentId = testAgentId;

      // Group where user has NO powers (0n)
      const memberGroup = {
        id: testGroupId,
        name: 'Member Group',
        powers: '0',
      };
      app.groups.replaceGroups([memberGroup]);

      const testMembers = [{ id: testAgentId, name: 'Normal Member', title: 'Member' }];
      app.groups.replaceMembers(testGroupId, testMembers);

      vi.spyOn(app, 'loadGroups').mockResolvedValue([memberGroup]);
      vi.spyOn(app, 'loadGroupDetails').mockResolvedValue([]);

      const mounted = await mountScreen(GroupsScreen);
      await flush();

      // Click on NOTICES tab
      const noticesTabBtn = buttonByText(mounted.host, /NOTICES/i);
      expect(noticesTabBtn).toBeDefined();
      await click(noticesTabBtn);
      await flush();

      // Verify CREATE NOTICE button is NOT rendered
      const createNoticeBtn = buttonByText(mounted.host, /CREATE NOTICE/i);
      expect(createNoticeBtn).toBeUndefined();

      await unmount(mounted);
    });
  });
});
