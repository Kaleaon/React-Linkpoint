// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useState } from 'react';
import { NoticeAttachmentBanner, NoticesScreen } from '../LiveScreens.jsx';
import { app } from '../../linkpoint/app';
import { Utils } from '../../linkpoint/utils';
import {
  mountScreen,
  unmount,
  click,
  buttonByText,
  type Mounted,
} from '../../linkpoint/__tests__/ui-helpers';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('NoticeAttachmentBanner CrystalLoader & AccessibleButton', () => {
  let mounted: Mounted | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    app.notices.clear();
  });

  afterEach(async () => {
    if (mounted) {
      await unmount(mounted);
      mounted = null;
    }
    app.notices.clear();
  });

  it('renders idle AccessibleButton without CrystalLoader or aria-busy', async () => {
    const notice = {
      id: 'notice-idle-1',
      groupId: 'group-1',
      subject: 'Monthly Update',
      hasAttachment: true,
      attachmentName: 'Club Rules Notecard',
      attachmentItemId: 'item-101',
      attachmentOwnerId: 'owner-101',
      attachmentType: 7,
    };

    mounted = await mountScreen(() => <NoticeAttachmentBanner notice={notice} />);

    const banner = mounted.host.querySelector('[aria-label="Notice Attachment"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Club Rules Notecard');
    expect(banner?.textContent).toContain('ATTACHMENT · NOTECARD');

    const saveBtn = buttonByText(mounted.host, 'SAVE TO INVENTORY');
    expect(saveBtn).toBeDefined();
    expect(saveBtn?.getAttribute('role')).toBe('button');
    expect(saveBtn?.getAttribute('type')).toBe('button');
    expect(saveBtn?.getAttribute('tabindex')).toBe('0');
    expect(saveBtn?.disabled).toBe(false);
    expect(saveBtn?.getAttribute('aria-disabled')).toBeNull();
    expect(saveBtn?.getAttribute('aria-busy')).toBeNull();
    expect(mounted.host.querySelector('[data-testid="crystal-loader"]')).toBeNull();
  });

  it('mounts inline CrystalLoader (size 13) with aria-busy="true" during active save and unmounts on completion', async () => {
    const deferred = createDeferred<{ accepted: boolean }>();
    const acceptSpy = vi
      .spyOn(app.protocol, 'acceptGroupNoticeAttachment')
      .mockReturnValue(deferred.promise);
    const toastSpy = vi.spyOn(Utils, 'showToast').mockImplementation(() => undefined);

    const seeded = app.notices.receive({
      id: 'notice-save-1',
      groupId: 'group-2',
      groupName: 'Builders Guild',
      senderName: 'Creator Resident',
      subject: 'Builder Kit',
      message: 'Free mesh box inside',
      timestamp: Date.now(),
      hasAttachment: true,
      attachmentName: 'Starter Mesh Box',
      attachmentItemId: 'item-202',
      attachmentOwnerId: 'owner-202',
      attachmentType: 6,
    });
    if (!seeded) throw new Error('Expected seeded notice');

    let notifySaved: ((ts: number) => void) | null = null;
    const origMark = app.notices.markAttachmentSaved.bind(app.notices);
    const markSpy = vi.spyOn(app.notices, 'markAttachmentSaved').mockImplementation((id, ts) => {
      const updated = origMark(id, ts);
      notifySaved?.(updated.savedToInventoryAt ?? Date.now());
      return updated;
    });

    const StatefulHarness = () => {
      const [savedAt, setSavedAt] = useState<number | null>(seeded.savedToInventoryAt ?? null);
      notifySaved = setSavedAt;
      return (
        <NoticeAttachmentBanner
          notice={{
            ...seeded,
            savedToInventoryAt: savedAt,
            attachment: seeded.attachment
              ? { ...seeded.attachment, savedToInventoryAt: savedAt }
              : undefined,
          }}
        />
      );
    };

    mounted = await mountScreen(StatefulHarness);

    const saveBtn = buttonByText(mounted.host, 'SAVE TO INVENTORY');
    expect(saveBtn).toBeDefined();

    // Start asynchronous transfer
    await click(saveBtn);

    // Active transfer assertions
    const busyBtn = buttonByText(mounted.host, 'SAVING...');
    expect(busyBtn).toBeDefined();
    expect(busyBtn?.getAttribute('aria-busy')).toBe('true');
    expect(busyBtn?.disabled).toBe(true);
    expect(busyBtn?.getAttribute('aria-disabled')).toBe('true');
    expect(busyBtn?.getAttribute('tabindex')).toBe('-1');

    const loader = mounted.host.querySelector(
      '[data-testid="crystal-loader"]',
    ) as HTMLElement | null;
    expect(loader).not.toBeNull();
    expect(loader?.getAttribute('data-variant')).toBe('inline');
    expect(loader?.style.width).toBe('13px');
    expect(loader?.style.height).toBe('13px');

    // Rapid duplicate clicks and keyboard activations must be blocked while saving
    await click(busyBtn);
    await act(async () => {
      busyBtn?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
      busyBtn?.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
      );
    });
    expect(acceptSpy).toHaveBeenCalledTimes(1);
    expect(acceptSpy).toHaveBeenCalledWith({
      id: 'notice-save-1',
      noticeId: 'notice-save-1',
      groupId: 'group-2',
      attachmentItemId: 'item-202',
      attachmentOwnerId: 'owner-202',
    });

    // Resolve transfer
    await act(async () => {
      deferred.resolve({ accepted: true });
      await deferred.promise;
    });

    // Loader unmounts and button transitions to SAVED TO INVENTORY without aria-busy
    expect(markSpy).toHaveBeenCalledWith('notice-save-1');
    expect(mounted.host.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    const savedBtn = buttonByText(mounted.host, 'SAVED TO INVENTORY');
    expect(savedBtn).toBeDefined();
    expect(savedBtn?.getAttribute('aria-busy')).toBeNull();
    expect(savedBtn?.disabled).toBe(true);
    expect(savedBtn?.getAttribute('aria-disabled')).toBe('true');
    expect(toastSpy).toHaveBeenCalledWith('Starter Mesh Box saved to inventory', 'success');
  });

  it('unmounts CrystalLoader, clears aria-busy, and restores interactive SAVE TO INVENTORY on transfer error', async () => {
    const deferred = createDeferred<{ accepted: boolean }>();
    const acceptSpy = vi
      .spyOn(app.protocol, 'acceptGroupNoticeAttachment')
      .mockReturnValueOnce(deferred.promise)
      .mockResolvedValueOnce({ accepted: true });
    const toastSpy = vi.spyOn(Utils, 'showToast').mockImplementation(() => undefined);

    const notice = {
      id: 'notice-err-1',
      groupId: 'group-3',
      subject: 'Event Flyer',
      hasAttachment: true,
      attachmentName: 'Event Poster Texture',
      attachmentItemId: 'item-303',
      attachmentOwnerId: 'owner-303',
      attachmentType: 0,
    };

    mounted = await mountScreen(() => <NoticeAttachmentBanner notice={notice} />);

    const saveBtn = buttonByText(mounted.host, 'SAVE TO INVENTORY');
    await click(saveBtn);

    // Verify busy state before failure
    expect(mounted.host.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();
    expect(buttonByText(mounted.host, 'SAVING...')?.getAttribute('aria-busy')).toBe('true');

    // Reject transfer
    await act(async () => {
      deferred.reject(new Error('Simulator capability timeout'));
      try {
        await deferred.promise;
      } catch {
        // Expected rejection handled inside NoticeAttachmentBanner
      }
    });

    // Verify recovery to interactive idle state
    expect(mounted.host.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    const restoredBtn = buttonByText(mounted.host, 'SAVE TO INVENTORY');
    expect(restoredBtn).toBeDefined();
    expect(restoredBtn?.getAttribute('aria-busy')).toBeNull();
    expect(restoredBtn?.disabled).toBe(false);
    expect(restoredBtn?.getAttribute('aria-disabled')).toBeNull();
    expect(restoredBtn?.getAttribute('tabindex')).toBe('0');
    expect(toastSpy).toHaveBeenCalledWith(
      'Failed to save attachment: Simulator capability timeout',
      'error',
    );

    // Retry via keyboard Enter works after error recovery
    await act(async () => {
      restoredBtn?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    expect(acceptSpy).toHaveBeenCalledTimes(2);
  });

  it('preserves landmark teleport action alongside AccessibleButton save control in NoticesScreen', async () => {
    const teleportSpy = vi.spyOn(app.protocol, 'teleportTo').mockResolvedValue({
      requested: { region: 'Ahern', x: 128, y: 128, z: 25 },
      message: 'Teleporting',
    });

    mounted = await mountScreen(NoticesScreen);

    await act(async () => {
      app.notices.receive({
        id: 'notice-lm-1',
        groupId: 'group-4',
        groupName: 'Explorers Guild',
        senderName: 'Scout Resident',
        subject: 'New Destination',
        message: 'Visit the new hub!',
        timestamp: Date.now(),
        hasAttachment: true,
        attachmentName: 'Ahern Welcome Hub',
        attachmentItemId: 'item-lm-404',
        attachmentType: 3,
      });
    });

    // Expand notice item in NoticesScreen
    await click(mounted.host.querySelector('article button'));

    const saveBtn = buttonByText(mounted.host, 'SAVE TO INVENTORY');
    expect(saveBtn).toBeDefined();
    expect(saveBtn?.getAttribute('role')).toBe('button');

    const tpBtn = buttonByText(mounted.host, 'TELEPORT TO LANDMARK');
    expect(tpBtn).toBeDefined();

    await click(tpBtn);
    expect(teleportSpy).toHaveBeenCalledWith('Ahern Welcome Hub');
  });
});
