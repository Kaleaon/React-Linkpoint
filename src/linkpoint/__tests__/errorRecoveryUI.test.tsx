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
});
