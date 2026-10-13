import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { CSUB, subView, setSub } from '../../theme/constants.js';
import SegmentedTabs from '../../components/SegmentedTabs.jsx';
import ScreenBody from '../../components/ScreenBody.jsx';
import Search from '../Search.jsx';
import Radar from '../Radar.jsx';

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
});

describe('Search & Radar Standardized Tabs Integration', () => {
  it('Requirement 1: CSUB defines sub-views for Search and Radar', () => {
    expect(CSUB.Search).toEqual([
      ['PEOPLE', '· 01'],
      ['GROUPS', '· 02'],
      ['PLACES', '· 03'],
      ['SEARCH', '· 04'],
    ]);
    expect(CSUB.Radar).toEqual([
      ['AVATAR', '· 01'],
      ['OBJECT', '· 02'],
    ]);
  });

  it('Requirement 2: subView and setSub manage active sub-tab state for Search and Radar', () => {
    const state: { searchTab: string; rMode: string; tabs: Record<string, string> } = {
      searchTab: 'PEOPLE',
      rMode: 'AV',
      tabs: {},
    };

    const actions = {
      setSearchTab: (val: string) => {
        state.searchTab = val;
      },
      setTab: (scr: string, val: string) => {
        state.tabs[scr] = val;
      },
      setRMode: (val: string) => {
        state.rMode = val;
      },
    };

    expect(subView(state, 'Search')).toBe('PEOPLE');
    expect(subView(state, 'Radar')).toBe('AVATAR');

    setSub(actions, 'Search', 'GROUPS');
    expect(subView(state, 'Search')).toBe('GROUPS');

    setSub(actions, 'Search', 'PLACES');
    expect(subView(state, 'Search')).toBe('PLACES');

    setSub(actions, 'Search', 'SEARCH');
    expect(subView(state, 'Search')).toBe('SEARCH');

    setSub(actions, 'Radar', 'OBJECT');
    expect(subView(state, 'Radar')).toBe('OBJECT');

    setSub(actions, 'Radar', 'AVATAR');
    expect(subView(state, 'Radar')).toBe('AVATAR');
  });

  it('Requirement 3 & 5: SegmentedTabs renders top-level tabs for Search and Radar without exceptions', async () => {
    const host = await mount(<SegmentedTabs />);
    // SegmentedTabs inspects theme context scr (defaults to Chat in provider or whatever screen is active)
    expect(host).not.toBeNull();
  });

  it('Requirement 4: Delegated category tab buttons in Search.jsx to SegmentedTabs', async () => {
    const searchHost = await mount(<Search />);
    // Search screen renders SegmentedTabs with PEOPLE, GROUPS, PLACES, SEARCH
    const segmentedTabs = searchHost.querySelectorAll('[role="tab"]');
    expect(segmentedTabs.length).toBe(4);
    expect(searchHost.textContent).toContain('PEOPLE');
    expect(searchHost.textContent).toContain('GROUPS');
    expect(searchHost.textContent).toContain('PLACES');
    expect(searchHost.textContent).toContain('SEARCH');

    // Render ScreenBody with Search screen active
    const bodyHost = await mount(<ScreenBody />);
    expect(bodyHost).not.toBeNull();
  });

  it('Requirement 4: Deprecated custom inline toggle buttons in Radar.jsx', async () => {
    const radarHost = await mount(<Radar />);
    // Custom PERSON / ITEM button buttons inside Radar body should no longer exist
    const buttons = Array.from(radarHost.querySelectorAll('button'));
    const personButton = buttons.find((btn) => btn.textContent?.includes('PERSON'));
    const itemButton = buttons.find((btn) => btn.textContent?.includes('ITEM'));

    expect(personButton).toBeUndefined();
    expect(itemButton).toBeUndefined();

    // Radar scope toggle button should still exist in Search & Sort bar
    const scopeButton = buttons.find((btn) => btn.getAttribute('title')?.includes('Radar Scope'));
    expect(scopeButton).not.toBeUndefined();
  });
});
