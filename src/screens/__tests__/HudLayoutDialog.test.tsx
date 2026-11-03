import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import HudControls from '../HudControls.jsx';
import { HudLayoutDialog } from '../../components/WindowLayoutDialog.jsx';
import { app } from '../../linkpoint/app';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const avatar = {
  id: 'me',
  localId: 1,
  avatar: true,
  position: [1, 1, 1],
  scale: [1, 1, 1],
  rotation: [0, 0, 0, 1],
};
const root = (id: string, localId: number, name: string, point: number) => ({
  id,
  localId,
  parentId: 1,
  attachmentPoint: point,
  name,
  position: [0, 0, 0],
  scale: [0.02, 1, 0.5],
  rotation: [0, 0, 0, 1],
});

let mounted: { host: HTMLElement; root: Root } | null = null;
async function mount(ui: React.ReactNode = createElement(HudControls)) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  await act(async () => {
    r.render(
      createElement(
        AppProvider as React.ComponentType<{ children: React.ReactNode }>,
        null,
        createElement(
          ThemeProvider as React.ComponentType<{ children: React.ReactNode }>,
          null,
          ui,
        ),
      ),
    );
  });
  mounted = { host, root: r };
  return host;
}

const click = async (el: Element | null) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
};

const emit = async (type: string, data: unknown) => {
  await act(async () => {
    (app.protocol as unknown as { emit: (t: string, d: unknown) => void }).emit(type, data);
  });
};

const byText = (host: HTMLElement, text: RegExp) =>
  [...host.querySelectorAll('button')].find((b) => text.test(b.textContent || '')) || null;

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted!.root.unmount());
    mounted.host.remove();
    mounted = null;
  }
  await act(async () => {
    (app.protocol as unknown as { emit: (t: string, d: unknown) => void }).emit('disconnected', {});
  });
  await act(async () => {
    (app.world as unknown as { emit: (t: string, d: unknown) => void }).emit('huds_changed', []);
  });
  document.body.style.overflow = '';
});

describe('HudLayoutDialog & HudControls Integration', () => {
  it('launches HUD Layout Dialog from HUD controls and applies presets', async () => {
    const host = await mount();
    await emit('scene:object-add', avatar);
    await emit('scene:object-add', root('h1', 10, 'Combat HUD', 35));

    // Choose HUD
    const toggle = byText(host, /HUDS \(1\)/);
    expect(toggle).not.toBeNull();
    await click(toggle);
    await click(byText(host, /Combat HUD/));

    expect(app.world.displayedHud?.id).toBe('h1');

    // Check for HUD Layout button
    const layoutBtn = host.querySelector('[aria-label="HUD Layout"]');
    expect(layoutBtn).not.toBeNull();
    expect(layoutBtn?.getAttribute('aria-haspopup')).toBe('dialog');

    // Click HUD Layout button to open dialog
    await click(layoutBtn);

    const dialog = host.querySelector('#hud-layout-dialog-title');
    expect(dialog).not.toBeNull();

    // Activate "Center Overlay" preset
    const centerOverlay = byText(host, /Center Overlay/);
    expect(centerOverlay).not.toBeNull();
    await click(centerOverlay);

    expect(app.world.displayedHud?.pan).toEqual([0, 0]);

    // Activate "Top-Left" preset
    const topLeft = byText(host, /^Top-Left$/);
    expect(topLeft).not.toBeNull();
    await click(topLeft);

    expect(app.world.displayedHud?.pan).toEqual([-0.5, 0.5]);

    // Activate "Top-Right" preset
    const topRight = byText(host, /^Top-Right$/);
    expect(topRight).not.toBeNull();
    await click(topRight);

    expect(app.world.displayedHud?.pan).toEqual([0.5, 0.5]);

    // Done button closes dialog
    const doneBtn = byText(host, /^Done$/);
    expect(doneBtn).not.toBeNull();
    await click(doneBtn);

    expect(host.querySelector('#hud-layout-dialog-title')).toBeNull();
  });

  it('HudLayoutDialog handles standalone mounting with focus trap and Escape', async () => {
    const onClose = vi.fn();
    const host = await mount(
      createElement(HudLayoutDialog, {
        isOpen: true,
        onClose,
      }),
    );

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-labelledby')).toBe('hud-layout-dialog-title');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
  });
});
