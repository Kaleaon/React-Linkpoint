import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SyncActionButton from '../SyncActionButton';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import Inventory from '../../screens/Inventory.jsx';
import { FriendsScreen, GroupsScreen } from '../../screens/LiveScreens.jsx';
import CacheScreen from '../../screens/CacheScreen.jsx';
import { ErrorRecoveryProvider } from '../../context/ErrorRecoveryContext';
import { errorRecovery } from '../../linkpoint/errorRecovery';

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
});
