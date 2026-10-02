import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import TouchTarget from '../../components/TouchTarget';
import MobileOverlayControls from '../../components/MobileOverlayControls';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  await act(async () => {
    r.render(
      createElement(
        AppProvider as any,
        null,
        createElement(ThemeProvider as any, null, ui)
      )
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

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted!.root.unmount());
    mounted.host.remove();
    mounted = null;
  }
});

describe('TouchTarget component (WCAG 2.5.8 & 2.5.5)', () => {
  it('renders a button with minimum 24x24 CSS pixel dimensions by default (WCAG 2.5.8 AA)', async () => {
    const host = await mount(
      createElement(TouchTarget, { 'aria-label': 'Test button' }, 'Tap')
    );

    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.classList.contains('touch-target')).toBe(true);
    expect(button?.style.minWidth).toBe('24px');
    expect(button?.style.minHeight).toBe('24px');
    expect(button?.style.display).toBe('inline-flex');
    expect(button?.style.alignItems).toBe('center');
    expect(button?.style.justifyContent).toBe('center');
  });

  it('applies minimum 44x44 CSS pixel dimensions when enhanced prop is true (WCAG 2.5.5 AAA)', async () => {
    const host = await mount(
      createElement(TouchTarget, { enhanced: true, 'aria-label': 'Enhanced button' }, 'Tap')
    );

    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.style.minWidth).toBe('44px');
    expect(button?.style.minHeight).toBe('44px');
  });

  it('expands touch hitbox using CSS padding for compact visual icons (Technique C42)', async () => {
    const host = await mount(
      createElement(
        TouchTarget,
        { minSize: 24, padding: '8px', 'aria-label': 'Compact Icon' },
        createElement('span', { style: { width: '12px', height: '12px' } }, '*')
      )
    );

    const button = host.querySelector('button');
    expect(button?.style.padding).toBe('8px');
    expect(parseInt(button?.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(button?.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(24);
  });

  it('triggers onClick handler when tapped', async () => {
    const handleClick = vi.fn();
    const host = await mount(
      createElement(TouchTarget, { onClick: handleClick, 'aria-label': 'Click me' }, 'Action')
    );

    const button = host.querySelector('button');
    await click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('MobileOverlayControls component (WCAG 2.5.8 & Layout Rules)', () => {
  it('renders all overlay action buttons wrapped in TouchTarget', async () => {
    const host = await mount(createElement(MobileOverlayControls, { cameraPreset: 'rear' }));

    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);

    buttons.forEach((btn) => {
      expect(btn.classList.contains('touch-target')).toBe(true);
      const minW = parseInt(btn.style.minWidth || '0', 10);
      const minH = parseInt(btn.style.minHeight || '0', 10);
      expect(minW).toBeGreaterThanOrEqual(24);
      expect(minH).toBeGreaterThanOrEqual(24);
    });
  });

  it('keeps 8px gaps between targets in overlay flex containers (Techniques C38 & C18)', async () => {
    const host = await mount(createElement(MobileOverlayControls, {}));

    const flexContainers = Array.from(host.querySelectorAll('.overlay-container'));
    expect(flexContainers.length).toBeGreaterThan(0);

    flexContainers.forEach((container) => {
      const style = (container as HTMLElement).style;
      expect(style.display).toBe('flex');
      expect(style.gap).toBe('8px');
    });
  });

  it('invokes callbacks when camera presets and action buttons are tapped', async () => {
    const onCameraChange = vi.fn();
    const onMove = vi.fn();
    const onOpenChat = vi.fn();

    const host = await mount(
      createElement(MobileOverlayControls, {
        cameraPreset: 'rear',
        onCameraChange,
        onMove,
        onOpenChat,
      })
    );

    const frontBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Camera view FRONT'
    );
    expect(frontBtn).not.toBeNull();
    await click(frontBtn!);
    expect(onCameraChange).toHaveBeenCalledWith('front');

    const moveForwardBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Move forward'
    );
    expect(moveForwardBtn).not.toBeNull();
    await click(moveForwardBtn!);
    expect(onMove).toHaveBeenCalledWith(1, 0);

    const chatBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Open Chat'
    );
    expect(chatBtn).not.toBeNull();
    await click(chatBtn!);
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });

  it('passes automated WCAG 2.5.8 Target Size checks across mobile viewports down to 320px width', async () => {
    const host = await mount(
      createElement('div', { style: { width: '320px', height: '568px', position: 'relative' } },
        createElement(MobileOverlayControls, {
          cameraPreset: 'rear',
          onCameraChange: () => {},
          onMove: () => {},
          onOpenChat: () => {},
          onOpenMenu: () => {},
          onOpenInventory: () => {},
          onOpenRadar: () => {},
          onOpenSettings: () => {},
          onZoomIn: () => {},
          onZoomOut: () => {},
          onRefreshScene: () => {},
        })
      )
    );

    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(10);

    // Automated Accessibility Verification: WCAG 2.5.8 Target Size Minimum
    const violations: string[] = [];

    buttons.forEach((btn, idx) => {
      const minW = parseInt(btn.style.minWidth || '0', 10);
      const minH = parseInt(btn.style.minHeight || '0', 10);
      const label = btn.getAttribute('aria-label') || `Button #${idx}`;

      if (minW < 24 || minH < 24) {
        violations.push(`${label} has touch target size ${minW}x${minH}px, smaller than 24x24px`);
      }
    });

    expect(violations).toEqual([]);
  });
});
