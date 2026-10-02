import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ErrorRecoveryService, sanitizeTelemetryData } from '../errorRecovery';

describe('ErrorRecoveryService', () => {
  let service: ErrorRecoveryService;

  beforeEach(() => {
    service = new ErrorRecoveryService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
  });

  describe('Sanitizes Telemetry Data', () => {
    it('strips sensitive keys and personal data from telemetry logs', () => {
      const rawPayload = {
        username: 'TestResident',
        password: 'SecretPassword123',
        token: 'xyz-auth-token-999',
        mfaHash: 'hash-abc-def',
        grid: 'agni',
        nested: {
          auth: 'Bearer my-secret',
          publicInfo: 'hello world',
        },
      };

      const sanitized = sanitizeTelemetryData(rawPayload);

      expect(sanitized.username).toBe('TestResident');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.mfaHash).toBe('[REDACTED]');
      expect(sanitized.grid).toBe('agni');
      expect(sanitized.nested.auth).toBe('[REDACTED]');
      expect(sanitized.nested.publicInfo).toBe('hello world');
    });
  });

  describe('Network Connectivity Monitoring', () => {
    it('tracks online/offline status changes and logs telemetry', () => {
      expect(service.getSnapshot().isOnline).toBe(true);

      service.setOnlineStatus(false);
      expect(service.getSnapshot().isOnline).toBe(false);

      const logs = service.getSnapshot().telemetryLogs;
      expect(logs.some((l) => l.code === 'NET_DISCONNECTED')).toBe(true);

      service.setOnlineStatus(true);
      expect(service.getSnapshot().isOnline).toBe(true);
      expect(service.getSnapshot().telemetryLogs.some((l) => l.code === 'NET_RESTORED')).toBe(true);
    });
  });

  describe('Automated Retry Queue with Exponential Backoff', () => {
    it('executes retries up to max 3 attempts on failure', async () => {
      let attempts = 0;
      const failingAction = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'SuccessResult';
      });

      const promise = service.enqueueRetry({
        action: failingAction,
        category: 'test',
        code: 'TEST_OP',
        description: 'Test retry operation',
        maxRetries: 3,
      });

      // Advance timers for exponential backoff retries
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result).toBe('SuccessResult');
      expect(failingAction).toHaveBeenCalledTimes(3);
      expect(service.getSnapshot().activeError).toBeNull();
    });

    it('prompts active error state when max retries (capped at 3) are exhausted', async () => {
      const alwaysFails = vi.fn().mockRejectedValue(new Error('Persistent service error'));

      const promise = service.enqueueRetry({
        action: alwaysFails,
        category: 'api',
        code: 'HTTP_503',
        description: 'Fetch user inventory',
        maxRetries: 3,
      });

      // Catch error expectation
      const catchPromise = promise.catch((err) => err);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      const err = await catchPromise;
      expect(err.message).toBe('Persistent service error');
      expect(alwaysFails).toHaveBeenCalledTimes(3);

      const snapshot = service.getSnapshot();
      expect(snapshot.activeError).not.toBeNull();
      expect(snapshot.activeError?.code).toBe('HTTP_503');
      expect(snapshot.activeError?.attempts).toBe(3);
    });

    it('automatically triggers background retries upon network restoration', async () => {
      service.setOnlineStatus(false);

      const action = vi.fn().mockResolvedValue('RecoveredData');

      const promise = service.enqueueRetry({
        action,
        category: 'net',
        code: 'FETCH_CONTACTS',
        description: 'Fetch contact list',
      }).catch((e) => e);

      expect(action).not.toHaveBeenCalled();

      // Restore network
      service.setOnlineStatus(true);

      await vi.runAllTimersAsync();

      expect(action).toHaveBeenCalledTimes(1);
    });
  });
});
