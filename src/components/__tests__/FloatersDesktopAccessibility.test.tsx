// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import FloatersDesktop from '../FloatersDesktop.jsx';
import { liveRegionAnnouncer } from '../../services/LiveRegionAnnouncer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root; getCtx: () => ReturnType<typeof useApp> } | null =
  null;

async function mountDesktop() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let ctxRef: ReturnType<typeof useApp> | null = null;

  function Inspector() {
    ctxRef = useApp();
    return null;
  }

  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(
          ThemeProvider,
          null,
          createElement(
            'div',
            { style: { position: 'relative', width: '1440px', height: '900px' } },
            createElement(Inspector),
            createElement(FloatersDesktop),
          ),
        ),
      ),
    );
  });

  mounted = { host, root, getCtx: () => ctxRef! };
  return { host, getCtx: () => ctxRef! };
}

describe('FloatersDesktop Accessibility & Keyboard Navigation (WCAG 2.2 SC 2.1.1, SC 2.5.7, SC 4.1.2)', () => {
  let announceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    announceSpy = vi.spyOn(liveRegionAnnouncer, 'announce').mockImplementation(() => {});
  });

  afterEach(async () => {
    announceSpy.mockRestore();
    vi.clearAllTimers();
    vi.useRealTimers();
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
  });

  it('renders keyboard-focusable titlebar move handle with ARIA separator semantics and roledescription', async () => {
    const { host } = await mountDesktop();
    const moveHandles = host.querySelectorAll<HTMLElement>(
      '[role="separator"][aria-roledescription="window move handle"]',
    );
    expect(moveHandles.length).toBeGreaterThan(0);

    const chatHandle = Array.from(moveHandles).find(
      (el) => el.getAttribute('aria-label') === 'Local Chat move handle',
    );
    expect(chatHandle).not.toBeNull();
    expect(chatHandle?.getAttribute('tabindex')).toBe('0');
    expect(chatHandle?.hasAttribute('aria-valuenow')).toBe(true);
    expect(chatHandle?.hasAttribute('aria-valuemin')).toBe(true);
    expect(chatHandle?.hasAttribute('aria-valuemax')).toBe(true);
  });

  it('renders keyboard-focusable corner resize grip with ARIA separator semantics and roledescription', async () => {
    const { host } = await mountDesktop();
    const resizeGrips = host.querySelectorAll<HTMLElement>(
      '[role="separator"][aria-roledescription="window resize grip"]',
    );
    expect(resizeGrips.length).toBeGreaterThan(0);

    const chatGrip = Array.from(resizeGrips).find(
      (el) => el.getAttribute('aria-label') === 'Local Chat resize grip',
    );
    expect(chatGrip).not.toBeNull();
    expect(chatGrip?.getAttribute('tabindex')).toBe('0');
    expect(chatGrip?.hasAttribute('aria-valuenow')).toBe(true);
    expect(chatGrip?.getAttribute('aria-valuemin')).toBe('216');
  });

  it('repositions floater with 10px arrow keys and 50px Shift+arrow keys on titlebar move handle', async () => {
    const { host, getCtx } = await mountDesktop();
    const chatHandle = host.querySelector<HTMLElement>('[aria-label="Local Chat move handle"]');
    expect(chatHandle).not.toBeNull();

    const initialRect = getCtx().actions.flR('Chat');
    const startX = initialRect.x;
    const startY = initialRect.y;

    // Shift + ArrowRight: moves 50px
    await act(async () => {
      chatHandle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
      );
    });
    expect(getCtx().actions.flR('Chat').x).toBe(startX + 50);

    // Another Shift + ArrowRight: moves another 50px (total 100px)
    await act(async () => {
      chatHandle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
      );
    });
    expect(getCtx().actions.flR('Chat').x).toBe(startX + 100);

    // Standard ArrowDown: moves 10px
    await act(async () => {
      chatHandle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: false, bubbles: true }),
      );
    });
    expect(getCtx().actions.flR('Chat').y).toBe(startY + 10);

    // Standard ArrowLeft: moves -10px
    await act(async () => {
      chatHandle?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: false, bubbles: true }),
      );
    });
    expect(getCtx().actions.flR('Chat').x).toBe(startX + 90);

    // Debounced announcement on channel 'status'
    expect(announceSpy).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(announceSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Local Chat moved to \d+, \d+/),
      'polite',
      'status',
    );
  });

  it('resizes floater with 10px arrow keys and 50px Shift+arrow keys on corner resize grip', async () => {
    const { host, getCtx } = await mountDesktop();
    const chatGrip = host.querySelector<HTMLElement>('[aria-label="Local Chat resize grip"]');
    expect(chatGrip).not.toBeNull();

    const initialRect = getCtx().actions.flR('Chat');
    const startW = initialRect.w;
    const startH = initialRect.h;

    // Shift + ArrowRight: expands width by 50px
    await act(async () => {
      chatGrip?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
      );
    });
    expect(getCtx().actions.flR('Chat').w).toBe(startW + 50);

    // Shift + ArrowDown: expands height by 50px
    await act(async () => {
      chatGrip?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }),
      );
    });
    expect(getCtx().actions.flR('Chat').h).toBe(startH + 50);

    // Standard ArrowLeft: shrinks width by 10px
    await act(async () => {
      chatGrip?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: false, bubbles: true }),
      );
    });
    expect(getCtx().actions.flR('Chat').w).toBe(startW + 40);

    // Advance debounce timer for status announcement
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(announceSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Local Chat resized to \d+ by \d+/),
      'polite',
      'status',
    );
  });

  it('clamps floater dimensions so it cannot shrink below 216x96 and coordinates stay within desktop', async () => {
    const { getCtx } = await mountDesktop();

    // Try resizing to negative or tiny values
    await act(async () => {
      getCtx().actions.flResize('Chat', -2000, -2000);
    });
    const shrunk = getCtx().actions.flR('Chat');
    expect(shrunk.w).toBe(216);
    expect(shrunk.h).toBe(96);

    // Try moving past desktop upper bounds
    await act(async () => {
      getCtx().actions.flMove('Chat', 5000, 5000);
    });
    const moved = getCtx().actions.flR('Chat');
    expect(moved.x).toBeLessThan(1440);
    expect(moved.y).toBeLessThan(900);
    expect(moved.x).toBeGreaterThan(0);
    expect(moved.y).toBeGreaterThan(0);

    // Try moving past negative bounds
    await act(async () => {
      getCtx().actions.flMove('Chat', -5000, -5000);
    });
    const clampedZero = getCtx().actions.flR('Chat');
    expect(clampedZero.x).toBe(0);
    expect(clampedZero.y).toBe(0);
  });

  it('supports single-pointer quick snap presets: Maximize, Restore, Snap Left, and Snap Right', async () => {
    const { host, getCtx } = await mountDesktop();
    const chatHandle = host.querySelector<HTMLElement>('[aria-label="Local Chat move handle"]');
    expect(chatHandle).not.toBeNull();

    const maxBtn = chatHandle?.querySelector<HTMLButtonElement>('button[aria-label="Maximize"]');
    const snapLeftBtn = chatHandle?.querySelector<HTMLButtonElement>(
      'button[aria-label="Snap Left"]',
    );
    const snapRightBtn = chatHandle?.querySelector<HTMLButtonElement>(
      'button[aria-label="Snap Right"]',
    );

    expect(maxBtn).not.toBeNull();
    expect(snapLeftBtn).not.toBeNull();
    expect(snapRightBtn).not.toBeNull();

    const initialRect = getCtx().actions.flR('Chat');

    // 1. Maximize
    await act(async () => {
      maxBtn?.click();
    });
    const maxRect = getCtx().actions.flR('Chat');
    expect(maxRect.x).toBe(0);
    expect(maxRect.y).toBe(0);
    expect(maxRect.w).toBeGreaterThan(initialRect.w);
    expect((getCtx().state.flMax as Record<string, boolean>)['Chat']).toBe(true);
    expect(announceSpy).toHaveBeenCalledWith('Local Chat maximized', 'polite', 'status');

    // Button label toggles to "Restore"
    const restoreBtn = chatHandle?.querySelector<HTMLButtonElement>('button[aria-label="Restore"]');
    expect(restoreBtn).not.toBeNull();

    // 2. Restore returns to previous coordinates
    await act(async () => {
      restoreBtn?.click();
    });
    const restoredRect = getCtx().actions.flR('Chat');
    expect(restoredRect.x).toBe(initialRect.x);
    expect(restoredRect.y).toBe(initialRect.y);
    expect(restoredRect.w).toBe(initialRect.w);
    expect(restoredRect.h).toBe(initialRect.h);
    expect((getCtx().state.flMax as Record<string, boolean>)['Chat']).toBe(false);

    // 3. Snap Left
    await act(async () => {
      snapLeftBtn?.click();
    });
    const leftRect = getCtx().actions.flR('Chat');
    expect(leftRect.x).toBe(0);
    expect(leftRect.y).toBe(0);
    expect(leftRect.w).toBeGreaterThanOrEqual(216);
    expect(announceSpy).toHaveBeenCalledWith('Local Chat snapped left', 'polite', 'status');

    // 4. Snap Right
    await act(async () => {
      snapRightBtn?.click();
    });
    const rightRect = getCtx().actions.flR('Chat');
    expect(rightRect.x).toBeGreaterThan(0);
    expect(rightRect.y).toBe(0);
    expect(announceSpy).toHaveBeenCalledWith('Local Chat snapped right', 'polite', 'status');
  });

  it('adapts titlebar action buttons to layout family geometry tokens', async () => {
    const { host, getCtx } = await mountDesktop();

    // Test with default layout family
    const defaultButtons = host.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Local Chat move handle"] button',
    );
    expect(defaultButtons.length).toBeGreaterThanOrEqual(5);
    expect(defaultButtons[0].style.width).toBe('17px');

    // Switch to sweep layout family
    await act(async () => {
      getCtx().actions.setLayout('sweep');
    });
    const sweepButtons = host.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Local Chat move handle"] button',
    );
    expect(sweepButtons[0].style.width).toBe('18px');

    // Switch to metro (tiles) layout family
    await act(async () => {
      getCtx().actions.setLayout('tiles');
    });
    const metroButtons = host.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Local Chat move handle"] button',
    );
    expect(metroButtons[0].style.width).toBe('24px');
  });

  it('resets floater geometry to initial defaults with flReset', async () => {
    const { getCtx } = await mountDesktop();

    const originalChat = getCtx().actions.flR('Chat');

    await act(async () => {
      getCtx().actions.flMove('Chat', 150, 80);
    });
    expect(getCtx().actions.flR('Chat').x).toBe(originalChat.x + 150);

    await act(async () => {
      getCtx().actions.flReset('Chat');
    });
    expect(getCtx().actions.flR('Chat').x).toBe(originalChat.x);
    expect(getCtx().actions.flR('Chat').y).toBe(originalChat.y);
    expect(announceSpy).toHaveBeenCalledWith(
      'Local Chat reset to default position',
      'polite',
      'status',
    );
  });
});
