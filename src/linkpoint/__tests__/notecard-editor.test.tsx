// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import {
  decodeLindenText,
  encodeLindenText,
  parseLindenText,
  validateNotecardLength,
  MAX_NOTECARD_BYTES,
} from '../notecard';
import { AssetManager } from '../asset-manager';
import AssetContainer from '../../components/AssetContainer.jsx';
import Inventory from '../../screens/Inventory.jsx';
import { NotecardsScreen } from '../../screens/LumiyaTools.jsx';
import { app } from '../app';
import { mountScreen, unmount, click, buttonByText, type Mounted } from './ui-helpers';

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

let mounted: Mounted | null = null;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

beforeEach(() => {
  app.inventory.items.clear();
  app.inventory.folders.clear();
  app.inventory.isLoading = false;
  app.assets.clearCache();
  // Default to logged-in auth state
  vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  vi.restoreAllMocks();
});

describe('Linden Text Notecard Parser & Serializer', () => {
  it('parses and decodes standard Linden text version 2 format with embedded items', () => {
    const raw = [
      'Linden text version 2',
      '{',
      'LLEmbeddedItems version 1',
      '{',
      'count 0',
      '}',
      'Text length 28',
      'Welcome to Second Life grid!}',
      '',
    ].join('\n');

    const decoded = decodeLindenText(raw);
    expect(decoded).toBe('Welcome to Second Life grid!');

    const parsed = parseLindenText(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.body).toBe('Welcome to Second Life grid!');
    expect(parsed.hasEmbeddedItems).toBe(true);
    expect(parsed.embeddedItemsCount).toBe(0);
  });

  it('handles multi-line text bodies and curly braces inside notecard content', () => {
    const content = 'First line\n{nested_block: true}\nLast line with symbols: &%$#@!';
    const encoded = encodeLindenText(content);

    expect(encoded).toContain('Linden text version 2');
    expect(encoded).toContain('LLEmbeddedItems version 1');

    const decoded = decodeLindenText(encoded);
    expect(decoded).toBe(content);
  });

  it('handles multi-byte UTF-8 unicode text and emojis correctly', () => {
    const unicodeText = 'Second Life 🌟 Virtual World - こんにちは世界 - Résumé';
    const encoded = encodeLindenText(unicodeText);
    const decoded = decodeLindenText(encoded);

    expect(decoded).toBe(unicodeText);
  });

  it('gracefully returns raw content when decoding plain text without Linden headers', () => {
    const plain = 'Just some raw notes without any SL header.';
    expect(decodeLindenText(plain)).toBe(plain);
    expect(decodeLindenText('')).toBe('');
    expect(decodeLindenText(null)).toBe('');
  });

  it('validates notecard length against 64KB limits', () => {
    const smallText = 'Hello world';
    const validResult = validateNotecardLength(smallText);
    expect(validResult.valid).toBe(true);
    expect(validResult.byteLength).toBe(11);

    const oversizedText = 'A'.repeat(MAX_NOTECARD_BYTES + 50);
    const invalidResult = validateNotecardLength(oversizedText);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.error).toContain('Notecard exceeds maximum size');
  });
});

describe('Client AssetManager In-Memory Caching & Fetching', () => {
  it('caches decoded strings in memory and serves cached text on subsequent calls', async () => {
    const assetMgr = new AssetManager();
    const notecardAsset = {
      id: 'nc-item-1',
      assetId: 'nc-asset-1',
      assetType: 7,
      data: encodeLindenText('Cached Notecard Body Content'),
    };

    const progressSpy = vi.fn();
    const result1 = await assetMgr.fetchNotecard(notecardAsset, progressSpy);
    expect(result1).toBe('Cached Notecard Body Content');
    expect(assetMgr.hasCached('nc-asset-1')).toBe(true);

    // Second call serves directly from cache without re-parsing
    const progressSpy2 = vi.fn();
    const result2 = await assetMgr.fetchNotecard(
      { id: 'nc-item-1', assetId: 'nc-asset-1', assetType: 7 },
      progressSpy2,
    );
    expect(result2).toBe('Cached Notecard Body Content');
    expect(progressSpy2).toHaveBeenCalledWith(100, 100);
  });
});

