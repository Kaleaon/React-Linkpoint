// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OutfitViewer from '../../screens/OutfitViewer.jsx';
import { app } from '../app';
import { slBridge } from '../sl-bridge';
import { buttonByText, click, mountScreen, typeInto, unmount, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;

const sampleWorn = [
  {
    id: 'worn-shape-id',
    name: 'Default Shape',
    assetType: 13,
    inventoryType: 18,
    category: 'body',
    typeName: 'Shape',
    worn: true,
  },
  {
    id: 'worn-jacket-id',
    name: 'Leather Jacket',
    assetType: 5,
    inventoryType: 18,
    category: 'clothing',
    typeName: 'Jacket',
    worn: true,
  },
  {
    id: 'worn-watch-id',
    name: 'Silver Watch',
    assetType: 6,
    inventoryType: 6,
    category: 'attachment',
    typeName: 'Attachment',
    worn: true,
  },
];

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('Save Outfit As Workflow in OutfitViewer', () => {
  it('Requirement 1 & Criterion 1: displays "SAVE OUTFIT AS" button in both Worn Items and Saved Outfits headers, disabled when not logged in or worn items empty', async () => {
    // When logged out
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(false);
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);

    const saveButtons = [...mounted.host.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'SAVE OUTFIT AS',
    );
    expect(saveButtons).toHaveLength(2);
    expect(saveButtons[0].disabled).toBe(true);
    expect(saveButtons[1].disabled).toBe(true);

    // When logged in but worn items empty
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });
    await click(buttonByText(mounted.host, 'REFRESH')!);

    const saveButtonsEmpty = [...mounted.host.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'SAVE OUTFIT AS',
    );
    expect(saveButtonsEmpty[0].disabled).toBe(true);
    expect(saveButtonsEmpty[1].disabled).toBe(true);
  });

  it('Requirement 1 & 2: enables "SAVE OUTFIT AS" buttons when worn items exist, and clicking opens the accessible modal dialog', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({
      items: sampleWorn,
      outfits: [{ id: 'outfit-1', name: 'Existing Outfit' }],
    });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);

    const saveButtons = [...mounted.host.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'SAVE OUTFIT AS',
    );
    expect(saveButtons).toHaveLength(2);
    expect(saveButtons[0].disabled).toBe(false);
    expect(saveButtons[1].disabled).toBe(false);

    // Click Save Outfit As button
    await click(saveButtons[0]);

    const dialog = mounted.host.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.querySelector('h3')?.textContent).toContain('SAVE OUTFIT AS');

    // Input field exists
    const input = dialog?.querySelector('#save-outfit-name-input') as HTMLInputElement;
    expect(input).toBeTruthy();

    // Category checkboxes exist with item counts
    const checkboxes = dialog?.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes?.length).toBe(3); // clothing, body, attachment
    expect(dialog?.textContent).toContain('Clothing (1)');
    expect(dialog?.textContent).toContain('Body Parts (1)');
    expect(dialog?.textContent).toContain('Attachments (1)');
  });

  it('User Scenario 2 & Constraints: validates empty name and duplicate name immediately, keeping SAVE disabled', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({
      items: sampleWorn,
      outfits: [{ id: 'outfit-1', name: 'Existing Outfit' }],
    });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);

    const saveBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'SAVE OUTFIT AS',
    );
    await click(saveBtn);

    const dialog = mounted.host.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector('#save-outfit-name-input') as HTMLInputElement;
    const confirmSaveBtn = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'SAVE',
    ) as HTMLButtonElement;

    // Blank name: error shown and SAVE disabled
    const errorEl = dialog.querySelector('#save-outfit-error');
    expect(errorEl?.textContent).toContain('Outfit name is required.');
    expect(confirmSaveBtn.disabled).toBe(true);

    // Whitespace only: error shown and SAVE disabled
    await typeInto(input, '   ');
    expect(errorEl?.textContent).toContain('Outfit name is required.');
    expect(confirmSaveBtn.disabled).toBe(true);

    // Duplicate name: error shown and SAVE disabled
    await typeInto(input, 'Existing Outfit');
    expect(errorEl?.textContent).toContain('An outfit with that name already exists.');
    expect(confirmSaveBtn.disabled).toBe(true);

    // Case-insensitive duplicate check
    await typeInto(input, 'existing outfit');
    expect(errorEl?.textContent).toContain('An outfit with that name already exists.');
    expect(confirmSaveBtn.disabled).toBe(true);

    // Valid unique name: no error, SAVE enabled
    await typeInto(input, 'Evening Casual');
    expect(errorEl?.textContent).toBe('');
    expect(confirmSaveBtn.disabled).toBe(false);
  });

  it('Requirement 2: toggling category checkboxes updates selected item count and filters itemIds', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({
      items: sampleWorn,
      outfits: [],
    });
    const saveSpy = vi.spyOn(slBridge, 'saveOutfitAs').mockResolvedValue({
      folderId: 'new-outfit-id',
      itemCount: 2,
    });

    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);

    const saveBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'SAVE OUTFIT AS',
    );
    await click(saveBtn);

    const dialog = mounted.host.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector('#save-outfit-name-input') as HTMLInputElement;
    await typeInto(input, 'Casual Look');

    // Initially all 3 items selected
    expect(dialog.textContent).toContain('3 worn item(s) selected to link.');

    // Uncheck "attachment" category
    const attachmentCheckbox = dialog.querySelector('#save-cat-attachment') as HTMLInputElement;
    await click(attachmentCheckbox);

    expect(dialog.textContent).toContain('2 worn item(s) selected to link.');

    // Submit
    const confirmSaveBtn = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'SAVE',
    )!;
    await click(confirmSaveBtn);

    expect(saveSpy).toHaveBeenCalledWith({
      name: 'Casual Look',
      itemIds: ['worn-shape-id', 'worn-jacket-id'],
    });
  });

  it('Requirement 6 & Acceptance Criteria 2 & 3: reloads outfit list upon completion, closes dialog, and focuses the new outfit', async () => {
    let outfitList = [{ id: 'outfit-old', name: 'Old Outfit' }];
    vi.spyOn(app, 'loadOutfit').mockImplementation(async () => ({
      items: sampleWorn,
      outfits: outfitList,
    }));

    vi.spyOn(slBridge, 'saveOutfitAs').mockImplementation(async ({ name }) => {
      outfitList = [...outfitList, { id: 'new-folder-123', name }];
      return {
        folderId: 'new-folder-123',
        itemCount: 3,
      };
    });

    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);

    const saveBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'SAVE OUTFIT AS',
    );
    await click(saveBtn);

    const dialog = mounted.host.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector('#save-outfit-name-input') as HTMLInputElement;
    await typeInto(input, 'Evening Casual');

    const confirmSaveBtn = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'SAVE',
    )!;
    await click(confirmSaveBtn);

    // Modal is closed
    expect(mounted.host.querySelector('[role="dialog"]')).toBeNull();

    // Status message confirms save
    expect(mounted.host.textContent).toContain('Saved outfit "Evening Casual".');

    // New outfit appears in Saved Outfits
    expect(mounted.host.textContent).toContain('Evening Casual');
    expect(mounted.host.textContent).toContain('SAVED OUTFITS (2)');

    // Newly created outfit is focused in the DOM
    const newOutfitEl = mounted.host.querySelector('#outfit-new-folder-123') as HTMLElement;
    expect(newOutfitEl).toBeTruthy();
    expect(newOutfitEl.getAttribute('tabindex')).toBe('0');
  });

  it('Constraint 4: displays partial warning toast when linking fails for an item without crashing', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({
      items: sampleWorn,
      outfits: [],
    });

    vi.spyOn(slBridge, 'saveOutfitAs').mockResolvedValue({
      folderId: 'partial-outfit-id',
      itemCount: 2,
      failedCount: 1,
      failedItemIds: ['worn-watch-id'],
    });

    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);

    const saveBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'SAVE OUTFIT AS',
    );
    await click(saveBtn);

    const dialog = mounted.host.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector('#save-outfit-name-input') as HTMLInputElement;
    await typeInto(input, 'Summer Style');

    const confirmSaveBtn = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'SAVE',
    )!;
    await click(confirmSaveBtn);

    expect(mounted.host.textContent).toContain(
      'Saved outfit "Summer Style" with 2 item(s) (1 item(s) could not be linked).',
    );
  });
});

