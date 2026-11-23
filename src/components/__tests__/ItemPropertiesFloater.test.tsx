import React, { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FloatersDesktop from '../FloatersDesktop.jsx';
import { InventoryTree } from '../InventoryTree';
import ItemPropertiesFloater from '../ItemPropertiesFloater';
import Inventory from '../../screens/Inventory.jsx';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app';
import { localCache } from '../../linkpoint/local-cache';
import {
  MAX_BATCH_UPDATE_ITEMS,
  PERMISSION_BITS,
  UNRESOLVED_AVATAR_PLACEHOLDER,
  type BatchUpdateProgress,
  type InventoryItemUpdatePayload,
} from '../../linkpoint/services/inventory-properties-service';
import { FLOATERS } from '../../theme/constants.js';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedHarness {
  host: HTMLDivElement;
  root: Root;
}

let mounted: MountedHarness | null = null;

async function mountWithProviders(ui: React.ReactNode): Promise<HTMLDivElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
  });
  mounted = { host, root };
  return host;
}

type AppContextSnapshot = ReturnType<typeof useApp>;

function DesktopController({ onReady }: { onReady: (ctx: AppContextSnapshot) => void }) {
  const ctx = useApp();
  useEffect(() => {
    onReady(ctx);
  }, [ctx, onReady]);
  return createElement(FloatersDesktop);
}

