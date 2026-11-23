// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app';
import type { MediaPlaybackState, PrimFaceMedia } from '../../linkpoint/world-viewer';
import MediaControlsOverlay from '../MediaControlsOverlay.jsx';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

function createFocusedMedia(
  overrides: {
    objectId?: string;
    faceIndex?: number;
    state?: Partial<MediaPlaybackState>;
  } = {},
): NonNullable<typeof app.world.focusedMediaFace> {
  const objectId = overrides.objectId ?? 'prim-media-1';
  const faceIndex = overrides.faceIndex ?? 2;
  const media: PrimFaceMedia = {
    objectId,
    faceIndex,
    currentUrl: 'https://stream.example.org/live',
    homeUrl: 'https://stream.example.org/home',
    autoPlay: true,
    autoLoop: true,
    autoScale: true,
    autoZoom: false,
    controls: 'standard',
    widthPixels: 512,
    heightPixels: 512,
    firstClickInteract: false,
    whitelist: [],
    whitelistEnable: false,
    permsInteract: 31,
    permsControl: 31,
  };
  const state: MediaPlaybackState = {
    objectId,
    faceIndex,
    url: 'https://stream.example.org/live',
    isPlaying: true,
    volume: 0.8,
    isMuted: false,
    isCorsBlocked: false,
    lastUpdated: 1,
    ...overrides.state,
  };
  return { objectId, faceIndex, media, state };
}

async function mountOverlay() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(ThemeProvider, null, createElement(MediaControlsOverlay)),
      ),
    );
  });
  mounted = { host, root };
  return host;
}

