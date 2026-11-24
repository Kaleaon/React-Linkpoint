import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SyncActionButton from '../SyncActionButton';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import Inventory from '../../screens/Inventory.jsx';
import { FriendsScreen, GroupsScreen } from '../../screens/LiveScreens.jsx';
import CacheScreen from '../../screens/CacheScreen.jsx';
import World3D from '../../screens/World3D.jsx';
import OutfitViewer from '../../screens/OutfitViewer.jsx';
import CalendarScreen from '../../screens/CalendarScreen.jsx';
import { ErrorRecoveryProvider } from '../../context/ErrorRecoveryContext';
import { errorRecovery } from '../../linkpoint/errorRecovery';
import { app } from '../../linkpoint/app.ts';

const googleMocks = vi.hoisted(() => ({
  getGoogleToken: vi.fn(),
  signInWithGoogle: vi.fn(),
  fetchLinkpointEvents: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

vi.mock('../../services/google.ts', () => ({
  loadGoogle: async () => ({
    auth: {
      getGoogleToken: googleMocks.getGoogleToken,
      signInWithGoogle: googleMocks.signInWithGoogle,
      signOutGoogle: vi.fn(),
    },
    contacts: {},
    calendar: {
      addNoticeToCalendar: vi.fn(),
      fetchLinkpointEvents: googleMocks.fetchLinkpointEvents,
      deleteCalendarEvent: googleMocks.deleteCalendarEvent,
    },
  }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(
        AppProvider as any,
        null,
        createElement(
          ThemeProvider as any,
          null,
          createElement(ErrorRecoveryProvider as any, { customService: errorRecovery }, ui),
        ),
      ),
    );
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
  localStorage.clear();
  app.preferences.set('integrations', 'google', false);
  Object.values(googleMocks).forEach((fn) => fn.mockReset());
  vi.restoreAllMocks();
});

describe('SyncActionButton Component', () => {
  it('renders idle state correctly with icon and idle text', async () => {
    const handleClick = vi.fn();
    const host = await mount(
      createElement(SyncActionButton, {
        iconName: 'rotate-cw',
        idleText: 'REFRESH',
        loadingText: 'FETCHING…',
        loading: false,
        onClick: handleClick,
      }),
    );

    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-busy')).toBeNull();
    expect(button.getAttribute('data-loading')).toBe('false');
    expect(button.textContent).toContain('REFRESH');
    expect(button.textContent).not.toContain('FETCHING…');

    // Idle icon is rendered, crystal loader is NOT rendered
    expect(host.querySelector('[data-testid="crystal-loader"]')).toBeNull();
    expect(button.querySelector('svg')).not.toBeNull();

    await act(async () => {
      button.click();
    });
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders loading state with CrystalLoader (inline variant) and loading text', async () => {
    const handleClick = vi.fn();
    const host = await mount(
      createElement(SyncActionButton, {
        iconName: 'rotate-cw',
        idleText: 'REFRESH',
        loadingText: 'FETCHING…',
        loading: true,
        size: 14,
        onClick: handleClick,
      }),
    );

    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('data-loading')).toBe('true');
    expect(button.textContent).toContain('FETCHING…');
    expect(button.textContent).not.toContain('REFRESH');

    // CrystalLoader is rendered with variant inline and 14px size
    const loader = host.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(loader).not.toBeNull();
    expect(loader.getAttribute('data-variant')).toBe('inline');
    expect(loader.style.width).toBe('14px');
    expect(loader.style.height).toBe('14px');

    // Clicking does NOT trigger handler while loading
    await act(async () => {
      button.click();
    });
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders disabled state properly when disabled=true while idle', async () => {
    const handleClick = vi.fn();
    const host = await mount(
      createElement(SyncActionButton, {
        iconName: 'rotate-cw',
        idleText: 'REFRESH',
        disabled: true,
        loading: false,
        onClick: handleClick,
      }),
    );

    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBeNull();
    expect(button.textContent).toContain('REFRESH');

    await act(async () => {
      button.click();
    });
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders compact icon-only button and switches to 14px CrystalLoader when loading', async () => {
    const host = await mount(
      createElement(SyncActionButton, {
        iconName: 'refresh-cw',
        loading: false,
        size: 14,
        'aria-label': 'Reload groups',
        title: 'Reload groups',
      }),
    );

    let button = host.querySelector('button') as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Reload groups');
    expect(button.getAttribute('title')).toBe('Reload groups');
    expect(button.querySelector('span')).toBeNull(); // No text span
    expect(host.querySelector('[data-testid="crystal-loader"]')).toBeNull();

    // Now re-mount with loading=true
    await act(async () => {
      mounted!.root.render(
        createElement(
          AppProvider as any,
          null,
          createElement(
            ThemeProvider as any,
            null,
            createElement(SyncActionButton, {
              iconName: 'refresh-cw',
              loading: true,
              size: 14,
              'aria-label': 'Reload groups',
              title: 'Reload groups',
            }),
          ),
        ),
      );
    });

    button = host.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    const loader = host.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(loader).not.toBeNull();
    expect(loader.getAttribute('data-variant')).toBe('inline');
    expect(loader.style.width).toBe('14px');
    expect(loader.style.height).toBe('14px');
  });

  it('enforces touch target dimensions per WCAG 2.5.8 and WCAG 2.5.5', async () => {
    // Default enhanced=true enforces WCAG 2.5.5 enhanced 44px
    const hostEnhanced = await mount(
      createElement(SyncActionButton, {
        iconName: 'rotate-cw',
        idleText: 'REFRESH',
      }),
    );
    const btnEnhanced = hostEnhanced.querySelector('button') as HTMLButtonElement;
    expect(btnEnhanced.classList.contains('touch-target')).toBe(true);
    expect(parseInt(btnEnhanced.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(btnEnhanced.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);
    expect(btnEnhanced.style.touchAction).toBe('manipulation');

    // explicit enhanced=false enforces WCAG 2.5.8 minimum 24px
    await act(async () => {
      mounted!.root.render(
        createElement(
          AppProvider as any,
          null,
          createElement(
            ThemeProvider as any,
            null,
            createElement(SyncActionButton, {
              iconName: 'rotate-cw',
              idleText: 'REFRESH',
              enhanced: false,
            }),
          ),
        ),
      );
    });
    const btnStandard = hostEnhanced.querySelector('button') as HTMLButtonElement;
    expect(parseInt(btnStandard.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(btnStandard.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(24);
  });

  it('preserves custom className and style props', async () => {
    const host = await mount(
      createElement(SyncActionButton, {
        iconName: 'rotate-cw',
        idleText: 'REFRESH',
        className: 'custom-sync-btn',
        style: { border: '2px solid red', padding: '8px 16px' },
      }),
    );

    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.classList.contains('custom-sync-btn')).toBe(true);
    expect(button.classList.contains('sync-action-button')).toBe(true);
    expect(button.classList.contains('touch-target')).toBe(true);
    expect(button.style.border).toBe('2px solid red');
  });
});

describe('SyncActionButton Adoption Across Screens', () => {
  it('Inventory screen uses SyncActionButton for inventory refresh', async () => {
    const host = await mount(createElement(Inventory));
    const syncBtn = host.querySelector(
      'button[title="Reload Second Life inventory"]',
    ) as HTMLButtonElement;

    expect(syncBtn).not.toBeNull();
    expect(syncBtn.classList.contains('sync-action-button')).toBe(true);
    expect(syncBtn.classList.contains('touch-target')).toBe(true);
    expect(syncBtn.textContent).toContain('REFRESH');
  });

  it('LiveScreens screen uses SyncActionButton for friends sync', async () => {
    const host = await mount(createElement(FriendsScreen));
    const friendsSyncBtn = host.querySelector(
      'button[title="Reload friends list from Second Life"]',
    ) as HTMLButtonElement;

    expect(friendsSyncBtn).not.toBeNull();
    expect(friendsSyncBtn.classList.contains('sync-action-button')).toBe(true);
    expect(friendsSyncBtn.classList.contains('touch-target')).toBe(true);
    expect(friendsSyncBtn.textContent).toContain('SYNC FRIENDS');
  });

  it('LiveScreens screen uses SyncActionButton for groups reload', async () => {
    const host = await mount(createElement(GroupsScreen));
    const groupsReloadBtn = host.querySelector(
      'button[aria-label="Reload groups"]',
    ) as HTMLButtonElement;

    expect(groupsReloadBtn).not.toBeNull();
    expect(groupsReloadBtn.classList.contains('sync-action-button')).toBe(true);
    expect(groupsReloadBtn.classList.contains('touch-target')).toBe(true);
    expect(groupsReloadBtn.getAttribute('title')).toBe('Reload groups');
  });

  it('CacheScreen screen uses SyncActionButton for rebuild operation', async () => {
    const host = await mount(createElement(CacheScreen));
    const buttons = Array.from(host.querySelectorAll('button'));
    const rebuildBtn = buttons.find((btn) =>
      btn.textContent?.includes('REBUILD FROM GRID (FORCE)'),
    );

    expect(rebuildBtn).toBeDefined();
    expect(rebuildBtn?.classList.contains('sync-action-button')).toBe(true);
    expect(rebuildBtn?.classList.contains('touch-target')).toBe(true);
  });

  it('World3D screen uses SyncActionButton for scene synchronization and respects logged-out state', async () => {
    vi.spyOn(app.world, 'init').mockResolvedValue(undefined);
    vi.spyOn(app.world, 'destroyRenderer').mockImplementation(() => {});
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(false);

    const host = await mount(createElement(World3D));
    const expandBtn = host.querySelector('[aria-label="Expand scene statistics"]') as HTMLElement;
    expect(expandBtn).not.toBeNull();
    await act(async () => {
      expandBtn.click();
    });

    const syncBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('SYNC SCENE'),
    ) as HTMLButtonElement | undefined;

    expect(syncBtn).toBeDefined();
    expect(syncBtn!.classList.contains('sync-action-button')).toBe(true);
    expect(syncBtn!.classList.contains('touch-target')).toBe(true);
    expect(parseInt(syncBtn!.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(syncBtn!.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(24);
    expect(syncBtn!.disabled).toBe(true);
    expect(syncBtn!.getAttribute('data-loading')).toBe('false');
  });

  it('World3D screen toggles CrystalLoader during active sync and resets on error', async () => {
    vi.spyOn(app.world, 'init').mockResolvedValue(undefined);
    vi.spyOn(app.world, 'destroyRenderer').mockImplementation(() => {});
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);

    let rejectRetry!: (reason?: unknown) => void;
    const retrySpy = vi.spyOn(app.world, 'retryFailedAssets').mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectRetry = reject;
        }),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const host = await mount(createElement(World3D));
    const expandBtn = host.querySelector('[aria-label="Expand scene statistics"]') as HTMLElement;
    await act(async () => {
      expandBtn.click();
    });

    const syncBtn = host.querySelector(
      'output button[data-testid="sync-action-button"]',
    ) as HTMLButtonElement;
    expect(syncBtn).not.toBeNull();
    expect(syncBtn.disabled).toBe(false);
    expect(syncBtn.textContent).toContain('SYNC SCENE');

    await act(async () => {
      syncBtn.click();
    });

    expect(retrySpy).toHaveBeenCalledTimes(1);
    expect(syncBtn.disabled).toBe(true);
    expect(syncBtn.getAttribute('aria-busy')).toBe('true');
    expect(syncBtn.getAttribute('data-loading')).toBe('true');
    expect(syncBtn.textContent).toContain('SYNCING…');
    expect(syncBtn.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();

    await act(async () => {
      rejectRetry(new Error('network timeout'));
    });

    expect(warnSpy).toHaveBeenCalledWith('Refresh scene error:', expect.any(Error));
    expect(syncBtn.disabled).toBe(false);
    expect(syncBtn.getAttribute('aria-busy')).toBeNull();
    expect(syncBtn.getAttribute('data-loading')).toBe('false');
    expect(syncBtn.textContent).toContain('SYNC SCENE');
  });

  it('OutfitViewer screen uses SyncActionButton for worn outfit refresh, enforces touch targets, shows CrystalLoader when loading, and stays disabled when logged out', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(false);
    const loadLoggedOut = vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });

    const hostLoggedOut = await mount(createElement(OutfitViewer));
    const loggedOutBtn = hostLoggedOut.querySelector(
      'button[title="Read what you are wearing from Second Life again"]',
    ) as HTMLButtonElement;

    expect(loggedOutBtn).not.toBeNull();
    expect(loggedOutBtn.classList.contains('sync-action-button')).toBe(true);
    expect(loggedOutBtn.classList.contains('touch-target')).toBe(true);
    expect(parseInt(loggedOutBtn.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(loggedOutBtn.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);
    expect(loggedOutBtn.disabled).toBe(true);
    expect(loggedOutBtn.textContent).toContain('REFRESH');

    const callsAfterMount = loadLoggedOut.mock.calls.length;
    await act(async () => {
      loggedOutBtn.click();
    });
    expect(loadLoggedOut.mock.calls.length).toBe(callsAfterMount);

    await act(async () => {
      mounted!.root.unmount();
    });
    mounted!.host.remove();
    mounted = null;

    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    let resolveLoad!: (val: { items: any[]; outfits: any[] }) => void;
    const loadLoggedIn = vi.spyOn(app, 'loadOutfit').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const host = await mount(createElement(OutfitViewer));
    const refreshBtn = host.querySelector(
      'button[title="Read what you are wearing from Second Life again"]',
    ) as HTMLButtonElement;

    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn.disabled).toBe(true);
    expect(refreshBtn.getAttribute('aria-busy')).toBe('true');
    expect(refreshBtn.getAttribute('data-loading')).toBe('true');
    expect(refreshBtn.textContent).toContain('LOADING…');
    const loader = refreshBtn.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(loader).not.toBeNull();
    expect(loader.getAttribute('data-variant')).toBe('inline');

    await act(async () => {
      resolveLoad({ items: [], outfits: [] });
    });

    expect(refreshBtn.disabled).toBe(false);
    expect(refreshBtn.getAttribute('aria-busy')).toBeNull();
    expect(refreshBtn.getAttribute('data-loading')).toBe('false');
    expect(refreshBtn.textContent?.trim()).toBe('REFRESH');
    expect(refreshBtn.querySelector('[data-testid="crystal-loader"]')).toBeNull();

    const callsBeforeClick = loadLoggedIn.mock.calls.length;
    await act(async () => {
      refreshBtn.click();
    });
    expect(loadLoggedIn.mock.calls.length).toBe(callsBeforeClick + 1);
    await act(async () => {
      resolveLoad({ items: [], outfits: [] });
    });
  });

  it('CalendarScreen Google Calendar tab uses SyncActionButton with touch targets, inline CrystalLoader during sync, and SIGN IN AND LOAD when unauthorized', async () => {
    app.preferences.set('integrations', 'google', true);
    googleMocks.getGoogleToken.mockReturnValue(null);

    let resolveSignIn!: (val: any) => void;
    let rejectSignIn!: (err: Error) => void;
    googleMocks.signInWithGoogle.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSignIn = reject;
        }),
    );

    function GoogleCalendarTabWrapper() {
      const { state, actions } = useApp();
      const activeTab = (state.tabs as Record<string, string | undefined>)?.Calendar;
      useEffect(() => {
        if (activeTab !== 'GOOGLE CALENDAR') {
          actions.setTab('Calendar', 'GOOGLE CALENDAR');
        }
      }, [activeTab, actions]);
      return createElement(CalendarScreen);
    }

    const host = await mount(createElement(GoogleCalendarTabWrapper));
    const syncBtn = host.querySelector(
      'button[title="Synchronize Google Calendar events"]',
    ) as HTMLButtonElement;

    expect(syncBtn).not.toBeNull();
    expect(syncBtn.classList.contains('sync-action-button')).toBe(true);
    expect(syncBtn.classList.contains('touch-target')).toBe(true);
    expect(parseInt(syncBtn.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(syncBtn.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(44);
    expect(syncBtn.disabled).toBe(false);
    expect(syncBtn.textContent?.trim()).toBe('SIGN IN AND LOAD');

    // Click when unauthorized: triggers Google sign-in and shows CrystalLoader while loading
    await act(async () => {
      syncBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(googleMocks.signInWithGoogle).toHaveBeenCalledWith('calendar');
    expect(syncBtn.disabled).toBe(true);
    expect(syncBtn.getAttribute('aria-busy')).toBe('true');
    expect(syncBtn.getAttribute('data-loading')).toBe('true');
    expect(syncBtn.textContent).toContain('LOADING…');
    const loader = syncBtn.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(loader).not.toBeNull();
    expect(loader.getAttribute('data-variant')).toBe('inline');

    // Reject sign-in: keeps 'SIGN IN AND LOAD' label
    await act(async () => {
      rejectSignIn(new Error('Authorization cancelled'));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(syncBtn.disabled).toBe(false);
    expect(syncBtn.getAttribute('aria-busy')).toBeNull();
    expect(syncBtn.textContent?.trim()).toBe('SIGN IN AND LOAD');

    // Succeed sign-in + fetch events: updates label to 'REFRESH'
    googleMocks.signInWithGoogle.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    googleMocks.fetchLinkpointEvents.mockResolvedValueOnce([]);

    await act(async () => {
      syncBtn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      resolveSignIn({ email: 'resident@example.com' });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(syncBtn.disabled).toBe(false);
    expect(syncBtn.textContent?.trim()).toBe('REFRESH');
  });
});
