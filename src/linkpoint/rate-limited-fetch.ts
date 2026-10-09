const MAX_CONCURRENT_REQUESTS = 2;
const MAX_429_RETRIES = 3;

let activeRequests = 0;
const waiting: Array<() => void> = [];

function acquire() {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) =>
    waiting.push(() => {
      activeRequests++;
      resolve();
    }),
  );
}

function release() {
  activeRequests--;
  waiting.shift()?.();
}

function retryDelay(response: Response, attempt: number) {
  const value = response.headers?.get?.('retry-after');
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 500 * 2 ** attempt;
}

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Keep asset and read-only API traffic below the small burst limits used by web hosts. A 429 is
 * safe to retry here because callers use this helper only for GETs or explicitly read-only calls.
 */
export async function rateLimitedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetcher: typeof fetch = (request, options) => fetch(request, options),
): Promise<Response> {
  await acquire();
  try {
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(input, init);
      if (response.status !== 429 || attempt >= MAX_429_RETRIES) return response;
      await sleep(retryDelay(response, attempt));
    }
  } finally {
    release();
  }
}
