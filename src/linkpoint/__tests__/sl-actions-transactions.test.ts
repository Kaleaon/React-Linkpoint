import { describe, it, expect, vi } from 'vitest';
import slActions from '../../../core/sl-actions.cjs';

describe('sl-actions getTransactionHistory capability fetcher', () => {
  it('queries UserTransactionHistory capability when available', async () => {
    const mockBot = {
      clientCommands: {
        grid: {
          getBalance: vi.fn().mockResolvedValue(1250),
        },
      },
      currentRegion: {
        caps: {
          isCapAvailable: vi.fn().mockImplementation(async (capName: string) => {
            return capName === 'UserTransactionHistory';
          }),
          capsGetXML: vi.fn().mockResolvedValue({
            balance: 1250,
            hasMore: false,
            transactions: [
              {
                id: 'tx-remote-1',
                amount: -100,
                type: 'payment',
                description: 'Clothing Store Purchase',
                target_name: 'Fashion Store',
                timestamp: Date.now() - 3600000,
              },
              {
                id: 'tx-remote-2',
                amount: 250,
                type: 'transfer',
                description: 'Payment from Friend',
                target_name: 'Alice Resident',
                timestamp: Date.now() - 7200000,
              },
            ],
          }),
        },
      },
    };

    const res = await slActions.getTransactionHistory(mockBot, { limit: 100 });
    expect(res.balance).toBe(1250);
    expect(res.transactions.length).toBe(2);
    expect(res.transactions[0].id).toBe('tx-remote-1');
  });

  it('falls back cleanly to empty transactions if capability is not available', async () => {
    const mockBot = {
      clientCommands: {
        grid: {
          getBalance: vi.fn().mockResolvedValue(300),
        },
      },
      currentRegion: {
        caps: {
          isCapAvailable: vi.fn().mockResolvedValue(false),
        },
      },
    };

    const res = await slActions.getTransactionHistory(mockBot, {});
    expect(res.balance).toBe(300);
    expect(res.transactions).toEqual([]);
  });
});