describe('ItemPropertiesFloater & Desktop Windowing Integration', { timeout: 15000 }, () => {
  const creatorKnownId = '10000000-0000-4000-8000-000000000001';
  const ownerKnownId = '10000000-0000-4000-8000-000000000002';
  const unresolvableId = '99999999-9999-4999-8999-999999999999';

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1440,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 900,
    });
    localStorage.setItem('linkpoint_view_mode', 'desktop');

    app.inventory.folders.clear();
    app.inventory.items.clear();
    app.inventory.avatarNameCache.clear();
    app.inventory.setRootFolder('root-folder');
    app.inventory.folders.set('root-folder', {
      id: 'root-folder',
      name: 'My Inventory',
      type: 'folder',
      parent: '',
      children: ['item-alpha', 'item-beta'],
    });
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted?.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
    vi.restoreAllMocks();
  });

  it('registers ItemPropertiesFloater in FLOATERS and opens, minimizes, and clamps bounds cleanly in FloatersDesktop', async () => {
    const registryEntry = FLOATERS.find((f) => f.id === 'ItemPropertiesFloater');
    expect(registryEntry).toBeDefined();
    expect(registryEntry?.title).toBe('Item Properties');

    const itemAlpha = app.inventory.normalizeItem({
      id: 'item-alpha',
      parent: 'root-folder',
      name: 'Cybernetic Visor',
      description: 'MK-IV visor mesh',
      assetType: 49,
      creatorId: creatorKnownId,
      ownerId: ownerKnownId,
      creationDate: 1715000000,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        groupMask: 0,
        everyoneMask: 0,
        nextOwnerMask: PERMISSION_BITS.COPY | PERMISSION_BITS.MODIFY,
      },
    });
    app.inventory.items.set('item-alpha', itemAlpha);
    app.inventory.avatarNameCache.set(creatorKnownId, 'Nora Artisan');
    app.inventory.avatarNameCache.set(ownerKnownId, 'Kael Builder');

    const ctxBox: { current: AppContextSnapshot | null } = { current: null };
    const host = await mountWithProviders(
      createElement(DesktopController, {
        onReady: (ctx) => {
          ctxBox.current = ctx;
        },
      }),
    );

    expect(ctxBox.current).not.toBeNull();

    // Open ItemPropertiesFloater via desktop windowing action
    await act(async () => {
      ctxBox.current?.actions.openItemProperties([itemAlpha]);
    });

    const floaterEl = host.querySelector(
      '[data-floater-id="ItemPropertiesFloater"]',
    ) as HTMLElement | null;
    expect(floaterEl).not.toBeNull();
    expect(floaterEl?.getAttribute('role')).toBe('dialog');
    expect(floaterEl?.textContent).toContain('Nora Artisan');
    expect(floaterEl?.textContent).toContain('Kael Builder');
    expect(floaterEl?.textContent).toContain('2024-05-06');

    // Enforce minimum dimensions (216x96) and desktop bounds
    await act(async () => {
      ctxBox.current?.actions.flResize('ItemPropertiesFloater', -2000, -2000);
      ctxBox.current?.actions.flMove('ItemPropertiesFloater', -5000, -5000);
    });

    const clampedRect = ctxBox.current?.actions.flR('ItemPropertiesFloater');
    expect(clampedRect?.w).toBeGreaterThanOrEqual(216);
    expect(clampedRect?.h).toBeGreaterThanOrEqual(96);
    expect(clampedRect?.x).toBeGreaterThanOrEqual(0);
    expect(clampedRect?.y).toBeGreaterThanOrEqual(0);

    // Minimize via titlebar button -> dialog unmounts while taskbar chip remains
    const minimizeBtn = floaterEl?.querySelector(
      'button[title="Minimize"]',
    ) as HTMLButtonElement | null;
    expect(minimizeBtn).not.toBeNull();

    await act(async () => {
      minimizeBtn?.click();
    });

    expect(host.querySelector('[data-floater-id="ItemPropertiesFloater"]')).toBeNull();
    const dockChip = host.querySelector(
      '[data-floater-chip="ItemPropertiesFloater"]',
    ) as HTMLElement | null;
    expect(dockChip).not.toBeNull();

    // Restore from taskbar chip
    await act(async () => {
      dockChip?.click();
    });

    expect(host.querySelector('[data-floater-id="ItemPropertiesFloater"]')).not.toBeNull();
  });

  it('supports opening two persistent ItemPropertiesFloater windows side by side to compare assets', async () => {
    const itemAlpha = app.inventory.normalizeItem({
      id: 'item-alpha',
      parent: 'root-folder',
      name: ' Hull Plating A',
      creatorId: creatorKnownId,
      ownerId: ownerKnownId,
      creationDate: 1715000000,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        nextOwnerMask: PERMISSION_BITS.COPY,
      },
    });
    const itemBeta = app.inventory.normalizeItem({
      id: 'item-beta',
      parent: 'root-folder',
      name: 'Hull Plating B',
      creatorId: unresolvableId,
      ownerId: unresolvableId,
      creationDate: 0,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        nextOwnerMask: PERMISSION_BITS.TRANSFER,
      },
    });
    app.inventory.items.set('item-alpha', itemAlpha);
    app.inventory.items.set('item-beta', itemBeta);
    app.inventory.avatarNameCache.set(creatorKnownId, 'Nora Artisan');
    app.inventory.avatarNameCache.set(ownerKnownId, 'Kael Builder');
    vi.spyOn(app.inventory, 'resolveAvatarNames').mockResolvedValue({
      [creatorKnownId]: 'Nora Artisan',
      [ownerKnownId]: 'Kael Builder',
    });

    const ctxBox: { current: AppContextSnapshot | null } = { current: null };
    const host = await mountWithProviders(
      createElement(DesktopController, {
        onReady: (ctx) => {
          ctxBox.current = ctx;
        },
      }),
    );

    let firstWinId = '';
    let secondWinId = '';
    await act(async () => {
      firstWinId = ctxBox.current?.actions.openItemProperties([itemAlpha]) || '';
    });
    await act(async () => {
      secondWinId = ctxBox.current?.actions.openItemProperties([itemBeta]) || '';
    });

    expect(firstWinId).toBe('ItemPropertiesFloater');
    expect(secondWinId).toMatch(/^ItemPropertiesFloater-\d+$/);

    const firstFloater = host.querySelector(
      `[data-floater-id="${firstWinId}"]`,
    ) as HTMLElement | null;
    const secondFloater = host.querySelector(
      `[data-floater-id="${secondWinId}"]`,
    ) as HTMLElement | null;

    // Both persistent floaters exist simultaneously on the desktop canvas
    expect(firstFloater).not.toBeNull();
    expect(secondFloater).not.toBeNull();

    // Second asset with unresolvable creator/owner UUIDs shows "―" per FAKE_DATA_POLICY.md
    const secondCreator = secondFloater?.querySelector(
      `[data-testid="${secondWinId}-creator-name"]`,
    );
    const secondOwner = secondFloater?.querySelector(`[data-testid="${secondWinId}-owner-name"]`);
    const secondAcquired = secondFloater?.querySelector(
      `[data-testid="${secondWinId}-acquired-date"]`,
    );
    expect(secondCreator?.textContent).toBe(UNRESOLVED_AVATAR_PLACEHOLDER);
    expect(secondOwner?.textContent).toBe(UNRESOLVED_AVATAR_PLACEHOLDER);
    expect(secondAcquired?.textContent).toBe(UNRESOLVED_AVATAR_PLACEHOLDER);
  });

  it('renders indeterminate checkboxes for conflicting multi-selection bits, shows CrystalProgressBar, and applies batch updates', async () => {
    const item1 = app.inventory.normalizeItem({
      id: 'item-alpha',
      parent: 'root-folder',
      name: 'Merchant Dress - S',
      creatorId: creatorKnownId,
      ownerId: creatorKnownId,
      creationDate: 1715000000,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        groupMask: PERMISSION_BITS.MODIFY | PERMISSION_BITS.COPY,
        everyoneMask: 0,
        nextOwnerMask: PERMISSION_BITS.MODIFY | PERMISSION_BITS.COPY | PERMISSION_BITS.TRANSFER,
      },
    });
    const item2 = app.inventory.normalizeItem({
      id: 'item-beta',
      parent: 'root-folder',
      name: 'Merchant Dress - M',
      creatorId: creatorKnownId,
      ownerId: creatorKnownId,
      creationDate: 1715000000,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        groupMask: 0,
        everyoneMask: 0,
        nextOwnerMask: PERMISSION_BITS.COPY,
      },
    });
    app.inventory.items.set(item1.id, item1);
    app.inventory.items.set(item2.id, item2);
    app.inventory.avatarNameCache.set(creatorKnownId, 'Merchant Creator');

    let resolveBatch:
      | ((val: {
          success: boolean;
          transport: 'capability' | 'udp';
          chunkCount: number;
          updatedIds: string[];
        }) => void)
      | null = null;

    vi.spyOn(localCache, 'saveInventory').mockResolvedValue();
    const batchSpy = vi
      .spyOn(app.inventory, 'batchUpdateItemProperties')
      .mockImplementation(
        (
          updates: InventoryItemUpdatePayload[],
          opts?: { onProgress?: (p: BatchUpdateProgress) => void },
        ) => {
          opts?.onProgress?.({
            completed: 1,
            total: updates.length,
            percent: 50,
            phase: 'updating',
            statusText: 'Dispatching UpdateInventoryItem capability (2 items)…',
          });
          return new Promise((resolve) => {
            resolveBatch = (res) => {
              for (const u of updates) {
                const cur = app.inventory.items.get(u.itemId);
                if (cur) {
                  app.inventory.items.set(u.itemId, {
                    ...cur,
                    permissions: { ...cur.permissions, ...u.permissions },
                  });
                }
              }
              opts?.onProgress?.({
                completed: updates.length,
                total: updates.length,
                percent: 100,
                phase: 'completed',
                statusText: 'Updated 2 items',
              });
              resolve(res);
            };
          });
        },
      );

    const host = await mountWithProviders(
      createElement(
        'div',
        null,
        createElement(InventoryTree, { rootFolderId: 'root-folder' }),
        createElement(ItemPropertiesFloater, {
          windowId: 'ItemPropertiesFloater',
          items: [item1, item2],
        }),
      ),
    );

    // Multi-selection banner & tri-state indicators
    expect(host.textContent).toContain('2 items selected');

    const modifyCheckbox = host.querySelector(
      '#ItemPropertiesFloater-perm-next-modify',
    ) as HTMLInputElement | null;
    const copyCheckbox = host.querySelector(
      '#ItemPropertiesFloater-perm-next-copy',
    ) as HTMLInputElement | null;
    const transferCheckbox = host.querySelector(
      '#ItemPropertiesFloater-perm-next-transfer',
    ) as HTMLInputElement | null;
    const groupCheckbox = host.querySelector(
      '#ItemPropertiesFloater-perm-group-share',
    ) as HTMLInputElement | null;

    expect(modifyCheckbox?.indeterminate).toBe(true);
    expect(modifyCheckbox?.getAttribute('aria-checked')).toBe('mixed');
    expect(transferCheckbox?.indeterminate).toBe(true);
    expect(transferCheckbox?.getAttribute('aria-checked')).toBe('mixed');
    expect(groupCheckbox?.indeterminate).toBe(true);
    expect(copyCheckbox?.indeterminate).toBe(false);
    expect(copyCheckbox?.checked).toBe(true);

    // Set Next Owner to Copy-Only and click Apply to All
    const copyOnlyPresetBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Copy-Only',
    ) as HTMLButtonElement | undefined;
    expect(copyOnlyPresetBtn).toBeDefined();

    await act(async () => {
      copyOnlyPresetBtn?.click();
    });

    expect(modifyCheckbox?.indeterminate).toBe(false);
    expect(modifyCheckbox?.checked).toBe(false);
    expect(copyCheckbox?.checked).toBe(true);
    expect(transferCheckbox?.indeterminate).toBe(false);
    expect(transferCheckbox?.checked).toBe(false);

    const applyBtn = host.querySelector(
      '[data-testid="ItemPropertiesFloater-apply-button"]',
    ) as HTMLButtonElement | null;
    expect(applyBtn?.textContent).toBe('Apply to All');

    await act(async () => {
      applyBtn?.click();
    });

    // CrystalProgressBar renders while batch operation is in flight
    const progressContainer = host.querySelector(
      '[data-testid="ItemPropertiesFloater-batch-progress"]',
    );
    expect(progressContainer).not.toBeNull();
    expect(progressContainer?.querySelector('[role="progressbar"]')).not.toBeNull();

    // Complete batch operation
    await act(async () => {
      resolveBatch?.({
        success: true,
        transport: 'capability',
        chunkCount: 1,
        updatedIds: [item1.id, item2.id],
      });
    });

    expect(batchSpy).toHaveBeenCalledTimes(1);
    const completionStatus = host.querySelector(
      '[data-testid="ItemPropertiesFloater-completion-status"]',
    );
    expect(completionStatus?.textContent).toContain(
      'Updated 2 items via UpdateInventoryItem capability',
    );
  });

  it('displays rollback alert and restores checkbox states when batch update fails, and blocks >100 items', async () => {
    const single = app.inventory.normalizeItem({
      id: 'item-alpha',
      parent: 'root-folder',
      name: 'Limited Edition Statue',
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        groupMask: 0,
        everyoneMask: 0,
        nextOwnerMask: PERMISSION_BITS.COPY | PERMISSION_BITS.TRANSFER,
      },
    });
    app.inventory.items.set(single.id, single);

    app.protocol.capabilities = {
      UpdateInventoryItem: 'https://sim.example.com/cap/update-fail',
    };
    vi.spyOn(localCache, 'saveInventory').mockResolvedValue();
    vi.spyOn(app.inventory, 'batchUpdateItemProperties').mockRejectedValueOnce(
      new Error('Simulator circuit timeout'),
    );

    const host = await mountWithProviders(
      createElement(ItemPropertiesFloater, {
        windowId: 'ItemPropertiesFloater',
        items: [single],
      }),
    );

    const transferBox = host.querySelector(
      '#ItemPropertiesFloater-perm-next-transfer',
    ) as HTMLInputElement | null;
    expect(transferBox?.checked).toBe(true);

    // Uncheck transfer and click Apply
    await act(async () => {
      transferBox?.click();
    });
    expect(transferBox?.checked).toBe(false);

    const applyBtn = host.querySelector(
      '[data-testid="ItemPropertiesFloater-apply-button"]',
    ) as HTMLButtonElement | null;
    await act(async () => {
      applyBtn?.click();
    });

    const alertEl = host.querySelector('[data-testid="ItemPropertiesFloater-error-alert"]');
    expect(alertEl?.textContent).toContain('rolled back');
    // Checkbox state restored to pre-batch value
    expect(transferBox?.checked).toBe(true);

    // Verify >100 items guardrail UI
    const oversizedItems = Array.from({ length: MAX_BATCH_UPDATE_ITEMS + 5 }, (_, idx) => ({
      id: `item-over-${idx}`,
      name: `Bulk Item ${idx}`,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        nextOwnerMask: PERMISSION_BITS.COPY,
      },
    }));

    await act(async () => {
      mounted?.root.render(
        createElement(
          AppProvider,
          null,
          createElement(
            ThemeProvider,
            null,
            createElement(ItemPropertiesFloater, {
              windowId: 'ItemPropertiesFloater',
              items: oversizedItems,
            }),
          ),
        ),
      );
    });

    const limitAlert = host.querySelector(
      '[data-testid="ItemPropertiesFloater-batch-limit-alert"]',
    );
    expect(limitAlert?.textContent).toContain('limited to 100 items');
    const disabledApplyBtn = host.querySelector(
      '[data-testid="ItemPropertiesFloater-apply-button"]',
    ) as HTMLButtonElement | null;
    expect(disabledApplyBtn?.disabled).toBe(true);
  });

  it('opens ItemPropertiesFloater from InventoryTree multi-selection Properties action', async () => {
    const itemA = app.inventory.normalizeItem({
      id: 'item-alpha',
      parent: 'root-folder',
      name: 'Release Boots - Left',
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        nextOwnerMask: PERMISSION_BITS.COPY | PERMISSION_BITS.MODIFY,
      },
    });
    const itemB = app.inventory.normalizeItem({
      id: 'item-beta',
      parent: 'root-folder',
      name: 'Release Boots - Right',
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        nextOwnerMask: PERMISSION_BITS.COPY,
      },
    });
    app.inventory.items.set(itemA.id, itemA);
    app.inventory.items.set(itemB.id, itemB);

    const host = await mountWithProviders(
      createElement(
        'div',
        null,
        createElement(InventoryTree, { rootFolderId: 'root-folder' }),
        createElement(FloatersDesktop),
      ),
    );

    const rowA = host.querySelector('#inventory-node-item-alpha') as HTMLElement | null;
    const rowB = host.querySelector('#inventory-node-item-beta') as HTMLElement | null;
    expect(rowA).not.toBeNull();
    expect(rowB).not.toBeNull();

    // Select first item, then Ctrl+Click second item
    await act(async () => {
      rowA?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      rowB?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    });

    const multiBar = host.querySelector('[data-testid="inventory-multi-select-bar"]');
    expect(multiBar).not.toBeNull();
    expect(multiBar?.textContent).toContain('2 items selected');

    const propsBtn = Array.from(multiBar?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Properties'),
    ) as HTMLButtonElement | undefined;
    expect(propsBtn).toBeDefined();

    await act(async () => {
      propsBtn?.click();
    });

    const floater = host.querySelector(
      '[data-floater-id="ItemPropertiesFloater"]',
    ) as HTMLElement | null;
    expect(floater).not.toBeNull();
    expect(floater?.textContent).toContain('2 items selected');

    // Clicking the "+" comparison window button spawns a second persistent floater instance
    const compareBtn = floater?.querySelector(
      '[data-testid="ItemPropertiesFloater-compare-window-button"]',
    ) as HTMLButtonElement | null;
    expect(compareBtn).not.toBeNull();

    await act(async () => {
      compareBtn?.click();
    });

    const allPropertyFloaters = host.querySelectorAll('[data-floater-id^="ItemPropertiesFloater"]');
    expect(allPropertyFloaters.length).toBe(2);
  });

  it('displays Owner and Next Owner permission summaries in Inventory detail drawer and opens ItemPropertiesFloater', async () => {
    const itemA = app.inventory.normalizeItem({
      id: 'item-alpha',
      parent: 'root-folder',
      name: 'Skyline Penthouse Shell',
      description: 'Modular prefab structure',
      assetType: 6,
      permissions: {
        baseMask: PERMISSION_BITS.ALL,
        ownerMask: PERMISSION_BITS.ALL,
        nextOwnerMask: PERMISSION_BITS.COPY | PERMISSION_BITS.MODIFY,
      },
    });
    app.inventory.items.set(itemA.id, itemA);

    const host = await mountWithProviders(
      createElement('div', null, createElement(Inventory), createElement(FloatersDesktop)),
    );

    const rowA = host.querySelector('#inventory-node-item-alpha') as HTMLElement | null;
    expect(rowA).not.toBeNull();

    await act(async () => {
      rowA?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 125));
    });

    const detailAside = host.querySelector('aside.record-detail');
    expect(detailAside).not.toBeNull();
    expect(detailAside?.textContent).toContain('Owner Permissions');
    expect(detailAside?.textContent).toContain('Modify · Copy · Transfer');
    expect(detailAside?.textContent).toContain('Next Owner');
    expect(detailAside?.textContent).toContain('Modify · Copy · No Transfer');

    const propsBtn = Array.from(detailAside?.querySelectorAll('button') || []).find((b) =>
      b.textContent?.includes('Properties'),
    ) as HTMLButtonElement | undefined;
    expect(propsBtn).toBeDefined();

    await act(async () => {
      propsBtn?.click();
    });

    const primaryFloater = host.querySelector('[data-floater-id="ItemPropertiesFloater"]');
    expect(primaryFloater).not.toBeNull();

    // Open row action menu and click "Compare in New Window" -> spawns secondary floater
    const actionMenuBtn = rowA?.querySelector(
      'button[aria-label="Actions for Skyline Penthouse Shell"]',
    ) as HTMLButtonElement | null;
    expect(actionMenuBtn).not.toBeNull();

    await act(async () => {
      actionMenuBtn?.click();
    });

    const compareMenuItem = Array.from(host.querySelectorAll('[role="menuitem"]')).find((el) =>
      el.textContent?.includes('Compare in New Window'),
    ) as HTMLButtonElement | undefined;
    expect(compareMenuItem).toBeDefined();

    await act(async () => {
      compareMenuItem?.click();
    });

    const openPropertyWindows = host.querySelectorAll('[data-floater-id^="ItemPropertiesFloater"]');
    expect(openPropertyWindows.length).toBe(2);
  });
});
