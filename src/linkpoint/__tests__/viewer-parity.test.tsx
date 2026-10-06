// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import Settings from '../../screens/Settings.jsx';
import ScreenDirectory from '../../screens/ScreenDirectory.jsx';
import { GroupsScreen } from '../../screens/LiveScreens.jsx';
import { NAV_ALL } from '../../data/content.js';
import { FLOATERS } from '../../theme/constants.js';
import { app } from '../app';
import { GroupsManager } from '../phase2/groups';
import { VIEWER_SETTINGS_KEY } from '../../hooks/viewerSettings.js';
import { mountScreen, unmount, click, typeInto, flush, buttonByText, type Mounted } from './ui-helpers';
let mounted: Mounted | null = null;
beforeEach(() => { localStorage.clear(); app.groups.replaceGroups([]); });
afterEach(async () => { await unmount(mounted); mounted = null; vi.restoreAllMocks(); });

describe('viewer navigation and preferences', () => {
  it('makes every registered screen available from the phone directory and desktop windows', async () => {
    mounted = await mountScreen(ScreenDirectory);
    for (const item of NAV_ALL.filter((item: any) => item.id !== 'Screens')) {
      expect(buttonByText(mounted.host, item.id)).toBeTruthy();
      if (item.id !== '3D View') expect(FLOATERS.some((f: any) => f.id === item.id)).toBe(true);
    }
    await click(buttonByText(mounted.host, 'Groups'));
    expect(mounted.ctx.current.state.screen).toBe('Groups');
  });
  it('filters settings and remembers preferences after remount, preserving explicit device mode on resize', async () => {
    mounted = await mountScreen(Settings);
    await typeInto(mounted.host.querySelector('#settings-fov-select') as HTMLSelectElement, '80');
    await typeInto(mounted.host.querySelector('#settings-format-select') as HTMLSelectElement, 'mobile');
    await click(buttonByText(mounted.host, 'Graphics'));
    expect((mounted.host.querySelector('[aria-labelledby="chat-im-heading"]') as HTMLElement).hidden).toBe(true);
    expect((mounted.host.querySelector('[aria-labelledby="graphics-heading"]') as HTMLElement).hidden).toBe(false);
    expect(JSON.parse(localStorage.getItem(VIEWER_SETTINGS_KEY)!).prefs.fov).toBe(80);
    await act(async () => window.dispatchEvent(new Event('resize')));
    expect(mounted.ctx.current.state.device).toBe('and');
    await unmount(mounted); mounted = await mountScreen(Settings);
    expect(mounted.ctx.current.state.prefs.fov).toBe(80);
    expect(mounted.ctx.current.state.viewMode).toBe('mobile');
  });
});

describe('group list and details', () => {
  it('replaces empty membership snapshots and drops former group details', () => {
    const manager = new GroupsManager();
    manager.setGroupInfo('g1', { name: 'Former group' });
    manager.replaceMembers('g1', [{ id: 'member' }]);
    manager.replaceGroups([]);
    expect(manager.getGroups()).toEqual([]);
    expect(manager.getGroupMembers('g1').size).toBe(0);
  });
  it('requests profile, members and roles as tabs open and returns to the mobile list', async () => {
    app.groups.setGroupInfo('g1', { name: 'Builders' });
    vi.spyOn(app, 'loadGroups').mockResolvedValue(app.groups.getGroups());
    const load = vi.spyOn(app, 'loadGroupDetails').mockImplementation(async (id, section) => {
      if (section === 'members') app.groups.replaceMembers(id, [{ id: 'resident', title: 'Owner' }]);
      return {};
    });
    mounted = await mountScreen(GroupsScreen); await flush();
    expect(load).toHaveBeenCalledWith('g1', 'profile');
    await click(buttonByText(mounted.host, /Builders/));
    expect(mounted.host.querySelector('.group-browser-detail')).toBeTruthy();
    await click(buttonByText(mounted.host, /Members/i)); await flush();
    expect(load).toHaveBeenCalledWith('g1', 'members');
    expect(mounted.host.textContent).toContain('Owner');
    await click(buttonByText(mounted.host, /Roles/i)); await flush();
    expect(load).toHaveBeenCalledWith('g1', 'roles');
    await click(mounted.host.querySelector('[aria-label="Back to groups"]'));
    expect(mounted.host.querySelector('.group-browser-detail')).toBeNull();
  });
});
