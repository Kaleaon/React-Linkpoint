import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import SystemDialog from '../../components/SystemDialog.jsx';
import InteractionDialog from '../../components/InteractionDialog.jsx';
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
          createElement('div', null, createElement(SystemDialog as any), createElement(InteractionDialog as any))
        )
      )
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
  [...host.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === label) as HTMLButtonElement | undefined;

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
  });

  it('updates progress percentage and status when protocol emits teleport_progress', async () => {
    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Da Boom');
    });

    await emit('teleport_progress', { phase: 'preparing', percent: 65, statusText: 'Transferring avatar session...' });

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
    const teleportSpy = vi.spyOn(app.protocol, 'teleportTo').mockResolvedValue({ requested: { region: 'home', x: 128, y: 128, z: 30 }, message: 'ok' });
    vi.spyOn(app.protocol as any, 'requireConnected').mockImplementation(() => undefined);

    const host = await mount();
    await act(async () => {
      app.interactions.startTeleportSession('Some Region');
    });

    const homeBtn = button(host, 'RETRY HOME');
    expect(homeBtn).toBeDefined();
    await click(homeBtn);

    expect(teleportSpy).toHaveBeenCalledWith('home');
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
});
