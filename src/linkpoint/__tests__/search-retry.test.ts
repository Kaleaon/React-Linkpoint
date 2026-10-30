import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSearchWithRetry, isNonTransientError } from '../search-retry';

describe('executeSearchWithRetry engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('succeeds on first attempt without retrying', async () => {
    const searchFn = vi.fn().mockResolvedValue({ results: ['item1'] });
    const onRetry = vi.fn();

    const resultPromise = executeSearchWithRetry(searchFn, { maxRetries: 3, onRetry });
    const result = await resultPromise;

    expect(result).toEqual({ results: ['item1'] });
    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('retries up to 3 times on transient errors with exponential backoff (500ms, 1000ms, 2000ms)', async () => {
    const searchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Packet loss'))
      .mockRejectedValueOnce(new Error('Bridge error'))
      .mockResolvedValueOnce({ results: ['recovered'] });

    const onRetry = vi.fn();

    const promise = executeSearchWithRetry(searchFn, {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 2000,
      onRetry,
    });

    // Right after initial rejection, onRetry is called for attempt 1 before backoff wait
    await vi.advanceTimersByTimeAsync(0);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: 1,
        maxRetries: 3,
        delay: 500,
      }),
    );

    // Fast-forward 500ms (1st retry execution fails, attempt 2 backoff starts)
    await vi.advanceTimersByTimeAsync(500);
    expect(onRetry).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attempt: 2,
        maxRetries: 3,
        delay: 1000,
      }),
    );

    // Fast-forward 1000ms (2nd retry execution succeeds)
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toEqual({ results: ['recovered'] });
    expect(searchFn).toHaveBeenCalledTimes(3);
  });

  it('fails after exhausting all 3 retries', async () => {
    const error = new Error('Grid disconnected');
    const searchFn = vi.fn().mockRejectedValue(error);
    const onRetry = vi.fn();

    const promise = executeSearchWithRetry(searchFn, {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 2000,
      onRetry,
    });

    promise.catch(() => {}); // prevent unhandled rejection warning during timer advances

    // Attempt 1: 500ms backoff
    await vi.advanceTimersByTimeAsync(500);
    // Attempt 2: 1000ms backoff
    await vi.advanceTimersByTimeAsync(1000);
    // Attempt 3: 2000ms backoff
    await vi.advanceTimersByTimeAsync(2000);

    await expect(promise).rejects.toThrow('Grid disconnected');
    expect(searchFn).toHaveBeenCalledTimes(4); // initial + 3 retries
    expect(onRetry).toHaveBeenCalledTimes(3);
  });

  it('immediately throws non-transient errors without retrying', async () => {
    const nonTransientErr = new Error('Invalid query syntax');
    const searchFn = vi.fn().mockRejectedValue(nonTransientErr);
    const onRetry = vi.fn();

    const promise = executeSearchWithRetry(searchFn, {
      maxRetries: 3,
      onRetry,
    });

    await expect(promise).rejects.toThrow('Invalid query syntax');
    expect(searchFn).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('cancels pending backoff timers immediately when AbortSignal triggers', async () => {
    const searchFn = vi.fn().mockRejectedValue(new Error('Network drop'));
    const controller = new AbortController();
    const onRetry = vi.fn();

    const promise = executeSearchWithRetry(searchFn, {
      maxRetries: 3,
      baseDelay: 500,
      signal: controller.signal,
      onRetry,
    });

    promise.catch(() => {});

    // Wait for initial failure and retry 1 timer start
    await vi.advanceTimersByTimeAsync(0);
    expect(onRetry).toHaveBeenCalledTimes(1);

    // Cancel while timer is running (at 0ms out of 500ms)
    controller.abort();

    await expect(promise).rejects.toThrow();
    // Verify no further retries occurred
    expect(searchFn).toHaveBeenCalledTimes(1);
  });

  it('detects non-transient error messages correctly', () => {
    expect(isNonTransientError(new Error('Invalid query string'))).toBe(true);
    expect(isNonTransientError(new Error('Syntax error at char 2'))).toBe(true);
    expect(isNonTransientError(new Error('Unauthorized access'))).toBe(true);
    expect(isNonTransientError({ isTransient: false, message: 'Custom error' })).toBe(true);
    expect(isNonTransientError(new Error('Bridge timeout'))).toBe(false);
    expect(isNonTransientError(new Error('Connection failed'))).toBe(false);
  });
});
