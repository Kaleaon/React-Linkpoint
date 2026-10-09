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
