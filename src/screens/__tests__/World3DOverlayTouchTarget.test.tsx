// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider, useTheme } from '../../context/ThemeContext.jsx';
import World3D, { World3DActionBar } from '../World3D.jsx';
import { app } from '../../linkpoint/app';

(globalThis as unknown as Record<string, boolean>).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;
let capturedThemeV: ReturnType<typeof useTheme>['V'] | null = null;

function ThemeInspector({
  children,
  onTheme,
}: {
  children?: React.ReactNode;
  onTheme: (tokens: ReturnType<typeof useTheme>['V']) => void;
}) {
  const { V } = useTheme();
  useEffect(() => {
    onTheme(V);
  }, [V, onTheme]);
  return <>{children}</>;
}

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const handleTheme = (tokens: ReturnType<typeof useTheme>['V']) => {
    capturedThemeV = tokens;
  };
  await act(async () => {
    root.render(
      <AppProvider>
        <ThemeProvider>
          <ThemeInspector onTheme={handleTheme}>{ui}</ThemeInspector>
        </ThemeProvider>
      </AppProvider>,
    );
  });
  mounted = { host, root };
  return host;
}

async function click(el: Element | null) {
  await act(async () => {
    if (el) (el as HTMLElement).click();
  });
}

function expectMinimumTargetSize(btn: HTMLButtonElement, label?: string) {
  const desc = label || btn.getAttribute('aria-label') || btn.textContent || 'button';
  expect(btn.classList.contains('touch-target'), `${desc} has touch-target class`).toBe(true);
  const minW = parseInt(btn.style.minWidth || '0', 10);
  const minH = parseInt(btn.style.minHeight || '0', 10);
  expect(minW, `${desc} minWidth >= 24px`).toBeGreaterThanOrEqual(24);
  expect(minH, `${desc} minHeight >= 24px`).toBeGreaterThanOrEqual(24);
  expect(btn.style.display, `${desc} display`).not.toBe('none');
  expect(btn.style.boxSizing, `${desc} boxSizing`).toBe('border-box');
}

async function expectKeyboardFocusRing(btn: HTMLButtonElement, expectedColorSubstr?: string) {
  const desc = btn.getAttribute('aria-label') || btn.textContent || 'button';
  expect(btn.style.outline, `${desc} unfocused outline`).not.toBe('none');
  expect(btn.getAttribute('data-focused'), `${desc} unfocused data-focused`).toBeNull();

  await act(async () => {
    btn.focus();
  });

  expect(document.activeElement, `${desc} receives active focus`).toBe(btn);
  expect(btn.getAttribute('data-focused'), `${desc} focused data-focused`).toBe('true');
  expect(btn.classList.contains('linkpoint-focused'), `${desc} focused class`).toBe(true);
  expect(btn.style.outline, `${desc} focused outline`).toContain('2px solid');
  expect(btn.style.outlineOffset, `${desc} focused outlineOffset`).toBe('2px');
  if (expectedColorSubstr) {
    // Browser/JSDOM may normalize hex colors to rgb() in style.outline; verify non-empty solid outline
    expect(btn.style.outline.length).toBeGreaterThan('2px solid '.length);
  }

  await act(async () => {
    btn.blur();
  });

  expect(btn.getAttribute('data-focused'), `${desc} blurred data-focused`).toBeNull();
  expect(btn.style.outline, `${desc} blurred outline`).toBe('');
}

