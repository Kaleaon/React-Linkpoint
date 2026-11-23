// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app.ts';
import OutfitViewer from '../OutfitViewer.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = null;
let originalCamera3d = null;

async function mountOutfitViewer() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(ThemeProvider, null, createElement(OutfitViewer)),
      ),
    );
  });
  mounted = { host, root };
  return host;
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
  originalCamera3d = app.world.camera3d;
  vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
  vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });
});

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
  app.world.camera3d = originalCamera3d;
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('OutfitViewer accessibility and viewport controls (WCAG 1.1.1, 2.1.1, 2.5.8)', () => {
  it('renders the 3D avatar canvas with role="img", tabIndex={0}, aria-label, and fallback DOM text', async () => {
    const host = await mountOutfitViewer();
    const canvas = host.querySelector('canvas');

    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.getAttribute('aria-label')).toBe('3D Avatar Viewport');

    const fallback = canvas.querySelector('p');
    expect(fallback).not.toBeNull();
    expect(fallback.textContent).toContain('Interactive 3D avatar viewport');
    expect(fallback.textContent).toContain('Arrow keys to rotate');
    expect(fallback.textContent).toContain('+ and - to zoom');
  });

  it('rotates the camera with arrow keys and prevents default scrolling', async () => {
    const rotateSpy = vi.spyOn(app.world, 'rotateCamera').mockImplementation(() => {});
    const host = await mountOutfitViewer();
    const canvas = host.querySelector('canvas');

    const cases = [
      { key: 'ArrowUp', code: 'ArrowUp', expected: [8, 0] },
      { key: 'ArrowDown', code: 'ArrowDown', expected: [-8, 0] },
      { key: 'ArrowLeft', code: 'ArrowLeft', expected: [0, -10] },
      { key: 'ArrowRight', code: 'ArrowRight', expected: [0, 10] },
    ];

    for (const { key, code, expected } of cases) {
      rotateSpy.mockClear();
      const event = new KeyboardEvent('keydown', {
        key,
        code,
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        canvas.dispatchEvent(event);
      });
      expect(rotateSpy).toHaveBeenCalledWith(expected[0], expected[1]);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('zooms the 3D camera in and out with +/- keys and resets view on Home', async () => {
    const zoomSpy = vi.fn();
    const updateMatricesSpy = vi.fn();
    const setPresetSpy = vi.spyOn(app.world, 'setCameraPreset').mockImplementation(() => {});
    const host = await mountOutfitViewer();
    const canvas = host.querySelector('canvas');

    app.world.camera3d = {
      zoom: zoomSpy,
      updateMatrices: updateMatricesSpy,
      orbitDistance: 4,
    };

    const zoomInKeys = [
      { key: '+', code: 'Equal', shiftKey: true },
      { key: '=', code: 'Equal', shiftKey: false },
      { key: '+', code: 'NumpadAdd', shiftKey: false },
    ];
    for (const init of zoomInKeys) {
      zoomSpy.mockClear();
      const event = new KeyboardEvent('keydown', {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        canvas.dispatchEvent(event);
      });
      expect(zoomSpy).toHaveBeenCalledWith(0.2);
      expect(event.defaultPrevented).toBe(true);
    }

    const zoomOutKeys = [
      { key: '-', code: 'Minus', shiftKey: false },
      { key: '_', code: 'Minus', shiftKey: true },
      { key: '-', code: 'NumpadSubtract', shiftKey: false },
    ];
    for (const init of zoomOutKeys) {
      zoomSpy.mockClear();
      const event = new KeyboardEvent('keydown', {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        canvas.dispatchEvent(event);
      });
      expect(zoomSpy).toHaveBeenCalledWith(-0.2);
      expect(event.defaultPrevented).toBe(true);
    }

    // Switch camera preset away from front, then reset via Home key
    const backBtn = host.querySelector('button[aria-label="View Back camera angle"]');
    await act(async () => {
      backBtn.click();
    });
    expect(backBtn.getAttribute('aria-pressed')).toBe('true');

    setPresetSpy.mockClear();
    const homeEvent = new KeyboardEvent('keydown', {
      key: 'Home',
      code: 'Home',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      canvas.dispatchEvent(homeEvent);
    });
    expect(homeEvent.defaultPrevented).toBe(true);
    expect(setPresetSpy).toHaveBeenCalledWith('front');
    const frontBtn = host.querySelector('button[aria-label="View Front camera angle"]');
    expect(frontBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores camera keystrokes when typing in form inputs or when modifier keys are active', async () => {
    const rotateSpy = vi.spyOn(app.world, 'rotateCamera').mockImplementation(() => {});
    const zoomSpy = vi.fn();
    const host = await mountOutfitViewer();
    const canvas = host.querySelector('canvas');

    app.world.camera3d = {
      zoom: zoomSpy,
      updateMatrices: vi.fn(),
      orbitDistance: 4,
    };

    // Modifier keys (Control, Meta, Alt) should be ignored
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      const modArrow = new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        code: 'ArrowLeft',
        ...mod,
        bubbles: true,
        cancelable: true,
      });
      const modZoom = new KeyboardEvent('keydown', {
        key: '+',
        code: 'Equal',
        ...mod,
        bubbles: true,
        cancelable: true,
      });
      await act(async () => {
        canvas.dispatchEvent(modArrow);
        canvas.dispatchEvent(modZoom);
      });
      expect(modArrow.defaultPrevented).toBe(false);
      expect(modZoom.defaultPrevented).toBe(false);
    }
    expect(rotateSpy).not.toHaveBeenCalled();
    expect(zoomSpy).not.toHaveBeenCalled();

    // Typing targets (e.g. text input) should be ignored even if event target is passed to handler
    const filterInput = host.querySelector('input[aria-label="Filter outfit items"]');
    expect(filterInput).not.toBeNull();
    const inputEvent = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(inputEvent, 'target', { value: filterInput });
    await act(async () => {
      canvas.dispatchEvent(inputEvent);
    });
    expect(rotateSpy).not.toHaveBeenCalled();
    expect(inputEvent.defaultPrevented).toBe(false);

    // Unhandled navigation keys like Tab should not call preventDefault (no keyboard trap)
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      canvas.dispatchEvent(tabEvent);
    });
    expect(tabEvent.defaultPrevented).toBe(false);
  });

  it('renders the camera RESET button using TouchTarget with minimum 24x24 CSS pixel dimensions', async () => {
    const host = await mountOutfitViewer();
    const resetBtn = host.querySelector('button[aria-label="Reset Camera View"]');

    expect(resetBtn).not.toBeNull();
    expect(resetBtn.textContent?.trim()).toBe('RESET');
    expect(resetBtn.classList.contains('touch-target')).toBe(true);
    expect(resetBtn.style.minWidth).toBe('24px');
    expect(resetBtn.style.minHeight).toBe('24px');
    expect(resetBtn.style.display).toBe('inline-flex');
    expect(resetBtn.style.alignItems).toBe('center');
    expect(resetBtn.style.justifyContent).toBe('center');

    // Verify clicking RESET restores the Front camera preset
    const sideBtn = host.querySelector('button[aria-label="View Side camera angle"]');
    await act(async () => {
      sideBtn.click();
    });
    expect(sideBtn.getAttribute('aria-pressed')).toBe('true');

    await act(async () => {
      resetBtn.click();
    });
    const frontBtn = host.querySelector('button[aria-label="View Front camera angle"]');
    expect(frontBtn.getAttribute('aria-pressed')).toBe('true');
    expect(sideBtn.getAttribute('aria-pressed')).toBe('false');
  });
});
