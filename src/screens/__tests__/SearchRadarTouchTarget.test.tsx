import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app';
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

  describe('Radar Spatial Blips and List Rows Accessibility (WCAG 2.1.1, 2.5.8, 4.1.2)', () => {
    let origNearbyUsers: typeof app.world.nearbyUsers;
    let origObjects: typeof app.world.objects;

    beforeEach(() => {
      origNearbyUsers = [...app.world.nearbyUsers];
      origObjects = [...app.world.objects];

      app.world.nearbyUsers = [
        {
          id: 'av-1',
          name: 'Alice Resident',
          distance: 12.4,
          bearing: 45,
          position: [128, 136, 25],
        },
        {
          id: 'av-2',
          name: 'Bob Builder',
          distance: 34.8,
          bearing: 180,
          position: [128, 93, 25],
        },
      ] as unknown as typeof app.world.nearbyUsers;

      app.world.objects = [
        {
          id: 'obj-1',
          name: 'Signal Beacon',
          distance: 18.2,
          bearing: 90,
          prims: 4,
          parcel: 'Plaza',
        },
        {
          id: 'obj-2',
          name: 'Cyber HUD',
          distance: 8.6,
          bearing: 270,
          isAttachment: true,
          attachedTo: 'Alice Resident',
          attachmentPoint: 'Chest',
        },
      ] as unknown as typeof app.world.objects;
    });

    afterEach(() => {
      app.world.nearbyUsers = origNearbyUsers;
      app.world.objects = origObjects;
    });

    it('renders spatial radar blips as minimum 24x24px TouchTarget buttons with accessible labels and visual markers', async () => {
      const host = await mount(<Radar />);

      const aliceBlip = host.querySelector(
        'button.touch-target[aria-label="Alice Resident (12m, NE)"]',
      ) as HTMLButtonElement;
      const bobBlip = host.querySelector(
        'button.touch-target[aria-label="Bob Builder (35m, S)"]',
      ) as HTMLButtonElement;

      expect(aliceBlip).not.toBeNull();
      expect(bobBlip).not.toBeNull();

      for (const blip of [aliceBlip, bobBlip]) {
        expect(blip.tagName).toBe('BUTTON');
        expect(blip.type).toBe('button');
        expect(blip.classList.contains('touch-target')).toBe(true);
        expect(parseInt(blip.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
        expect(parseInt(blip.style.minHeight, 10)).toBeGreaterThanOrEqual(24);
        expect(parseInt(blip.style.width, 10)).toBeGreaterThanOrEqual(24);
        expect(parseInt(blip.style.height, 10)).toBeGreaterThanOrEqual(24);
        expect(blip.getAttribute('aria-pressed')).toBe('false');

        const dot = blip.querySelector('span[aria-hidden="true"]') as HTMLElement;
        expect(dot).not.toBeNull();
        expect(dot.style.width).toBe('7px');
        expect(dot.style.height).toBe('7px');
      }

      expect(aliceBlip.style.outline).toBe('');
      await act(async () => {
        aliceBlip.focus();
      });
      expect(aliceBlip.style.outline).toContain('2px solid');
      expect(aliceBlip.getAttribute('data-focused')).toBe('true');

      await act(async () => {
        aliceBlip.blur();
      });
      expect(aliceBlip.style.outline).toBe('');
    });

    it('activates spatial radar blips via Enter and Space keys and updates aria-pressed and visual dot size', async () => {
      const host = await mount(<Radar />);

      const aliceBlip = host.querySelector(
        'button.touch-target[aria-label="Alice Resident (12m, NE)"]',
      ) as HTMLButtonElement;
      const bobBlip = host.querySelector(
        'button.touch-target[aria-label="Bob Builder (35m, S)"]',
      ) as HTMLButtonElement;

      expect(aliceBlip).not.toBeNull();
      expect(bobBlip).not.toBeNull();

      // Activate Alice blip via Enter key
      let enterEvent: KeyboardEvent | null = null;
      await act(async () => {
        enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        });
        aliceBlip.dispatchEvent(enterEvent);
      });

      expect(enterEvent!.defaultPrevented).toBe(true);
      expect(aliceBlip.getAttribute('aria-pressed')).toBe('true');
      expect(bobBlip.getAttribute('aria-pressed')).toBe('false');

      const aliceDot = aliceBlip.querySelector('span[aria-hidden="true"]') as HTMLElement;
      expect(aliceDot.style.width).toBe('11px');
      expect(aliceDot.style.height).toBe('11px');
      expect(host.textContent).toContain('PROFILE');

      // Activate Bob blip via Space key
      let spaceEvent: KeyboardEvent | null = null;
      await act(async () => {
        spaceEvent = new KeyboardEvent('keydown', {
          key: ' ',
          bubbles: true,
          cancelable: true,
        });
        bobBlip.dispatchEvent(spaceEvent);
      });

      expect(spaceEvent!.defaultPrevented).toBe(true);
      expect(bobBlip.getAttribute('aria-pressed')).toBe('true');
      expect(aliceBlip.getAttribute('aria-pressed')).toBe('false');
      expect(aliceDot.style.width).toBe('7px');
    });

    it('renders radar list rows with role="button", tabIndex=0, aria-label, minimum 24px sizing, and focus indicator', async () => {
      const host = await mount(<Radar />);

      const rows = Array.from(host.querySelectorAll('.radar-list-row')) as HTMLElement[];
      expect(rows.length).toBe(2);

      const [aliceRow, bobRow] = rows;
      expect(aliceRow.getAttribute('role')).toBe('button');
      expect(aliceRow.tabIndex).toBe(0);
      expect(aliceRow.getAttribute('aria-label')).toBe('Alice Resident (12m, NE)');
      expect(aliceRow.getAttribute('aria-pressed')).toBe('false');
      expect(parseInt(aliceRow.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
      expect(parseInt(aliceRow.style.minHeight, 10)).toBeGreaterThanOrEqual(24);

      expect(bobRow.getAttribute('role')).toBe('button');
      expect(bobRow.tabIndex).toBe(0);
      expect(bobRow.getAttribute('aria-label')).toBe('Bob Builder (35m, S)');
      expect(bobRow.getAttribute('aria-pressed')).toBe('false');

      // Verify accessible focus ring appears on keyboard focus and clears on blur
      expect(aliceRow.style.outline).toBe('');
      await act(async () => {
        aliceRow.focus();
      });
      expect(aliceRow.style.outline).toContain('2px solid');
      expect(aliceRow.style.outlineOffset).toBe('-2px');
      expect(aliceRow.getAttribute('data-focused')).toBe('true');

      await act(async () => {
        aliceRow.blur();
      });
      expect(aliceRow.style.outline).toBe('');
      expect(aliceRow.getAttribute('data-focused')).toBeNull();
    });

    it('activates radar list rows via Enter and Space keys to toggle selection and expanded actions', async () => {
      const host = await mount(<Radar />);

      const rows = Array.from(host.querySelectorAll('.radar-list-row')) as HTMLElement[];
      const [aliceRow, bobRow] = rows;

      // Press Enter on Alice row to expand actions
      let enterEvent: KeyboardEvent | null = null;
      await act(async () => {
        enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        });
        aliceRow.dispatchEvent(enterEvent);
      });

      expect(enterEvent!.defaultPrevented).toBe(true);
      expect(aliceRow.getAttribute('aria-pressed')).toBe('true');
      expect(host.textContent).toContain('PROFILE');
      expect(host.textContent).toContain('MESSAGE');

      // Press Space on Alice row to collapse actions
      let spaceCollapseEvent: KeyboardEvent | null = null;
      await act(async () => {
        spaceCollapseEvent = new KeyboardEvent('keydown', {
          key: ' ',
          bubbles: true,
          cancelable: true,
        });
        aliceRow.dispatchEvent(spaceCollapseEvent);
      });

      expect(spaceCollapseEvent!.defaultPrevented).toBe(true);
      expect(aliceRow.getAttribute('aria-pressed')).toBe('false');
      expect(host.textContent).not.toContain('MESSAGE');

      // Press Space on Bob row to select Bob
      await act(async () => {
        bobRow.dispatchEvent(
          new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
        );
      });

      expect(bobRow.getAttribute('aria-pressed')).toBe('true');
      expect(host.textContent).toContain('MESSAGE');
    });

    it('renders accessible blips and list rows in OBJECT radar mode', async () => {
      function ObjectRadarHarness() {
        const { actions } = useApp();
        useEffect(() => {
          actions.setRMode('OBJ');
        }, [actions]);
        return <Radar />;
      }

      const host = await mount(<ObjectRadarHarness />);

      const beaconBlip = host.querySelector(
        'button.touch-target[aria-label="Signal Beacon (18m, E)"]',
      ) as HTMLButtonElement;
      const hudBlip = host.querySelector(
        'button.touch-target[aria-label="Cyber HUD (9m, W)"]',
      ) as HTMLButtonElement;

      expect(beaconBlip).not.toBeNull();
      expect(hudBlip).not.toBeNull();
      expect(parseInt(beaconBlip.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
      expect(parseInt(beaconBlip.style.minHeight, 10)).toBeGreaterThanOrEqual(24);

      const beaconRow = Array.from(host.querySelectorAll('.radar-list-row')).find(
        (el) => el.getAttribute('aria-label') === 'Signal Beacon (18m, E)',
      ) as HTMLElement;
      expect(beaconRow).toBeDefined();

      await act(async () => {
        beaconRow.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
      });

      expect(beaconRow.getAttribute('aria-pressed')).toBe('true');
      expect(beaconBlip.getAttribute('aria-pressed')).toBe('true');
      expect(host.textContent).toContain('CAM TO OBJECT');
    });
  });
});
