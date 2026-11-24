import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import SystemDialog from '../../components/SystemDialog.jsx';
import InteractionDialog from '../../components/InteractionDialog.jsx';
import DesktopChrome from '../../components/DesktopChrome.jsx';
import MenuBar from '../../components/MenuBar.jsx';
import Search from '../../screens/Search.jsx';
import Radar from '../../screens/Radar.jsx';
import MapScreen from '../../screens/Map.jsx';
import { TeleportScreen } from '../../screens/LumiyaTools.jsx';
import { NoticesScreen } from '../../screens/LiveScreens.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { slBridge } from '../sl-bridge';
import { app } from '../app';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const dialogRequest = (id: string) => ({
  id,
  receivedAt: Date.now(),
  objectId: 'obj-123',
  objectName: 'Vendor Object',
  ownerName: 'Pat Resident',
  message: 'Choose an option',
  channel: 0,
  imageId: null,
  buttons: ['Option 1', 'Option 2'],
  textBox: false,
  textBoxIndex: -1,
});

beforeAll(() => {
  app.interactions.init();
});

let mounted: { host: HTMLElement; root: Root } | null = null;
async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  await act(async () => {
    r.render(
      createElement(
        AppProvider as any,
        null,
        createElement(
          ThemeProvider as any,
          null,
          createElement(
            'div',
            null,
            createElement(SystemDialog as any),
            createElement(InteractionDialog as any),
          ),
        ),
      ),
    );
  });
  mounted = { host, root: r };
  return host;
}

const emit = async (type: string, data: any) => {
  await act(async () => {
    (app.protocol as any).emit(type, data);
  });
};

const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === label) as
    HTMLButtonElement | undefined;

const click = async (el: Element | null | undefined) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
};

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted!.root.unmount());
    mounted.host.remove();
    mounted = null;
  }
  await act(async () => {
    app.interactions.clear();
    app.interactions.clearTeleportSession();
    (app.protocol as any).emit('disconnected', {});
  });
  vi.restoreAllMocks();
});