describe('World3D Overlay TouchTarget & FocusRing Accessibility (WCAG 2.2 SC 2.5.8 & 2.4.7)', () => {
  const origVoiceState = app.voice.state;
  const origVoiceMuted = app.voice.muted;
  const origSelectedObject = app.world.selectedObject;

  beforeEach(() => {
    vi.spyOn(app.world, 'init').mockResolvedValue(undefined);
    vi.spyOn(app.world, 'destroyRenderer').mockImplementation(() => {});
    app.voice.state = 'off';
    app.voice.muted = false;
    app.world.selectedObject = null;
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
    app.voice.state = origVoiceState;
    app.voice.muted = origVoiceMuted;
    app.world.selectedObject = origSelectedObject;
    capturedThemeV = null;
    vi.restoreAllMocks();
  });

  it('enforces >= 24x24px TouchTarget dimensions and FocusRing outlines on collapsed and expanded diagnostics controls', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    vi.spyOn(app.world, 'getAssetErrors').mockReturnValue([
      { assetId: 'mesh-1', message: 'Failed' },
    ]);
    const retrySpy = vi.spyOn(app.world, 'retryFailedAssets').mockResolvedValue(undefined);

    const host = await mount(<World3D />);

    // Collapsed diagnostics header controls
    const expandBtn = host.querySelector(
      'button[aria-label="Expand scene statistics"]',
    ) as HTMLButtonElement;
    const hideBtn = host.querySelector(
      'button[aria-label="Hide scene statistics"]',
    ) as HTMLButtonElement;

    expect(expandBtn).not.toBeNull();
    expect(hideBtn).not.toBeNull();
    expect(expandBtn.style.minWidth).toBe('24px');
    expect(expandBtn.style.minHeight).toBe('24px');
    expect(hideBtn.style.minWidth).toBe('24px');
    expect(hideBtn.style.minHeight).toBe('24px');

    await expectKeyboardFocusRing(expandBtn);
    await expectKeyboardFocusRing(hideBtn);

    // Expand diagnostics panel
    await click(expandBtn);

    const collapseBtn = host.querySelector(
      'button[aria-label="Collapse scene statistics"]',
    ) as HTMLButtonElement;
    const closeBtn = host.querySelector(
      'button[aria-label="Close scene statistics"]',
    ) as HTMLButtonElement;
    const retryBtn = Array.from(host.querySelectorAll('output button')).find(
      (b) => b.textContent?.trim() === 'RETRY',
    ) as HTMLButtonElement;
    const syncBtn = Array.from(host.querySelectorAll('output button')).find(
      (b) => b.textContent?.trim() === 'SYNC SCENE',
    ) as HTMLButtonElement;

    expect(collapseBtn).not.toBeNull();
    expect(closeBtn).not.toBeNull();
    expect(retryBtn).toBeDefined();
    expect(syncBtn).toBeDefined();

    for (const btn of [collapseBtn, closeBtn, retryBtn, syncBtn]) {
      expectMinimumTargetSize(btn);
      expect(btn.style.minWidth).toBe('24px');
      expect(btn.style.minHeight).toBe('24px');
      await expectKeyboardFocusRing(btn);
    }

    await click(retryBtn);
    expect(retrySpy).toHaveBeenCalledTimes(1);

    // Close diagnostics and check INFO restore button
    await click(closeBtn);
    const showInfoBtn = host.querySelector(
      'button[aria-label="Show scene information"]',
    ) as HTMLButtonElement;
    expect(showInfoBtn).not.toBeNull();
    expectMinimumTargetSize(showInfoBtn, 'Show scene information');
    await expectKeyboardFocusRing(showInfoBtn);
  });

  it('enforces >= 24x24px TouchTarget dimensions and FocusRing outlines on object inspector controls', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    const selectSpy = vi.fn();
    const worldRecord = app.world as unknown as Record<string, unknown>;
    const prevSelectObject = worldRecord.selectObject;
    worldRecord.selectObject = selectSpy;
    const focusCamSpy = vi.spyOn(app.world, 'focusSelectedObject').mockImplementation(() => false);

    app.world.selectedObject = {
      id: 'prim-42',
      name: 'Crystal Beacon',
      shape: 'Prism',
      avatar: false,
      distance: 5.4,
    } as typeof app.world.selectedObject;

    const host = await mount(<World3D />);

    const inspector = host.querySelector('aside[aria-label="Selected object"]') as HTMLElement;
    expect(inspector).not.toBeNull();

    const deselectBtn = inspector.querySelector(
      'button[aria-label="Deselect object"]',
    ) as HTMLButtonElement;
    expect(deselectBtn).not.toBeNull();
    expect(deselectBtn.style.minWidth).toBe('24px');
    expect(deselectBtn.style.minHeight).toBe('24px');

    const inspectorButtons = Array.from(
      inspector.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(inspectorButtons.length).toBe(4); // Deselect, FOCUS CAMERA, TOUCH, SIT

    for (const btn of inspectorButtons) {
      expectMinimumTargetSize(btn);
      await expectKeyboardFocusRing(btn);
    }

    const focusCameraBtn = inspectorButtons.find((b) =>
      b.textContent?.includes('FOCUS CAMERA'),
    ) as HTMLButtonElement;
    await click(focusCameraBtn);
    expect(focusCamSpy).toHaveBeenCalledTimes(1);

    try {
      await click(deselectBtn);
      expect(selectSpy).toHaveBeenCalledWith(null);
      expect(host.querySelector('aside[aria-label="Selected object"]')).toBeNull();
    } finally {
      worldRecord.selectObject = prevSelectObject;
    }
  });

  it('enforces >= 24x24px TouchTarget dimensions and FocusRing outline on spatial chat overlay dismiss button', async () => {
    const host = await mount(<World3D />);

    const openChatBtn = host.querySelector('button[aria-label="Open Chat"]') as HTMLButtonElement;
    expect(openChatBtn).not.toBeNull();
    await click(openChatBtn);

    const closeChatBtn = host.querySelector(
      'button[aria-label="Close spatial chat overlay"]',
    ) as HTMLButtonElement;
    expect(closeChatBtn).not.toBeNull();
    expect(closeChatBtn.style.minWidth).toBe('24px');
    expect(closeChatBtn.style.minHeight).toBe('24px');
    expectMinimumTargetSize(closeChatBtn, 'Close spatial chat overlay');

    await expectKeyboardFocusRing(closeChatBtn);

    await click(closeChatBtn);
    expect(host.querySelector('button[aria-label="Close spatial chat overlay"]')).toBeNull();
  });

  it('enforces >= 24x24px TouchTarget dimensions and FocusRing outlines (including danger ringColor on LEAVE) on quick voice controls', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    const connectSpy = vi.spyOn(app.voice, 'connect').mockResolvedValue(undefined);
    const setMutedSpy = vi.spyOn(app.voice, 'setMuted').mockImplementation((muted: boolean) => {
      app.voice.muted = muted;
      app.voice.emit('state', { state: app.voice.state, muted });
    });
    const disconnectSpy = vi.spyOn(app.voice, 'disconnect').mockResolvedValue(undefined);

    const host = await mount(<World3D />);

    // Disconnected state: JOIN VOICE button
    const joinBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'JOIN VOICE',
    ) as HTMLButtonElement;
    expect(joinBtn).toBeDefined();
    expect(joinBtn.disabled).toBe(false);
    expect(joinBtn.style.minWidth).toBe('24px');
    expect(joinBtn.style.minHeight).toBe('24px');
    expectMinimumTargetSize(joinBtn, 'JOIN VOICE');
    await expectKeyboardFocusRing(joinBtn);

    await click(joinBtn);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    // Transition to connected voice state
    await act(async () => {
      app.voice.state = 'connected';
      app.voice.muted = false;
      app.voice.emit('state', { state: 'connected', muted: false });
    });

    const muteBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'MUTE MIC',
    ) as HTMLButtonElement;
    const leaveBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LEAVE',
    ) as HTMLButtonElement;

    expect(muteBtn).toBeDefined();
    expect(leaveBtn).toBeDefined();

    expect(muteBtn.style.minWidth).toBe('24px');
    expect(muteBtn.style.minHeight).toBe('24px');
    expect(leaveBtn.style.minWidth).toBe('24px');
    expect(leaveBtn.style.minHeight).toBe('24px');

    expectMinimumTargetSize(muteBtn, 'MUTE MIC');
    expectMinimumTargetSize(leaveBtn, 'LEAVE');

    // Verify MUTE MIC uses primary ringColor (V.pri) and LEAVE uses danger ringColor (V.err)
    await act(async () => {
      muteBtn.focus();
    });
    const muteOutline = muteBtn.style.outline;
    expect(muteOutline).toBe(`2px solid ${capturedThemeV?.pri}`);
    await act(async () => {
      muteBtn.blur();
    });

    await act(async () => {
      leaveBtn.focus();
    });
    const leaveOutline = leaveBtn.style.outline;
    expect(leaveOutline).toBe(`2px solid ${capturedThemeV?.err}`);
    expect(leaveBtn.getAttribute('data-focused')).toBe('true');
    if (capturedThemeV && capturedThemeV.err !== capturedThemeV.pri) {
      expect(leaveOutline).not.toBe(muteOutline);
    }
    await act(async () => {
      leaveBtn.blur();
    });
    expect(leaveBtn.style.outline).toBe('');

    await click(muteBtn);
    expect(setMutedSpy).toHaveBeenCalledWith(true);

    const unmuteBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'UNMUTE MIC',
    ) as HTMLButtonElement;
    expect(unmuteBtn).toBeDefined();

    await click(leaveBtn);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('enforces >= 24x24px TouchTarget dimensions and FocusRing outlines on World3DActionBar status bar controls', async () => {
    const resetSpy = vi.spyOn(app.world, 'resetCamera').mockImplementation(() => {});

    const host = await mount(
      <>
        <World3D />
        <World3DActionBar />
      </>,
    );

    const statusBar = host.querySelector('div[role="status"]') as HTMLElement;
    expect(statusBar).not.toBeNull();

    const resetViewBtn = statusBar.querySelector(
      'button[aria-label="Reset camera view to avatar"]',
    ) as HTMLButtonElement;
    const toggleOverlaysBtn = statusBar.querySelector(
      'button[aria-label="Hide 3D view overlays"]',
    ) as HTMLButtonElement;

    expect(resetViewBtn).not.toBeNull();
    expect(toggleOverlaysBtn).not.toBeNull();

    for (const btn of [resetViewBtn, toggleOverlaysBtn]) {
      expectMinimumTargetSize(btn);
      expect(btn.style.minWidth).toBe('24px');
      expect(btn.style.minHeight).toBe('24px');
      await expectKeyboardFocusRing(btn);
    }

    await click(resetViewBtn);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    // Toggling overlays updates status bar button and reveals floating restore buttons
    await click(toggleOverlaysBtn);
    const showOverlaysStatusBtn = statusBar.querySelector(
      'button[aria-label="Show 3D view overlays"]',
    ) as HTMLButtonElement;
    expect(showOverlaysStatusBtn).not.toBeNull();
    expectMinimumTargetSize(showOverlaysStatusBtn, 'Show 3D view overlays');
    await expectKeyboardFocusRing(showOverlaysStatusBtn);

    // Verify floating hidden-overlay controls also have TouchTarget & FocusRing
    const showFloatingBtn = host.querySelector(
      'button[aria-label="Show 3D overlays"]',
    ) as HTMLButtonElement;
    expect(showFloatingBtn).not.toBeNull();
    expectMinimumTargetSize(showFloatingBtn, 'Show 3D overlays');
    await expectKeyboardFocusRing(showFloatingBtn);
  });

  it('enforces >= 24x24px TouchTarget dimensions and FocusRing outlines on top-center mode selector and top-right quick actions', async () => {
    const host = await mount(<World3D />);

    const modeSelector = host.querySelector(
      '[data-testid="interaction-mode-selector"]',
    ) as HTMLElement;
    expect(modeSelector).not.toBeNull();

    const modeButtons = Array.from(modeSelector.querySelectorAll('button')) as HTMLButtonElement[];
    expect(modeButtons.length).toBe(4);
    for (const btn of modeButtons) {
      expectMinimumTargetSize(btn);
      await expectKeyboardFocusRing(btn);
    }

    const hideUiBtn = host.querySelector(
      'button[aria-label="Hide 3D overlays"]',
    ) as HTMLButtonElement;
    expect(hideUiBtn).not.toBeNull();
    expectMinimumTargetSize(hideUiBtn, 'Hide 3D overlays');
    await expectKeyboardFocusRing(hideUiBtn);
  });
});
