// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import FloatersDesktop from '../../components/FloatersDesktop.jsx';
import MenuBar from '../../components/MenuBar.jsx';
import AOFloater from '../../screens/AOFloater.jsx';
import { app } from '../app';
import { LLAssetType } from '../inventory';
import {
  click,
  flush,
  mountScreen,
  typeInto,
  unmount,
  buttonByText,
  type Mounted,
} from './ui-helpers';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const INV_STAND_UUID = '15468e00-3400-bb66-cecc-646d7c14458e';
const INV_WALK_UUID = 'f5fc7433-043d-e819-8298-f519a119b688';
const BROKEN_ANIM_UUID = 'deadbeef-1111-2222-3333-444444444444';

function emptyAnim(): Uint8Array {
  const out: number[] = [1, 0, 0, 0];
  const dv = new DataView(new ArrayBuffer(4));
  const i32 = (v: number) => {
    dv.setInt32(0, v, true);
    out.push(...new Uint8Array(dv.buffer));
  };
  const f32 = (v: number) => {
    dv.setFloat32(0, v, true);
    out.push(...new Uint8Array(dv.buffer));
  };
  i32(1);
  f32(1);
  out.push(0);
  f32(0);
  f32(1);
  i32(0);
  f32(0);
  f32(0);
  i32(0);
  i32(0);
  return new Uint8Array(out);
}

let mounted: Mounted | null = null;
let desktopMount: { host: HTMLElement; root: Root; getCtx: () => any } | null = null;

async function mountDesktopShell() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let ctxRef: any = null;
  function Probe() {
    ctxRef = useApp();
    return null;
  }
  await act(async () => {
    root.render(
      createElement(
        AppProvider as any,
        null,
        createElement(
          ThemeProvider as any,
          null,
          createElement(
            'div',
            { style: { position: 'relative', width: '1440px', height: '900px' } },
            createElement(Probe),
            createElement(MenuBar),
            createElement(FloatersDesktop),
          ),
        ),
      ),
    );
  });
  await act(async () => {
    ctxRef.actions.setDevice('desk');
  });
  desktopMount = { host, root, getCtx: () => ctxRef };
  return desktopMount;
}

