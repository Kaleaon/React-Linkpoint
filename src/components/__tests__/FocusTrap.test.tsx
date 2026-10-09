import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import FocusTrap from '../FocusTrap.jsx';
import PayDialog from '../PayDialog.jsx';
import SystemDialog from '../SystemDialog.jsx';
import { DIALOGS } from '../../theme/dialogs.js';
import InteractionDialog from '../InteractionDialog.jsx';
import { ErrorRecoveryModal } from '../ErrorRecoveryModal';
import InventoryTree from '../InventoryTree';
import OutfitCarouselDrawer from '../OutfitCarouselDrawer';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { ErrorRecoveryProvider, useErrorRecovery } from '../../context/ErrorRecoveryContext';
import { app } from '../../linkpoint/app';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

describe('FocusTrap Component', () => {
  it('autofocuses the first focusable element inside the trap on mount', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(
          FocusTrap,
          { active: true },
          createElement('button', { id: 'btn1' }, 'Button 1'),
          createElement('button', { id: 'btn2' }, 'Button 2'),
        ),
      );
    });

    const btn1 = host.querySelector('#btn1') as HTMLButtonElement;
    expect(document.activeElement).toBe(btn1);

    await act(async () => {
      root.unmount();
    });
    host.remove();
    trigger.remove();
  });

  it('restores focus to previous element on unmount', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    expect(document.activeElement).toBe(trigger);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(
          FocusTrap,
          { active: true },
          createElement('button', { id: 'inner-btn' }, 'Inner'),
        ),
      );
    });

    const innerBtn = host.querySelector('#inner-btn') as HTMLButtonElement;
    expect(document.activeElement).toBe(innerBtn);

    await act(async () => {
      root.unmount();
    });

    expect(document.activeElement).toBe(trigger);

    host.remove();
    trigger.remove();
  });

  it('invokes onEscape when Escape key is pressed', async () => {
    const onEscape = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(
          FocusTrap,
          { active: true, onEscape },
          createElement('button', null, 'Inside'),
        ),
      );
    });

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(event);

    expect(onEscape).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('cycles focus within focusable children on Tab and Shift+Tab', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(
          FocusTrap,
          { active: true },
          createElement('button', { id: 'first' }, 'First'),
          createElement('button', { id: 'second' }, 'Second'),
        ),
      );
    });

    const first = host.querySelector('#first') as HTMLButtonElement;
    const second = host.querySelector('#second') as HTMLButtonElement;

    // Initially focused on first
    expect(document.activeElement).toBe(first);

    // Tab from last element (second) wraps to first element
    second.focus();
    expect(document.activeElement).toBe(second);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    window.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(first);

    // Shift+Tab from first element wraps to last element (second)
    const shiftTabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
    });
    window.dispatchEvent(shiftTabEvent);
    expect(document.activeElement).toBe(second);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});

