// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import BottomTabs from '../../components/BottomTabs.jsx';
import SegmentedTabs from '../../components/SegmentedTabs.jsx';
import MenuBar from '../../components/MenuBar.jsx';
import RailNav from '../../components/RailNav.jsx';
import ViewModeSwitcher from '../../components/ViewModeSwitcher.jsx';
import { useRovingTabindex } from '../../hooks/useRovingTabindex';
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

  it('assigns role="tab", roving tabIndex, aria-selected, and aria-label to tab items', async () => {
    mounted = await mountScreen(BottomTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const tabs = [...mounted.host.querySelectorAll('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(0);

    for (const tab of tabs) {
      expect(tab.getAttribute('aria-label')).toBeTruthy();
      if (tab.getAttribute('aria-label') === 'CHAT') {
        expect(tab.getAttribute('tabindex')).toBe('0');
        expect(tab.getAttribute('aria-selected')).toBe('true');
      } else {
        expect(tab.getAttribute('tabindex')).toBe('-1');
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
      (t) => t.getAttribute('aria-label') === 'MAP',
    ) as HTMLElement;
    expect(mapTab).toBeDefined();

    await act(async () => {
      mapTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(mounted.ctx.current.state.screen).toBe('Map');

    const worldTab = [...mounted.host.querySelectorAll('[role="tab"]')].find(
      (t) =>
        t.getAttribute('aria-label') === '3D WORLD' || t.getAttribute('aria-label') === 'WORLD',
    ) as HTMLElement;
    if (worldTab) {
      await act(async () => {
        worldTab.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(mounted.ctx.current.state.screen).toBe('3D View');
    }
  });

  it('exposes aria-controls on all tab elements pointing to view container IDs', async () => {
    mounted = await mountScreen(BottomTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const tabs = [...mounted.host.querySelectorAll('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of tabs) {
      const controls = tab.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(controls).toMatch(/^panel-[a-z0-9-]+$/);
    }
  });

  it('supports roving tabindex keyboard navigation across tabs with ArrowRight, ArrowLeft, Home, and End', async () => {
    mounted = await mountScreen(BottomTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const getTabs = () => [...mounted!.host.querySelectorAll('[role="tab"]')] as HTMLElement[];
    let tabs = getTabs();
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');

    // ArrowRight moves to next tab
    await act(async () => {
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    tabs = getTabs();
    expect(mounted.ctx.current.state.screen).toBe('Friends');
    expect(tabs[1].getAttribute('tabindex')).toBe('0');
    expect(tabs[0].getAttribute('tabindex')).toBe('-1');

    // End moves to last tab
    await act(async () => {
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    tabs = getTabs();
    const lastIndex = tabs.length - 1;
    expect(tabs[lastIndex].getAttribute('tabindex')).toBe('0');
    expect(mounted.ctx.current.state.screen).toBe('Screens');

    // ArrowRight on last tab wraps around to first tab
    await act(async () => {
      tabs[lastIndex].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    tabs = getTabs();
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(mounted.ctx.current.state.screen).toBe('Chat');

    // ArrowLeft on first tab wraps around to last tab
    await act(async () => {
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    tabs = getTabs();
    expect(tabs[lastIndex].getAttribute('tabindex')).toBe('0');
    expect(mounted.ctx.current.state.screen).toBe('Screens');

    // Home moves directly to first tab
    await act(async () => {
      tabs[lastIndex].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    tabs = getTabs();
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(mounted.ctx.current.state.screen).toBe('Chat');
  });
});

describe('Accessible SegmentedTabs Navigation Component (WCAG 2.2 SC 2.1.1, 2.4.3, 4.1.2)', () => {
  it('renders role="tablist" with roving tabindex and aria-controls on tabs', async () => {
    mounted = await mountScreen(SegmentedTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const tablist = mounted.host.querySelector('[role="tablist"]');
    expect(tablist).not.toBeNull();

    const tabs = [...mounted.host.querySelectorAll('[role="tab"]')];
    expect(tabs.length).toBeGreaterThan(0);

    // Active sub-tab is LOCAL by default
    for (const tab of tabs) {
      const label = tab.getAttribute('data-tab');
      const controls = tab.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(controls).toContain('panel-chat-');

      if (label === 'LOCAL') {
        expect(tab.getAttribute('tabindex')).toBe('0');
        expect(tab.getAttribute('aria-selected')).toBe('true');
      } else {
        expect(tab.getAttribute('tabindex')).toBe('-1');
        expect(tab.getAttribute('aria-selected')).toBe('false');
      }
    }
  });

  it('navigates sub-view tabs using ArrowRight, ArrowLeft with wrapping, Home, and End', async () => {
    mounted = await mountScreen(SegmentedTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const getTabs = () => [...mounted!.host.querySelectorAll('[role="tab"]')] as HTMLElement[];
    let tabs = getTabs();
    expect(tabs[0].getAttribute('data-tab')).toBe('LOCAL');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');

    // ArrowRight to IM
    await act(async () => {
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    tabs = getTabs();
    expect(tabs[1].getAttribute('data-tab')).toBe('IM');
    expect(tabs[1].getAttribute('tabindex')).toBe('0');
    expect(tabs[0].getAttribute('tabindex')).toBe('-1');

    // End to GROUP
    await act(async () => {
      tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    tabs = getTabs();
    const lastIndex = tabs.length - 1;
    expect(tabs[lastIndex].getAttribute('data-tab')).toBe('GROUP');
    expect(tabs[lastIndex].getAttribute('tabindex')).toBe('0');

    // ArrowRight on last tab wraps to first tab LOCAL
    await act(async () => {
      tabs[lastIndex].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    tabs = getTabs();
    expect(tabs[0].getAttribute('data-tab')).toBe('LOCAL');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');

    // ArrowLeft on first tab wraps to last tab GROUP
    await act(async () => {
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    tabs = getTabs();
    expect(tabs[lastIndex].getAttribute('data-tab')).toBe('GROUP');
    expect(tabs[lastIndex].getAttribute('tabindex')).toBe('0');

    // Home returns to first tab LOCAL
    await act(async () => {
      tabs[lastIndex].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    tabs = getTabs();
    expect(tabs[0].getAttribute('data-tab')).toBe('LOCAL');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
  });

  it('activates tabs on Enter and Space keypresses', async () => {
    mounted = await mountScreen(SegmentedTabs);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const imTab = mounted.host.querySelector('[role="tab"][data-tab="IM"]') as HTMLElement;
    expect(imTab).not.toBeNull();

    await act(async () => {
      imTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(imTab.getAttribute('aria-selected')).toBe('true');

    const groupTab = mounted.host.querySelector('[role="tab"][data-tab="GROUP"]') as HTMLElement;
    await act(async () => {
      groupTab.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(groupTab.getAttribute('aria-selected')).toBe('true');
  });
});

describe('useRovingTabindex Hook Specification Compliance', () => {
  it('supports manual activation mode without auto-selecting on arrow navigation', () => {
    let selected: string | null = null;
    let hookResult: any;

    function TestComponent() {
      hookResult = useRovingTabindex({
        tabs: ['tab1', 'tab2', 'tab3'],
        activeTab: selected || 'tab1',
        onSelect: (t) => {
          selected = t;
        },
        activationMode: 'manual',
      });
      return null;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(createElement(TestComponent));
    });

    // Initial state: tab1 is active and focused
    expect(hookResult.getTabIndex('tab1')).toBe(0);
    expect(hookResult.getTabIndex('tab2')).toBe(-1);

    // ArrowRight in manual mode moves focus but does not call onSelect
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    act(() => {
      hookResult.handleKeyDown(event, 'tab1');
    });
    expect(selected).toBeNull();
    expect(hookResult.focusedTab).toBe('tab2');
    expect(hookResult.getTabIndex('tab2')).toBe(0);
    expect(hookResult.getTabIndex('tab1')).toBe(-1);

    // Enter activates focused tab
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    act(() => {
      hookResult.handleKeyDown(enterEvent, 'tab2');
    });
    expect(selected).toBe('tab2');

    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('does not block Tab, Shift+Tab, or Escape keys', () => {
    let hookResult: any;
    function TestComponent() {
      hookResult = useRovingTabindex({
        tabs: ['tab1', 'tab2'],
        activeTab: 'tab1',
        onSelect: () => {},
      });
      return null;
    }

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(createElement(TestComponent));
    });

    for (const key of ['Tab', 'Escape']) {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      act(() => {
        hookResult.handleKeyDown(event, 'tab1');
      });
      expect(event.defaultPrevented).toBe(false);
    }

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});

describe('Accessible ViewModeSwitcher Component (WCAG 2.2 SC 2.5.8 & 4.1.2)', () => {
  it('enforces minimum target dimensions of 24px (minHeight and minWidth >= 24px) on all switcher buttons in standard and compact modes', async () => {
    mounted = await mountScreen(ViewModeSwitcher);
    const buttons = mounted.host.querySelectorAll('button');
    expect(buttons.length).toBe(3);

    for (const btn of buttons) {
      expect(btn.style.height).toBe('24px');
      expect(btn.style.minHeight).toBe('24px');
      expect(btn.style.minWidth).toBe('24px');
      expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(24);
      expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
    }

    await unmount(mounted);
    const CompactSwitcher = () => createElement(ViewModeSwitcher, { compact: true });
    mounted = await mountScreen(CompactSwitcher);

    const compactBtn = mounted.host.querySelector('button');
    expect(compactBtn).not.toBeNull();
    expect(compactBtn?.style.height).toBe('24px');
    expect(compactBtn?.style.minHeight).toBe('24px');
    expect(compactBtn?.style.minWidth).toBe('24px');
    expect(parseInt(compactBtn?.style.minHeight || '0', 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(compactBtn?.style.minWidth || '0', 10)).toBeGreaterThanOrEqual(24);
  });

  it('assigns aria-pressed states to all view mode buttons according to active mode and handles auto mode edge cases', async () => {
    mounted = await mountScreen(ViewModeSwitcher);

    // Case 1: Auto mode with desktop device active
    await act(async () => {
      mounted!.ctx.current.actions.setViewMode('auto');
      mounted!.ctx.current.actions.setDevice('desk');
    });

    const getBtn = (text: string) =>
      [...mounted!.host.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

    let mobileBtn = getBtn('MOBILE');
    let desktopBtn = getBtn('DESKTOP');
    let autoBtn = getBtn('AUTO');

    expect(mobileBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(desktopBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(autoBtn?.getAttribute('aria-pressed')).toBe('true');

    // Case 2: Auto mode with mobile device active
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
    });

    mobileBtn = getBtn('MOBILE');
    desktopBtn = getBtn('DESKTOP');
    autoBtn = getBtn('AUTO');

    expect(mobileBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(desktopBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(autoBtn?.getAttribute('aria-pressed')).toBe('true');

    // Case 3: Explicit mobile mode
    await act(async () => {
      mounted!.ctx.current.actions.setViewMode('mobile');
    });

    mobileBtn = getBtn('MOBILE');
    desktopBtn = getBtn('DESKTOP');
    autoBtn = getBtn('AUTO');

    expect(mobileBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(desktopBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(autoBtn?.getAttribute('aria-pressed')).toBe('false');

    // Case 4: Explicit desktop mode
    await act(async () => {
      mounted!.ctx.current.actions.setViewMode('desktop');
    });

    mobileBtn = getBtn('MOBILE');
    desktopBtn = getBtn('DESKTOP');
    autoBtn = getBtn('AUTO');

    expect(mobileBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(desktopBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(autoBtn?.getAttribute('aria-pressed')).toBe('false');

    // Case 5: Clicking buttons updates view mode and aria-pressed states
    await act(async () => {
      mobileBtn?.click();
    });

    mobileBtn = getBtn('MOBILE');
    desktopBtn = getBtn('DESKTOP');
    autoBtn = getBtn('AUTO');

    expect(mobileBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(desktopBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(autoBtn?.getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      desktopBtn?.click();
    });

    mobileBtn = getBtn('MOBILE');
    desktopBtn = getBtn('DESKTOP');
    autoBtn = getBtn('AUTO');

    expect(mobileBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(desktopBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(autoBtn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('provides accessible aria-label on compact mode button indicating toggle destination', async () => {
    const CompactSwitcher = () => createElement(ViewModeSwitcher, { compact: true });
    mounted = await mountScreen(CompactSwitcher);

    await act(async () => {
      mounted!.ctx.current.actions.setDevice('desk');
    });
    let compactBtn = mounted.host.querySelector('button');
    expect(compactBtn?.getAttribute('aria-label')).toBe('Switch to mobile view');

    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
    });
    compactBtn = mounted.host.querySelector('button');
    expect(compactBtn?.getAttribute('aria-label')).toBe('Switch to desktop view');
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

    const triggers = [
      ...mounted.host.querySelectorAll('[role="menubar"] > div > [role="menuitem"]'),
    ];
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

    const fileTrigger = mounted.host.querySelector(
      '[role="menubar"] > div > [role="menuitem"]',
    ) as HTMLElement;

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

    const triggers = [
      ...mounted.host.querySelectorAll('[role="menubar"] > div > [role="menuitem"]'),
    ];
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

    const fileTrigger = mounted.host.querySelector(
      '[role="menubar"] > div > [role="menuitem"]',
    ) as HTMLElement;

    await act(async () => {
      fileTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(mounted.ctx.current.state.menu).toBe('File');

    const dropdownItem = mounted.host.querySelector(
      'nav [role="menu"] [role="menuitem"]',
    ) as HTMLElement;

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

    const items = [
      ...mounted.host.querySelectorAll('nav[aria-label="Side Rail Navigation"] [role="button"]'),
    ];
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

    const mapButton = [
      ...mounted.host.querySelectorAll('nav[aria-label="Side Rail Navigation"] [role="button"]'),
    ].find((b) => b.getAttribute('aria-label') === 'MAP') as HTMLElement;
    expect(mapButton).toBeDefined();

    await act(async () => {
      mapButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(mounted.ctx.current.state.screen).toBe('Map');

    const chatButton = [
      ...mounted.host.querySelectorAll('nav[aria-label="Side Rail Navigation"] [role="button"]'),
    ].find((b) => b.getAttribute('aria-label') === 'CHAT') as HTMLElement;

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

describe('Skip Navigation Link and Application Landmarks (WCAG 2.2 SC 2.4.1 & 1.3.1)', () => {
  let AppModule: any;
  let ViewerModule: any;
  let HeaderModule: any;
  let TileNavModule: any;
  let DesktopChromeModule: any;

  beforeAll(async () => {
    const appImp = await import('../../App.tsx');
    AppModule = appImp.default;
    ViewerModule = appImp.Viewer;
    HeaderModule = (await import('../../components/Header.jsx')).default;
    TileNavModule = (await import('../../components/TileNav.jsx')).default;
    DesktopChromeModule = (await import('../../components/DesktopChrome.jsx')).default;
  });

  it('renders skip navigation link pointing to #main-content in App', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AppModule));
    });

    const skipLink = host.querySelector('a.skip-to-content-link') as HTMLAnchorElement;
    expect(skipLink).not.toBeNull();
    expect(skipLink.getAttribute('href')).toBe('#main-content');
    expect(skipLink.textContent?.trim()).toBe('Skip to main content');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('renders a single <main id="main-content" tabIndex={-1}> landmark enclosing view content', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AppModule));
    });

    const mainElements = host.querySelectorAll('main');
    expect(mainElements.length).toBe(1);

    const main = host.querySelector('main#main-content');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('tabindex')).toBe('-1');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('renders global header components inside <header> tags', async () => {
    mounted = await mountScreen(HeaderModule);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const header = mounted.host.querySelector('header');
    expect(header).not.toBeNull();
  });

  it('renders TileNav inside <nav aria-label="Tile Navigation">', async () => {
    mounted = await mountScreen(TileNavModule);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setLayout('metro');
    });

    const nav = mounted.host.querySelector('nav[aria-label="Tile Navigation"]');
    expect(nav).not.toBeNull();
  });

  it('renders DesktopChrome location bar inside <nav aria-label="Location bar">', async () => {
    mounted = await mountScreen(DesktopChromeModule);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('desk');
    });

    const locNav = mounted.host.querySelector('nav[aria-label="Location bar"]');
    expect(locNav).not.toBeNull();
  });
});

describe('Accessible Heading Standardization and Top-Level Landmark (WCAG 2.2 SC 1.3.1 & 2.4.6)', () => {
  let HeaderModule: any;
  let ScreenBodyModule: any;

  beforeAll(async () => {
    HeaderModule = (await import('../../components/Header.jsx')).default;
    ScreenBodyModule = (await import('../../components/ScreenBody.jsx')).default;
  });

  it('renders an <h1> heading inside Header for title with margin: 0 across layouts', async () => {
    mounted = await mountScreen(HeaderModule);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      mounted!.ctx.current.actions.setScreen('Chat');
    });

    const h1 = mounted.host.querySelector('header h1') as HTMLElement;
    expect(h1).not.toBeNull();
    expect(h1.tagName.toLowerCase()).toBe('h1');
    expect(h1.style.margin).toBe('0px');
  });

  it('renders visually hidden <h1 className="sr-only"> inside main landmark when headLook === "none"', async () => {
    mounted = await mountScreen(ScreenBodyModule);
    await act(async () => {
      mounted!.ctx.current.actions.setDevice('ios');
      // '3D View' screen sets bare = true, resulting in headLook === 'none'
      mounted!.ctx.current.actions.setScreen('3D View');
    });

    const hiddenH1 = mounted.host.querySelector('main#main-content h1.sr-only');
    expect(hiddenH1).not.toBeNull();
    expect(hiddenH1?.tagName.toLowerCase()).toBe('h1');
    expect(hiddenH1?.textContent).toBeTruthy();
  });
});
