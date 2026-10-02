/**
 * Centralized Error Recovery Framework for React Web
 * Manages network connectivity state, exponential backoff retries,
 * sanitized telemetry logging, and global error recovery states.
 */

export interface TelemetryEntry {
  id: string;
  timestamp: string;
  category: string;
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface RetryItem<T = any> {
  id: string;
  action: () => Promise<T>;
  category: string;
  code: string;
  description: string;
  attempts: number;
  maxRetries: number;
  lastError?: Error | null;
  onSuccess?: (result: T) => void;
  onFailure?: (error: Error) => void;
}

export interface ActiveErrorState {
  code: string;
  category: string;
  message: string;
  attempts: number;
  timestamp: string;
  details?: Record<string, any>;
}

export interface ErrorRecoverySnapshot {
  isOnline: boolean;
  isRetrying: boolean;
  retryQueueCount: number;
  activeError: ActiveErrorState | null;
  telemetryLogs: TelemetryEntry[];
}

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'token',
  'mfatoken',
  'mfahash',
  'auth',
  'authorization',
  'cookie',
  'secret',
  'credential',
  'credentials',
  'email',
  'ssn',
  'privatekey',
]);

/**
 * Sanitizes telemetry payload by stripping personal/sensitive data.
 */
export function sanitizeTelemetryData(data: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== 'object') return {};
  const sanitized: Record<string, any> = {};

  for (const [key, val] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('pass') || lowerKey.includes('token') || lowerKey.includes('secret')) {
      sanitized[key] = '[REDACTED]';
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitized[key] = sanitizeTelemetryData(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

type Listener = (snapshot: ErrorRecoverySnapshot) => void;

export class ErrorRecoveryService {
  private isOnlineState: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isRetryingState: boolean = false;
  private activeErrorState: ActiveErrorState | null = null;
  private retryQueue: RetryItem[] = [];
  private telemetry: TelemetryEntry[] = [];
  private listeners: Set<Listener> = new Set();
  private maxCapRetries = 3;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  public destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.listeners.clear();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  public getSnapshot(): ErrorRecoverySnapshot {
    return {
      isOnline: this.isOnlineState,
      isRetrying: this.isRetryingState,
      retryQueueCount: this.retryQueue.length,
      activeError: this.activeErrorState,
      telemetryLogs: [...this.telemetry],
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (e) {
        console.error('Error in recovery listener:', e);
      }
    }
  }

  private handleOnline = (): void => {
    this.isOnlineState = true;
    this.logTelemetry('network', 'NET_RESTORED', 'Network connectivity restored');
    this.notify();
    this.processRetryQueue();
  };

  private handleOffline = (): void => {
    this.isOnlineState = false;
    this.logTelemetry('network', 'NET_DISCONNECTED', 'Network connectivity lost');
    this.notify();
  };

  /**
   * Set network status explicitly (useful for testing or manual override).
   */
  public setOnlineStatus(online: boolean): void {
    if (this.isOnlineState === online) return;
    if (online) {
      this.handleOnline();
    } else {
      this.handleOffline();
    }
  }

  /**
   * Log telemetry event with sanitized details.
   */
  public logTelemetry(category: string, code: string, message: string, details?: Record<string, any>): TelemetryEntry {
    const sanitizedDetails = details ? sanitizeTelemetryData(details) : undefined;
    const entry: TelemetryEntry = {
      id: `tel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      category,
      code,
      message,
      details: sanitizedDetails,
    };
    this.telemetry.unshift(entry);
    if (this.telemetry.length > 100) this.telemetry.pop();
    this.notify();
    return entry;
  }

  /**
   * Enqueue a request for execution with exponential backoff retries (capped at 3).
   */
  public async enqueueRetry<T>(options: {
    action: () => Promise<T>;
    category?: string;
    code?: string;
    description?: string;
    maxRetries?: number;
    onSuccess?: (result: T) => void;
    onFailure?: (error: Error) => void;
  }): Promise<T> {
    const item: RetryItem<T> = {
      id: `retry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action: options.action,
      category: options.category || 'service',
      code: options.code || 'REQ_FAILED',
      description: options.description || 'Service operation',
      attempts: 0,
      maxRetries: Math.min(options.maxRetries ?? 3, this.maxCapRetries),
      onSuccess: options.onSuccess,
      onFailure: options.onFailure,
    };

    this.retryQueue.push(item);
    this.logTelemetry(item.category, item.code, `Queued operation: ${item.description}`, { attempts: 0 });
    this.notify();

    return this.executeItem(item);
  }

  private async executeItem<T>(item: RetryItem<T>): Promise<T> {
    if (!this.isOnlineState) {
      const err = new Error('Network offline');
      item.lastError = err;
      this.logTelemetry(item.category, 'NET_OFFLINE', `Cannot execute ${item.description}: device offline`);
      if (item.onFailure) item.onFailure(err);
      throw err;
    }

    this.isRetryingState = true;
    this.notify();

    while (item.attempts < item.maxRetries) {
      item.attempts++;
      const backoffMs = Math.min(1000 * Math.pow(2, item.attempts - 1), 4000);

      this.logTelemetry(item.category, `${item.code}_ATTEMPT`, `Executing ${item.description} (attempt ${item.attempts}/${item.maxRetries})`, {
        attempt: item.attempts,
        backoffMs,
      });

      try {
        const result = await item.action();
        // Success! Remove from queue
        this.retryQueue = this.retryQueue.filter((i) => i.id !== item.id);
        this.isRetryingState = this.retryQueue.length > 0;
        this.logTelemetry(item.category, `${item.code}_SUCCESS`, `Operation ${item.description} recovered successfully`);

        if (this.activeErrorState && this.activeErrorState.code === item.code) {
          this.activeErrorState = null;
        }

        if (item.onSuccess) item.onSuccess(result);
        this.notify();
        return result;
      } catch (error: any) {
        const err = error instanceof Error ? error : new Error(String(error));
        item.lastError = err;

        this.logTelemetry(item.category, `${item.code}_FAILURE`, `Attempt ${item.attempts} failed for ${item.description}: ${err.message}`, {
          error: err.message,
        });

        if (item.attempts < item.maxRetries) {
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    // All retries failed!
    this.retryQueue = this.retryQueue.filter((i) => i.id !== item.id);
    this.isRetryingState = this.retryQueue.length > 0;

    const finalError = item.lastError || new Error(`Operation failed after ${item.maxRetries} retries`);
    this.activeErrorState = {
      code: item.code,
      category: item.category,
      message: finalError.message,
      attempts: item.attempts,
      timestamp: new Date().toISOString(),
      details: { description: item.description },
    };

    this.logTelemetry(item.category, `${item.code}_EXHAUSTED`, `Max retries (${item.maxRetries}) reached for ${item.description}. Prompting recovery gateway.`, {
      error: finalError.message,
    });

    if (item.onFailure) item.onFailure(finalError);
    this.notify();
    throw finalError;
  }

  /**
   * Process pending items in retry queue (e.g. after network restoration).
   */
  public async processRetryQueue(): Promise<void> {
    if (!this.isOnlineState || this.retryQueue.length === 0) return;

    const itemsToRetry = [...this.retryQueue];
    for (const item of itemsToRetry) {
      if (item.attempts < item.maxRetries) {
        try {
          await this.executeItem(item);
        } catch {
          // Failure logged in executeItem
        }
      }
    }
  }

  public clearActiveError(): void {
    this.activeErrorState = null;
    this.notify();
  }

  public clearTelemetry(): void {
    this.telemetry = [];
    this.notify();
  }
}

export const errorRecovery = new ErrorRecoveryService();
