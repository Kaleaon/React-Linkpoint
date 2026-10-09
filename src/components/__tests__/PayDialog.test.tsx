import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import PayDialog from '../PayDialog.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app.ts';

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
  vi.restoreAllMocks();
});

describe('PayDialog Component', () => {
  beforeEach(() => {
    app.economy.currencySymbol = 'L$';
    app.economy.isZeroCurrency = false;
  });

  it('renders preset amounts and handles preset selection', async () => {
    const host = await mount(
      createElement(PayDialog, {
        isOpen: true,
        onClose: vi.fn(),
        target: { id: 'resident-1', name: 'Aimee Resident', type: 'avatar' },
      }),
    );

    const title = host.querySelector('#pay-dialog-title');
    expect(title?.textContent).toContain('Pay Resident');

    const presets = Array.from(host.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('L$'),
    );
    expect(presets.length).toBeGreaterThanOrEqual(4);

    const payBtn = host.querySelector('button[type="submit"]');
    expect(payBtn?.textContent).toContain('Pay L$ 10'); // Default preset is 10

    // Click L$ 50 preset
    const preset50 = presets.find((b) => b.textContent?.includes('50'));
    expect(preset50).toBeDefined();

    await act(async () => {
      preset50?.click();
    });

    expect(payBtn?.textContent).toContain('Pay L$ 50');
  });

  it('allows custom amount input and submits payment to avatar', async () => {
    const payAvatarSpy = vi.spyOn(app.economy, 'payAvatar').mockResolvedValueOnce({
      id: 'tx-123',
      agentId: 'current',
      targetId: 'resident-1',
      targetName: 'Aimee Resident',
      targetType: 'avatar',
      amount: 75,
      type: 'tip',
      description: 'Tip for DJ set',
      timestamp: Date.now(),
      status: 'success',
    });

    const onSuccess = vi.fn();

    const host = await mount(
      createElement(PayDialog, {
        isOpen: true,
        onClose: vi.fn(),
        onSuccess,
        target: { id: 'resident-1', name: 'Aimee Resident', type: 'avatar' },
      }),
    );

    const customInput = host.querySelector(
      'input[placeholder="Custom amount"]',
    ) as HTMLInputElement;
    expect(customInput).not.toBeNull();

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      nativeInputValueSetter?.call(customInput, '75');
      customInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const payBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(payBtn?.textContent).toContain('Pay L$ 75');

    await act(async () => {
      payBtn.click();
    });

    expect(payAvatarSpy).toHaveBeenCalledWith({
      targetId: 'resident-1',
      targetName: 'Aimee Resident',
      amount: 75,
      description: 'Tip for Aimee Resident',
    });

    expect(onSuccess).toHaveBeenCalled();
    expect(host.textContent).toContain('Payment Successful');
  });

  it('submits payment to object when target is an object', async () => {
    const payObjectSpy = vi.spyOn(app.economy, 'payObject').mockResolvedValueOnce({
      id: 'tx-obj-1',
      agentId: 'current',
      targetId: 'object-99',
      targetName: 'Vendor Machine',
      targetType: 'object',
      amount: 100,
      type: 'payment',
      description: 'Payment for Vendor Machine',
      timestamp: Date.now(),
      status: 'success',
    });

    const host = await mount(
      createElement(PayDialog, {
        isOpen: true,
        onClose: vi.fn(),
        target: { id: 'object-99', name: 'Vendor Machine', type: 'object' },
      }),
    );

    const title = host.querySelector('#pay-dialog-title');
    expect(title?.textContent).toContain('Pay Object');

    const payBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      payBtn.click();
    });

    expect(payObjectSpy).toHaveBeenCalledWith({
      targetId: 'object-99',
      targetName: 'Vendor Machine',
      amount: 10,
      description: 'Payment for Vendor Machine',
    });

    expect(host.textContent).toContain('Payment Successful');
  });

  it('displays error message when payment throws', async () => {
    vi.spyOn(app.economy, 'payAvatar').mockRejectedValueOnce(new Error('Insufficient L$ balance'));

    const host = await mount(
      createElement(PayDialog, {
        isOpen: true,
        onClose: vi.fn(),
        target: { id: 'resident-1', name: 'Aimee Resident', type: 'avatar' },
      }),
    );

    const payBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      payBtn.click();
    });

    expect(host.textContent).toContain('Insufficient L$ balance');
  });

  it('displays notice and disables pay when in zero-currency mode', async () => {
    app.economy.isZeroCurrency = true;

    const host = await mount(
      createElement(PayDialog, {
        isOpen: true,
        onClose: vi.fn(),
        target: { id: 'resident-1', name: 'Aimee Resident', type: 'avatar' },
      }),
    );

    expect(host.textContent).toContain('This grid operates in zero-currency mode');

    const payBtn = host.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(payBtn.disabled).toBe(true);
  });
});
