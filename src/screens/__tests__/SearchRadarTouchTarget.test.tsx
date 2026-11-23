import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
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

describe('Search and Radar TouchTarget Controls (WCAG 2.1.1, 4.1.2, 2.5.8)', () => {
  describe('Search Screen Back Navigation Control', () => {
    it('renders TouchTarget button with accessible name, title tooltip, 36x36 dimensions, and decorative icon', async () => {
      const host = await mount(<Search />);
      const backBtn = host.querySelector('button[aria-label="Back"]') as HTMLButtonElement;

      expect(backBtn).not.toBeNull();
      expect(backBtn.tagName).toBe('BUTTON');
      expect(backBtn.type).toBe('button');
      expect(backBtn.classList.contains('touch-target')).toBe(true);
      expect(backBtn.getAttribute('aria-label')).toBe('Back');
      expect(backBtn.getAttribute('title')).toBe('Back');
      expect(backBtn.style.minWidth).toBe('36px');
      expect(backBtn.style.minHeight).toBe('36px');
      expect(backBtn.style.width).toBe('36px');
      expect(backBtn.style.height).toBe('36px');
      expect(backBtn.style.background).toBe('none');
      expect(backBtn.style.borderStyle).toBe('none');

      await act(async () => {
        backBtn.focus();
      });
      expect(document.activeElement).toBe(backBtn);

      const icon = backBtn.querySelector('[aria-hidden="true"]');
      expect(icon).not.toBeNull();
    });

    it('navigates back to state.searchFrom on click and falls back to Friends when searchFrom is undefined', async () => {
      let currentScreen = '';

      function SearchFromChat() {
        const { state, actions } = useApp();
        const { openSearch } = actions;
        currentScreen = state.screen;
        useEffect(() => {
          openSearch('Chat', 'PEOPLE');
        }, [openSearch]);
        return <Search />;
      }

      const host = await mount(<SearchFromChat />);
      expect(currentScreen).toBe('Search');

      const backBtn = host.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
      expect(backBtn).not.toBeNull();

      await act(async () => {
        backBtn.click();
      });
      expect(currentScreen).toBe('Chat');

      await act(async () => {
        mounted!.root.unmount();
      });
      mounted!.host.remove();
      mounted = null;

      function SearchWithoutFrom() {
        const { state, actions } = useApp();
        const { openSearch } = actions;
        currentScreen = state.screen;
        useEffect(() => {
          openSearch(undefined as unknown as string, 'PEOPLE');
        }, [openSearch]);
        return <Search />;
      }

      const fallbackHost = await mount(<SearchWithoutFrom />);
      expect(currentScreen).toBe('Search');

      const fallbackBackBtn = fallbackHost.querySelector(
        'button[aria-label="Back"]',
      ) as HTMLButtonElement;
      await act(async () => {
        fallbackBackBtn.click();
      });
      expect(currentScreen).toBe('Friends');
    });

    it('supports keyboard activation via Enter and Space keys', async () => {
      let currentScreen = '';
      let reopen: ((from: string, tab?: string) => void) | null = null;

      function SearchKeyboardHarness() {
        const { state, actions } = useApp();
        const { openSearch } = actions;
        currentScreen = state.screen;
        reopen = openSearch;
        useEffect(() => {
          openSearch('Inventory', 'PEOPLE');
        }, [openSearch]);
        return <Search />;
      }

      const host = await mount(<SearchKeyboardHarness />);
      const backBtn = host.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
      expect(backBtn).not.toBeNull();
      expect(currentScreen).toBe('Search');

      // Activate with Enter key
      await act(async () => {
        backBtn.focus();
        backBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });
      expect(currentScreen).toBe('Inventory');

      // Reopen Search from Radar and activate with Space key
      await act(async () => {
        reopen?.('Radar', 'PEOPLE');
      });
      expect(currentScreen).toBe('Search');

      await act(async () => {
        backBtn.focus();
        backBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });
      expect(currentScreen).toBe('Radar');
    });
  });

  describe('Search Screen Clear Control', () => {
    it('does not render clear button when query is empty', async () => {
      const host = await mount(<Search />);
      const clearBtn = host.querySelector('button[aria-label="Clear search input"]');
      expect(clearBtn).toBeNull();
    });

    it('renders TouchTarget button with accessible attributes and minimum 24x24 dimensions when query is present', async () => {
      function SearchWithQuery() {
        const { actions } = useApp();
        useEffect(() => {
          actions.setSearchQuery('test resident');
        }, [actions]);
        return <Search />;
      }

      const host = await mount(<SearchWithQuery />);
      const clearBtn = host.querySelector(
        'button[aria-label="Clear search input"]',
      ) as HTMLButtonElement;

      expect(clearBtn).not.toBeNull();
      expect(clearBtn.tagName).toBe('BUTTON');
      expect(clearBtn.type).toBe('button');
      expect(clearBtn.classList.contains('touch-target')).toBe(true);
      expect(clearBtn.getAttribute('aria-label')).toBe('Clear search input');
      expect(clearBtn.style.minWidth).toBe('24px');
      expect(clearBtn.style.minHeight).toBe('24px');

      const icon = clearBtn.querySelector('[aria-hidden="true"]');
      expect(icon).not.toBeNull();
    });

    it('clears query and moves focus directly to search input upon activation', async () => {
      const host = await mount(<Search />);
      const input = host.querySelector('input.search-input') as HTMLInputElement;
      expect(input).not.toBeNull();

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(input, 'resident');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const clearBtn = host.querySelector(
        'button[aria-label="Clear search input"]',
      ) as HTMLButtonElement;

      expect(input.value).toBe('resident');
      expect(clearBtn).not.toBeNull();

      await act(async () => {
        clearBtn.click();
      });

      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);
    });

    it('supports keyboard activation via Enter and Space keys', async () => {
      const host = await mount(<Search />);
      const input = host.querySelector('input.search-input') as HTMLInputElement;

      // Test Enter key
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(input, 'query one');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      let clearBtn = host.querySelector(
        'button[aria-label="Clear search input"]',
      ) as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();

      await act(async () => {
        clearBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);

      // Test Space key
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(input, 'query two');
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      clearBtn = host.querySelector('button[aria-label="Clear search input"]') as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();

      await act(async () => {
        clearBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });

      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);
    });
  });

  describe('Radar Screen Clear Control', () => {
    it('does not render clear button when query is empty', async () => {
      const host = await mount(<Radar />);
      const clearBtn = host.querySelector('button[aria-label="Clear search input"]');
      expect(clearBtn).toBeNull();
    });

    it('renders TouchTarget button with accessible attributes and minimum 24x24 dimensions when query is present', async () => {
      const host = await mount(<Radar />);
      const input = host.querySelector('input.search-input') as HTMLInputElement;
      expect(input).not.toBeNull();

      // Type into radar search input
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(input, 'parcel');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const clearBtn = host.querySelector(
        'button[aria-label="Clear search input"]',
      ) as HTMLButtonElement;

      expect(clearBtn).not.toBeNull();
      expect(clearBtn.tagName).toBe('BUTTON');
      expect(clearBtn.type).toBe('button');
      expect(clearBtn.classList.contains('touch-target')).toBe(true);
      expect(clearBtn.getAttribute('aria-label')).toBe('Clear search input');
      expect(clearBtn.style.minWidth).toBe('24px');
      expect(clearBtn.style.minHeight).toBe('24px');

      const icon = clearBtn.querySelector('[aria-hidden="true"]');
      expect(icon).not.toBeNull();
    });

    it('clears query and moves focus directly to radar search input upon activation', async () => {
      const host = await mount(<Radar />);
      const input = host.querySelector('input.search-input') as HTMLInputElement;
      expect(input).not.toBeNull();

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(input, 'parcel');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      const clearBtn = host.querySelector(
        'button[aria-label="Clear search input"]',
      ) as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();

      await act(async () => {
        clearBtn.click();
      });

      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);
    });

    it('supports keyboard activation via Enter and Space keys', async () => {
      const host = await mount(<Radar />);
      const input = host.querySelector('input.search-input') as HTMLInputElement;

      // Test Enter key
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(input, 'parcel enter');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      let clearBtn = host.querySelector(
        'button[aria-label="Clear search input"]',
      ) as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();

      await act(async () => {
        clearBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      });

      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);

      // Test Space key
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(input, 'parcel space');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      clearBtn = host.querySelector('button[aria-label="Clear search input"]') as HTMLButtonElement;
      expect(clearBtn).not.toBeNull();

      await act(async () => {
        clearBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });

      expect(input.value).toBe('');
      expect(document.activeElement).toBe(input);
    });
  });
});
