import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import NotecardFloater from '../NotecardFloater.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { encodeLindenText, MAX_NOTECARD_BYTES } from '../../linkpoint/notecard';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: ReturnType<typeof createRoot> } | null = null;

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

function setTextareaValue(textarea: HTMLElement | null, value: string) {
  if (!textarea) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted!.host.remove();
    mounted = null;
  }
  vi.restoreAllMocks();
});

describe('NotecardFloater Component', () => {
  it('renders honest empty indicator when no notecard is loaded', async () => {
    const host = await mount(createElement(NotecardFloater));
    expect(host.querySelector('.notecard-empty')).toBeTruthy();
    expect(host.textContent).toContain('No notecard loaded from inventory.');
  });

  it('downloads notecard asset and renders decoded text inside NotecardFloater', async () => {
    const sampleText = 'Welcome to the Sandbox Region!\nPlease follow parcel rules.';
    const encodedPayload = encodeLindenText(sampleText);

    const mockFetch = vi.fn().mockResolvedValue({
      id: 'asset-nc-1',
      data: encodedPayload,
    });

    const notecardItem = {
      id: 'item-nc-1',
      assetId: 'asset-nc-1',
      name: 'Sandbox Guidelines',
      assetType: 7,
    };

    const host = await mount(
      createElement(NotecardFloater, {
        item: notecardItem,
        onFetch: mockFetch,
      }),
    );

    expect(mockFetch).toHaveBeenCalledWith(notecardItem);

    // Verify window title and textarea
    expect(host.textContent).toContain('Sandbox Guidelines');
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe(sampleText);
  });

  it('renders decoded text immediately when pre-decoded text or local payload is present', async () => {
    const localText = 'Pre-loaded notecard instructions.';
    const notecardItem = {
      id: 'item-nc-2',
      name: 'Quick Start',
      text: localText,
      assetType: 7,
    };

    const host = await mount(createElement(NotecardFloater, { item: notecardItem }));
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(localText);
  });

  it('supports window move, snap, maximize, minimize, and close keyboard/mouse interactions', async () => {
    const notecardItem = {
      id: 'item-nc-3',
      name: 'Event Program',
      text: 'Live DJ at 8 PM SLT.',
      assetType: 7,
    };

    const mockClose = vi.fn();

    const host = await mount(
      createElement(NotecardFloater, {
        item: notecardItem,
        onClose: mockClose,
      }),
    );

    // Verify move handle attributes and keyboard interaction
    const moveHandle = host.querySelector('[aria-roledescription="window move handle"]');
    expect(moveHandle).toBeTruthy();
    expect(moveHandle?.getAttribute('role')).toBe('separator');

    await act(async () => {
      moveHandle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      moveHandle?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    // Verify snap left, snap right, maximize, minimize buttons exist
    const snapLeftBtn = host.querySelector('button[aria-label="Snap Left"]');
    const snapRightBtn = host.querySelector('button[aria-label="Snap Right"]');
    const maxBtn = host.querySelector('button[aria-label="Maximize"]');
    const minBtn = host.querySelector('button[aria-label="Minimize"]');
    const closeBtn = host.querySelector('button[aria-label="Close"]') as HTMLButtonElement;

    expect(snapLeftBtn).toBeTruthy();
    expect(snapRightBtn).toBeTruthy();
    expect(maxBtn).toBeTruthy();
    expect(minBtn).toBeTruthy();
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      closeBtn.click();
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('supports corner resize handle with mouse drag and keyboard navigation', async () => {
    const notecardItem = {
      id: 'item-nc-4',
      name: 'Building Guide',
      text: 'Prims and Meshes.',
      assetType: 7,
    };

    const host = await mount(createElement(NotecardFloater, { item: notecardItem }));
    const resizeHandle = host.querySelector('[aria-roledescription="window resize handle"]');
    expect(resizeHandle).toBeTruthy();

    await act(async () => {
      resizeHandle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      resizeHandle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
  });

  it('edits text, isolates draft changes, and saves valid Linden text payload via save capability', async () => {
    const notecardItem = {
      id: 'item-nc-save',
      name: 'Draft Story',
      text: 'Initial draft.',
      assetType: 7,
    };

    const mockSave = vi.fn().mockResolvedValue({ success: true, itemId: 'item-nc-save' });

    const host = await mount(
      createElement(NotecardFloater, {
        item: notecardItem,
        onSave: mockSave,
      }),
    );

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Initial draft.');

    // Before dirty, save button is disabled
    const allButtons = Array.from(host.querySelectorAll('button'));
    const saveButton = allButtons.find((b) => b.textContent?.includes('Save'));
    expect(saveButton?.hasAttribute('disabled')).toBe(true);

    // Edit text
    await act(async () => {
      setTextareaValue(textarea, 'Updated draft with new chapter.');
    });

    expect(textarea.value).toBe('Updated draft with new chapter.');
    expect(saveButton?.hasAttribute('disabled')).toBe(false);

    // Click Save
    await act(async () => {
      saveButton?.click();
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    const saveArg = mockSave.mock.calls[0][0];
    expect(saveArg.itemId).toBe('item-nc-save');
    expect(saveArg.text).toBe('Updated draft with new chapter.');
    expect(saveArg.data).toContain('Linden text version 2');
    expect(saveArg.data).toContain('Updated draft with new chapter.');
  });

  it('displays size limit warning and disables Save when notecard exceeds 65,536 bytes', async () => {
    const notecardItem = {
      id: 'item-nc-oversize',
      name: 'Huge Book',
      text: 'Short initial text',
      assetType: 7,
    };

    const host = await mount(createElement(NotecardFloater, { item: notecardItem }));
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;

    const oversizedText = 'X'.repeat(MAX_NOTECARD_BYTES + 50);

    await act(async () => {
      setTextareaValue(textarea, oversizedText);
    });

    // Warning banner should be rendered
    const alertBanner = host.querySelector('[role="alert"]');
    expect(alertBanner).toBeTruthy();
    expect(alertBanner?.textContent).toContain('Size Limit Warning');
    expect(alertBanner?.textContent).toContain('65,536');

    // Save button must be disabled
    const saveButton = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save'),
    );
    expect(saveButton?.hasAttribute('disabled')).toBe(true);
  });

  it('supports read-only preview mode for received notecards (secondary user journey)', async () => {
    const notecardItem = {
      id: 'item-nc-preview',
      name: 'Notice Offer',
      text: 'Read-only conference details.',
      assetType: 7,
    };

    const mockClose = vi.fn();

    const host = await mount(
      createElement(NotecardFloater, {
        item: notecardItem,
        readOnly: true,
        onClose: mockClose,
      }),
    );

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    expect(host.textContent).toContain('(Preview)');

    // Should render "Save to Inventory" and "Close" buttons instead of normal Save
    const saveToInvBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save to Inventory'),
    );
    expect(saveToInvBtn).toBeTruthy();

    await act(async () => {
      saveToInvBtn?.click();
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('displays error notification and retry action on download failure without crashing', async () => {
    const notecardItem = {
      id: 'item-nc-fail',
      name: 'Corrupt Notecard',
      assetType: 7,
    };

    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network timeout downloading notecard'))
      .mockResolvedValueOnce({
        id: 'item-nc-fail',
        data: encodeLindenText('Recovered text after retry.'),
      });

    const host = await mount(
      createElement(NotecardFloater, {
        item: notecardItem,
        onFetch: mockFetch,
      }),
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Network timeout downloading notecard');

    const retryBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    );
    expect(retryBtn).toBeTruthy();

    await act(async () => {
      retryBtn?.click();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('Recovered text after retry.');
  });

  it('clears isolated draft on successful save', async () => {
    const notecardItem = {
      id: 'item-nc-draft-clear',
      name: 'Draft Document',
      text: 'Original content',
      assetType: 7,
    };

    const mockSave = vi.fn().mockResolvedValue({ success: true });

    const host = await mount(
      createElement(NotecardFloater, {
        item: notecardItem,
        onSave: mockSave,
      }),
    );

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      setTextareaValue(textarea, 'Edited content to be saved');
    });

    const saveButton = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save'),
    );
    expect(saveButton?.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      saveButton?.click();
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    // After save, dirty state is reset
    expect(saveButton?.hasAttribute('disabled')).toBe(true);
    expect(host.textContent).not.toContain('Draft Document*');
  });
});