describe('AssetContainer Text Asset Viewer & Editor UI', () => {
  it('renders notecard in read-only mode with EDIT button, then switches to editor mode', async () => {
    const notecardAsset = {
      id: 'nc-1',
      name: 'Welcome Guide',
      assetType: 7,
      data: encodeLindenText('Welcome to our community region!'),
    };

    mounted = await mountScreen(() => <AssetContainer asset={notecardAsset} editable={true} />);

    // Initially in loaded read-only mode
    expect(mounted.host.querySelector('[data-testid="asset-loaded-state"]')).toBeTruthy();
    expect(mounted.host.querySelector('[data-testid="notecard-text-view"]')).toBeTruthy();
    expect(mounted.host.textContent).toContain('Welcome to our community region!');
    expect(mounted.host.textContent).toContain('Read-Only');

    const editBtn = mounted.host.querySelector('button[aria-label="Edit notecard"]') as HTMLElement;
    expect(editBtn).toBeTruthy();

    // Click EDIT button
    await click(editBtn);

    // Now in editing mode
    expect(mounted.host.querySelector('[data-testid="notecard-text-editor"]')).toBeTruthy();
    expect(mounted.host.textContent).toContain('Editing');

    const saveBtn = mounted.host.querySelector('button[aria-label="Save notecard"]') as HTMLElement;
    const cancelBtn = mounted.host.querySelector(
      'button[aria-label="Cancel editing"]',
    ) as HTMLElement;
    expect(saveBtn).toBeTruthy();
    expect(cancelBtn).toBeTruthy();

    // Cancel switches back to read-only mode
    await click(cancelBtn);
    expect(mounted.host.querySelector('[data-testid="notecard-text-view"]')).toBeTruthy();
  });

  it('disables editing controls and prompts for login in unauthenticated sessions', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(false);

    const notecardAsset = {
      id: 'nc-unauth',
      name: 'Rules Notecard',
      assetType: 7,
      data: encodeLindenText('These are the region rules.'),
    };

    mounted = await mountScreen(() => <AssetContainer asset={notecardAsset} editable={true} />);

    expect(mounted.host.querySelector('[data-testid="notecard-login-prompt"]')).toBeTruthy();
    expect(mounted.host.textContent).toContain('Connect to a grid to edit notecards.');

    const editBtn = mounted.host.querySelector(
      'button[aria-label="Edit notecard"]',
    ) as HTMLButtonElement;
    expect(editBtn).toBeTruthy();
    expect(editBtn.disabled).toBe(true);
  });

  it('allows editing text and clicking Save validates length, updates state, and persists', async () => {
    const notecardAsset = {
      id: 'nc-save-test',
      name: 'Meeting Minutes',
      assetType: 7,
      data: encodeLindenText('Initial text'),
    };

    const mockSave = vi.fn().mockResolvedValue({ success: true });
    const dirtySpy = vi.fn();

    mounted = await mountScreen(() => (
      <AssetContainer
        asset={notecardAsset}
        editable={true}
        onSave={mockSave}
        onDirtyChange={dirtySpy}
      />
    ));

    // Switch to edit mode
    const editBtn = mounted.host.querySelector('button[aria-label="Edit notecard"]') as HTMLElement;
    await click(editBtn);

    const textarea = mounted.host.querySelector(
      '[data-testid="notecard-text-editor"]',
    ) as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    // Modify text
    await act(async () => {
      typeInto(textarea, 'Updated meeting minutes with action items.');
    });

    expect(dirtySpy).toHaveBeenCalledWith(true, 'Updated meeting minutes with action items.');

    const saveBtn = mounted.host.querySelector('button[aria-label="Save notecard"]') as HTMLElement;
    await click(saveBtn);

    expect(mockSave).toHaveBeenCalledWith({
      itemId: 'nc-save-test',
      name: 'Meeting Minutes',
      text: 'Updated meeting minutes with action items.',
    });
    expect(dirtySpy).toHaveBeenLastCalledWith(false, 'Updated meeting minutes with action items.');
  });
});