describe('SystemDialog Teleport Sheet', () => {
  it('renders nothing when no teleport is active and no system dialog is set', async () => {
    const host = await mount();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('renders teleport sheet with progress milestones and percentage when teleport is initiated', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Ahern Welcome Area');
    });

    const sheet = host.querySelector('[role="alertdialog"]');
    expect(sheet).not.toBeNull();
    expect(host.textContent).toContain('TELEPORTING');
    expect(host.textContent).toContain('Ahern Welcome Area');
    expect(host.textContent).toContain('10%');
    expect(host.textContent).toContain('Resolve');
    expect(host.textContent).toContain('Contact');
    expect(host.textContent).toContain('Prepare');
    expect(host.textContent).toContain('Arrive');

    const crystalHero = host.querySelector('[aria-label="Teleport transition progress"]');
    expect(crystalHero).not.toBeNull();
  });

  it('updates progress percentage and status when protocol emits teleport_progress', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Da Boom');
    });

    await emit('teleport_progress', {
      phase: 'preparing',
      percent: 65,
      statusText: 'Transferring avatar session...',
    });

    expect(host.textContent).toContain('65%');
    expect(host.textContent).toContain('Transferring avatar session...');
  });

  it('ensures teleport sheet takes priority over script dialogs during teleportation', async () => {
    const host = await mount();

    // Start teleport session
    await act(async () => {
      app.interactions.startTeleportSession('Kama City');
    });

    // Script dialog arrives during teleportation
    await emit('script_dialog', dialogRequest('dialog-99'));

    // Verify script dialog is queued in InteractionsManager
    expect(app.interactions.items.length).toBe(1);

    // Verify the UI shows the TELEPORTING sheet in SystemDialog
    expect(host.textContent).toContain('TELEPORTING');
    expect(host.textContent).toContain('Kama City');

    // Teleport completes and dismisses
    await act(async () => {
      app.interactions.completeTeleportSession('Kama City');
    });

    // Now script dialog becomes visible in InteractionDialog
    expect(host.textContent).toContain('OBJECT DIALOG');
    expect(host.textContent).toContain('Vendor Object');
  });

  it('dismisses teleport sheet on CANCEL button click', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Ahern');
    });

    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();

    const cancelBtn = button(host, 'CANCEL');
    expect(cancelBtn).toBeDefined();
    await click(cancelBtn);

    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(app.interactions.teleportSession).toBeNull();
  });

  it('triggers retry home on RETRY HOME button click', async () => {
    const teleportHomeSpy = vi
      .spyOn(app.protocol, 'teleportHome')
      .mockResolvedValue({ requested: 'home' });
    vi.spyOn(app.protocol as any, 'requireConnected').mockImplementation(() => undefined);

    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Some Region');
    });

    const homeBtn = button(host, 'RETRY HOME');
    expect(homeBtn).toBeDefined();
    await click(homeBtn);

    expect(teleportHomeSpy).toHaveBeenCalledOnce();
  });

  it('renders failed state with error message and RETRY controls when teleport fails', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Failed Region');
      app.interactions.failTeleportSession('Target region is full');
    });

    expect(host.textContent).toContain('TELEPORT FAILED');
    expect(host.textContent).toContain('Target region is full');
    expect(button(host, 'RETRY')).toBeDefined();
    expect(button(host, 'RETRY HOME')).toBeDefined();
    expect(button(host, 'CANCEL')).toBeDefined();
  });

  it('does not emit interaction_changed event on progress ticks within the same phase', async () => {
    const interactionChangedSpy = vi.fn();
    app.interactions.on('interaction_changed', interactionChangedSpy);

    await act(async () => {
      app.interactions.startTeleportSession('Decoupled Progress Region');
    });

    const callsAfterStart = interactionChangedSpy.mock.calls.length;

    // Emit progress tick within the same phase 'initiating'
    await act(async () => {
      app.interactions.updateTeleportProgress('initiating', 25, 'Resolving address...');
    });

    expect(interactionChangedSpy.mock.calls.length).toBe(callsAfterStart);
    expect(app.interactions.teleportSession?.stepPercent).toBe(25);
  });

  it('bails out of state updates when receiving duplicate teleport progress updates with identical stepPercent and statusText', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Lusk');
    });

    await emit('teleport_progress', {
      phase: 'preparing',
      percent: 50,
      statusText: 'Connecting to region...',
    });

    expect(host.textContent).toContain('50%');
    expect(host.textContent).toContain('Connecting to region...');

    // Emit duplicate event
    await emit('teleport_progress', {
      phase: 'preparing',
      percent: 50,
      statusText: 'Connecting to region...',
    });

    expect(host.textContent).toContain('50%');
    expect(host.textContent).toContain('Connecting to region...');
  });

  it('renders CrystalProgressBar at 8px height with ARIA semantics during teleportation', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Crystal Region');
    });

    const progressContainer = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    expect(progressContainer).not.toBeNull();
    expect(progressContainer.getAttribute('role')).toBe('progressbar');
    expect(progressContainer.getAttribute('aria-valuenow')).toBe('10');
    expect(progressContainer.getAttribute('aria-label')).toBe('Teleport progress');

    const track = host.querySelector('[data-testid="crystal-progress-track"]') as HTMLElement;
    expect(track.style.height).toBe('8px');

    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fill.style.width).toBe('10%'); // Initial startTeleportSession has 10%
    expect(fill.style.background).toContain('linear-gradient');

    const cap = host.querySelector('[data-testid="crystal-progress-cap"]') as HTMLElement;
    expect(cap).not.toBeNull();
    expect(cap.style.display).toBe('flex');
  });

  it('updates CrystalProgressBar imperatively on teleport_tick events without React re-render', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Dynamic Tick Region');
    });

    const progressContainer = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;

    await act(async () => {
      app.interactions.emit('teleport_tick', {
        stepPercent: 84,
        statusText: 'Connecting to sim...',
      });
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(progressContainer.getAttribute('aria-valuenow')).toBe('84');
    expect(fill.style.width).toBe('84%');
    expect(host.textContent).toContain('84%');
    expect(host.textContent).toContain('Connecting to sim...');
  });

  it('applies error token styling to CrystalProgressBar when teleport session fails', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Faulty Region');
      app.interactions.failTeleportSession('Region handshake failed');
    });

    const progressContainer = host.querySelector(
      '[data-testid="crystal-progress-bar-container"]',
    ) as HTMLElement;
    expect(progressContainer.classList.contains('is-failed')).toBe(true);

    const fill = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
    expect(fill.style.background).not.toContain('linear-gradient');
    expect(fill.style.background).toBeTruthy();
  });

  it('paints 65% preparing, 90% arriving, and 100% zero-gap convergence for 500ms before unmounting', async () => {
    vi.useFakeTimers();
    try {
      (app.protocol as any).connected = true;
      (slBridge as any).connected = true;

      let resolveBridge: (val: any) => void = () => {};
      vi.spyOn(slBridge, 'teleport').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveBridge = resolve;
          }) as any,
      );

      const host = await mount();

      let tpPromise!: Promise<any>;
      await act(async () => {
        tpPromise = app.protocol.teleportTo('Ahern');
        await vi.advanceTimersToNextFrame();
      });

      // 1. In-flight RPC paints 65% preparing state
      const hero65 = host.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
      const bar65 = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
      expect(hero65).not.toBeNull();
      expect(hero65.getAttribute('data-step-percent')).toBe('65');
      expect(bar65.style.width).toBe('65%');
      expect(host.textContent).toContain('65%');
      expect(host.textContent).toContain('Preparing avatar transfer...');

      // 2. Resolve bridge RPC -> yields 1 animation frame at 90% arriving before completion
      await act(async () => {
        resolveBridge({ requested: { region: 'Ahern', x: 128, y: 128, z: 30 }, message: 'ok' });
        await Promise.resolve();
      });

      // Advance exactly one animation frame: 90% frame paints first
      expect(app.interactions.teleportSession?.phase).toBe('arriving');
      expect(app.interactions.teleportSession?.stepPercent).toBe(90);
      expect(host.textContent).toContain('90%');
      expect(host.textContent).toContain('Arriving at destination...');
      expect(hero65.getAttribute('data-step-percent')).toBe('90');

      // Advance frame to resolve rAF yield -> transitions to 100% completed and holds for 500ms
      await act(async () => {
        await vi.advanceTimersToNextFrame();
        await Promise.resolve();
        await vi.advanceTimersToNextFrame();
      });
      await tpPromise;

      const hero100 = host.querySelector('[data-testid="teleport-crystal-hero"]') as HTMLElement;
      const top100 = host.querySelector('.tpch-top') as HTMLElement;
      const bot100 = host.querySelector('.tpch-bot') as HTMLElement;
      const bar100 = host.querySelector('[data-testid="asset-progress-bar"]') as HTMLElement;
      expect(hero100).not.toBeNull();
      expect(hero100.getAttribute('data-step-percent')).toBe('100');
      expect(top100.style.transform).toBe('translateY(0.00px)');
      expect(bot100.style.transform).toBe('translateY(0.00px)');
      expect(bar100.style.width).toBe('100%');
      expect(host.textContent).toContain('100%');
      expect(host.textContent).toContain('Arrived at destination');

      // Still mounted at 450ms into the 500ms hold
      await act(async () => {
        await vi.advanceTimersByTimeAsync(450);
      });
      expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();

      // Unmounts cleanly once 500ms hold completes
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
      expect(host.querySelector('[role="alertdialog"]')).toBeNull();
      expect(app.interactions.teleportSession).toBeNull();
    } finally {
      (app.protocol as any).connected = false;
      (slBridge as any).connected = false;
      vi.useRealTimers();
    }
  });

  it('cancels pending 500ms completion hold on new teleport, cancel, fail, or disconnect', async () => {
    vi.useFakeTimers();
    try {
      const host = await mount();

      // 1. Starting a new teleport during 500ms hold cancels prior completion timer
      await act(async () => {
        app.interactions.startTeleportSession('First Region');
        app.interactions.completeTeleportSession('First Region');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
        app.interactions.startTeleportSession('Second Region');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(app.interactions.teleportSession?.destination).toBe('Second Region');
      expect(app.interactions.teleportSession?.phase).toBe('initiating');
      expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();

      // 2. Failing during 500ms hold cancels prior completion timer
      await act(async () => {
        app.interactions.completeTeleportSession('Second Region');
        await vi.advanceTimersByTimeAsync(250);
        app.interactions.failTeleportSession('Late simulator error');
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(app.interactions.teleportSession?.phase).toBe('failed');
      expect(host.textContent).toContain('Late simulator error');

      // 3. Canceling during 500ms hold clears immediately and leaves no dangling timer
      await act(async () => {
        app.interactions.startTeleportSession('Third Region');
        app.interactions.completeTeleportSession('Third Region');
        await vi.advanceTimersByTimeAsync(100);
        app.interactions.cancelTeleportSession();
      });
      expect(app.interactions.teleportSession).toBeNull();
      await act(async () => {
        app.interactions.startTeleportSession('Fourth Region');
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(app.interactions.teleportSession?.destination).toBe('Fourth Region');

      // 4. Disconnecting during 500ms hold cancels prior completion timer cleanly
      await act(async () => {
        app.interactions.completeTeleportSession('Fourth Region');
        await vi.advanceTimersByTimeAsync(100);
        (app.protocol as any).emit('disconnected', {});
      });
      expect(app.interactions.teleportSession).toBeNull();
      await act(async () => {
        app.interactions.startTeleportSession('Fifth Region');
        await vi.advanceTimersByTimeAsync(500);
      });
      expect(app.interactions.teleportSession?.destination).toBe('Fifth Region');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears teleportSession immediately on completion when prefers-reduced-motion: reduce matches', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      const host = await mount();
      await act(async () => {
        app.interactions.startTeleportSession('Quiet Region');
      });
      expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();

      await act(async () => {
        app.interactions.completeTeleportSession('Quiet Region');
      });
      expect(app.interactions.teleportSession).toBeNull();
      expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('mounts SystemDialog with TeleportCrystalHero and CrystalProgressBar across all nine client teleport actions', async () => {
    (app.protocol as any).connected = true;
    (slBridge as any).connected = true;
    app.auth.user = { id: 'agent-1', fullName: 'Test Resident', grid: 'opensim' };

    const pending = () => new Promise<any>(() => {});
    vi.spyOn(slBridge, 'teleport').mockImplementation(pending as any);
    vi.spyOn(slBridge, 'teleportHome').mockImplementation(pending as any);
    vi.spyOn(slBridge, 'acceptLure').mockImplementation(pending as any);
    vi.spyOn(slBridge, 'call').mockImplementation(async (method: string) => {
      if (method === 'getMapBlocks') {
        return [{ name: 'Ahern', x: 1000, y: 1000, access: 13 }];
      }
      return {};
    });
    vi.spyOn(slBridge, 'searchDir').mockImplementation(async (params: any) => ({
      results: [{ id: 'res-1', name: `Target ${params.category}`, type: params.category }],
      hasMore: false,
    }));

    let appCtx: any = null;
    function CaptureCtx() {
      appCtx = useApp();
      return null;
    }

    async function mountWithDialog(ScreenComp: any) {
      if (mounted) {
        await act(async () => mounted!.root.unmount());
        mounted.host.remove();
        mounted = null;
      }
      await act(async () => {
        app.interactions.cancelTeleportSession();
      });
      const host = document.createElement('div');
      document.body.appendChild(host);
      const r = createRoot(host);
      await act(async () => {
        r.render(
          createElement(
            AppProvider as any,
            null,
            createElement(
              ThemeProvider as any,
              null,
              createElement(
                'div',
                null,
                createElement(CaptureCtx),
                createElement(ScreenComp),
                createElement(SystemDialog as any),
              ),
            ),
          ),
        );
      });
      mounted = { host, root: r };
      return host;
    }

    const assertCrystalDialogMounted = (host: HTMLElement, expectedTitle?: string) => {
      expect(app.interactions.teleportSession).not.toBeNull();
      expect(host.querySelector('[data-testid="teleport-crystal-hero"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="crystal-progress-bar-container"]')).not.toBeNull();
      if (expectedTitle) {
        expect(host.querySelector('#teleport-sheet-title')?.textContent).toContain(expectedTitle);
      }
    };

    try {
      // 1. DesktopChrome location bar submit
      let host = await mountWithDialog(DesktopChrome);
      const locInput = host.querySelector('#desktop-location') as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(locInput, 'Da Boom/128/128/30');
        locInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        host
          .querySelector('form.desktop-location-form')!
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      assertCrystalDialogMounted(host, 'Da Boom/128/128/30');

      // 2. DesktopChrome toolbar Teleport home button
      host = await mountWithDialog(DesktopChrome);
      await click(host.querySelector('button[aria-label="Teleport home"]'));
      assertCrystalDialogMounted(host, 'Home');

      // 3. MenuBar World -> Teleport Home
      host = await mountWithDialog(MenuBar);
      await act(async () => {
        appCtx.actions.setDevice('desk');
        appCtx.actions.setMenu('World');
      });
      const tpHomeItem = [...host.querySelectorAll('[role="menuitem"]')].find((el) =>
        (el.textContent || '').includes('Teleport Home'),
      );
      expect(tpHomeItem).toBeDefined();
      await click(tpHomeItem);
      assertCrystalDialogMounted(host, 'Home');

      // 4. Search directory (Places, Events, Classifieds)
      host = await mountWithDialog(Search);
      await click(host.querySelector('button[data-tab="PLACES"]'));
      const searchInput = host.querySelector('input') as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(searchInput, 'Ahern');
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 20));
      });
      await click(button(host, 'Teleport'));
      assertCrystalDialogMounted(host, 'Target places');

      await act(async () => {
        app.interactions.cancelTeleportSession();
      });
      await click(host.querySelector('button[data-tab="EVENTS"]'));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      await click(button(host, 'Teleport'));
      assertCrystalDialogMounted(host, 'Target events');

      await act(async () => {
        app.interactions.cancelTeleportSession();
      });
      await click(host.querySelector('button[data-tab="CLASSIFIEDS"]'));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      await click(button(host, 'Teleport'));
      assertCrystalDialogMounted(host, 'Target classifieds');

      // 5. Radar nearby resident TELEPORT TO
      const prevRegion = app.world.region;
      const prevNearby = app.world.nearbyUsers;
      app.world.region = { name: 'Morris', x: 1000, y: 1000 } as any;
      app.world.nearbyUsers = [
        { id: 'av-99', name: 'Nyx Resident', distance: 14, position: [64, 96, 24] },
      ] as any;
      host = await mountWithDialog(Radar);
      const residentRow = [...host.querySelectorAll('div')].find(
        (el) => el.textContent?.includes('Nyx Resident') && el.style.cursor === 'pointer',
      );
      await click(residentRow);
      await click(button(host, 'TELEPORT TO'));
      assertCrystalDialogMounted(host, 'Morris');
      app.world.region = prevRegion;
      app.world.nearbyUsers = prevNearby;

      // 6. Map screen Teleport button
      const origRegion = app.world.region;
      app.world.region = { name: 'Ahern', x: 1000, y: 1000 } as any;
      host = await mountWithDialog(MapScreen);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      const mapTileBtn =
        host.querySelector('button[aria-label*="1000, 1000"]') ||
        [...host.querySelectorAll('button')].find((b) =>
          (b.getAttribute('title') || b.getAttribute('aria-label') || '').includes('Ahern'),
        ) ||
        host.querySelector('.map-grid button, [role="gridcell"] button, button[data-tile]');
      if (mapTileBtn) {
        await click(mapTileBtn);
      } else {
        // Fallback click on the center tile button inside the map grid
        const allBtns = [...host.querySelectorAll('button')];
        const centerTile = allBtns.find((b) => (b.textContent || '').includes('Ahern'));
        await click(centerTile);
      }
      await click(button(host, 'Teleport'));
      assertCrystalDialogMounted(host, 'Ahern');
      app.world.region = origRegion;

      // 7. LumiyaTools TeleportScreen Go button
      host = await mountWithDialog(TeleportScreen);
      const uriInput = host.querySelector(
        'input[aria-label="Teleport destination URI"]',
      ) as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(uriInput, 'secondlife://Lusk/100/100/25');
        uriInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await click(button(host, 'Go'));
      assertCrystalDialogMounted(host, 'secondlife://Lusk/100/100/25');

      // 8. LiveScreens NoticesScreen TELEPORT TO LANDMARK button
      host = await mountWithDialog(NoticesScreen);
      await act(async () => {
        app.notices.receive({
          id: 'notice-tp-1',
          groupId: 'grp-1',
          groupName: 'Explorers',
          senderName: 'Scout',
          subject: 'Landmark Notice',
          message: 'Visit now',
          timestamp: Date.now(),
          hasAttachment: true,
          attachmentName: ' Bora Bora ',
          attachmentItemId: 'att-1',
          attachmentType: 3,
        } as any);
      });
      await click(host.querySelector('article button'));
      await click(button(host, 'TELEPORT TO LANDMARK'));
      assertCrystalDialogMounted(host, 'Bora Bora');

      // 9. InteractionDialog lure ACCEPT button
      host = await mountWithDialog(InteractionDialog);
      await emit('lure', {
        id: 'lure-9',
        receivedAt: Date.now(),
        fromId: 'sender-9',
        fromName: 'Kit Sandalwood',
        message: 'Join us!',
        regionId: 'reg-9',
        position: [128, 128, 30],
        gridX: 1000,
        gridY: 1000,
      });
      await click(button(host, 'ACCEPT'));
      assertCrystalDialogMounted(host, 'Kit Sandalwood');
    } finally {
      (app.protocol as any).connected = false;
      (slBridge as any).connected = false;
      app.auth.user = null;
    }
  }, 15_000);

  it('suppresses duplicate UI error toasts when SystemDialog already displays the teleport failure alert', async () => {
    (app.protocol as any).connected = true;
    (slBridge as any).connected = true;
    app.auth.user = { id: 'agent-1', fullName: 'Test Resident', grid: 'opensim' };

    vi.spyOn(slBridge, 'teleportHome').mockRejectedValue(new Error('Home parcel unavailable'));

    let appCtx: any = null;
    function CaptureCtx() {
      appCtx = useApp();
      return null;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    await act(async () => {
      r.render(
        createElement(
          AppProvider as any,
          null,
          createElement(
            ThemeProvider as any,
            null,
            createElement(
              'div',
              null,
              createElement(CaptureCtx),
              createElement(DesktopChrome as any),
              createElement(SystemDialog as any),
            ),
          ),
        ),
      );
    });
    mounted = { host, root: r };

    try {
      const notifySpy = vi.spyOn(appCtx.actions, 'notify');
      await click(host.querySelector('button[aria-label="Teleport home"]'));

      expect(app.interactions.teleportSession?.phase).toBe('failed');
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        'Home parcel unavailable',
      );
      expect(notifySpy).not.toHaveBeenCalled();
    } finally {
      (app.protocol as any).connected = false;
      (slBridge as any).connected = false;
      app.auth.user = null;
    }
  });
});
