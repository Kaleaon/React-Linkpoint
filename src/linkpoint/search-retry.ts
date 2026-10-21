/**
 * Exponential backoff retry engine for search directory queries.
 */

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  signal?: AbortSignal;
  onRetry?: (info: { attempt: number; maxRetries: number; delay: number; error: Error }) => void;
  isTransient?: (error: any) => boolean;
}

export function isNonTransientError(error: any): boolean {
  if (!error) return false;
  if (error.isTransient === false || error.nonTransient === true) {
    return true;
  }
  const msg = String(error.message || error).toLowerCase();
  const nonTransientKeywords = [
    'invalid query',
    'syntax error',
    'invalid syntax',
    'malformed query',
    'unauthorized',
    'forbidden',
    'bad request',
  ];
  return nonTransientKeywords.some((kw) => msg.includes(kw));
}

export function defaultIsTransient(error: any): boolean {
  return !isNonTransientError(error);
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const abortError = new Error('Search cancelled');
      abortError.name = 'AbortError';
      return reject(abortError);
    }

    let timer: any = null;

    const onAbort = () => {
      if (timer) clearTimeout(timer);
      const abortError = new Error('Search cancelled');
      abortError.name = 'AbortError';
      reject(abortError);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
  });
}

/**
 * Wraps search function calls with exponential backoff retry capability.
 */
export async function executeSearchWithRetry<T>(
  searchFn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 500,
    maxDelay = 2000,
    signal,
    onRetry,
    isTransient = defaultIsTransient,
  } = options;

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      const abortError = new Error('Search cancelled');
      abortError.name = 'AbortError';
      throw abortError;
    }

    try {
      return await searchFn();
    } catch (error: any) {
      if (signal?.aborted) {
        const abortError = new Error('Search cancelled');
        abortError.name = 'AbortError';
        throw abortError;
      }

      // If non-transient or retries exhausted, fail immediately
      if (!isTransient(error) || attempt >= maxRetries) {
        throw error;
      }

      attempt++;

      // Exponential progression: 500ms (attempt 1), 1000ms (attempt 2), 2000ms (attempt 3)
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

      const errObj = error instanceof Error ? error : new Error(String(error));

      if (onRetry) {
        onRetry({ attempt, maxRetries, delay, error: errObj });
      }

      // Wait backoff delay (cancellable via signal)
      await sleepWithSignal(delay, signal);
    }
  }
}
