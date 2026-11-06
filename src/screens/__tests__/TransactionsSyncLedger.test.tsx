// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { TransactionsScreen } from '../LumiyaTools.jsx';
import { app } from '../../linkpoint/app.ts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mountScreen(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
  });
  mounted = { host, root };
  return host;
}

describe('TransactionsScreen Sync Indicator and Refresh Actions', () => {
  const agentId = 'test-agent-screen-1';

  beforeEach(async () => {
    vi.restoreAllMocks();
    await app.economy.init(agentId);
    app.economy.transactions = [];
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
  });

  it('renders refresh button and pays target in header', async () => {
    const host = await mountScreen(<TransactionsScreen />);

    const refreshBtn = host.querySelector(
      '[data-testid="refresh-transactions-btn"]',
    ) as HTMLButtonElement | null;
    expect(refreshBtn).not.toBeNull();
    expect(refreshBtn?.textContent).toContain('Refresh');
    expect(refreshBtn?.disabled).toBe(false);

    const payBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pay / Tip'),
    );
    expect(payBtn).toBeDefined();
  });

  it('displays inline synchronization indicator during active sync', async () => {
    vi.spyOn(app.economy, 'fetchHistory').mockResolvedValue([]);
    const host = await mountScreen(<TransactionsScreen />);

    // Initially not syncing after mock fetchHistory resolves
    expect(host.querySelector('[data-testid="sync-indicator"]')).toBeNull();

    // Trigger sync_started
    await act(async () => {
      app.economy.emit('sync_started', { agentId });
    });

    const indicator = host.querySelector('[data-testid="sync-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator?.textContent).toContain('Syncing...');
    expect(indicator?.getAttribute('role')).toBe('status');
    expect(indicator?.getAttribute('aria-live')).toBe('polite');

    const refreshBtn = host.querySelector(
      '[data-testid="refresh-transactions-btn"]',
    ) as HTMLButtonElement;
    expect(refreshBtn.disabled).toBe(true);

    // End sync
    await act(async () => {
      app.economy.emit('sync_completed', { agentId });
    });

    expect(host.querySelector('[data-testid="sync-indicator"]')).toBeNull();
    expect(refreshBtn.disabled).toBe(false);
  });

  it('updates transaction list reactively when background delta batches arrive without manual reload', async () => {
    vi.spyOn(app.economy, 'fetchHistory').mockResolvedValue([]);
    const host = await mountScreen(<TransactionsScreen />);

    // Initially no transactions
    expect(host.textContent).toContain('No transactions stored in local 30-day ledger');

    const newTx = {
      id: 'delta-tx-99',
      agentId,
      targetId: 'vendor-123',
      targetName: 'Mainland Vendor',
      targetType: 'object' as const,
      amount: -120,
      type: 'payment' as const,
      description: 'Vendor Purchase',
      timestamp: Date.now(),
      status: 'success' as const,
    };

    // Simulate background delta batch arrival
    await act(async () => {
      app.economy.syncEngine.emit('delta_batch_received', {
        agentId,
        batch: [newTx],
        lastSyncedTimestamp: newTx.timestamp,
        totalFetched: 1,
        isLastBatch: true,
      });
    });

    // Verify UI updated immediately
    expect(host.textContent).toContain('Vendor Purchase');
    expect(host.textContent).toContain('- L$ 120');
  });

  it('clicking Refresh triggers app.economy.fetchHistory', async () => {
    const fetchHistorySpy = vi.spyOn(app.economy, 'fetchHistory').mockResolvedValue([]);
    const host = await mountScreen(<TransactionsScreen />);

    const refreshBtn = host.querySelector(
      '[data-testid="refresh-transactions-btn"]',
    ) as HTMLButtonElement;
    expect(refreshBtn).not.toBeNull();

    await act(async () => {
      refreshBtn.click();
    });

    expect(fetchHistorySpy).toHaveBeenCalled();
  });
});
