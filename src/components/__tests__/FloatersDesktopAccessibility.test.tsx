// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import FloatersDesktop from '../FloatersDesktop.jsx';
import { liveRegionAnnouncer } from '../../services/LiveRegionAnnouncer';
import { app } from '../../linkpoint/app';
import { CBTN } from '../../theme/constants.js';

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
    const titleBar = chatHandle?.parentElement;

    const maxBtn = titleBar?.querySelector<HTMLButtonElement>('button[aria-label="Maximize"]');
    const snapLeftBtn = titleBar?.querySelector<HTMLButtonElement>(
      'button[aria-label="Snap Left"]',
    );
    const snapRightBtn = titleBar?.querySelector<HTMLButtonElement>(
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
    const restoreBtn = titleBar?.querySelector<HTMLButtonElement>('button[aria-label="Restore"]');
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
    const getChatButtons = () =>
      host
        .querySelector<HTMLElement>('[aria-label="Local Chat move handle"]')
        ?.parentElement?.querySelectorAll<HTMLButtonElement>('button') || [];

    // Test with default layout family
    const defaultButtons = getChatButtons();
    expect(defaultButtons.length).toBeGreaterThanOrEqual(5);
    expect(defaultButtons[0].style.width).toBe('17px');

    // Switch to sweep layout family
    await act(async () => {
      getCtx().actions.setLayout('sweep');
    });
    const sweepButtons = getChatButtons();
    expect(sweepButtons[0].style.width).toBe('18px');

    // Switch to metro (tiles) layout family
    await act(async () => {
      getCtx().actions.setLayout('tiles');
    });
    const metroButtons = getChatButtons();
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

  it('renders floater window chips in the dock as focusable buttons with aria-pressed and Enter activation', async () => {
    const { host, getCtx } = await mountDesktop();
    const dock = host.querySelector<HTMLElement>('.quick-chat-dock');
    expect(dock).not.toBeNull();

    // Focus Chat so it becomes active (aria-pressed="true")
    await act(async () => {
      getCtx().actions.flFocus('Chat');
    });

    const getFloaterBtn = (title: string) =>
      Array.from(dock!.querySelectorAll<HTMLButtonElement>('button[type="button"]')).find(
        (btn) => btn.textContent?.trim() === title,
      ) ?? null;

    const chatChip = getFloaterBtn('Local Chat');
    const radarChip = getFloaterBtn('Nearby');
    expect(chatChip).not.toBeNull();
    expect(radarChip).not.toBeNull();

    // Verify keyboard focusability and initial ARIA pressed states
    chatChip!.focus();
    expect(document.activeElement).toBe(chatChip);
    expect(chatChip!.getAttribute('aria-pressed')).toBe('true');
    expect(radarChip!.getAttribute('aria-pressed')).toBe('false');

    // Enter keypress minimizes the currently open Chat floater and updates aria-pressed to "false"
    await act(async () => {
      chatChip!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect((getCtx().state.flMin as Record<string, boolean>)['Chat']).toBe(true);
    expect(chatChip!.getAttribute('aria-pressed')).toBe('false');

    // Enter keypress again restores and focuses the Chat floater and updates aria-pressed to "true"
    await act(async () => {
      chatChip!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect((getCtx().state.flMin as Record<string, boolean>)['Chat']).toBe(false);
    expect(getCtx().state.screen).toBe('Chat');
    expect(chatChip!.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders voice control as a focusable button that updates aria-label and aria-pressed across connection and mute states', async () => {
    const originalState = app.voice.state;
    const originalMuted = app.voice.muted;
    const connectSpy = vi.spyOn(app.voice, 'connect').mockResolvedValue(undefined);
    const setMutedSpy = vi.spyOn(app.voice, 'setMuted').mockImplementation((muted: boolean) => {
      app.voice.muted = muted;
      app.voice.emit('state', { state: app.voice.state, muted });
    });

    try {
      app.voice.state = 'off';
      app.voice.muted = true;

      const { host } = await mountDesktop();
      const dock = host.querySelector<HTMLElement>('.quick-chat-dock');
      expect(dock).not.toBeNull();

      const voiceBtn = dock!.querySelector<HTMLButtonElement>(
        'button[aria-label="Connect Voice Microphone"]',
      );
      expect(voiceBtn).not.toBeNull();
      expect(voiceBtn!.getAttribute('type')).toBe('button');
      expect(voiceBtn!.getAttribute('aria-pressed')).toBe('false');

      // Verify keyboard focus and Enter keypress to connect voice
      voiceBtn!.focus();
      expect(document.activeElement).toBe(voiceBtn);
      await act(async () => {
        voiceBtn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(connectSpy).toHaveBeenCalledTimes(1);

      // Simulate voice connecting while muted -> label updates to "Unmute Microphone", aria-pressed="false"
      await act(async () => {
        app.voice.state = 'connected';
        app.voice.muted = true;
        app.voice.emit('state', { state: 'connected', muted: true });
      });
      expect(voiceBtn!.getAttribute('aria-label')).toBe('Unmute Microphone');
      expect(voiceBtn!.getAttribute('aria-pressed')).toBe('false');

      // Enter keypress unmutes microphone -> label updates to "Mute Microphone", aria-pressed="true"
      await act(async () => {
        voiceBtn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(setMutedSpy).toHaveBeenCalledWith(false);
      expect(voiceBtn!.getAttribute('aria-label')).toBe('Mute Microphone');
      expect(voiceBtn!.getAttribute('aria-pressed')).toBe('true');

      // Enter keypress again mutes microphone -> label updates back to "Unmute Microphone", aria-pressed="false"
      await act(async () => {
        voiceBtn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(setMutedSpy).toHaveBeenCalledWith(true);
      expect(voiceBtn!.getAttribute('aria-label')).toBe('Unmute Microphone');
      expect(voiceBtn!.getAttribute('aria-pressed')).toBe('false');
    } finally {
      app.voice.state = originalState;
      app.voice.muted = originalMuted;
      connectSpy.mockRestore();
      setMutedSpy.mockRestore();
    }
  });

  it('renders console dock items as semantic buttons with aria-pressed, Enter activation, and disabled state handling', async () => {
    const flyEntry = CBTN.fly as { label: string; icon: string; off?: boolean };
    const sitEntry = CBTN.sit as { label: string; icon: string; off?: boolean };
    flyEntry.off = true;

    try {
      const { host, getCtx } = await mountDesktop();
      const dock = host.querySelector<HTMLElement>('.quick-chat-dock');
      expect(dock).not.toBeNull();

      const getDockBtn = (label: string) =>
        Array.from(dock!.querySelectorAll<HTMLButtonElement>('button[type="button"]')).find(
          (btn) => btn.textContent?.trim() === label,
        ) ?? null;

      const flyBtn = getDockBtn('FLY');
      const sitBtn = getDockBtn('SIT');
      const mapBtn = getDockBtn('MAP');

      expect(flyBtn).not.toBeNull();
      expect(sitBtn).not.toBeNull();
      expect(mapBtn).not.toBeNull();

      // Disabled console dock button reports disabled attribute and blocks click / Enter dispatch
      expect(flyBtn!.disabled).toBe(true);
      expect(flyBtn!.getAttribute('aria-pressed')).toBe('false');

      await act(async () => {
        flyBtn!.click();
        flyBtn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(getCtx().state.cReason).toBe('');

      // Active console dock buttons receive focus, expose aria-pressed, and activate via Enter keypress
      expect(sitBtn!.disabled).toBe(false);
      expect(sitBtn!.getAttribute('aria-pressed')).toBe('false');
      sitBtn!.focus();
      expect(document.activeElement).toBe(sitBtn);

      await act(async () => {
        sitBtn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(getCtx().state.cReason).toContain('SIT');

      mapBtn!.focus();
      expect(document.activeElement).toBe(mapBtn);
      await act(async () => {
        mapBtn!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(getCtx().state.screen).toBe('Map');
    } finally {
      delete flyEntry.off;
      delete sitEntry.off;
    }
  });
});
