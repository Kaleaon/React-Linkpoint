// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import Settings from '../../screens/Settings.jsx';
import { GroupsScreen } from '../../screens/LiveScreens.jsx';
import AccessibleChatLog from '../../components/AccessibleChatLog.jsx';
import { app } from '../app';
import { slBridge } from '../sl-bridge';
import { NotificationsManager } from '../notifications';
import { ChatManager } from '../chat';
import { Utils } from '../utils';
import { PALETTES } from '@linkpoint/design-system/tokens';
import { readViewerSettings, VIEWER_SETTINGS_KEY } from '../../hooks/viewerSettings.js';
import { THEME_STORAGE_KEY, themeFromPalette } from '../../theme/customTheme.js';
import {
  mountScreen,
  unmount,
  click,
  typeInto,
  flush,
  buttonByText,
  type Mounted,
} from './ui-helpers';
let mounted: Mounted | null = null;
let oldConnected: boolean;
beforeEach(() => {
  localStorage.clear();
  app.groups.replaceGroups([]);
  app.notices.clear();
  app.chat.setAutoReplyEnabled(false);
  app.chat.setHistoryLoggingEnabled(true);
  oldConnected = slBridge.connected;
});
afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  slBridge.connected = oldConnected;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('follow-up settings audit', () => {
  it('restores selected palette and actual compact density without a saved custom theme', async () => {
    localStorage.setItem(VIEWER_SETTINGS_KEY, JSON.stringify({ palette: 'aero', dense: true }));
    mounted = await mountScreen(Settings);
    expect(mounted.ctx.current.state.customTheme.colors).toEqual(
      themeFromPalette(PALETTES.aero).colors,
    );
    expect(mounted.ctx.current.state.customTheme.density).toBe('compact');
    await typeInto(
      mounted.host.querySelector('#settings-density-select') as HTMLSelectElement,
      'comfortable',
    );
    expect(mounted.ctx.current.state.customTheme.density).toBe('comfortable');
    await unmount(mounted);
    mounted = await mountScreen(Settings);
    expect(mounted.ctx.current.state.customTheme.density).toBe('comfortable');
  });
  it('switching palette supersedes an explicitly saved custom theme on the next reload', async () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ ...themeFromPalette(PALETTES.ink), active: true }),
    );
    mounted = await mountScreen(Settings);
    await typeInto(
      mounted.host.querySelector('#settings-theme-select') as HTMLSelectElement,
      'aero',
    );
    await unmount(mounted);
    mounted = await mountScreen(Settings);
    expect(mounted.ctx.current.state.palette).toBe('aero');
    expect(mounted.ctx.current.state.customTheme.colors).toEqual(
      themeFromPalette(PALETTES.aero).colors,
    );
  });
  it('rejects corrupted preference types and prototype names before consumers read them', () => {
    localStorage.setItem(
      VIEWER_SETTINGS_KEY,
      JSON.stringify({
        layout: '__proto__',
        palette: 'constructor',
        dense: 'false',
        toggles: { battery: 'false', notifyIM: false },
        prefs: { draw: 1, fps: {}, fov: 1e9, volume: '100%' },
      }),
    );
    expect(readViewerSettings()).toEqual({
      toggles: { notifyIM: false },
      prefs: { volume: '100%' },
    });
  });
  it('preserves saved autoreply at startup, synchronizes Chat changes and avoids unrelated resets', async () => {
    Utils.storage.set('linkpoint_auto_reply_config', { enabled: true });
    localStorage.setItem(VIEWER_SETTINGS_KEY, JSON.stringify({ toggles: { autoresponse: false } }));
    mounted = await mountScreen(Settings);
    expect(app.chat.isAutoReplyEnabled()).toBe(true);
    await act(async () => app.chat.setAutoReplyEnabled(false));
    expect(mounted.ctx.current.state.toggles.autoresponse).toBe(false);
    const setter = vi.spyOn(app.chat, 'setAutoReplyEnabled');
    await typeInto(
      mounted.host.querySelector('#settings-master-volume-select') as HTMLSelectElement,
      '25%',
    );
    expect(setter).not.toHaveBeenCalled();
    expect(app.chat.isAutoReplyEnabled()).toBe(false);
  });
  it('timestamps toggle changes rendered chat while retaining message content', async () => {
    const Component = () => (
      <AccessibleChatLog
        messages={[
          { id: 'm', sender: 'Resident', text: 'Hello', timestamp: Date.UTC(2026, 0, 1, 12) },
        ]}
      />
    );
    mounted = await mountScreen(Component);
    expect(mounted.host.textContent).toMatch(/\[\d.*\]/);
    await act(async () => mounted!.ctx.current.actions.toggleSetting('timestamps'));
    expect(mounted.host.textContent).not.toMatch(/\[\d.*\]/);
    expect(mounted.host.textContent).toContain('Hello');
  });
  it('disabling chat logging removes saved history and stops new persistence without dropping live messages', () => {
    const manager = new ChatManager({}, {});
    manager.messages = [{ id: 'm', text: 'Hello' }];
    manager.saveChatHistory();
    expect(Utils.storage.get('linkpoint_chat_history')).toHaveLength(1);
    manager.setHistoryLoggingEnabled(false);
    manager.saveChatHistory();
    expect(Utils.storage.get('linkpoint_chat_history')).toBeNull();
    expect(manager.messages).toHaveLength(1);
  });
});