describe('MediaControlsOverlay accessibility and controls', () => {
  beforeEach(() => {
    localStorage.clear();
    app.world.focusedMediaFace = null;
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
    app.world.focusedMediaFace = null;
    vi.restoreAllMocks();
  });

  it('returns null safely when focused media state is null or undefined', async () => {
    (app.world as unknown as { focusedMediaFace: unknown }).focusedMediaFace = undefined;
    const host = await mountOverlay();
    expect(host.querySelector('[role="region"][aria-label="Media on Prim Controls"]')).toBeNull();

    await act(async () => {
      app.world.emit('focused_media_changed', createFocusedMedia());
    });
    expect(
      host.querySelector('[role="region"][aria-label="Media on Prim Controls"]'),
    ).not.toBeNull();

    await act(async () => {
      app.world.emit('focused_media_changed', undefined);
    });
    expect(host.querySelector('[role="region"][aria-label="Media on Prim Controls"]')).toBeNull();
  });

  it('renders visible PLAYING and PAUSED status text inside an aria-live="polite" container (WCAG 2.2 SC 1.4.1)', async () => {
    app.world.focusedMediaFace = createFocusedMedia({ state: { isPlaying: true } });
    const host = await mountOverlay();

    const region = host.querySelector('[role="region"][aria-label="Media on Prim Controls"]');
    expect(region).not.toBeNull();

    const liveContainer = host.querySelector('[aria-live="polite"]') as HTMLElement | null;
    expect(liveContainer).not.toBeNull();
    expect(liveContainer!.textContent).toContain('SHARED MEDIA — FACE 2');

    const statusBadge = host.querySelector(
      '[data-testid="media-playback-status"]',
    ) as HTMLElement | null;
    expect(statusBadge).not.toBeNull();
    expect(statusBadge!.textContent).toBe('PLAYING');
    expect(liveContainer!.contains(statusBadge)).toBe(true);

    // Update playback state to paused and emit event
    await act(async () => {
      app.world.focusedMediaFace = createFocusedMedia({ state: { isPlaying: false } });
      app.world.emit('media_playback_changed', {
        objectId: 'prim-media-1',
        faceIndex: 2,
        isPlaying: false,
      });
    });

    expect(statusBadge!.textContent).toBe('PAUSED');
  });

  it('displays CORS BLOCKED error badge alongside the playback status indicator when CORS blocks media', async () => {
    app.world.focusedMediaFace = createFocusedMedia({
      state: { isPlaying: false, isCorsBlocked: true },
    });
    const host = await mountOverlay();

    const liveContainer = host.querySelector('[aria-live="polite"]') as HTMLElement | null;
    expect(liveContainer).not.toBeNull();
    expect(liveContainer!.textContent).toContain('PAUSED');
    expect(liveContainer!.textContent).toContain('CORS BLOCKED');
  });

  it('wraps the Media URL input with FocusRing and omits outline: none (WCAG 2.2 SC 2.4.7)', async () => {
    app.world.focusedMediaFace = createFocusedMedia();
    const host = await mountOverlay();

    const urlInput = host.querySelector('input[aria-label="Media URL"]') as HTMLInputElement | null;
    expect(urlInput).not.toBeNull();

    // Verify outline: none is not present on unfocused input
    expect(urlInput!.style.outline).toBe('');
    expect(urlInput!.getAttribute('data-focused')).toBeNull();

    await act(async () => {
      urlInput!.focus();
    });

    expect(urlInput!.style.outline).toContain('2px solid');
    expect(urlInput!.style.outlineOffset).toBe('2px');
    expect(urlInput!.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      urlInput!.blur();
    });

    expect(urlInput!.style.outline).toBe('');
    expect(urlInput!.getAttribute('data-focused')).toBeNull();
  });

  it('renders close button with TouchTarget minimum 24x24 dimensions and triggers focusMediaFace on click (WCAG 2.2 SC 2.5.8)', async () => {
    const focusSpy = vi.spyOn(app.world, 'focusMediaFace').mockImplementation(() => {});
    app.world.focusedMediaFace = createFocusedMedia();
    const host = await mountOverlay();

    const closeBtn = host.querySelector(
      'button[aria-label="Close media controls"]',
    ) as HTMLButtonElement | null;
    expect(closeBtn).not.toBeNull();
    expect(closeBtn!.classList.contains('touch-target')).toBe(true);
    expect(closeBtn!.style.minWidth).toBe('24px');
    expect(closeBtn!.style.minHeight).toBe('24px');
    expect(closeBtn!.style.display).toBe('inline-flex');
    expect(closeBtn!.style.alignItems).toBe('center');
    expect(closeBtn!.style.justifyContent).toBe('center');
    expect(closeBtn!.querySelector('svg')).not.toBeNull();

    await act(async () => {
      closeBtn!.click();
    });

    expect(focusSpy).toHaveBeenCalledWith('', 0);
  });

  it('preserves playback, home, and URL navigation handlers', async () => {
    const pauseSpy = vi.spyOn(app.world, 'pauseMedia').mockImplementation(() => {});
    const homeSpy = vi.spyOn(app.world, 'goHomeMedia').mockImplementation(() => {});
    const navSpy = vi.spyOn(app.world, 'navigateMedia').mockImplementation(() => {});

    app.world.focusedMediaFace = createFocusedMedia({ state: { isPlaying: true } });
    const host = await mountOverlay();

    const pauseBtn = host.querySelector(
      'button[aria-label="Pause media"]',
    ) as HTMLButtonElement | null;
    const homeBtn = host.querySelector(
      'button[aria-label="Go home URL"]',
    ) as HTMLButtonElement | null;
    const urlInput = host.querySelector('input[aria-label="Media URL"]') as HTMLInputElement | null;
    const form = host.querySelector('form') as HTMLFormElement | null;

    expect(pauseBtn).not.toBeNull();
    expect(homeBtn).not.toBeNull();
    expect(urlInput).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      pauseBtn!.click();
      homeBtn!.click();
    });
    expect(pauseSpy).toHaveBeenCalledWith('prim-media-1', 2);
    expect(homeSpy).toHaveBeenCalledWith('prim-media-1', 2);

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      valueSetter?.call(urlInput, 'https://stream.example.org/next');
      urlInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(navSpy).toHaveBeenCalledWith('prim-media-1', 2, 'https://stream.example.org/next');
  });
});
