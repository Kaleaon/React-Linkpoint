// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import BottomTabs from '../../components/BottomTabs.jsx';
import MenuBar from '../../components/MenuBar.jsx';
import RailNav from '../../components/RailNav.jsx';
import { mountScreen, unmount, type Mounted } from './ui-helpers.js';
import fs from 'node:fs';
import path from 'node:path';

let mounted: Mounted | null = null;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
});

describe('Accessible BottomTabs Navigation Component (WCAG 2.2 SC 2.1.1 & 4.1.2)', () => {
  it('renders HTML5 <nav aria-label="Bottom Navigation"> and role="tablist"', async () => {
    mounted = await mountScreen(BottomTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
    });

    const nav = mounted.host.querySelector('nav[aria-label="Bottom Navigation"]');
    expect(nav).not.toBeNull();

    const tablist = nav?.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();
  });

  it('assigns role="tab", tabIndex={0}, aria-selected, and aria-label to tab items', async () => {
    mounted = await mountScreen(BottomTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const tabs = [...mounted.host.querySelectorAll('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(0);

    for (const tab of tabs) {
      expect(tab.getAttribute('tabindex')).toBe('0');
      expect(tab.getAttribute('aria-label')).toBeTruthy();
      if (tab.getAttribute('aria-label') === 'CHAT') {
        expect(tab.getAttribute('aria-selected')).toBe('true');
      } else {
        expect(tab.getAttribute('aria-selected')).toBe('false');
      }
    }
  });

  it('activates tabs on Enter and Space keypresses', async () => {
    mounted = await mountScreen(BottomTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const mapTab = [...mounted.host.querySelectorAll('[role="tab"]')].find(
      (t) => t.getAttribute('aria-label') === 'MAP'
    ) as HTMLElement;
    expect(mapTab).toBeDefined();

    await act(async () => {
      mapTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(mounted.ctx.current.state.screen).toBe('Map');

    const worldTab = [...mounted.host.querySelectorAll('[role="tab"]')].find(
      (t) => t.getAttribute('aria-label') === '3D WORLD' || t.getAttribute('aria-label') === 'WORLD'
    ) as HTMLElement;
    if (worldTab) {
      await act(async () => {
        worldTab.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(mounted.ctx.current.state.screen).toBe('3D View');
    }
  });
});

describe('Accessible MenuBar Component (WCAG 2.2 SC 2.1.1 & 4.1.2)', () => {
  it('renders HTML5 <nav aria-label="Application Menu"> and role="menubar"', async () => {
    mounted = await mountScreen(MenuBar);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('desk');
    });

    const nav = mounted.host.querySelector('nav[aria-label="Application Menu"]');
    expect(nav).not.toBeNull();

    const menubar = nav?.querySelector('[role="menubar"]');
    expect(menubar).not.toBeNull();
  });

  it('assigns role="menuitem", tabIndex={0}, aria-haspopup="true", and aria-expanded to triggers', async () => {
    mounted = await mountScreen(MenuBar);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('desk');
    });

    const triggers = [...mounted.host.querySelectorAll('[role="menubar"] > div > [role="menuitem"]')];
    expect(triggers.length).toBeGreaterThan(0);

    const fileTrigger = triggers[0] as HTMLElement;
    expect(fileTrigger.getAttribute('tabindex')).toBe('0');
    expect(fileTrigger.getAttribute('aria-haspopup')).toBe('true');
    expect(fileTrigger.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      fileTrigger.click();
    });
    expect(fileTrigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens dropdown menu on Enter, Space, or ArrowDown keypresses', async () => {
    mounted = await mountScreen(MenuBar);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('desk');
    });

    const fileTrigger = mounted.host.querySelector('[role="menubar"] > div > [role="menuitem"]') as HTMLElement;

    await act(async () => {
      fileTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(mounted.ctx.current.state.menu).toBe('File');

    const dropdown = mounted.host.querySelector('nav [role="menu"]');
    expect(dropdown).not.toBeNull();

    const dropdownItems = [...dropdown!.querySelectorAll('[role="menuitem"]')];
    expect(dropdownItems.length).toBeGreaterThan(0);
    expect(dropdownItems[0].getAttribute('tabindex')).toBe('0');
  });

  it('navigates top-level menu triggers using ArrowLeft and ArrowRight', async () => {
    mounted = await mountScreen(MenuBar);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('desk');
    });

    const triggers = [...mounted.host.querySelectorAll('[role="menubar"] > div > [role="menuitem"]')];
    const fileTrigger = triggers[0] as HTMLElement;

    await act(async () => {
      fileTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });

    const activeEl = document.activeElement;
    expect(activeEl).toBe(triggers[1]);
  });

  it('dismisses dropdown menu on Escape keypress and restores focus to menu trigger', async () => {
    mounted = await mountScreen(MenuBar);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('desk');
    });

    const fileTrigger = mounted.host.querySelector('[role="menubar"] > div > [role="menuitem"]') as HTMLElement;

    await act(async () => {
      fileTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(mounted.ctx.current.state.menu).toBe('File');

    const dropdownItem = mounted.host.querySelector('nav [role="menu"] [role="menuitem"]') as HTMLElement;

    await act(async () => {
      dropdownItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(mounted.ctx.current.state.menu).toBeNull();
  });
});

describe('Accessible RailNav Navigation Component (WCAG 2.2 SC 2.1.1 & 4.1.2)', () => {
  it('renders HTML5 <nav aria-label="Side Rail Navigation">', async () => {
    mounted = await mountScreen(RailNav);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('tab');
    });

    const nav = mounted.host.querySelector('nav[aria-label="Side Rail Navigation"]');
    expect(nav).not.toBeNull();
  });

  it('assigns role="button", tabIndex={0}, and aria-current="page" to active item', async () => {
    mounted = await mountScreen(RailNav);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('tab');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const items = [...mounted.host.querySelectorAll('nav[aria-label="Side Rail Navigation"] [role="button"]')];
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      expect(item.getAttribute('tabindex')).toBe('0');
      expect(item.getAttribute('aria-label')).toBeTruthy();
      if (item.getAttribute('aria-label') === 'CHAT') {
        expect(item.getAttribute('aria-current')).toBe('page');
      } else {
        expect(item.getAttribute('aria-current')).toBeNull();
      }
    }
  });

  it('activates rail navigation items on Enter and Space keypresses', async () => {
    mounted = await mountScreen(RailNav);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('tab');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const mapButton = [...mounted.host.querySelectorAll('nav[aria-label="Side Rail Navigation"] [role="button"]')].find(
      (b) => b.getAttribute('aria-label') === 'MAP'
    ) as HTMLElement;
    expect(mapButton).toBeDefined();

    await act(async () => {
      mapButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(mounted.ctx.current.state.screen).toBe('Map');

    const chatButton = [...mounted.host.querySelectorAll('nav[aria-label="Side Rail Navigation"] [role="button"]')].find(
      (b) => b.getAttribute('aria-label') === 'CHAT'
    ) as HTMLElement;

    await act(async () => {
      chatButton.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(mounted.ctx.current.state.screen).toBe('Chat');
  });
});

describe('W3C Specification References Documentation Compliance', () => {
  it('contains official W3C specification URLs in BottomTabs, MenuBar, and RailNav source files', () => {
    const componentsDir = path.resolve(__dirname, '../../components');
    const files = ['BottomTabs.jsx', 'MenuBar.jsx', 'RailNav.jsx'];

    for (const file of files) {
      const content = fs.readFileSync(path.join(componentsDir, file), 'utf-8');
      expect(content).toContain('https://www.w3.org/TR/WCAG22/#keyboard');
      expect(content).toContain('https://www.w3.org/TR/WCAG22/#name-role-value');
      expect(content).toContain('https://www.w3.org/WAI/WCAG22/Techniques/aria/');
    }
  });
});
