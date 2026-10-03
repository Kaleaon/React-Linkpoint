import { describe, expect, it, vi } from 'vitest';
import { rateLimitedFetch } from '../rate-limited-fetch';

describe('rate-limited fetch', () => {
  it('honors a 429 response and retries a safe request', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response('ready', { status: 200 }));

    const response = await rateLimitedFetch('/asset', undefined, fetcher);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ready');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('caps a burst at two requests', async () => {
    let active = 0;
    let peak = 0;
    const fetcher = vi.fn(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return new Response('', { status: 200 });
    });

    await Promise.all(Array.from({ length: 6 }, () => rateLimitedFetch('/asset', undefined, fetcher)));

    expect(peak).toBe(2);
  });
});
