import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import World3D from '../../screens/World3D.jsx';
import HudControls from '../../screens/HudControls.jsx';
import MobileOverlayControls from '../../components/MobileOverlayControls';
import OutfitCarouselDrawer from '../../components/OutfitCarouselDrawer';
import { app } from '../app';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const avatar = {
  id: 'me',
  localId: 1,
  avatar: true,
  position: [1, 1, 1],
  scale: [1, 1, 1],
  rotation: [0, 0, 0, 1],
};
const rootHud = (id: string, localId: number, name: string, point: number) => ({
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

async function mountComponent(ui: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  await act(async () => {
    r.render(
      createElement(AppProvider as any, null, createElement(ThemeProvider as any, null, ui)),
    );
  });
  mounted = { host, root: r };
  return host;
}

const click = async (el: Element | null) => {
  await act(async () => {
    if (el) (el as HTMLElement).click();
  });
};

const emit = async (type: string, data: any) => {
  await act(async () => {
    (app.protocol as any).emit(type, data);
  });
};

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted!.root.unmount());
    mounted!.host.remove();
    mounted = null;
  }
  await act(async () => {
    (app.protocol as any).emit('disconnected', {});
  });
  await act(async () => {
    (app.world as any).emit('huds_changed', []);
  });
});

describe('Spatial Touch Pods & Responsive Overlay Architecture', () => {
  it('shifts HudControls above movement D-pad on viewports under 480px width', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const host = await mountComponent(createElement(World3D));
    await emit('scene:object-add', avatar);
    await emit('scene:object-add', rootHud('h1', 10, 'Test HUD', 35));

    const hudWrapper = host.querySelector('[aria-label="Worn HUDs"]');
    expect(hudWrapper).not.toBeNull();
    // On 375px screen with D-pad visible, bottom offset should be 110px
    expect((hudWrapper as HTMLElement).style.bottom).toBe('110px');
  });

  it('hides desktop shortcut text on viewports under 768px and shows it on >= 768px', async () => {
    // Mobile Viewport (375px)
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    window.dispatchEvent(new Event('resize'));

    let host = await mountComponent(createElement(World3D));
    // Expand diagnostic panel
    const expandBtnMobile = host.querySelector('[aria-label="Expand scene statistics"]');
    if (expandBtnMobile) await click(expandBtnMobile);

    const diagnosticOutputMobile = host.querySelector('output');
    expect(diagnosticOutputMobile).not.toBeNull();
    expect(diagnosticOutputMobile?.textContent).not.toContain('WASD: move');

    // Clean up mobile mount
    await act(async () => mounted!.root.unmount());
    mounted!.host.remove();
    mounted = null;

    // Desktop Viewport (1024px)
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    window.dispatchEvent(new Event('resize'));

    host = await mountComponent(createElement(World3D));
    // Expand diagnostic panel
    const expandBtnDesktop = host.querySelector('[aria-label="Expand scene statistics"]');
    if (expandBtnDesktop) await click(expandBtnDesktop);

    const diagnosticOutputDesktop = host.querySelector('output');
    expect(diagnosticOutputDesktop).not.toBeNull();
    expect(diagnosticOutputDesktop?.textContent).toContain('WASD: move');
  });

  it('collapses floating HUD controls when OutfitCarouselDrawer is opened', async () => {
    const host = await mountComponent(createElement(World3D));
    await emit('scene:object-add', avatar);
    await emit('scene:object-add', rootHud('h1', 10, 'Combat HUD', 35));

    // Initially HUDs are visible
    expect(host.querySelector('[aria-label="Worn HUDs"]')).not.toBeNull();

    // Open Outfits Drawer via side rail button
    const outfitsBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Open Outfits Drawer',
    );
    expect(outfitsBtn).not.toBeNull();
    await click(outfitsBtn!);

    // Drawer is now open
    expect(host.querySelector('[aria-label="Outfit Carousel Drawer"]')).not.toBeNull();
    // HudControls should be collapsed / hidden
    expect(host.querySelector('[aria-label="Worn HUDs"]')).toBeNull();

    // Close Outfits Drawer
    const closeBtn = host.querySelector('[aria-label="Close outfit drawer"]');
    expect(closeBtn).not.toBeNull();
    await click(closeBtn!);

    // Outfits Drawer is closed and HUD controls reappear
    expect(host.querySelector('[aria-label="Outfit Carousel Drawer"]')).toBeNull();
    expect(host.querySelector('[aria-label="Worn HUDs"]')).not.toBeNull();
  });

  it('enforces minimum 44x44px touch target dimensions on all spatial buttons', async () => {
    const host = await mountComponent(createElement(World3D));
    await emit('scene:object-add', avatar);
    await emit('scene:object-add', rootHud('h1', 10, 'Target HUD', 35));

    // Open outfits drawer to include drawer buttons in check
    const outfitsBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Open Outfits Drawer',
    );
    await click(outfitsBtn!);

    const touchButtons = Array.from(host.querySelectorAll('button.touch-target'));
    expect(touchButtons.length).toBeGreaterThan(0);

    touchButtons.forEach((btn) => {
      const minW = parseInt((btn as HTMLElement).style.minWidth || '0', 10);
      const minH = parseInt((btn as HTMLElement).style.minHeight || '0', 10);
      const label = btn.getAttribute('aria-label') || btn.textContent || 'Spatial Button';

      expect(minW, `Button "${label}" minWidth`).toBeGreaterThanOrEqual(44);
      expect(minH, `Button "${label}" minHeight`).toBeGreaterThanOrEqual(44);
    });
  });
});
