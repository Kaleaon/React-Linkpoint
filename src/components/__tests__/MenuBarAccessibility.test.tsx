// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import MenuBar from '../MenuBar.jsx';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root; getCtx: () => ReturnType<typeof useApp> } | null =
  null;

async function mountMenuBar() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let ctxRef: ReturnType<typeof useApp> | null = null;

  function Inspector() {
    ctxRef = useApp();
    return null;
  }

  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(ThemeProvider, null, createElement(Inspector), createElement(MenuBar)),
      ),
    );
  });

  await act(async () => {
    ctxRef!.actions.setDevice('desk');
  });

  mounted = { host, root, getCtx: () => ctxRef! };
  return { host, getCtx: () => ctxRef! };
}

function getTopTriggers(host: HTMLElement): HTMLElement[] {
  return Array.from(
    host.querySelectorAll<HTMLElement>('[role="menubar"] > div > [role="menuitem"]'),
  );
}

function getDropdownItems(host: HTMLElement): HTMLElement[] {
  return Array.from(host.querySelectorAll<HTMLElement>('nav [role="menu"] [role="menuitem"]'));
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

describe('MenuBar Roving Tabindex & Focus Indicators (WCAG 2.2 SC 2.1.1 & SC 2.4.7)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sets roving tabIndex on top menubar triggers (0 on active, -1 on inactive)', async () => {
    const { host } = await mountMenuBar();
    const triggers = getTopTriggers(host);
    expect(triggers.length).toBeGreaterThan(1);

    expect(triggers[0].getAttribute('tabindex')).toBe('0');
    for (let i = 1; i < triggers.length; i++) {
      expect(triggers[i].getAttribute('tabindex')).toBe('-1');
    }
  });

  it('updates top trigger roving tabIndex and focus on ArrowRight and ArrowLeft with wrap-around', async () => {
    const { host } = await mountMenuBar();
    const triggers = getTopTriggers(host);

    await act(async () => {
      triggers[0].focus();
    });
    expect(document.activeElement).toBe(triggers[0]);

    // ArrowRight moves focus and tabIndex=0 to Edit (index 1)
    await act(async () => {
      triggers[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(triggers[1]);
    expect(triggers[1].getAttribute('tabindex')).toBe('0');
    expect(triggers[0].getAttribute('tabindex')).toBe('-1');
    expect(triggers[2].getAttribute('tabindex')).toBe('-1');

    // ArrowLeft moves back to File (index 0)
    await act(async () => {
      triggers[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(document.activeElement).toBe(triggers[0]);
    expect(triggers[0].getAttribute('tabindex')).toBe('0');
    expect(triggers[1].getAttribute('tabindex')).toBe('-1');

    // ArrowLeft from index 0 wraps around to last trigger (Help)
    const lastIdx = triggers.length - 1;
    await act(async () => {
      triggers[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(document.activeElement).toBe(triggers[lastIdx]);
    expect(triggers[lastIdx].getAttribute('tabindex')).toBe('0');
    expect(triggers[0].getAttribute('tabindex')).toBe('-1');

    // ArrowRight from last trigger wraps around to index 0
    await act(async () => {
      triggers[lastIdx].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(triggers[0]);
    expect(triggers[0].getAttribute('tabindex')).toBe('0');
    expect(triggers[lastIdx].getAttribute('tabindex')).toBe('-1');
  });

  it('renders visible FocusRing indicator on focused top menubar triggers', async () => {
    const { host } = await mountMenuBar();
    const triggers = getTopTriggers(host);
    const fileTrigger = triggers[0];

    expect(fileTrigger.style.outline).toBe('');
    expect(fileTrigger.getAttribute('data-focused')).toBeNull();

    await act(async () => {
      fileTrigger.focus();
    });

    expect(fileTrigger.style.outline).toContain('solid');
    expect(fileTrigger.getAttribute('data-focused')).toBe('true');
    expect(fileTrigger.classList.contains('linkpoint-focused')).toBe(true);

    await act(async () => {
      fileTrigger.blur();
    });

    expect(fileTrigger.style.outline).toBe('');
    expect(fileTrigger.getAttribute('data-focused')).toBeNull();
  });

  it('sets roving tabIndex and visible focus highlight on dropdown items with ArrowDown and ArrowUp', async () => {
    const { host, getCtx } = await mountMenuBar();
    const triggers = getTopTriggers(host);

    // Open File menu via ArrowDown
    await act(async () => {
      triggers[0].focus();
      triggers[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(getCtx().state.menu).toBe('File');

    const items = getDropdownItems(host);
    expect(items.length).toBeGreaterThan(2);

    // First dropdown item is active (tabIndex=0) and focused with FocusRing + highlight background
    expect(document.activeElement).toBe(items[0]);
    expect(items[0].getAttribute('tabindex')).toBe('0');
    expect(items[0].style.outline).toContain('solid');
    expect(items[0].getAttribute('data-focused')).toBe('true');
    expect(items[0].style.background).not.toBe('transparent');
    expect(items[0].style.background).not.toBe('');

    for (let i = 1; i < items.length; i++) {
      expect(items[i].getAttribute('tabindex')).toBe('-1');
      expect(items[i].getAttribute('data-focused')).toBeNull();
      expect(items[i].style.background).toBe('transparent');
    }

    // ArrowDown moves roving tabIndex, FocusRing, and highlight to item 1
    await act(async () => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(document.activeElement).toBe(items[1]);
    expect(items[1].getAttribute('tabindex')).toBe('0');
    expect(items[1].style.outline).toContain('solid');
    expect(items[1].getAttribute('data-focused')).toBe('true');
    expect(items[1].style.background).not.toBe('transparent');

    expect(items[0].getAttribute('tabindex')).toBe('-1');
    expect(items[0].style.outline).toBe('');
    expect(items[0].getAttribute('data-focused')).toBeNull();
    expect(items[0].style.background).toBe('transparent');

    // ArrowUp moves back to item 0
    await act(async () => {
      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(document.activeElement).toBe(items[0]);
    expect(items[0].getAttribute('tabindex')).toBe('0');
    expect(items[1].getAttribute('tabindex')).toBe('-1');

    // ArrowUp from item 0 wraps to last item
    const lastItemIdx = items.length - 1;
    await act(async () => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(document.activeElement).toBe(items[lastItemIdx]);
    expect(items[lastItemIdx].getAttribute('tabindex')).toBe('0');
    expect(items[0].getAttribute('tabindex')).toBe('-1');
  });

  it('resets active dropdown item index to 0 when switching menus with ArrowRight or ArrowLeft', async () => {
    const { host, getCtx } = await mountMenuBar();
    const triggers = getTopTriggers(host);

    // Open File menu and navigate down to item index 2
    await act(async () => {
      triggers[0].focus();
      triggers[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    const fileItems = getDropdownItems(host);
    await act(async () => {
      fileItems[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await act(async () => {
      fileItems[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(fileItems[2].getAttribute('tabindex')).toBe('0');

    // Press ArrowRight inside open dropdown to switch to Edit menu
    await act(async () => {
      fileItems[2].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(getCtx().state.menu).toBe('Edit');

    const editItems = getDropdownItems(host);
    expect(editItems.length).toBeGreaterThan(1);
    expect(document.activeElement).toBe(editItems[0]);
    expect(editItems[0].getAttribute('tabindex')).toBe('0');
    expect(editItems[0].getAttribute('data-focused')).toBe('true');
    for (let i = 1; i < editItems.length; i++) {
      expect(editItems[i].getAttribute('tabindex')).toBe('-1');
    }
    expect(triggers[1].getAttribute('tabindex')).toBe('0');
    expect(triggers[0].getAttribute('tabindex')).toBe('-1');

    // Navigate down in Edit menu, then press ArrowLeft to return to File menu at index 0
    await act(async () => {
      editItems[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(editItems[1].getAttribute('tabindex')).toBe('0');

    await act(async () => {
      editItems[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(getCtx().state.menu).toBe('File');

    const reopenedFileItems = getDropdownItems(host);
    expect(document.activeElement).toBe(reopenedFileItems[0]);
    expect(reopenedFileItems[0].getAttribute('tabindex')).toBe('0');
    for (let i = 1; i < reopenedFileItems.length; i++) {
      expect(reopenedFileItems[i].getAttribute('tabindex')).toBe('-1');
    }
    expect(triggers[0].getAttribute('tabindex')).toBe('0');
  });

  it('closes dropdown on Escape and returns focus and roving tabIndex=0 to the top trigger', async () => {
    const { host, getCtx } = await mountMenuBar();
    const triggers = getTopTriggers(host);

    // Move to Edit trigger (index 1) and open dropdown
    await act(async () => {
      triggers[0].focus();
      triggers[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await act(async () => {
      triggers[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(getCtx().state.menu).toBe('Edit');

    const editItems = getDropdownItems(host);
    await act(async () => {
      editItems[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(editItems[1]);

    // Press Escape inside open dropdown
    await act(async () => {
      editItems[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(getCtx().state.menu).toBeNull();
    expect(host.querySelector('nav [role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(triggers[1]);
    expect(triggers[1].getAttribute('tabindex')).toBe('0');
    expect(triggers[1].getAttribute('data-focused')).toBe('true');
    expect(triggers[1].style.outline).toContain('solid');
    expect(triggers[0].getAttribute('tabindex')).toBe('-1');
  });

  it('preserves pointer click interactions and menu item actions', async () => {
    const { host, getCtx } = await mountMenuBar();
    const triggers = getTopTriggers(host);

    // Click Edit trigger
    await act(async () => {
      triggers[1].click();
    });
    expect(getCtx().state.menu).toBe('Edit');
    expect(triggers[1].getAttribute('tabindex')).toBe('0');

    // Click Appearance… item -> navigates to Outfits screen and closes menu
    const appearanceItem = getDropdownItems(host).find(
      (el) => el.getAttribute('aria-label') === 'Appearance…',
    );
    expect(appearanceItem).toBeDefined();

    await act(async () => {
      appearanceItem!.click();
    });

    expect(getCtx().state.menu).toBeNull();
    expect(getCtx().state.screen).toBe('Outfits');
  });

  it('supports Home, End, and Space keyboard navigation across triggers and dropdown items', async () => {
    const { host, getCtx } = await mountMenuBar();
    const triggers = getTopTriggers(host);
    const lastTriggerIdx = triggers.length - 1;

    await act(async () => {
      triggers[0].focus();
      triggers[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(triggers[lastTriggerIdx]);
    expect(triggers[lastTriggerIdx].getAttribute('tabindex')).toBe('0');
    expect(triggers[0].getAttribute('tabindex')).toBe('-1');

    await act(async () => {
      triggers[lastTriggerIdx].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(triggers[0]);
    expect(triggers[0].getAttribute('tabindex')).toBe('0');
    expect(triggers[lastTriggerIdx].getAttribute('tabindex')).toBe('-1');

    // Open Edit menu with Space and test End / Home / Space inside dropdown
    await act(async () => {
      triggers[1].focus();
      triggers[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(getCtx().state.menu).toBe('Edit');

    const editItems = getDropdownItems(host);
    const lastItemIdx = editItems.length - 1;
    expect(document.activeElement).toBe(editItems[0]);

    await act(async () => {
      editItems[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(editItems[lastItemIdx]);
    expect(editItems[lastItemIdx].getAttribute('tabindex')).toBe('0');
    expect(editItems[0].getAttribute('tabindex')).toBe('-1');

    await act(async () => {
      editItems[lastItemIdx].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(editItems[0]);
    expect(editItems[0].getAttribute('tabindex')).toBe('0');
    expect(editItems[lastItemIdx].getAttribute('tabindex')).toBe('-1');

    const appearanceItem = editItems.find((el) => el.getAttribute('aria-label') === 'Appearance…')!;
    await act(async () => {
      appearanceItem.focus();
      appearanceItem.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(getCtx().state.menu).toBeNull();
    expect(getCtx().state.screen).toBe('Outfits');
  });
});
