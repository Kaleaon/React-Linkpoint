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

  it('handles getBalance error gracefully and extracts currencySymbol from params', async () => {
    const mockBot = {
      clientCommands: {
        grid: {
          getBalance: vi.fn().mockRejectedValue(new Error('Balance retrieval failed')),
        },
      },
    };

    const res = await slActions.getTransactionHistory(mockBot, { currencySymbol: 'OS$' });
    expect(res.balance).toBe(0);
    expect(res.currencySymbol).toBe('OS$');
    expect(res.transactions).toEqual([]);
  });

  it('correctly appends query parameters with & when URL already contains a ?', async () => {
    const requestGetMock = vi.fn().mockResolvedValue({ body: [] });
    const mockBot = {
      clientCommands: {
        grid: {
          getBalance: vi.fn().mockResolvedValue(50),
        },
      },
      currentRegion: {
        caps: {
          isCapAvailable: vi.fn().mockResolvedValue(true),
          getCapability: vi.fn().mockResolvedValue('https://example.com/caps/tx?token=xyz'),
          requestGet: requestGetMock,
        },
      },
    };

    await slActions.getTransactionHistory(mockBot, { limit: 25 });
    expect(requestGetMock).toHaveBeenCalledWith('https://example.com/caps/tx?token=xyz&limit=25');
  });
  it('normalizes entries into structured transaction objects', async () => {
    const mockBot = {
      clientCommands: {
        grid: {
          getBalance: vi.fn().mockResolvedValue(1000),
        },
      },
      currentRegion: {
        caps: {
          isCapAvailable: vi.fn().mockResolvedValue(true),
          getCapability: vi.fn().mockResolvedValue('https://example.com/caps/tx'),
          requestGet: vi.fn().mockResolvedValue({
            body: {
              transactions: [
                {
                  id: 'tx-raw-123',
                  timestamp: 1700000000000,
                  type: 'purchase',
                  amount: -250,
                  balance: 750,
                  target_name: 'Merchant Avatar',
                  from_id: 'avatar-me',
                  to_id: 'avatar-merchant',
                  description: 'Purchased Item',
                },
              ],
            },
          }),
        },
      },
    };

    const res = await slActions.getTransactionHistory(mockBot, {});
    expect(res.transactions.length).toBe(1);
    const tx = res.transactions[0];
    expect(tx.transactionId).toBe('tx-raw-123');
    expect(tx.timestamp).toBe(1700000000000);
    expect(tx.type).toBe('purchase');
    expect(tx.amount).toBe(-250);
    expect(tx.balance).toBe(750);
    expect(tx.user).toBe('Merchant Avatar');
    expect(tx.fromId).toBe('avatar-me');
    expect(tx.toId).toBe('avatar-merchant');
    expect(tx.description).toBe('Purchased Item');
  });
});
