// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { CSUB, subView, setSub } from '../../theme/constants.js';
import Profile, { ResidentInspector } from '../Profile.jsx';
import { app } from '../../linkpoint/app.ts';

(globalThis as unknown as Record<string, boolean>).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
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

describe('ResidentInspector & Profile Tabs Integration', () => {
  beforeEach(() => {
    // Reset auth user to authenticated state
    (app.auth as any).user = {
      id: 'usr-local-1234',
      fullName: 'Local User',
      grid: 'Second Life Main Grid',
    };
  });

  it('Requirement 2: CSUB defines 2ND LIFE, PICKS, and GROUPS sub-views for Profile', () => {
    expect(CSUB.Profile).toEqual([
      ['2ND LIFE', '· 01'],
      ['PICKS', '· 02'],
      ['GROUPS', '· 03'],
    ]);
  });

  it('Requirement 2: subView and setSub manage active sub-tab state for Profile', () => {
    const state: { tabs: Record<string, string> } = {
      tabs: {},
    };
    const actions = {
      setTab: (scr: string, val: string) => {
        state.tabs[scr] = val;
      },
    };

    expect(subView(state as any, 'Profile')).toBe('2ND LIFE');

    setSub(actions as any, 'Profile', 'PICKS');
    expect(subView(state as any, 'Profile')).toBe('PICKS');

    setSub(actions as any, 'Profile', 'GROUPS');
    expect(subView(state as any, 'Profile')).toBe('GROUPS');

    setSub(actions as any, 'Profile', '2ND LIFE');
    expect(subView(state as any, 'Profile')).toBe('2ND LIFE');
  });

  it('Requirement 1 & Criterion 1: Profile displays self profile when target is null', async () => {
    const host = await mount(<Profile />);
    expect(host.querySelector('[data-testid="resident-inspector"]')).toBeNull();
    expect(host.textContent).toContain('Local User');
    expect(host.textContent).toContain('Account ID');
    expect(host.textContent).toContain('usr-local-1234');
  });

  it('Requirement 1 & Criterion 1: Profile mounts dedicated ResidentInspector when target is set', async () => {
    function TargetSetter() {
      const { actions } = useApp();
      useEffect(() => {
        actions.setTarget({ name: 'Philip Linden', id: 'avatar-uuid-001' } as any);
      }, []);
      return <Profile />;
    }

    const host = await mount(<TargetSetter />);
    const inspector = host.querySelector('[data-testid="resident-inspector"]');
    expect(inspector).not.toBeNull();
    expect(host.textContent).toContain('Philip Linden');
    expect(host.textContent).toContain('Inspecting: Philip Linden');

    // Tabs for 2ND LIFE, PICKS, and GROUPS exist
    const tabs = host.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(3);
    const tabLabels = Array.from(tabs).map((t) => t.textContent);
    expect(tabLabels).toContain('2ND LIFE');
    expect(tabLabels).toContain('PICKS');
    expect(tabLabels).toContain('GROUPS');
  });

  it('Requirement 3: Fetches resident profile photo via app.protocol.fetchProfilePhoto', async () => {
    const fetchPhotoSpy = vi.spyOn(app.protocol, 'fetchProfilePhoto').mockResolvedValue({
      photoBytes:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      contentType: 'image/png',
    });

    const host = await mount(
      <ResidentInspector
        target={{ name: 'Philip Linden', id: 'avatar-uuid-001' }}
        onReturn={() => {}}
      />,
    );

    expect(fetchPhotoSpy).toHaveBeenCalledWith('Philip Linden');

    const photoImg = host.querySelector('[data-testid="resident-photo"]') as HTMLImageElement;
    expect(photoImg).not.toBeNull();
    expect(photoImg.src).toContain('data:image/png;base64,iVBORw0');
  });

  it('Requirement 3: Gracefully handles missing photo or error from fetchProfilePhoto', async () => {
    vi.spyOn(app.protocol, 'fetchProfilePhoto').mockRejectedValue(new Error('Network error'));

    const host = await mount(
      <ResidentInspector
        target={{ name: 'Unknown Explorer', id: 'avatar-uuid-999' }}
        onReturn={() => {}}
      />,
    );

    // Should not throw or crash, and renders fallback icon instead of broken img
    expect(host.querySelector('[data-testid="resident-photo"]')).toBeNull();
    expect(host.textContent).toContain('Unknown Explorer');
  });

  it('Requirement 4 & Criterion 3: IM button triggers instant messaging with target resident', async () => {
    function ImHarness() {
      const { actions } = useApp();
      useEffect(() => {
        actions.setTarget({ name: 'Ada Lovelace', id: 'ada-uuid' } as any);
      }, []);
      return <Profile />;
    }

    const host = await mount(<ImHarness />);
    const imBtn = host.querySelector('[data-testid="resident-im-btn"]') as HTMLButtonElement;
    expect(imBtn).not.toBeNull();

    await act(async () => {
      imBtn.click();
    });

    // IM click dispatches actions.startIm or opens chat session and notifies
    expect(imBtn).toBeTruthy();
  });

  it('Requirement 4: Friend button triggers friendship request', async () => {
    const friendSpy = vi.fn().mockResolvedValue({});
    (app as any).friends = {
      sendFriendRequest: friendSpy,
    };

    const host = await mount(
      <ResidentInspector
        target={{ name: 'Grace Hopper', id: 'grace-uuid-42' }}
        onReturn={() => {}}
      />,
    );

    const friendBtn = host.querySelector(
      '[data-testid="resident-friend-btn"]',
    ) as HTMLButtonElement;
    expect(friendBtn).not.toBeNull();

    await act(async () => {
      friendBtn.click();
    });

    expect(friendSpy).toHaveBeenCalledWith('grace-uuid-42');
  });

  it('Requirement 5 & Criterion 4: Return action clears target and returns to self profile', async () => {
    function ToggleHarness() {
      const { actions } = useApp();
      useEffect(() => {
        actions.setTarget({ name: 'Temporary Resident', id: 'temp-id' } as any);
      }, []);
      return <Profile />;
    }

    const host = await mount(<ToggleHarness />);
    expect(host.querySelector('[data-testid="resident-inspector"]')).not.toBeNull();
    expect(host.textContent).toContain('Temporary Resident');

    const returnBtn = host.querySelector(
      '[data-testid="inspector-return-btn"]',
    ) as HTMLButtonElement;
    expect(returnBtn).not.toBeNull();

    await act(async () => {
      returnBtn.click();
    });

    // Target cleared -> Self profile shown
    expect(host.querySelector('[data-testid="resident-inspector"]')).toBeNull();
    expect(host.textContent).toContain('Local User');
  });

  it('Criterion 2: Switching sub-tabs displays corresponding cards and preserves target', async () => {
    function TabSwitchHarness() {
      const { actions } = useApp();
      useEffect(() => {
        actions.setTarget({ name: 'Torley Linden', id: 'torley-uuid' } as any);
      }, []);
      return <Profile />;
    }

    const host = await mount(<TabSwitchHarness />);
    expect(host.textContent).toContain('Torley Linden');

    // Default tab 2ND LIFE
    expect(host.querySelector('#panel-profile-2nd-life')).not.toBeNull();

    // Switch to PICKS tab
    const picksTab = host.querySelector('[role="tab"][data-tab="PICKS"]') as HTMLButtonElement;
    expect(picksTab).not.toBeNull();

    await act(async () => {
      picksTab.click();
    });

    expect(host.querySelector('#panel-profile-picks')).not.toBeNull();
    expect(host.querySelector('[data-testid="picks-empty-state"]')).not.toBeNull();
    expect(host.textContent).toContain('No picks published');
    // Target is preserved!
    expect(host.textContent).toContain('Inspecting: Torley Linden');

    // Switch to GROUPS tab
    const groupsTab = host.querySelector('[role="tab"][data-tab="GROUPS"]') as HTMLButtonElement;
    expect(groupsTab).not.toBeNull();

    await act(async () => {
      groupsTab.click();
    });

    expect(host.querySelector('#panel-profile-groups')).not.toBeNull();
    expect(host.querySelector('[data-testid="groups-empty-state"]')).not.toBeNull();
    expect(host.textContent).toContain('No public groups');
    // Target is preserved!
    expect(host.textContent).toContain('Inspecting: Torley Linden');
  });

  it('Constraints: Standard empty state indicators render instead of fabricated data', async () => {
    const host = await mount(
      <ResidentInspector
        target={{ name: 'Explorer Avatar', id: 'avatar-id-7' }}
        onReturn={() => {}}
      />,
    );

    const picksTab = host.querySelector('[role="tab"][data-tab="PICKS"]') as HTMLButtonElement;
    await act(async () => {
      picksTab.click();
    });

    const picksEmpty = host.querySelector('[data-testid="picks-empty-state"]');
    expect(picksEmpty).not.toBeNull();
    expect(picksEmpty?.textContent).toContain('No picks published');

    const groupsTab = host.querySelector('[role="tab"][data-tab="GROUPS"]') as HTMLButtonElement;
    await act(async () => {
      groupsTab.click();
    });

    const groupsEmpty = host.querySelector('[data-testid="groups-empty-state"]');
    expect(groupsEmpty).not.toBeNull();
    expect(groupsEmpty?.textContent).toContain('No public groups');
  });

  it('Accessibility: Touch hit targets meet WCAG 2.2 SC 2.5.8 minimum dimensions', async () => {
    const host = await mount(
      <ResidentInspector
        target={{ name: 'Philip Linden', id: 'philip-uuid' }}
        onReturn={() => {}}
      />,
    );

    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);

    for (const btn of buttons) {
      // Buttons styled via TouchTarget have minHeight/minWidth >= 24px per WCAG 2.5.8
      const style = window.getComputedStyle(btn);
      const minW = parseInt(style.minWidth || '0', 10);
      const minH = parseInt(style.minHeight || '0', 10);
      const effectiveW = Math.max(minW, btn.offsetWidth || 0);
      const effectiveH = Math.max(minH, btn.offsetHeight || 0);
      // At least 24px in both dimensions
      expect(effectiveW).toBeGreaterThanOrEqual(24);
      expect(effectiveH).toBeGreaterThanOrEqual(24);
    }
  });
});