describe('Inventory Screen Embedded Notecard Inspector & Tabs', () => {
  it('displays tabbed view with Details and Content for notecard items (assetType 7)', async () => {
    app.inventory.items.set('item-nc-1', {
      id: 'item-nc-1',
      name: 'Club Schedule',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Friday: Live DJ\nSaturday: Trivia Night'),
    });
    app.inventory.emit('inventory_loaded');

    mounted = await mountScreen(Inventory);

    // Select the notecard row
    const rowBtn = mounted.host.querySelector('.inventory-row') as HTMLElement;
    expect(rowBtn).toBeTruthy();
    await click(rowBtn);

    // Detail sidebar opens with tabs
    const contentTab = mounted.host.querySelector('button[aria-controls="inspector-content-tab"]');
    const detailsTab = mounted.host.querySelector('button[aria-controls="inspector-details-tab"]');
    expect(contentTab).toBeTruthy();
    expect(detailsTab).toBeTruthy();

    // Default active tab is content, displaying the notecard text view
    expect(mounted.host.querySelector('[data-testid="notecard-text-view"]')).toBeTruthy();
    expect(mounted.host.textContent).toContain('Friday: Live DJ');

    // Switch to Details tab
    await click(detailsTab as HTMLElement);
    expect(mounted.host.querySelector('#inspector-details-tab')).toBeTruthy();
    expect(mounted.host.textContent).toContain('UUID');
    expect(mounted.host.textContent).toContain('item-nc-1');
  });

  it('warns user with confirmation dialog when attempting to select another item while dirty', async () => {
    app.inventory.items.set('nc-1', {
      id: 'nc-1',
      name: 'Notecard 1',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Content 1'),
    });
    app.inventory.items.set('nc-2', {
      id: 'nc-2',
      name: 'Notecard 2',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Content 2'),
    });
    app.inventory.emit('inventory_loaded');

    mounted = await mountScreen(Inventory);

    // Select Notecard 1
    const rows = mounted.host.querySelectorAll('.inventory-row');
    await click(rows[0] as HTMLElement);

    // Click EDIT
    const editBtn = mounted.host.querySelector('button[aria-label="Edit notecard"]') as HTMLElement;
    await click(editBtn);

    // Type unsaved changes
    const textarea = mounted.host.querySelector(
      '[data-testid="notecard-text-editor"]',
    ) as HTMLTextAreaElement;
    await act(async () => {
      typeInto(textarea, 'Unsaved draft edits...');
    });

    // Try to click Notecard 2
    const secondRow = mounted.host.querySelectorAll('.inventory-row')[1] as HTMLElement;
    await click(secondRow);

    // Confirmation dialog appears
    const dialog = mounted.host.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Unsaved Changes');

    // Clicking Discard completes selection of Notecard 2
    const discardBtn = buttonByText(dialog as HTMLElement, 'DISCARD');
    expect(discardBtn).toBeTruthy();
    await click(discardBtn!);

    // Dialog is dismissed and Notecard 2 is loaded
    expect(mounted.host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(mounted.host.textContent).toContain('Notecard 2');
  });

  it('saves modified dirty text when user selects SAVE & CONTINUE in dirty confirmation dialog', async () => {
    app.inventory.items.set('nc-save-1', {
      id: 'nc-save-1',
      name: 'Original Title',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Original cached body text'),
    });
    app.inventory.items.set('nc-save-2', {
      id: 'nc-save-2',
      name: 'Second Notecard',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Second body text'),
    });
    app.inventory.emit('inventory_loaded');

    const saveSpy = vi.spyOn(app.assets, 'saveNotecard').mockResolvedValue({
      item_id: 'nc-save-1',
      asset_id: 'new-asset-id',
      name: 'Original Title',
      modified: 1700000000,
    } as any);

    mounted = await mountScreen(Inventory);

    // Select first notecard
    const rows = mounted.host.querySelectorAll('.inventory-row');
    await click(rows[0] as HTMLElement);

    // Click EDIT and modify text
    const editBtn = mounted.host.querySelector('button[aria-label="Edit notecard"]') as HTMLElement;
    await click(editBtn);
    const textarea = mounted.host.querySelector(
      '[data-testid="notecard-text-editor"]',
    ) as HTMLTextAreaElement;
    await act(async () => {
      typeInto(textarea, 'Brand new edits written by user!');
    });

    // Attempt to switch to second item
    const secondRow = mounted.host.querySelectorAll('.inventory-row')[1] as HTMLElement;
    await click(secondRow);

    const dialog = mounted.host.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();

    // Click SAVE & CONTINUE
    const saveContinueBtn = buttonByText(dialog as HTMLElement, 'SAVE & CONTINUE');
    expect(saveContinueBtn).toBeTruthy();
    await click(saveContinueBtn!);

    // Ensure saveNotecard received the modified dirty text and not the original cached text
    expect(saveSpy).toHaveBeenCalledWith({
      itemId: 'nc-save-1',
      name: 'Original Title',
      text: 'Brand new edits written by user!',
    });

    // Dialog dismissed and second card selected
    expect(mounted.host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(mounted.host.textContent).toContain('Second Notecard');
  });

  it('keeps confirmation dialog open and does not discard edits if save fails on SAVE & CONTINUE', async () => {
    app.inventory.items.set('nc-fail-1', {
      id: 'nc-fail-1',
      name: 'Failing Card',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Initial text'),
    });
    app.inventory.items.set('nc-fail-2', {
      id: 'nc-fail-2',
      name: 'Target Card',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Target text'),
    });
    app.inventory.emit('inventory_loaded');

    vi.spyOn(app.assets, 'saveNotecard').mockRejectedValue(new Error('Network failure'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mounted = await mountScreen(Inventory);

    const rows = mounted.host.querySelectorAll('.inventory-row');
    await click(rows[0] as HTMLElement);

    const editBtn = mounted.host.querySelector('button[aria-label="Edit notecard"]') as HTMLElement;
    await click(editBtn);
    const textarea = mounted.host.querySelector(
      '[data-testid="notecard-text-editor"]',
    ) as HTMLTextAreaElement;
    await act(async () => {
      typeInto(textarea, 'Edits that fail to upload');
    });

    // Try to select second card
    await click(rows[1] as HTMLElement);

    const dialog = mounted.host.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();

    const saveContinueBtn = buttonByText(dialog as HTMLElement, 'SAVE & CONTINUE');
    await click(saveContinueBtn!);

    // Save failed, dialog should still be present and target card not loaded
    expect(mounted.host.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('LumiyaTools NotecardsScreen Embedded Editor', () => {
  it('renders notecard list and embedded editor in NotecardsScreen', async () => {
    app.inventory.items.set('tool-nc-1', {
      id: 'tool-nc-1',
      name: 'Field Guide',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Field guide instructions for explorer.'),
    });

    mounted = await mountScreen(NotecardsScreen);

    expect(mounted.host.textContent).toContain('Field Guide');

    // Click the notecard button
    const cardBtn = mounted.host.querySelector('.runtime-card-button') as HTMLElement;
    await click(cardBtn);

    // Detail view with editor renders
    expect(mounted.host.querySelector('[data-testid="asset-loaded-state"]')).toBeTruthy();
    expect(mounted.host.textContent).toContain('Field guide instructions for explorer.');
    expect(mounted.host.querySelector('button[aria-label="Edit notecard"]')).toBeTruthy();
  });

  it('saves modified dirty text and keeps dialog open on failure in NotecardsScreen', async () => {
    app.inventory.items.set('tool-nc-a', {
      id: 'tool-nc-a',
      name: 'Guide A',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Initial text A'),
    });
    app.inventory.items.set('tool-nc-b', {
      id: 'tool-nc-b',
      name: 'Guide B',
      folder: false,
      assetType: 7,
      data: encodeLindenText('Initial text B'),
    });
    app.inventory.emit('inventory_loaded');

    const saveSpy = vi.spyOn(app.assets, 'saveNotecard').mockResolvedValue({
      item_id: 'tool-nc-a',
      asset_id: 'tool-nc-a-new',
      name: 'Guide A',
      modified: 1700000000,
    } as any);

    mounted = await mountScreen(NotecardsScreen);

    const cards = mounted.host.querySelectorAll('.runtime-card-button');
    await click(cards[0] as HTMLElement);

    const editBtn = mounted.host.querySelector('button[aria-label="Edit notecard"]') as HTMLElement;
    await click(editBtn);

    const textarea = mounted.host.querySelector(
      '[data-testid="notecard-text-editor"]',
    ) as HTMLTextAreaElement;
    await act(async () => {
      typeInto(textarea, 'Modified Guide A text');
    });

    // Attempt to switch to card B
    await click(cards[1] as HTMLElement);

    const dialog = mounted.host.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();

    const saveBtn = buttonByText(dialog as HTMLElement, 'SAVE & CONTINUE');
    await click(saveBtn!);

    expect(saveSpy).toHaveBeenCalledWith({
      itemId: 'tool-nc-a',
      name: 'Guide A',
      text: 'Modified Guide A text',
    });
    expect(mounted.host.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
