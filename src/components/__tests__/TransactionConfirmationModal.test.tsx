import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { economyService } from '../../services/EconomyService';
import { computeTheme } from '../../theme/computeTheme.js';
import TransactionConfirmationModal from '../TransactionConfirmationModal';
import {
  mountScreen,
  unmount,
  click,
  buttonByText,
  Mounted,
} from '../../linkpoint/__tests__/ui-helpers';

function normalizeCssColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  return probe.style.color;
}

describe('TransactionConfirmationModal Component', () => {
  let mounted: Mounted | null = null;

  beforeEach(() => {
    economyService.clearQueue('Cleanup');
    economyService.setAutoApprove(false);
  });

  afterEach(async () => {
    economyService.clearQueue('Cleanup');
    if (mounted) {
      await unmount(mounted);
      mounted = null;
    }
  });

  it('renders nothing when there are no pending requests', async () => {
    mounted = await mountScreen(TransactionConfirmationModal);
    const dialog = mounted.host.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('renders modal with summary details when a request is queued', async () => {
    mounted = await mountScreen(TransactionConfirmationModal);

    const executeSpy = vi.fn().mockResolvedValue({ id: 'tx-modal-1', status: 'success' });

    // Queue request inside act
    let pendingPromise: Promise<any> = null as any;
    await act(async () => {
      pendingPromise = economyService.interceptPay({
        params: {
          targetId: 'avatar-uuid-123',
          targetName: 'Aimee Resident',
          amount: 150,
          description: 'Tip for DJ performance',
        },
        targetType: 'avatar',
        currencySymbol: 'L$',
        currentBalance: 500,
        execute: executeSpy,
      });
      pendingPromise.catch(() => {});
    });

    const dialog = mounted.host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');

    // Check summary fields
    expect(mounted.host.textContent).toContain('Aimee Resident');
    expect(mounted.host.textContent).toContain('avatar');
    expect(mounted.host.textContent).toContain('L$ 150');
    expect(mounted.host.textContent).toContain('Tip for DJ performance');
    expect(mounted.host.textContent).toContain('L$ 500'); // Current balance
    expect(mounted.host.textContent).toContain('L$ 350'); // Expected remaining balance

    // Clean up
    await act(async () => {
      economyService.cancelTransaction(economyService.getPendingRequests()[0].id);
    });
    await expect(pendingPromise).rejects.toThrow();
  });

  it('resolves payment when user clicks "Approve Payment"', async () => {
    mounted = await mountScreen(TransactionConfirmationModal);

    const executeSpy = vi.fn().mockResolvedValue({ id: 'tx-approved', status: 'success' });

    let payPromise: Promise<any> = null as any;
    await act(async () => {
      payPromise = economyService.interceptPay({
        params: {
          targetId: 'obj-99',
          targetName: 'Vendor Object',
          amount: 200,
          description: 'Purchase mesh clothing',
        },
        targetType: 'object',
        currencySymbol: 'L$',
        currentBalance: 1000,
        execute: executeSpy,
      });
    });

    const approveButton = buttonByText(mounted.host, 'Approve Payment');
    expect(approveButton).toBeDefined();

    await click(approveButton);

    const res = await payPromise;
    expect(res).toEqual({ id: 'tx-approved', status: 'success' });
    expect(executeSpy).toHaveBeenCalledOnce();

    // Modal closes upon approval
    const dialog = mounted.host.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('rejects payment with "Transaction cancelled by user" when user clicks "Cancel Payment"', async () => {
    mounted = await mountScreen(TransactionConfirmationModal);

    const executeSpy = vi.fn();

    let payPromise: Promise<any> = null as any;
    await act(async () => {
      payPromise = economyService.interceptPay({
        params: {
          targetId: 'avatar-cancel',
          targetName: 'Declined Resident',
          amount: 50,
        },
        targetType: 'avatar',
        currencySymbol: 'L$',
        currentBalance: 300,
        execute: executeSpy,
      });
      payPromise.catch(() => {});
    });

    const cancelButton = buttonByText(mounted.host, 'Cancel Payment');
    expect(cancelButton).toBeDefined();

    await click(cancelButton);

    await expect(payPromise).rejects.toThrow('Transaction cancelled by user');
    expect(executeSpy).not.toHaveBeenCalled();

    // Modal closes
    const dialog = mounted.host.querySelector('[role="dialog"]');
    expect(dialog).toBeNull();
  });

  it('handles Escape key to cancel transaction', async () => {
    mounted = await mountScreen(TransactionConfirmationModal);

    const executeSpy = vi.fn();

    let payPromise: Promise<any> = null as any;
    await act(async () => {
      payPromise = economyService.interceptPay({
        params: {
          targetId: 'obj-escape',
          targetName: 'Escape Vendor',
          amount: 25,
        },
        targetType: 'object',
        currencySymbol: 'L$',
        currentBalance: 100,
        execute: executeSpy,
      });
      payPromise.catch(() => {});
    });

    // Trigger Escape key
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    await expect(payPromise).rejects.toThrow('Transaction cancelled by user');
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('contains zero hardcoded hex color values in TransactionConfirmationModal.tsx', () => {
    const filePath = path.resolve(__dirname, '../TransactionConfirmationModal.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const matches = content.match(hexPattern) || [];
    expect(
      matches,
      `TransactionConfirmationModal.tsx contains hardcoded hex colors: ${matches.join(', ')}`,
    ).toEqual([]);
  });

  it('binds ThemeContext V and t tokens across dark and light palettes and layout scales', async () => {
    mounted = await mountScreen(TransactionConfirmationModal);

    let pendingPromise!: Promise<unknown>;
    await act(async () => {
      pendingPromise = economyService.interceptPay({
        params: {
          targetId: 'avatar-theme-1',
          targetName: 'Theme Resident',
          amount: 120,
          description: 'Theme token verification',
        },
        targetType: 'avatar',
        currencySymbol: 'L$',
        currentBalance: 400,
        execute: vi.fn(),
      });
      pendingPromise.catch(() => {});
    });

    const getResolvedTheme = () =>
      computeTheme(mounted!.ctx.current.state, mounted!.ctx.current.actions.cf);

    // Default theme ('terminal' / 'ink')
    const initialTheme = getResolvedTheme();
    const dialog = mounted.host.querySelector('[role="dialog"]') as HTMLElement;
    const header = mounted.host.querySelector('.tx-confirmation-header') as HTMLElement;
    const detailsCard = mounted.host.querySelector('.tx-confirmation-details') as HTMLElement;
    const title = mounted.host.querySelector('#tx-confirmation-title') as HTMLElement;
    const remainingEl = mounted.host.querySelector(
      '[data-testid="expected-remaining-balance"]',
    ) as HTMLElement;
    const cancelBtn = buttonByText(mounted.host, 'Cancel Payment') as HTMLButtonElement;
    const approveBtn = buttonByText(mounted.host, 'Approve Payment') as HTMLButtonElement;
    const closeBtn = mounted.host.querySelector(
      'button[aria-label="Cancel transaction"]',
    ) as HTMLButtonElement;

    expect(dialog.style.backgroundColor).toBe(normalizeCssColor(initialTheme.V.surf));
    expect(dialog.style.color).toBe(normalizeCssColor(initialTheme.V.ink));
    expect(dialog.style.borderRadius).toBe(initialTheme.V.rl);
    expect(dialog.style.borderColor).toBe(normalizeCssColor(initialTheme.V.outv));
    expect(header.style.backgroundColor).toBe(normalizeCssColor(initialTheme.V.surf2));
    expect(detailsCard.style.backgroundColor).toBe(normalizeCssColor(initialTheme.V.surf2));
    expect(detailsCard.style.borderRadius).toBe(initialTheme.V.rp);
    expect(title.style.color).toBe(normalizeCssColor(initialTheme.V.ink));
    expect(remainingEl.style.color).toBe(normalizeCssColor(initialTheme.V.ok));
    expect(cancelBtn.style.borderRadius).toBe(initialTheme.V.rs);
    expect(approveBtn.style.borderRadius).toBe(initialTheme.V.rs);
    expect(approveBtn.style.backgroundColor).toBe(normalizeCssColor(initialTheme.V.pri));
    expect(approveBtn.style.color).toBe(normalizeCssColor(initialTheme.V.onpri));
    expect(closeBtn.style.borderRadius).toBe(initialTheme.V.rs);

    // Switch dynamically to a light palette ('paper') and pill layout ('lcars')
    await act(async () => {
      mounted!.ctx.current.actions.setPalette('paper');
      mounted!.ctx.current.actions.setLayout('lcars');
    });

    const updatedTheme = getResolvedTheme();
    expect(dialog.style.backgroundColor).toBe(normalizeCssColor(updatedTheme.V.surf));
    expect(dialog.style.color).toBe(normalizeCssColor(updatedTheme.V.ink));
    expect(dialog.style.borderRadius).toBe(updatedTheme.V.rl);
    expect(header.style.backgroundColor).toBe(normalizeCssColor(updatedTheme.V.surf2));
    expect(detailsCard.style.backgroundColor).toBe(normalizeCssColor(updatedTheme.V.surf2));
    expect(detailsCard.style.borderRadius).toBe(updatedTheme.V.rp);
    expect(cancelBtn.style.borderRadius).toBe(updatedTheme.V.rs);
    expect(approveBtn.style.borderRadius).toBe(updatedTheme.V.rs);
    expect(approveBtn.style.backgroundColor).toBe(normalizeCssColor(updatedTheme.V.pri));

    await act(async () => {
      economyService.cancelTransaction(economyService.getPendingRequests()[0].id);
    });
    await expect(pendingPromise).rejects.toThrow();
  });

  it('renders negative expected remaining balance and error alerts in V.err', async () => {
    mounted = await mountScreen(TransactionConfirmationModal);

    let pendingPromise!: Promise<unknown>;
    await act(async () => {
      pendingPromise = economyService.interceptPay({
        params: {
          targetId: 'obj-overdraft',
          targetName: 'Luxury Vendor',
          amount: 250,
        },
        targetType: 'object',
        currencySymbol: 'L$',
        currentBalance: 100,
        execute: vi.fn(),
      });
      pendingPromise.catch(() => {});
      const [queued] = economyService.getPendingRequests();
      economyService.emit('queue_updated', [{ ...queued, expectedRemainingBalance: -150 }]);
    });

    const theme = computeTheme(mounted.ctx.current.state, mounted.ctx.current.actions.cf);
    const remainingEl = mounted.host.querySelector(
      '[data-testid="expected-remaining-balance"]',
    ) as HTMLElement;
    expect(remainingEl.textContent).toBe('L$ -150');
    expect(remainingEl.style.color).toBe(normalizeCssColor(theme.V.err));

    // Trigger failed approval while keeping request visible to render error alert banner
    const approveSpy = vi
      .spyOn(economyService, 'approveTransaction')
      .mockRejectedValueOnce(new Error('Insufficient simulator funds'));

    const approveBtn = buttonByText(mounted.host, 'Approve Payment') as HTMLButtonElement;
    await click(approveBtn);
    expect(approveSpy).toHaveBeenCalledOnce();

    const alertEl = mounted.host.querySelector('[role="alert"]') as HTMLElement;
    expect(alertEl).not.toBeNull();
    expect(alertEl.textContent).toContain('Insufficient simulator funds');
    expect(alertEl.style.color).toBe(normalizeCssColor(theme.V.err));
    expect(alertEl.style.borderColor).toBe(normalizeCssColor(theme.V.err));

    approveSpy.mockRestore();
    await act(async () => {
      economyService.cancelTransaction(economyService.getPendingRequests()[0].id);
    });
  });

  it('renders FocusRing indicators, keyboard activation, and distinct pending processing disabled styles via AccessibleButton', async () => {
    mounted = await mountScreen(TransactionConfirmationModal);

    let pendingPromise!: Promise<unknown>;
    await act(async () => {
      pendingPromise = economyService.interceptPay({
        params: {
          targetId: 'avatar-a11y',
          targetName: 'Accessible Resident',
          amount: 75,
        },
        targetType: 'avatar',
        currencySymbol: 'L$',
        currentBalance: 300,
        execute: vi.fn().mockResolvedValue({ id: 'tx-a11y-done', status: 'success' }),
      });
      pendingPromise.catch(() => {});
    });

    const theme = computeTheme(mounted.ctx.current.state, mounted.ctx.current.actions.cf);
    const closeBtn = mounted.host.querySelector(
      'button[aria-label="Cancel transaction"]',
    ) as HTMLButtonElement;
    const cancelBtn = buttonByText(mounted.host, 'Cancel Payment') as HTMLButtonElement;
    const approveBtn = buttonByText(mounted.host, 'Approve Payment') as HTMLButtonElement;

    for (const btn of [closeBtn, cancelBtn, approveBtn]) {
      expect(btn.getAttribute('role')).toBe('button');
      expect(btn.getAttribute('tabindex')).toBe('0');

      await act(async () => {
        btn.focus();
      });
      expect(btn.getAttribute('data-focused')).toBe('true');
      expect(btn.style.outline).toContain('solid');

      await act(async () => {
        btn.blur();
      });
      expect(btn.getAttribute('data-focused')).toBeNull();
      expect(btn.style.outline).toBe('');
    }

    let resolveApproval!: () => void;
    const approveSpy = vi.spyOn(economyService, 'approveTransaction').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveApproval = () =>
            resolve({
              id: 'tx-a11y-done',
              agentId: 'agent-1',
              targetId: 'avatar-a11y',
              targetName: 'Accessible Resident',
              targetType: 'avatar',
              amount: 75,
              type: 'payment',
              description: '',
              timestamp: 1700000000000,
              status: 'success',
            });
        }),
    );

    // Activate Approve Payment via Enter key (AccessibleButton keyboard handler)
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      approveBtn.dispatchEvent(enterEvent);
    });
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(approveSpy).toHaveBeenCalledOnce();

    // Verify distinct disabled visual styling and attributes while processing
    const processingBtn = buttonByText(mounted.host, /Processing/) as HTMLButtonElement;
    expect(processingBtn).toBeDefined();
    expect(processingBtn.disabled).toBe(true);
    expect(processingBtn.getAttribute('aria-disabled')).toBe('true');
    expect(processingBtn.getAttribute('tabindex')).toBe('-1');
    expect(processingBtn.style.cursor).toBe('not-allowed');
    expect(processingBtn.style.backgroundColor).toBe(normalizeCssColor(theme.V.surf2));
    expect(processingBtn.style.color).toBe(normalizeCssColor(theme.V.ink2));

    expect(cancelBtn.disabled).toBe(true);
    expect(cancelBtn.getAttribute('aria-disabled')).toBe('true');
    expect(cancelBtn.style.cursor).toBe('not-allowed');
    expect(closeBtn.disabled).toBe(true);

    // Resolve pending approval and clear queue cleanly
    await act(async () => {
      resolveApproval();
      economyService.clearQueue('Cleanup');
    });
    approveSpy.mockRestore();

    expect(mounted.host.querySelector('[role="dialog"]')).toBeNull();
  });
});