describe('Backend core/sl-outfit.cjs saveOutfitAs', () => {
  const outfit = require('../../../core/sl-outfit.cjs');

  it('creates an outfit folder and links worn items', async () => {
    const mockCircuit = {
      sendMessage: vi.fn(),
      waitForAck: vi.fn().mockResolvedValue(true),
      waitForMessage: vi.fn().mockResolvedValue({
        InventoryData: [{ CallbackID: 123, ItemID: 'linked-item-uuid' }],
      }),
      sessionID: 'session-uuid',
    };
    const mockRegion = { circuit: mockCircuit };

    const myOutfitsFolder: {
      folderID: string;
      name: string;
      typeDefault: number;
      folders: any[];
    } = {
      folderID: 'my-outfits-uuid',
      name: 'My Outfits',
      typeDefault: 48,
      folders: [],
    };
    const skeleton = new Map();
    skeleton.set('my-outfits-uuid', myOutfitsFolder);

    const mockCof = {
      folderID: 'cof-uuid',
      items: [
        { itemID: 'link-1', assetID: 'asset-1', name: 'Shirt', inventoryType: 18, flags: 4 },
        { itemID: 'link-2', assetID: 'asset-2', name: 'Jeans', inventoryType: 18, flags: 5 },
      ],
    };

    const mockBot = {
      agent: {
        agentID: 'agent-uuid',
        inventory: {
          main: {
            skeleton,
            itemsByID: new Map(),
          },
        },
      },
      clientCommands: {
        agent: {
          getWearables: vi.fn().mockResolvedValue(mockCof),
        },
      },
    };

    const result = await outfit.saveOutfitAs(mockBot, mockRegion, {
      name: 'Winter Casual',
    });

    expect(result.folderId).toBeTruthy();
    expect(result.itemCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(myOutfitsFolder.folders.length).toBe(1);
    expect(myOutfitsFolder.folders[0].name).toBe('Winter Casual');
  });

  it('rejects empty or duplicate names', async () => {
    const mockCircuit = { sendMessage: vi.fn(), sessionID: 'session-uuid' };
    const mockRegion = { circuit: mockCircuit };
    const myOutfitsFolder = {
      folderID: 'my-outfits-uuid',
      name: 'My Outfits',
      typeDefault: 48,
      folders: [],
    };
    const existingOutfit = {
      folderID: 'outfit-existing-uuid',
      parentID: 'my-outfits-uuid',
      name: 'Beach Day',
    };
    const skeleton = new Map();
    skeleton.set('my-outfits-uuid', myOutfitsFolder);
    skeleton.set('outfit-existing-uuid', existingOutfit);

    const mockBot = {
      agent: {
        agentID: 'agent-uuid',
        inventory: { main: { skeleton } },
      },
      clientCommands: { agent: { getWearables: vi.fn() } },
    };

    await expect(outfit.saveOutfitAs(mockBot, mockRegion, { name: '' })).rejects.toThrow(
      'Outfit name is required',
    );

    await expect(outfit.saveOutfitAs(mockBot, mockRegion, { name: '   ' })).rejects.toThrow(
      'Outfit name is required',
    );

    await expect(outfit.saveOutfitAs(mockBot, mockRegion, { name: 'Beach Day' })).rejects.toThrow(
      'An outfit with that name already exists',
    );
  });
});