describe('group and notification audit', () => {
  it('failed membership fetch rejects without deleting cached groups', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    slBridge.connected = true;
    app.groups.setGroupInfo('g1', { name: 'Builders' });
    vi.spyOn(slBridge, 'fetchGroups').mockRejectedValue(new Error('Group request timed out'));
    await expect(app.loadGroups()).rejects.toThrow('timed out');
    expect(app.groups.getGroups()).toHaveLength(1);
  });
  it('does not restore group records after the connection changes during a request', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    slBridge.connected = true;
    let finish!: (groups: any[]) => void;
    vi.spyOn(slBridge, 'fetchGroups').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const loading = app.loadGroups();
    slBridge.connected = false;
    finish([{ id: 'old', name: 'Old session' }]);
    await expect(loading).rejects.toThrow('Session changed');
    expect(app.groups.getGroups()).toEqual([]);
  });
  it('shows group refresh failure in the list and receives notices from the real notice store', async () => {
    app.groups.setGroupInfo('g1', { name: 'Builders' });
    vi.spyOn(app, 'loadGroups').mockRejectedValue(new Error('Refresh timed out'));
    vi.spyOn(app, 'loadGroupDetails').mockResolvedValue({});
    mounted = await mountScreen(GroupsScreen);
    await flush();
    expect(mounted.host.querySelector('[role="alert"]')?.textContent).toContain(
      'Refresh timed out',
    );
    await click(buttonByText(mounted.host, /Builders/));
    await click(buttonByText(mounted.host, /Notices/i));
    await act(async () =>
      app.notices.receive({
        id: 'n1',
        groupId: 'g1',
        subject: 'Live group notice',
        message: 'Details',
      }),
    );
    expect(mounted.host.textContent).toContain('Live group notice');
  });
  it('classifies incoming normalized IM and group messages and retains records when popups are off', () => {
    const chat = new Utils.EventEmitter();
    const protocol = new Utils.EventEmitter();
    (protocol as any).agentId = 'me';
    const notifications = new NotificationsManager(protocol as any);
    notifications.init(chat);
    notifications.setFilters({ local: true, im: false, group: false });
    const popup = vi.spyOn(Utils, 'showToast').mockImplementation(() => {});
    chat.emit('message_received', {
      type: 'im',
      senderId: 'resident',
      sender: 'Resident',
      text: 'Hello',
    });
    chat.emit('message_received', { type: 'group', senderId: 'resident', text: 'Group hello' });
    chat.emit('message_received', { type: 'im', senderId: 'me', text: 'Own echo' });
    expect(notifications.items).toHaveLength(2);
    expect(popup).not.toHaveBeenCalled();
    notifications.setFilters({ local: false, im: true, group: false });
    chat.emit('message_received', { type: 'im', senderId: 'resident', text: 'Hello again' });
    expect(popup).toHaveBeenCalledTimes(1);
  });
});

it('local mutes block new incoming messages before persistence, notifications and autoreplies', async () => {
  const { ChatExtended } = await import('../phase2/chat-extended');
  const extended = new ChatExtended();
  const sendInstantMessage = vi.fn().mockResolvedValue({});
  const manager = new ChatManager({ sendInstantMessage }, { user: { id: 'me' } });
  manager.setMessageFilter((message) => extended.shouldDisplayMessage(message));
  manager.setAutoReplyEnabled(true);
  const received = vi.fn();
  manager.on('message_received', received);
  extended.muteUser('resident');
  extended.muteObject('Object-ID');
  await manager.handleIncomingMessage({
    type: 'im',
    senderId: 'resident',
    sender: 'Resident',
    text: 'Muted private message',
  });
  await manager.handleIncomingMessage({
    type: 'local',
    senderId: 'object-id',
    sender: 'Scripted object',
    sourceType: 2,
    text: 'Muted object',
  });
  expect(manager.messages).toEqual([]);
  expect(received).not.toHaveBeenCalled();
  expect(sendInstantMessage).not.toHaveBeenCalled();
  extended.unmuteUser('resident');
  manager.setAutoReplyEnabled(false);
  await manager.handleIncomingMessage({
    type: 'im',
    senderId: 'resident',
    text: 'Visible message',
  });
  expect(manager.messages).toHaveLength(1);
  expect(received).toHaveBeenCalledTimes(1);
});