describe('AOFloater UI & Desktop Chrome Integration (Acceptance Criteria 1–5)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset AO state cleanly between tests
    app.ao.setEnabled(false);
    for (const p of [...app.ao.profiles]) {
      app.ao.deleteProfile(p.id);
    }
    for (const err of app.ao.getErrors()) {
      app.ao.clearAnimationError(err.assetId);
    }
    app.inventory.items.clear();
    app.inventory.items.set('anim-item-stand', {
      id: 'anim-item-stand',
      name: 'Heroic Stand',
      assetType: LLAssetType.Animation,
      assetId: INV_STAND_UUID,
    });
    app.inventory.items.set('anim-item-walk', {
      id: 'anim-item-walk',
      name: 'Runway Walk',
      assetType: LLAssetType.Animation,
      assetId: INV_WALK_UUID,
    });
  });

  afterEach(async () => {
    await unmount(mounted);
    mounted = null;
    if (desktopMount) {
      await act(async () => desktopMount!.root.unmount());
      desktopMount.host.remove();
      desktopMount = null;
    }
    app.protocol.connected = false;
    app.protocol.agentId = null;
    vi.restoreAllMocks();
  });

  it('Criterion 1: opens the AO floater from the desktop toolbar, dock, and menu bar, and respects minimum floater dimensions, snapping, and minimizing', async () => {
    const { host, getCtx } = await mountDesktopShell();

    // 1. Open via Desktop Toolbar button
    const toolbarBtn = host.querySelector('button[aria-label="Animation Overrider"]');
    expect(toolbarBtn).toBeTruthy();
    await click(toolbarBtn);
    expect(getCtx().state.flOpen.AO).toBe(true);
    expect(getCtx().state.screen).toBe('AO');
    expect(host.querySelector('[data-testid="ao-floater"]')).toBeTruthy();

    // Respect minimum desktop floater dimensions (minW: 420, minH: 340) + docking/minimizing
    await act(async () => {
      getCtx().actions.flResize('AO', -9999, -9999);
    });
    const clamped = getCtx().actions.flR('AO');
    expect(clamped.w).toBeGreaterThanOrEqual(420);
    expect(clamped.h).toBeGreaterThanOrEqual(340);

    // Snap left (docking) & minimize via dock chip
    await act(async () => {
      getCtx().actions.flSnap('AO', 'left');
    });
    expect(getCtx().actions.flR('AO').x).toBe(0);

    // 2. Toggle minimize and re-open via Dock ('AO' custom button)
    const dockChips = [...host.querySelectorAll('.quick-chat-dock button')];
    const aoDockBtn = dockChips.find((el) => (el.textContent || '').trim() === 'AO');
    expect(aoDockBtn).toBeTruthy();
    await click(aoDockBtn); // minimizes since currently open
    expect(getCtx().state.flMin.AO).toBe(true);
    await click(aoDockBtn); // restores & focuses
    expect(getCtx().state.flMin.AO).toBe(false);
    expect(getCtx().state.flOpen.AO).toBe(true);

    // Close floater, then 3. Open via Menu Bar (World -> Animation Overrider…)
    await act(async () => {
      getCtx().actions.flClose('AO');
    });
    expect(getCtx().state.flOpen.AO).toBe(false);

    const worldMenuTrigger = [...host.querySelectorAll('[role="menubar"] [role="menuitem"]')].find(
      (el) => (el.textContent || '').trim() === 'World',
    );
    expect(worldMenuTrigger).toBeTruthy();
    await click(worldMenuTrigger);

    const aoMenuItem = [...host.querySelectorAll('[role="menu"] [role="menuitem"]')].find((el) =>
      (el.textContent || '').includes('Animation Overrider'),
    );
    expect(aoMenuItem).toBeTruthy();
    await click(aoMenuItem);

    expect(getCtx().state.flOpen.AO).toBe(true);
    expect(getCtx().state.screen).toBe('AO');
  });

  it('Criteria 2, 3 & 4: creates profiles, assigns inventory stand/walk animations, sends simulator packets, and restores default locomotion on master switch off', async () => {
    app.protocol.connected = true;
    app.protocol.agentId = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
    const sendSpy = vi
      .spyOn(app.protocol, 'sendAgentAnimations')
      .mockResolvedValue({ sent: true, count: 1 });
    vi.spyOn(app.protocol, 'fetchAnimation').mockResolvedValue(emptyAnim());
    const applyLocalSpy = vi.spyOn(app.world, 'applyLocalAnimations');
    vi.spyOn(app.world, 'validateAnimationAsset').mockResolvedValue({ ok: true });

    mounted = await mountScreen(AOFloater);

    // Create a profile
    await click(buttonByText(mounted.host, /New/));
    const nameInput = mounted.host.querySelector(
      'input[aria-label="New animation set name"]',
    ) as HTMLInputElement;
    await typeInto(nameInput, 'Casual Set');
    await click(buttonByText(mounted.host, 'Create Set'));
    expect(app.ao.getActiveProfile()?.name).toBe('Casual Set');

    // Assign inventory animation to Standing
    const invSelect = mounted.host.querySelector(
      'select[aria-label="Choose inventory animation"]',
    ) as HTMLSelectElement;
    await typeInto(invSelect, 'anim-item-stand');
    await click(buttonByText(mounted.host, '+ Add Inventory Anim'));

    // Switch to Walking state and assign Runway Walk
    const walkOption = mounted.host.querySelector(
      'button[data-state-key="walk"]',
    ) as HTMLButtonElement;
    await click(walkOption);
    await typeInto(invSelect, 'anim-item-walk');
    await click(buttonByText(mounted.host, '+ Add Inventory Anim'));

    // Enable Master AO Switch
    const masterSwitch = mounted.host.querySelector(
      'button[role="switch"][aria-label="Enable Animation Overrider"]',
    ) as HTMLButtonElement;
    await click(masterSwitch);
    await flush();

    expect(masterSwitch.getAttribute('aria-checked')).toBe('true');
    expect(applyLocalSpy).toHaveBeenCalledWith([{ id: INV_STAND_UUID, seq: expect.any(Number) }]);
    expect(sendSpy).toHaveBeenCalledWith([{ id: INV_STAND_UUID, start: true }]);

    // Toggle Master AO Switch OFF -> immediately restores default Linden stand and stops custom pose
    sendSpy.mockClear();
    applyLocalSpy.mockClear();
    await click(masterSwitch);
    await flush();

    expect(masterSwitch.getAttribute('aria-checked')).toBe('false');
    expect(sendSpy).toHaveBeenCalledWith([{ id: INV_STAND_UUID, start: false }]);
    expect(applyLocalSpy).toHaveBeenCalledWith([
      { id: '2408fe9e-df1d-1d7d-f4ff-1384fa7b350f', seq: 0 },
    ]);
  });

  it('Criterion 5: displays a clear alert banner and per-row error feedback when an assigned animation fails to download or parse', async () => {
    vi.spyOn(app.world, 'validateAnimationAsset').mockResolvedValue({
      ok: false,
      kind: 'download',
      error: 'Asset HTTP 404 Not Found on simulator',
    });

    mounted = await mountScreen(AOFloater);

    const uuidInput = mounted.host.querySelector(
      'input[aria-label="Animation asset UUID"]',
    ) as HTMLInputElement;
    const labelInput = mounted.host.querySelector(
      'input[aria-label="Animation label"]',
    ) as HTMLInputElement;
    await typeInto(uuidInput, BROKEN_ANIM_UUID);
    await typeInto(labelInput, 'Missing Pose');
    await click(buttonByText(mounted.host, 'Assign UUID'));
    await flush();

    const alertBanner = mounted.host.querySelector('[data-testid="ao-asset-error-banner"]');
    expect(alertBanner).toBeTruthy();
    expect(alertBanner?.textContent).toContain('Animation Download Failed');
    expect(alertBanner?.textContent).toContain('Missing Pose');
    expect(alertBanner?.textContent).toContain('Asset HTTP 404 Not Found on simulator');
  });
});
