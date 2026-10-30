// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localCache } from '../local-cache';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('cache clearing preserves user records', () => {
  it('drops replaceable assets but preserves transaction history and reports server failure', async () => {
    vi.spyOn(localCache as any, 'initIDB').mockResolvedValue(null);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    );
    const record = { id: 'payment', amount: 10, timestamp: Date.now() };
    await localCache.saveTransaction('audit-agent', record);
    (localCache as any).memoryCache.set('tex_test', { dataUrl: 'data:image/png;base64,AA==' });
    const result = await localCache.clearCache('audit-agent');
    expect(result.serverCleared).toBe(false);
    expect(await localCache.getTransactions('audit-agent')).toEqual([
      expect.objectContaining(record),
    ]);
    expect((localCache as any).memoryCache.has('tex_test')).toBe(false);
  });
  it('awaits IndexedDB completion and does not include the transaction-history store', async () => {
    let finish!: () => void;
    const clear = vi.fn();
    const tx: any = { objectStore: () => ({ clear }) };
    const transaction = vi.fn(() => {
      queueMicrotask(() => {
        finish = () => tx.oncomplete();
      });
      return tx;
    });
    vi.spyOn(localCache as any, 'initIDB').mockResolvedValue({ transaction });
    const fetch = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    let finished = false;
    const clearing = localCache.clearCache().then((result) => {
      finished = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledWith(['inventory', 'textures', 'metadata'], 'readwrite');
    expect(clear).toHaveBeenCalledTimes(3);
    finish();
    expect((await clearing).serverCleared).toBe(true);
  });
  it('surfaces an aborted device clear instead of reporting success', async () => {
    const tx: any = {
      objectStore: () => ({ clear: vi.fn() }),
      error: new Error('Storage unavailable'),
    };
    vi.spyOn(localCache as any, 'initIDB').mockResolvedValue({
      transaction: () => {
        queueMicrotask(() => tx.onabort());
        return tx;
      },
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(localCache.clearCache()).rejects.toThrow('Storage unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('pruneOldTransactions cursor streaming', () => {
  it('deletes expired records via cursor streaming and awaits transaction completion', async () => {
    vi.stubGlobal('IDBKeyRange', { only: vi.fn((val: any) => val) });
    const agentId = 'agent-123';
    const now = Date.now();
    const oldRecord = { id: 'old-1', agentId, timestamp: now - 40 * 24 * 60 * 60 * 1000 };
    const newRecord = { id: 'new-1', agentId, timestamp: now - 5 * 24 * 60 * 60 * 1000 };

    const records = [oldRecord, newRecord];
    let cursorIndex = 0;
    const deleteSpy = vi.fn();

    const tx: any = {
      oncomplete: null,
      onerror: null,
      onabort: null,
    };

    const req: any = {};
    const advanceCursor = () => {
      if (cursorIndex < records.length) {
        const item = records[cursorIndex];
        const cursorMock = {
          value: item,
          delete: () => {
            deleteSpy(item.id);
          },
          continue: () => {
            cursorIndex++;
            queueMicrotask(() => advanceCursor());
          },
        };
        req.result = cursorMock;
        if (req.onsuccess) req.onsuccess();
      } else {
        req.result = null;
        if (req.onsuccess) req.onsuccess();
        queueMicrotask(() => {
          if (tx.oncomplete) tx.oncomplete();
        });
      }
    };

    const indexMock = {
      openCursor: vi.fn(() => {
        queueMicrotask(() => advanceCursor());
        return req;
      }),
    };

    const storeMock = {
      index: vi.fn(() => indexMock),
    };

    const transactionMock = vi.fn(() => {
      tx.objectStore = vi.fn(() => storeMock);
      return tx;
    });

    vi.spyOn(localCache as any, 'initIDB').mockResolvedValue({
      transaction: transactionMock,
    });

    let finished = false;
    const pruning = localCache.pruneOldTransactions(agentId, 30).then(() => {
      finished = true;
    });

    expect(finished).toBe(false);
    await pruning;
    expect(finished).toBe(true);

    expect(transactionMock).toHaveBeenCalledWith(['transactions'], 'readwrite');
    expect(indexMock.openCursor).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith('old-1');
    expect(deleteSpy).not.toHaveBeenCalledWith('new-1');
  });

  it('handles unavailable IndexedDB gracefully without throwing', async () => {
    vi.spyOn(localCache as any, 'initIDB').mockResolvedValue(null);
    await expect(localCache.pruneOldTransactions('agent-xyz', 30)).resolves.toBeUndefined();
  });
});