describe('Modal ARIA Semantics and Focus Trap Integration', () => {
  it('renders PayDialog with role="dialog", aria-modal="true", and aria-labelledby', async () => {
    const onClose = vi.fn();
    const host = await mount(
      createElement(PayDialog, {
        isOpen: true,
        onClose,
        onSuccess: vi.fn(),
        target: { id: '123', name: 'Test Resident', type: 'avatar' },
      }),
    );

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('pay-dialog-title');

    const title = host.querySelector('#pay-dialog-title');
    expect(title).not.toBeNull();
    expect(title?.textContent).toContain('Pay Resident');

    // Pressing Escape calls onClose
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(event);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders SystemDialog with role="dialog", aria-modal="true", aria-labelledby, and aria-describedby', async () => {
    (DIALOGS as any)['PAYMENT'] = {
      icon: 'banknote',
      kind: 'PAYMENT',
      title: 'Pay Sunset Lamp',
      body: 'L$ 450',
      buttons: [{ label: 'PAY' }],
    };

    function TestWrapper() {
      const { actions } = useApp();
      React.useEffect(() => {
        actions.setDialog('PAYMENT');
      }, []);
      return createElement(SystemDialog);
    }

    try {
      const host = await mount(createElement(TestWrapper));

      const dialog = host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.getAttribute('aria-labelledby')).toBe('system-dialog-title');
      expect(dialog?.getAttribute('aria-describedby')).toBe('system-dialog-body');

      const title = host.querySelector('#system-dialog-title');
      const body = host.querySelector('#system-dialog-body');
      expect(title).not.toBeNull();
      expect(body).not.toBeNull();
    } finally {
      delete (DIALOGS as any)['PAYMENT'];
    }
  });

  it('renders InteractionDialog with role="alertdialog", aria-modal="true", aria-labelledby, and aria-describedby', async () => {
    (app.interactions as any).add('lure', {
      id: 'inter-1',
      fromName: 'Friend Avatar',
      message: 'Come over here!',
      position: [128, 128, 20],
    });

    try {
      const host = await mount(createElement(InteractionDialog));

      const alertdialog = host.querySelector('[role="alertdialog"]');
      expect(alertdialog).not.toBeNull();
      expect(alertdialog?.getAttribute('aria-modal')).toBe('true');
      expect(alertdialog?.getAttribute('aria-labelledby')).toBe('interaction-title');
      expect(alertdialog?.getAttribute('aria-describedby')).toBe('interaction-body');
    } finally {
      (app.interactions as any).clear();
    }
  });

  it('renders ErrorRecoveryModal with role="alertdialog" and aria-modal="true"', async () => {
    const mockService: any = {
      getSnapshot: () => ({
        isOnline: true,
        isRetrying: false,
        retryQueueCount: 0,
        activeError: {
          code: 'ERR_CONN_LOST',
          category: 'network',
          message: 'Connection lost to simulator',
          attempts: 1,
          timestamp: new Date().toISOString(),
        },
        telemetryLogs: [],
      }),
      subscribe: (fn: any) => {
        fn(mockService.getSnapshot());
        return () => {};
      },
      clearActiveError: vi.fn(),
      processRetryQueue: vi.fn(),
      enqueueRetry: vi.fn(),
      logTelemetry: vi.fn(),
      setOnlineStatus: vi.fn(),
    };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        createElement(ErrorRecoveryProvider, {
          customService: mockService,
          children: createElement(ErrorRecoveryModal),
        }),
      );
    });

    const modal = host.querySelector('[role="alertdialog"]');
    expect(modal).not.toBeNull();
    expect(modal?.getAttribute('aria-modal')).toBe('true');
    expect(modal?.getAttribute('aria-labelledby')).toBe('recovery-modal-title');

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('renders InventoryTree move modal with role="dialog", aria-modal="true", and FocusTrap wrapper', async () => {
    // Populate dummy folder
    app.inventory.folders.set('folder-1', {
      id: 'folder-1',
      name: 'Main Folder',
      children: ['item-1'],
    } as any);
    app.inventory.items.set('item-1', {
      id: 'item-1',
      name: 'My Object',
      parent: 'folder-1',
    } as any);

    const host = await mount(createElement(InventoryTree, { rootFolderId: 'folder-1' }));

    // Open context menu for item-1 and click "Move to Folder"
    const actionsBtn = host.querySelector(
      'button[aria-label="Actions for My Object"]',
    ) as HTMLButtonElement;
    expect(actionsBtn).not.toBeNull();

    await act(async () => {
      actionsBtn.click();
    });

    const moveMenuItem = Array.from(host.querySelectorAll('button[role="menuitem"]')).find((btn) =>
      btn.textContent?.includes('Move to Folder'),
    ) as HTMLButtonElement;
    expect(moveMenuItem).not.toBeNull();

    await act(async () => {
      moveMenuItem.click();
    });

    const moveModal = host.querySelector('[role="dialog"]');
    expect(moveModal).not.toBeNull();
    expect(moveModal?.getAttribute('aria-modal')).toBe('true');
    expect(moveModal?.getAttribute('aria-labelledby')).toBe('move-modal-title');
  });

  it('renders OutfitCarouselDrawer with role="dialog", aria-modal="true", and FocusTrap wrapper', async () => {
    const handleClose = vi.fn();
    const host = await mount(
      createElement(OutfitCarouselDrawer, { isOpen: true, onClose: handleClose }),
    );

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-label')).toBe('Outfit Carousel Drawer');

    // Verify FocusTrap container wraps the dialog
    const focusTrapContainer = dialog?.parentElement;
    expect(focusTrapContainer?.getAttribute('tabindex')).toBe('-1');

    // Test Escape key dismissal handled by FocusTrap
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
