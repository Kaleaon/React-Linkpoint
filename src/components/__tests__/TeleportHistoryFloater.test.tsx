import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import TeleportHistoryFloater from '../TeleportHistoryFloater.jsx';
import FloatersDesktop from '../FloatersDesktop.jsx';
import MapScreen from '../../screens/Map.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app';
import { indexedDBStore } from '../../linkpoint/indexeddb-store';
import { LLAssetType } from '../../linkpoint/inventory';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ACTIVE_AGENT = '22222222-3333-4444-5555-666666666666';
const OTHER_AGENT = '99999999-8888-7777-6666-555555555555';

let mounted: { host: HTMLElement; root: ReturnType<typeof createRoot> } | null = null;

function getGridDataRows(rootEl: ParentNode): HTMLElement[] {
  return Array.from(
    rootEl.querySelectorAll<HTMLElement>('[role="grid"] [role="row"][aria-selected]'),
  );
}

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  mounted = { host, root };
  return host;
}

function setInputValue(input: HTMLInputElement | null, value: string) {
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function clickEl(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

describe('TeleportHistoryFloater Component & Desktop Integration', () => {
  const prevAuthUser = app.auth.user;
  const prevAgentId = app.protocol.agentId;
  const prevConnected = app.protocol.connected;

  beforeEach(async () => {
    await indexedDBStore.clearTeleportHistory(ACTIVE_AGENT);
    await indexedDBStore.clearTeleportHistory(OTHER_AGENT);
    app.protocol.connected = true;
    app.protocol.agentId = ACTIVE_AGENT;
    app.auth.user = { id: ACTIVE_AGENT, fullName: 'Test Explorer', grid: 'agni' };
    app.teleportHistory.setAgentId(ACTIVE_AGENT);
    app.world.focusMapLocation(null);
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted!.host.remove();
      mounted = null;
    }
    app.teleportHistory.setAgentId(null);
    app.auth.user = prevAuthUser;
    app.protocol.agentId = prevAgentId;
    app.protocol.connected = prevConnected;
    vi.restoreAllMocks();
  });

  it('displays visited destinations sorted by visit time in descending order and renders honest dashes for unknown fields', async () => {
    await app.teleportHistory.recordEntry({
      regionName: 'Ahern',
      parcelName: 'Welcome Hub',
      position: [64, 180, 28],
      timestamp: 1_710_000_100,
    });
    await app.teleportHistory.recordEntry({
      regionName: 'Morris',
      parcelName: null,
      position: null,
      timestamp: 1_710_000_200,
    });
    await app.teleportHistory.recordEntry({
      regionName: 'Da Boom',
      parcelName: 'First Sim Monument',
      position: [45, 192, 25],
      timestamp: 1_710_000_300,
    });

    const host = await mount(createElement(TeleportHistoryFloater));
    const rows = getGridDataRows(host);
    expect(rows).toHaveLength(3);
    expect(host.querySelectorAll('[role="columnheader"]')).toHaveLength(4);

    expect(rows[0].textContent).toContain('Da Boom');
    expect(rows[0].textContent).toContain('First Sim Monument');
    expect(rows[0].textContent).toContain('45, 192, 25');

    expect(rows[1].textContent).toContain('Morris');
    expect(rows[1].textContent).toContain('—');

    expect(rows[2].textContent).toContain('Ahern');
    expect(rows[2].textContent).toContain('64, 180, 28');
  });

  it('filters entries in real time by region name or parcel name and triggers single-click teleport to exact coordinates', async () => {
    const teleportSpy = vi.spyOn(app.protocol, 'teleportTo').mockResolvedValue({
      requested: { region: 'Ahern', x: 64, y: 180, z: 28 },
    } as any);

    await app.teleportHistory.recordEntry({
      regionName: 'Ahern',
      parcelName: 'Harbor Overlook',
      position: [64, 180, 28],
      timestamp: 1_710_010_100,
    });
    await app.teleportHistory.recordEntry({
      regionName: 'Da Boom',
      parcelName: 'Monument Square',
      position: [45, 192, 25],
      timestamp: 1_710_010_200,
    });

    const host = await mount(createElement(TeleportHistoryFloater));
    const filterInput = host.querySelector(
      'input[aria-label="Filter teleport history by region or parcel"]',
    ) as HTMLInputElement;
    expect(filterInput).toBeTruthy();

    // Filter by parcel substring
    await act(async () => {
      setInputValue(filterInput, 'harbor');
    });

    const matchingRows = getGridDataRows(host);
    expect(matchingRows).toHaveLength(1);
    expect(matchingRows[0].textContent).toContain('Ahern');

    // Verify Clear filter button meets minimum 24x24 target size (WCAG 2.2 SC 2.5.8)
    const clearFilterBtn = host.querySelector(
      'button[aria-label="Clear filter"]',
    ) as HTMLButtonElement;
    expect(clearFilterBtn).toBeTruthy();
    expect(clearFilterBtn.style.minWidth).toBe('24px');
    expect(clearFilterBtn.style.minHeight).toBe('24px');

    // Click single-click TP button directly on the matching history record
    const rowTpButton = matchingRows[0].querySelector('button') as HTMLButtonElement;
    expect(rowTpButton.style.minWidth).toBe('24px');
    expect(rowTpButton.style.minHeight).toBe('24px');
    await clickEl(rowTpButton);

    expect(teleportSpy).toHaveBeenCalledWith('secondlife://Ahern/64/180/28');
  });

  it('copies a valid secondlife:// SLURL to clipboard and creates a Landmark with confirmation without re-entering coordinates', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    await app.teleportHistory.recordEntry({
      regionName: 'Bay City - Harwich',
      parcelName: 'Canal Dock',
      position: [88, 144, 25],
      gridX: 980,
      gridY: 1015,
      timestamp: 1_710_020_100,
    });

    const host = await mount(createElement(TeleportHistoryFloater));

    // Copy SLURL
    const copyButton = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Copy SLURL',
    );
    await clickEl(copyButton);

    expect(writeTextMock).toHaveBeenCalledWith('secondlife://Bay%20City%20-%20Harwich/88/144/25');
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'secondlife://Bay%20City%20-%20Harwich/88/144/25',
    );

    // Create Landmark via confirmation dialog without re-entering coordinates
    const landmarkButton = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Create Landmark',
    );
    await clickEl(landmarkButton);

    const dialog = host.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('Bay City - Harwich');
    expect(dialog?.textContent).toContain('88, 144, 25');

    const saveBtn = Array.from(dialog!.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Save Landmark',
    );
    await clickEl(saveBtn);

    await vi.waitFor(() => {
      expect(host.querySelector('[role="dialog"]')).toBeNull();
    });
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Landmark created');

    const createdItem = Array.from(app.inventory.items.values()).find(
      (item) =>
        item.assetType === LLAssetType.Landmark &&
        item.description === 'secondlife://Bay%20City%20-%20Harwich/88/144/25',
    );
    expect(createdItem).toBeTruthy();
  });

  it('centers the World Map on Show on Map, deletes individual records, and clears history only for the active avatar', async () => {
    await indexedDBStore.recordTeleportHistory(OTHER_AGENT, {
      regionName: 'Other Avatar Sanctuary',
      position: [15, 25, 35],
      timestamp: 1_710_030_000,
    });

    await app.teleportHistory.recordEntry({
      regionName: 'First Place',
      position: [30, 40, 22],
      gridX: 1005,
      gridY: 992,
      timestamp: 1_710_030_100,
    });
    await app.teleportHistory.recordEntry({
      regionName: 'Second Place',
      position: [190, 75, 44],
      gridX: 1020,
      gridY: 1008,
      timestamp: 1_710_030_200,
    });

    const host = await mount(
      createElement('div', null, createElement(TeleportHistoryFloater), createElement(MapScreen)),
    );

    // Show on Map centers Map on selected Second Place (1020, 1008)
    const showMapBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Show on Map',
    );
    await clickEl(showMapBtn);

    expect(app.world.mapFocusTarget).toMatchObject({
      regionName: 'Second Place',
      gridX: 1020,
      gridY: 1008,
    });
    expect(host.textContent).toContain('1020, 1008');

    // Delete single selected entry ('Second Place')
    const deleteBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Delete',
    );
    await clickEl(deleteBtn);

    await vi.waitFor(async () => {
      await act(async () => {});
      const rows = getGridDataRows(host);
      expect(rows).toHaveLength(1);
      expect(rows[0].textContent).toContain('First Place');
    });

    // Clear History empties active avatar's list while preserving OTHER_AGENT's store records
    const clearBtn = Array.from(host.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Clear History',
    );
    await clickEl(clearBtn);

    await vi.waitFor(async () => {
      await act(async () => {});
      expect(getGridDataRows(host)).toHaveLength(0);
      expect(host.textContent).toContain('No teleport history recorded for this avatar yet.');
    });

    const otherAvatarRecords = await indexedDBStore.getTeleportHistory(OTHER_AGENT);
    expect(otherAvatarRecords).toHaveLength(1);
    expect(otherAvatarRecords[0].regionName).toBe('Other Avatar Sanctuary');
  });

  it('supports WCAG 2.2 AA keyboard navigation in the ARIA grid and opens as a registered desktop floater in FloatersDesktop', async () => {
    const teleportSpy = vi.spyOn(app.protocol, 'teleportTo').mockResolvedValue({} as any);

    await app.teleportHistory.recordEntry({
      regionName: 'Alpha Atoll',
      position: [22, 33, 21],
      timestamp: 1_710_040_100,
    });
    await app.teleportHistory.recordEntry({
      regionName: 'Beta Basin',
      position: [55, 66, 24],
      timestamp: 1_710_040_200,
    });

    const host = await mount(createElement(FloatersDesktop));

    // Open Teleport History floater from DesktopChrome's navigation bar button
    const historyChromeBtn = host.querySelector('button[aria-label="Teleport history"]');
    await clickEl(historyChromeBtn);

    const floaterRegion = host.querySelector('[role="region"][aria-label="Teleport History"]');
    expect(floaterRegion).toBeTruthy();

    const rows = getGridDataRows(floaterRegion!);
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('aria-selected')).toBe('true');

    // ArrowDown moves selection & focus to Alpha Atoll, Enter initiates teleportation
    await act(async () => {
      rows[0].focus();
      rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    const updatedRows = getGridDataRows(floaterRegion!);
    expect(updatedRows[1].getAttribute('aria-selected')).toBe('true');
    expect(updatedRows[1].style.boxShadow).toContain('inset 0 0 0 2px');

    await act(async () => {
      updatedRows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(teleportSpy).toHaveBeenCalledWith('secondlife://Alpha%20Atoll/22/33/21');
  });
});
