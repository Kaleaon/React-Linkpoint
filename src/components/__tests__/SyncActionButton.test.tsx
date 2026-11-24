import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import SyncActionButton, { useBusyCoordinator } from '../SyncActionButton';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import Inventory from '../../screens/Inventory.jsx';
import { FriendsScreen, GroupsScreen } from '../../screens/LiveScreens.jsx';
import CacheScreen from '../../screens/CacheScreen.jsx';
import World3D from '../../screens/World3D.jsx';
import CalendarScreen from '../../screens/CalendarScreen.jsx';
import OutfitViewer from '../../screens/OutfitViewer.jsx';
import GroupAdminFloater from '../GroupAdminFloater.jsx';
import CreateGroupNoticeModal from '../CreateGroupNoticeModal.jsx';
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

  it('supports default, primary, and danger variants while allowing style overrides', async () => {
    const host = await mount(
      createElement(
        'div',
        null,
        createElement(SyncActionButton, {
          variant: 'default',
          idleText: 'Default Action',
          'aria-label': 'Default Variant',
        }),
        createElement(SyncActionButton, {
          variant: 'primary',
          idleText: 'Primary Action',
          'aria-label': 'Primary Variant',
        }),
        createElement(SyncActionButton, {
          variant: 'danger',
          idleText: 'Danger Action',
          'aria-label': 'Danger Variant',
        }),
      ),
    );

    const defaultBtn = host.querySelector(
      'button[aria-label="Default Variant"]',
    ) as HTMLButtonElement;
    const primaryBtn = host.querySelector(
      'button[aria-label="Primary Variant"]',
    ) as HTMLButtonElement;
    const dangerBtn = host.querySelector(
      'button[aria-label="Danger Variant"]',
    ) as HTMLButtonElement;

    expect(defaultBtn.getAttribute('data-variant')).toBe('default');
    expect(defaultBtn.classList.contains('sync-action-button--default')).toBe(true);

    expect(primaryBtn.getAttribute('data-variant')).toBe('primary');
    expect(primaryBtn.classList.contains('sync-action-button--primary')).toBe(true);
    expect(primaryBtn.style.background).not.toBe('transparent');

    expect(dangerBtn.getAttribute('data-variant')).toBe('danger');
    expect(dangerBtn.classList.contains('sync-action-button--danger')).toBe(true);
    expect(dangerBtn.style.background).toBe('transparent');
  });

  it('supports type="submit" for form submissions and prevents duplicate submissions while loading', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

    function TestForm({ loading }: { loading: boolean }) {
      return createElement(
        'form',
        { onSubmit },
        createElement(SyncActionButton, {
          type: 'submit',
          variant: 'primary',
          loading,
          iconName: 'send',
          idleText: 'Submit',
          loadingText: 'Submitting…',
        }),
      );
    }

    const host = await mount(createElement(TestForm, { loading: false }));
    let submitBtn = host.querySelector('button') as HTMLButtonElement;
    expect(submitBtn.type).toBe('submit');
    expect(submitBtn.disabled).toBe(false);

    await act(async () => {
      submitBtn.click();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Re-render in loading state and verify click/submit is locked
    await act(async () => {
      mounted!.root.render(
        createElement(
          AppProvider as never,
          null,
          createElement(ThemeProvider as never, null, createElement(TestForm, { loading: true })),
        ),
      );
    });

    submitBtn = host.querySelector('button') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.getAttribute('aria-busy')).toBe('true');
    expect(submitBtn.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();

    await act(async () => {
      submitBtn.click();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('coordinates concurrent async actions with useBusyCoordinator', async () => {
    let resolveFirst: (() => void) | null = null;
    const firstTask = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const secondTask = vi.fn().mockResolvedValue(undefined);

    function CoordinatedButtons() {
      const { isBusy, isLoading, run } = useBusyCoordinator<'save' | 'eject'>();
      return createElement(
        'div',
        null,
        createElement(SyncActionButton, {
          variant: 'primary',
          loading: isLoading('save'),
          disabled: isBusy,
          idleText: 'Save',
          loadingText: 'Saving…',
          'aria-label': 'Save Action',
          onClick: () => void run('save', firstTask),
        }),
        createElement(SyncActionButton, {
          variant: 'danger',
          loading: isLoading('eject'),
          disabled: isBusy,
          idleText: 'Eject',
          loadingText: 'Ejecting…',
          'aria-label': 'Eject Action',
          onClick: () => void run('eject', secondTask),
        }),
      );
    }

    const host = await mount(createElement(CoordinatedButtons));
    const saveBtn = host.querySelector('button[aria-label="Save Action"]') as HTMLButtonElement;
    const ejectBtn = host.querySelector('button[aria-label="Eject Action"]') as HTMLButtonElement;

    await act(async () => {
      saveBtn.click();
    });

    // Save button shows CrystalLoader; Eject button is disabled without showing CrystalLoader
    expect(firstTask).toHaveBeenCalledTimes(1);
    expect(saveBtn.disabled).toBe(true);
    expect(saveBtn.getAttribute('data-loading')).toBe('true');
    expect(saveBtn.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();

    expect(ejectBtn.disabled).toBe(true);
    expect(ejectBtn.getAttribute('data-loading')).toBe('false');
    expect(ejectBtn.querySelector('[data-testid="crystal-loader"]')).toBeNull();

    await act(async () => {
      ejectBtn.click();
    });
    expect(secondTask).not.toHaveBeenCalled();

    await act(async () => {
      resolveFirst?.();
    });

    expect(saveBtn.disabled).toBe(false);
    expect(ejectBtn.disabled).toBe(false);
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

  it('CalendarScreen uses SyncActionButton with CrystalLoader during Google Calendar loading', async () => {
    let resolveEvents: ((events: never[]) => void) | null = null;
    googleMocks.getGoogleToken.mockReturnValue('tok');
    googleMocks.fetchLinkpointEvents.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEvents = resolve;
        }),
    );

    app.preferences.set('integrations', 'google', true);

    const actionsRef: { current: ReturnType<typeof useApp>['actions'] | null } = { current: null };
    function CalendarGoogleHarness() {
      const { actions } = useApp();
      actionsRef.current = actions;
      return createElement(CalendarScreen);
    }

    const host = await mount(createElement(CalendarGoogleHarness));
    await act(async () => {
      actionsRef.current?.setTab('Calendar', 'GOOGLE CALENDAR');
    });
    const loadBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('SIGN IN AND LOAD'),
    ) as HTMLButtonElement | undefined;

    expect(loadBtn).toBeDefined();
    expect(loadBtn?.classList.contains('sync-action-button')).toBe(true);
    expect(loadBtn?.classList.contains('touch-target')).toBe(true);

    await act(async () => {
      loadBtn?.click();
    });

    expect(loadBtn?.disabled).toBe(true);
    expect(loadBtn?.getAttribute('aria-busy')).toBe('true');
    expect(loadBtn?.textContent).toContain('LOADING…');
    expect(loadBtn?.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();

    await act(async () => {
      resolveEvents?.([]);
    });

    expect(loadBtn?.disabled).toBe(false);
    expect(loadBtn?.textContent).toContain('REFRESH');
    await act(async () => {
      app.preferences.set('integrations', 'google', false);
    });
  });

  it('OutfitViewer uses SyncActionButton with CrystalLoader during active outfit reload', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    vi.spyOn(app.world, 'init').mockResolvedValue(undefined);
    vi.spyOn(app.world, 'destroyRenderer').mockImplementation(() => {});

    let resolveReload: ((val: { items: never[]; outfits: never[] }) => void) | null = null;
    const loadSpy = vi
      .spyOn(app, 'loadOutfit')
      .mockResolvedValueOnce({ items: [], outfits: [] })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReload = resolve;
          }),
      );

    const host = await mount(createElement(OutfitViewer));
    const outfitTabBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Outfit Items'),
    );
    await act(async () => {
      outfitTabBtn?.click();
    });

    const refreshBtn = host.querySelector(
      'button[title="Read what you are wearing from Second Life again"]',
    ) as HTMLButtonElement;
    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn.classList.contains('sync-action-button')).toBe(true);
    expect(refreshBtn.getAttribute('data-variant')).toBe('primary');
    expect(refreshBtn.textContent).toContain('REFRESH');

    await act(async () => {
      refreshBtn.click();
    });

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(refreshBtn.disabled).toBe(true);
    expect(refreshBtn.getAttribute('aria-busy')).toBe('true');
    expect(refreshBtn.textContent).toContain('LOADING…');
    expect(refreshBtn.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();

    await act(async () => {
      resolveReload?.({ items: [], outfits: [] });
    });

    expect(refreshBtn.disabled).toBe(false);
    expect(refreshBtn.textContent).toContain('REFRESH');
  });

  it('GroupAdminFloater role, invite, and eject buttons use SyncActionButton with primary and danger variants', async () => {
    const groupId = '00000000-0000-0000-0000-000000000099';
    const group = { id: groupId, name: 'Test Architects' };
    app.groups.replaceGroups([group]);
    app.groups.replaceRoles(groupId, [
      { id: 'role-1', name: 'Builders', title: 'Builder', description: '', powers: '0' },
    ]);
    app.groups.replaceMembers(groupId, [
      { id: 'mem-1', name: 'Alice Builder', title: 'Builder', onlineStatus: 'Online', roleIds: [] },
    ]);

    let resolveEject: (() => void) | null = null;
    const adminService = {
      createRole: vi.fn().mockResolvedValue({ success: true }),
      updateRole: vi.fn().mockResolvedValue({ success: true }),
      deleteRole: vi.fn().mockResolvedValue({ success: true }),
      assignMemberRoles: vi.fn().mockResolvedValue({ success: true }),
      ejectMember: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveEject = resolve;
          }),
      ),
      inviteMember: vi.fn().mockResolvedValue({ success: true }),
    };

    const host = await mount(
      createElement(GroupAdminFloater, {
        groupId,
        group,
        onClose: vi.fn(),
        adminService,
      }),
    );

    // Role submit button (primary) and Delete button (danger)
    const roleSubmitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(roleSubmitBtn.classList.contains('sync-action-button')).toBe(true);
    expect(roleSubmitBtn.getAttribute('data-variant')).toBe('primary');

    const roleDeleteBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Delete',
    ) as HTMLButtonElement;
    expect(roleDeleteBtn.classList.contains('sync-action-button')).toBe(true);
    expect(roleDeleteBtn.getAttribute('data-variant')).toBe('danger');

    // Switch to MEMBERS tab and verify Save Role Assignments (primary), Eject Member (danger), Confirm Eject (danger)
    const membersTab = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
    ).find((b) => b.textContent?.trim() === 'MEMBERS');
    await act(async () => {
      membersTab?.click();
    });

    const saveRolesBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save Role Assignments'),
    ) as HTMLButtonElement;
    const ejectTriggerBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Eject Member'),
    ) as HTMLButtonElement;

    expect(saveRolesBtn.classList.contains('sync-action-button')).toBe(true);
    expect(saveRolesBtn.getAttribute('data-variant')).toBe('primary');
    expect(ejectTriggerBtn.classList.contains('sync-action-button')).toBe(true);
    expect(ejectTriggerBtn.getAttribute('data-variant')).toBe('danger');

    await act(async () => {
      ejectTriggerBtn.click();
    });

    const confirmEjectBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Eject'),
    ) as HTMLButtonElement;
    expect(confirmEjectBtn.classList.contains('sync-action-button')).toBe(true);
    expect(confirmEjectBtn.getAttribute('data-variant')).toBe('danger');

    await act(async () => {
      confirmEjectBtn.click();
    });

    // Confirm Eject displays CrystalLoader while Save Role Assignments stays idle-disabled
    expect(confirmEjectBtn.getAttribute('data-loading')).toBe('true');
    expect(confirmEjectBtn.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();
    expect(saveRolesBtn.disabled).toBe(true);
    expect(saveRolesBtn.getAttribute('data-loading')).toBe('false');

    await act(async () => {
      resolveEject?.();
    });

    // Switch to INVITATIONS tab and verify Send Invitation submit button (primary)
    const invitesTab = Array.from(
      host.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
    ).find((b) => b.textContent?.trim() === 'INVITATIONS');
    await act(async () => {
      invitesTab?.click();
    });

    const inviteSubmitBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(inviteSubmitBtn.classList.contains('sync-action-button')).toBe(true);
    expect(inviteSubmitBtn.getAttribute('data-variant')).toBe('primary');
    expect(inviteSubmitBtn.textContent).toContain('Send Invitation');
  });

  it('CreateGroupNoticeModal submits notices using SyncActionButton variant primary with CrystalLoader', async () => {
    let resolveNotice: ((val: unknown) => void) | null = null;
    vi.spyOn(app, 'sendGroupNotice').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNotice = resolve;
        }) as never,
    );

    const host = await mount(
      createElement(CreateGroupNoticeModal, {
        isOpen: true,
        onClose: vi.fn(),
        groupId: 'group-1',
        groupName: 'Design Guild',
        V: {
          pri: '#2563eb',
          onpri: '#ffffff',
          surf: '#111827',
          ink: '#f9fafb',
          outv: '#374151',
          rs: '6px',
        },
      }),
    );

    const submitBtn = host.querySelector('button[aria-label="Send Notice"]') as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn.type).toBe('submit');
    expect(submitBtn.classList.contains('sync-action-button')).toBe(true);
    expect(submitBtn.getAttribute('data-variant')).toBe('primary');

    const subjectInput = host.querySelector('#notice-subject') as HTMLInputElement;
    const messageInput = host.querySelector('#notice-message') as HTMLTextAreaElement;

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        subjectInput,
        'Weekly Sync',
      );
      subjectInput.dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        messageInput,
        'Starting in 10 minutes.',
      );
      messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const form = host.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.getAttribute('aria-busy')).toBe('true');
    expect(submitBtn.textContent).toContain('Sending…');
    expect(submitBtn.querySelector('[data-testid="crystal-loader"]')).not.toBeNull();

    await act(async () => {
      resolveNotice?.({ id: 'n-1' });
    });
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
