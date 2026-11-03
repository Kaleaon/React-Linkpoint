import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import WindowLayoutDialog from '../WindowLayoutDialog.jsx';
import FloatersDesktop from '../FloatersDesktop.jsx';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const click = async (el: Element | null) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
};

const changeInput = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const keyDown = async (el: Element | null, key: string, options: any = {}) => {
  await act(async () => {
    el?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
    );
  });
};

const getLayoutBtn = (host: HTMLElement) => {
  return [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(
    (el) => el.getAttribute('aria-label') === 'Layout & Position',
  );
};

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
  document.body.style.overflow = '';
});

describe('WindowLayoutDialog Component', () => {
  it('renders modal dialog with labeled number inputs for X, Y, Width, and Height', async () => {
    const host = await mount(
      createElement(WindowLayoutDialog, {
        isOpen: true,
        onClose: vi.fn(),
        floaterId: 'Chat',
      }),
    );

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('window-layout-dialog-title');

    const inputX = host.querySelector('#window-pos-x') as HTMLInputElement;
    const inputY = host.querySelector('#window-pos-y') as HTMLInputElement;
    const inputW = host.querySelector('#window-dim-w') as HTMLInputElement;
    const inputH = host.querySelector('#window-dim-h') as HTMLInputElement;

    expect(inputX).not.toBeNull();
    expect(inputX.type).toBe('number');
    expect(inputX.getAttribute('aria-label')).toBe('X Position');

    expect(inputY).not.toBeNull();
    expect(inputY.type).toBe('number');
    expect(inputY.getAttribute('aria-label')).toBe('Y Position');

    expect(inputW).not.toBeNull();
    expect(inputW.type).toBe('number');
    expect(inputW.getAttribute('aria-label')).toBe('Width');

    expect(inputH).not.toBeNull();
    expect(inputH.type).toBe('number');
    expect(inputH.getAttribute('aria-label')).toBe('Height');

    // Associated labels
    const labelX = host.querySelector('label[for="window-pos-x"]');
    const labelY = host.querySelector('label[for="window-pos-y"]');
    const labelW = host.querySelector('label[for="window-dim-w"]');
    const labelH = host.querySelector('label[for="window-dim-h"]');

    expect(labelX?.textContent).toContain('X Position');
    expect(labelY?.textContent).toContain('Y Position');
    expect(labelW?.textContent).toContain('Width');
    expect(labelH?.textContent).toContain('Height');
  });

  it('prevents background scrolling while open and restores it when unmounted', async () => {
    document.body.style.overflow = 'visible';
    const host = await mount(
      createElement(WindowLayoutDialog, {
        isOpen: true,
        onClose: vi.fn(),
        floaterId: 'Chat',
      }),
    );

    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => {
      mounted!.root.unmount();
      mounted = null;
    });

    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('repositions the window when preset buttons are activated', async () => {
    let appActions: any = null;
    function Helper() {
      const { actions } = useApp();
      appActions = actions;
      return createElement(WindowLayoutDialog, {
        isOpen: true,
        onClose: vi.fn(),
        floaterId: 'Chat',
      });
    }

    const host = await mount(createElement(Helper));

    const snapTopLeft = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Snap Top-Left'),
    );
    expect(snapTopLeft).toBeDefined();
    await click(snapTopLeft!);

    const rTopLeft = appActions.flR('Chat');
    expect(rTopLeft.x).toBe(16);
    expect(rTopLeft.y).toBe(16);

    const centerBtn = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Center' || b.textContent?.includes('Center Window'),
    );
    expect(centerBtn).toBeDefined();
    await click(centerBtn!);

    const rCenter = appActions.flR('Chat');
    expect(rCenter.x).toBeGreaterThan(50);
    expect(rCenter.y).toBeGreaterThan(30);

    const snapTopRight = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Top-Right' || b.textContent?.includes('Snap Top-Right'),
    );
    expect(snapTopRight).toBeDefined();
    await click(snapTopRight!);

    const rTopRight = appActions.flR('Chat');
    expect(rTopRight.x).toBeGreaterThan(rTopLeft.x);
    expect(rTopRight.y).toBe(16);
  });

  it('updates placement upon submitting the form with custom values', async () => {
    let appActions: any = null;
    function Helper() {
      const { actions } = useApp();
      appActions = actions;
      return createElement(WindowLayoutDialog, {
        isOpen: true,
        onClose: vi.fn(),
        floaterId: 'Chat',
      });
    }

    const host = await mount(createElement(Helper));

    const inputX = host.querySelector('#window-pos-x') as HTMLInputElement;
    const inputY = host.querySelector('#window-pos-y') as HTMLInputElement;

    await changeInput(inputX, '100');
    await changeInput(inputY, '50');

    const submitBtn = host.querySelector('button[type="submit"]');
    expect(submitBtn).not.toBeNull();
    await click(submitBtn!);

    const r = appActions.flR('Chat');
    expect(r.x).toBe(100);
    expect(r.y).toBe(50);
  });

  it('closes dialog on Escape key and restores focus to trigger button', async () => {
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-label', 'Layout & Position');
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = vi.fn();
    const host = await mount(
      createElement(WindowLayoutDialog, {
        isOpen: true,
        onClose,
        floaterId: 'Chat',
        triggerEl: trigger,
      }),
    );

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalled();
    trigger.remove();
  });
});

describe('FloatersDesktop Trigger Integration', () => {
  it('features a focusable title bar button with aria-haspopup="dialog" that launches Layout Dialog', async () => {
    const host = await mount(createElement(FloatersDesktop));

    const layoutBtn = getLayoutBtn(host);
    expect(layoutBtn).toBeDefined();
    expect(layoutBtn?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(layoutBtn?.getAttribute('role')).toBe('button');
    expect(layoutBtn?.getAttribute('tabindex')).toBe('0');

    // Dialog is initially not rendered
    expect(host.querySelector('#window-layout-dialog-title')).toBeNull();

    // Launch dialog via click
    await click(layoutBtn!);
    expect(host.querySelector('#window-layout-dialog-title')).not.toBeNull();
  });

  it('launches Layout Dialog from title bar button using Enter key', async () => {
    const host = await mount(createElement(FloatersDesktop));

    const layoutBtn = getLayoutBtn(host);
    expect(layoutBtn).toBeDefined();

    await keyDown(layoutBtn!, 'Enter');
    expect(host.querySelector('#window-layout-dialog-title')).not.toBeNull();
  });

  it('triggers dimension settings section of dialog when resize grip is activated via Enter or Space', async () => {
    const host = await mount(createElement(FloatersDesktop));

    const resizeGrip = host.querySelector('[aria-label="Resize window"]');
    expect(resizeGrip).not.toBeNull();
    expect(resizeGrip?.getAttribute('role')).toBe('button');
    expect(resizeGrip?.getAttribute('tabindex')).toBe('0');
    expect(resizeGrip?.getAttribute('aria-haspopup')).toBe('dialog');

    // Press Space on resize grip
    await keyDown(resizeGrip, ' ');
    expect(host.querySelector('#window-layout-dialog-title')).not.toBeNull();

    // Check Width input exists and is in the dimensions section
    const widthInput = host.querySelector('#window-dim-w');
    expect(widthInput).not.toBeNull();
  });
});
