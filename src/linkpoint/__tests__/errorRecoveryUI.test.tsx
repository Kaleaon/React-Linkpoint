// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { ErrorRecoveryService } from '../errorRecovery';
import { ErrorRecoveryProvider } from '../../context/ErrorRecoveryContext';
import { ErrorRecoveryBanner } from '../../components/ErrorRecoveryBanner';
import { ErrorRecoveryModal } from '../../components/ErrorRecoveryModal';
import { mountScreen, unmount, click, buttonByText, Mounted } from './ui-helpers';

let service: ErrorRecoveryService;
let mounted: Mounted | null = null;

beforeEach(() => {
  service = new ErrorRecoveryService();
});

afterEach(async () => {
  if (mounted) {
    await unmount(mounted);
    mounted = null;
  }
  service.destroy();
});

const TestApp: React.FC<{ onFallback?: (r: any) => void }> = ({ onFallback }) => {
  return (
    <ErrorRecoveryProvider customService={service}>
      <div>
        <ErrorRecoveryBanner />
        <main>Main Content</main>
        <ErrorRecoveryModal onNavigateFallback={onFallback} />
      </div>
    </ErrorRecoveryProvider>
  );
};

describe('ErrorRecovery UI Components', () => {
  it('renders nothing in banner when online and queue is empty', async () => {
    mounted = await mountScreen(() => <TestApp />);
    expect(mounted.host.querySelector('[data-testid="error-recovery-banner"]')).toBeNull();
  });

  it('renders non-blocking banner when device goes offline', async () => {
    mounted = await mountScreen(() => <TestApp />);

    await act(async () => {
      service.setOnlineStatus(false);
    });

    const banner = mounted.host.querySelector('[data-testid="error-recovery-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain(
      'Network disconnected. Auto-reconnecting when signal restores…',
    );
  });

  it('renders recovery modal when active error is set after retries fail', async () => {
    mounted = await mountScreen(() => <TestApp />);

    await act(async () => {
      service.logTelemetry('api', 'HTTP_500', 'Internal Server Error', {
        password: 'secretPassword',
      });
      // Trigger active error
      try {
        await service.enqueueRetry({
          action: () => Promise.reject(new Error('Backend Outage')),
          category: 'service',
          code: 'BACKEND_OUTAGE',
          description: 'Load user profile',
          maxRetries: 1,
        });
      } catch {
        // expected error
      }
    });

    const modal = mounted.host.querySelector('[data-testid="error-recovery-modal"]');
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain('Service Recovery Gateway');
    expect(modal?.textContent).toContain('BACKEND_OUTAGE');
    expect(modal?.textContent).toContain('Backend Outage');

    // Expand telemetry log
    const viewTelemetryBtn = buttonByText(mounted.host, 'View Diagnostic Telemetry');
    expect(viewTelemetryBtn).toBeTruthy();
    await click(viewTelemetryBtn!);

    const logViewer = mounted.host.querySelector('[data-testid="telemetry-log-viewer"]');
    expect(logViewer).not.toBeNull();
    expect(logViewer?.textContent).toContain('[REDACTED]');
    expect(logViewer?.textContent).not.toContain('secretPassword');
  });

  it('executes fallback navigation when user clicks return to safe home', async () => {
    const onFallback = vi.fn();
    mounted = await mountScreen(() => <TestApp onFallback={onFallback} />);

    await act(async () => {
      try {
        await service.enqueueRetry({
          action: () => Promise.reject(new Error('Fatal Error')),
          category: 'service',
          code: 'FATAL_ERR',
          description: 'Fatal task',
          maxRetries: 1,
        });
      } catch {
        // expected
      }
    });

    expect(mounted.host.querySelector('[data-testid="error-recovery-modal"]')).not.toBeNull();

    const returnBtn = buttonByText(mounted.host, 'Return to Safe Home (Chat)');
    expect(returnBtn).toBeTruthy();
    await click(returnBtn!);

    expect(onFallback).toHaveBeenCalledWith('Chat');
    expect(mounted.host.querySelector('[data-testid="error-recovery-modal"]')).toBeNull();
  });

  it('renders crystal brand badge in header and inline crystal loader on retry button during queue execution', async () => {
    mounted = await mountScreen(() => <TestApp />);

    let resolveRetry: () => void = () => {};
    const retryPromise = new Promise<void>((resolve) => {
      resolveRetry = resolve;
    });

    await act(async () => {
      try {
        await service.enqueueRetry({
          action: () => Promise.reject(new Error('Gateway Timeout')),
          category: 'service',
          code: 'GATEWAY_TIMEOUT',
          description: 'Fetch map data',
          maxRetries: 1,
        });
      } catch {
        // expected failure to populate active error
      }
    });

    const headerBadge = mounted.host.querySelector('[data-testid="recovery-modal-header-badge"]');
    expect(headerBadge).not.toBeNull();
    const headerCrystal = headerBadge?.querySelector(
      '[data-testid="crystal-loader"]',
    ) as HTMLElement;
    expect(headerCrystal).not.toBeNull();
    expect(headerCrystal?.style.width).toBe('32px');
    expect(headerCrystal?.style.height).toBe('32px');

    // Prepare a pending retry item in service queue to test active processing UI
    (service as any).retryQueue.push({
      id: 'pending-1',
      action: () => retryPromise,
      category: 'service',
      code: 'RETRY_TEST',
      description: 'Pending task',
      attempts: 0,
      maxRetries: 1,
    });

    const retryBtn = buttonByText(mounted.host, 'Retry Operation') as HTMLButtonElement;
    expect(retryBtn).not.toBeNull();

    // Click retry button to initiate queue processing
    let clickPromise: Promise<void>;
    await act(async () => {
      clickPromise = (async () => {
        retryBtn.click();
      })();
    });

    // Check button state during active queue processing
    expect(retryBtn.disabled).toBe(true);
    expect(retryBtn.textContent).toContain('Retrying...');
    const buttonCrystal = retryBtn.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(buttonCrystal).not.toBeNull();
    expect(buttonCrystal?.style.width).toBe('16px');
    expect(buttonCrystal?.style.height).toBe('16px');

    // Resolve retry promise and cleanup
    await act(async () => {
      resolveRetry();
      await clickPromise;
    });
  });
});
