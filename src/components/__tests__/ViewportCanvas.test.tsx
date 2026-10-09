import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ViewportCanvas from '../ViewportCanvas';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(props: React.ComponentProps<typeof ViewportCanvas> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ViewportCanvas, props));
  });
  mounted = { host, root };
  return host;
}

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
});

describe('ViewportCanvas Component', () => {
  it('renders canvas with ARIA attributes and tabIndex', async () => {
    const host = await mount({ regionName: 'Arah', position: [128, 128, 25] });
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;

    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.tabIndex).toBe(0);

    const ariaLabel = canvas.getAttribute('aria-label');
    expect(ariaLabel).toContain('Arah');
    expect(ariaLabel).toContain('128, 128, 25');
  });

  it('renders text fallback content inside canvas element', async () => {
    const host = await mount({ regionName: 'Test Sandbox' });
    const canvas = host.querySelector('canvas');
    expect(canvas?.innerHTML).toContain('Test Sandbox');
    expect(canvas?.innerHTML).toContain('Interactive 3D viewport canvas');
  });

  it('supports custom ariaLabel override', async () => {
    const host = await mount({ ariaLabel: 'Custom 3D Viewport Description' });
    const canvas = host.querySelector('canvas');
    expect(canvas?.getAttribute('aria-label')).toBe('Custom 3D Viewport Description');
  });

  it('handles keyboard navigation for movement, zoom, and reset', async () => {
    const onCameraMove = vi.fn();
    const onZoom = vi.fn();
    const onResetView = vi.fn();

    const host = await mount({ onCameraMove, onZoom, onResetView });
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;

    // Test Arrow key movement
    const upEvent = new KeyboardEvent('keydown', {
      code: 'ArrowUp',
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(upEvent);
    expect(onCameraMove).toHaveBeenCalledWith(1, 0, 0);

    const leftEvent = new KeyboardEvent('keydown', {
      code: 'ArrowLeft',
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(leftEvent);
    expect(onCameraMove).toHaveBeenCalledWith(0, -1, 0);

    // Test WASD movement
    const wEvent = new KeyboardEvent('keydown', {
      code: 'KeyW',
      key: 'w',
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(wEvent);
    expect(onCameraMove).toHaveBeenCalledWith(1, 0, 0);

    // Test EQ movement
    const eEvent = new KeyboardEvent('keydown', {
      code: 'KeyE',
      key: 'e',
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(eEvent);
    expect(onCameraMove).toHaveBeenCalledWith(0, 0, 1);

    // Test Zoom (+ and -)
    const plusEvent = new KeyboardEvent('keydown', {
      key: '+',
      code: 'Equal',
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(plusEvent);
    expect(onZoom).toHaveBeenCalledWith(0.2);

    const minusEvent = new KeyboardEvent('keydown', {
      key: '-',
      code: 'Minus',
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(minusEvent);
    expect(onZoom).toHaveBeenCalledWith(-0.2);

    // Test Reset view (Home or KeyR)
    const homeEvent = new KeyboardEvent('keydown', {
      code: 'Home',
      key: 'Home',
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(homeEvent);
    expect(onResetView).toHaveBeenCalled();
  });

  it('ignores keyboard shortcuts when modifier keys are pressed', async () => {
    const onCameraMove = vi.fn();
    const host = await mount({ onCameraMove });
    const canvas = host.querySelector('canvas') as HTMLCanvasElement;

    const ctrlUp = new KeyboardEvent('keydown', {
      code: 'ArrowUp',
      key: 'ArrowUp',
      ctrlKey: true,
      bubbles: true,
    });
    canvas.dispatchEvent(ctrlUp);
    expect(onCameraMove).not.toHaveBeenCalled();
  });

  it('renders single-pointer overlay controls and responds to clicks', async () => {
    const onZoom = vi.fn();
    const onPan = vi.fn();
    const onResetView = vi.fn();

    const host = await mount({ onZoom, onPan, onResetView });

    const zoomInBtn = host.querySelector('[aria-label="Zoom in"]') as HTMLButtonElement;
    const zoomOutBtn = host.querySelector('[aria-label="Zoom out"]') as HTMLButtonElement;
    const panUpBtn = host.querySelector('[aria-label="Pan camera up"]') as HTMLButtonElement;
    const panDownBtn = host.querySelector('[aria-label="Pan camera down"]') as HTMLButtonElement;
    const panLeftBtn = host.querySelector('[aria-label="Pan camera left"]') as HTMLButtonElement;
    const panRightBtn = host.querySelector('[aria-label="Pan camera right"]') as HTMLButtonElement;
    const resetBtn = host.querySelector('[aria-label="Reset camera view"]') as HTMLButtonElement;

    expect(zoomInBtn).not.toBeNull();
    expect(zoomOutBtn).not.toBeNull();
    expect(panUpBtn).not.toBeNull();
    expect(panDownBtn).not.toBeNull();
    expect(panLeftBtn).not.toBeNull();
    expect(panRightBtn).not.toBeNull();
    expect(resetBtn).not.toBeNull();

    await act(async () => {
      zoomInBtn.click();
    });
    expect(onZoom).toHaveBeenCalledWith(0.2);

    await act(async () => {
      zoomOutBtn.click();
    });
    expect(onZoom).toHaveBeenCalledWith(-0.2);

    await act(async () => {
      panUpBtn.click();
    });
    expect(onPan).toHaveBeenCalledWith(0, 1);

    await act(async () => {
      panDownBtn.click();
    });
    expect(onPan).toHaveBeenCalledWith(0, -1);

    await act(async () => {
      panLeftBtn.click();
    });
    expect(onPan).toHaveBeenCalledWith(-1, 0);

    await act(async () => {
      panRightBtn.click();
    });
    expect(onPan).toHaveBeenCalledWith(1, 0);

    await act(async () => {
      resetBtn.click();
    });
    expect(onResetView).toHaveBeenCalled();
  });

  it('can hide single-pointer overlay controls when showOverlayControls is false', async () => {
    const host = await mount({ showOverlayControls: false });
    const overlay = host.querySelector('[aria-label="Single-pointer camera controls"]');
    expect(overlay).toBeNull();
  });
});
