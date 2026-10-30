import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { economyService } from '../../services/EconomyService';
import TransactionConfirmationModal from '../TransactionConfirmationModal';
import {
  mountScreen,
  unmount,
  click,
  buttonByText,
  Mounted,
} from '../../linkpoint/__tests__/ui-helpers';

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
});
