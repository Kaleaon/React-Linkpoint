// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Chat from '../../screens/Chat.jsx';
import Search from '../../screens/Search.jsx';
import Radar from '../../screens/Radar.jsx';
import CacheScreen from '../../screens/CacheScreen.jsx';
import { MediaScreen, TeleportScreen } from '../../screens/LumiyaTools.jsx';
import { MuteListScreen } from '../../screens/LiveScreens.jsx';
import Settings from '../../screens/Settings.jsx';
import { app } from '../app';
import { click, flush, mountScreen, typeInto, unmount, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
  const worldRecord = app.world as unknown as Record<string, unknown>;
  if (!worldRecord.getNearbyUsers) {
    worldRecord.getNearbyUsers = () => [];
  }
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
});

describe('Form Label Associations and Accessible Names Across Viewer Tooling Screens', () => {
  it('Chat screen away message textarea has explicit id linked to label htmlFor', async () => {
    mounted = await mountScreen(Chat);
    const configBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => b.textContent?.includes('CONFIG AWAY MSG') || b.textContent?.includes('HIDE AWAY CONFIG')
    );
    expect(configBtn).toBeTruthy();
    await click(configBtn!);

    const label = mounted.host.querySelector('label[for="chat-away-message-input"]');
    const textarea = mounted.host.querySelector('textarea#chat-away-message-input');
    expect(label).not.toBeNull();
    expect(textarea).not.toBeNull();
    expect(label?.getAttribute('for')).toBe('chat-away-message-input');
    expect(textarea?.getAttribute('id')).toBe('chat-away-message-input');
  });

  it('Search screen input is named for the active tab and the clear control is a real button', async () => {
    mounted = await mountScreen(Search);
    let searchInput = mounted.host.querySelector('input.search-input');
    expect(searchInput).not.toBeNull();
    expect(searchInput?.getAttribute('aria-label')).toBe('Search residents');

    const tab = (label: string) => [...mounted!.host.querySelectorAll('button')].find((b) => (b.textContent || '').trim().toLowerCase() === label);
    await click(tab('groups'));
    await flush();
    expect(mounted.host.querySelector('input.search-input')?.getAttribute('aria-label')).toBe('Search groups');
    await click(tab('places'));
    await flush();
    expect(mounted.host.querySelector('input.search-input')?.getAttribute('aria-label')).toBe('Search places');

    await typeInto(mounted.host.querySelector('input.search-input') as HTMLInputElement, 'club');
    const clear = mounted.host.querySelector('button[aria-label="Clear search"]');
    expect(clear).not.toBeNull();
  });

  it('Radar screen search input and sort select both have explicit aria-label attributes', async () => {
    mounted = await mountScreen(Radar);
    const input = mounted.host.querySelector('input[aria-label]');
    const select = mounted.host.querySelector('select[aria-label]');

    expect(input).not.toBeNull();
    expect(input?.getAttribute('aria-label')).toMatch(/Filter/);
    expect(select).not.toBeNull();
    expect(select?.getAttribute('aria-label')).toBe('Sort radar entities');
  });

  it('Cache screen custom path input and import input both have accessible names', async () => {
    mounted = await mountScreen(CacheScreen);
    const pathInput = mounted.host.querySelector('input[aria-label="Custom cache mount path"]');
    const importInput = mounted.host.querySelector('input[aria-label="Import flashdrive cache file"]');

    expect(pathInput).not.toBeNull();
    expect(importInput).not.toBeNull();
    expect(importInput?.getAttribute('type')).toBe('file');
  });

  it('LumiyaTools media and teleport inputs have explicit aria-label attributes', async () => {
    mounted = await mountScreen(MediaScreen);
    const mediaInput = mounted.host.querySelector('input[aria-label="HTTPS audio stream URL"]');
    expect(mediaInput).not.toBeNull();
    await unmount(mounted);

    mounted = await mountScreen(TeleportScreen);
    const teleportInput = mounted.host.querySelector('input[aria-label="Teleport destination URI"]');
    expect(teleportInput).not.toBeNull();
  });

  it('LiveScreens mute input has an explicit aria-label attribute', async () => {
    mounted = await mountScreen(MuteListScreen);
    const muteInput = mounted.host.querySelector('input[aria-label="Avatar UUID or name to mute"]');
    expect(muteInput).not.toBeNull();
  });

  it('Settings screen preference select controls have explicit id and htmlFor attributes', async () => {
    mounted = await mountScreen(Settings);

    const selectIds = [
      'settings-draw-distance-select',
      'settings-graphics-quality-select',
      'settings-bandwidth-limit-select',
      'settings-master-volume-select',
    ];

    for (const id of selectIds) {
      const label = mounted.host.querySelector(`label[for="${id}"]`);
      const select = mounted.host.querySelector(`select#${id}`);
      expect(label).not.toBeNull();
      expect(select).not.toBeNull();
      expect(label?.getAttribute('for')).toBe(id);
      expect(select?.getAttribute('id')).toBe(id);
    }
  });
});
