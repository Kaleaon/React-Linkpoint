import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Utils } from './utils';

describe('Utils', () => {
  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should only call the function once after the wait time', () => {
      const func = vi.fn();
      const debouncedFunc = Utils.debounce(func, 100);

      debouncedFunc();
      debouncedFunc();
      debouncedFunc();

      expect(func).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(func).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(func).toHaveBeenCalledTimes(1);
    });

    it('should call the function with the latest arguments', () => {
      const func = vi.fn();
      const debouncedFunc = Utils.debounce(func, 100);

      debouncedFunc(1);
      debouncedFunc(2);
      debouncedFunc(3);

      vi.advanceTimersByTime(100);

      expect(func).toHaveBeenCalledTimes(1);
      expect(func).toHaveBeenCalledWith(3);
    });

    it('should be able to handle multiple calls spaced out more than the wait time', () => {
      const func = vi.fn();
      const debouncedFunc = Utils.debounce(func, 100);

      debouncedFunc('call 1');
      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(1);
      expect(func).toHaveBeenCalledWith('call 1');

      debouncedFunc('call 2');
      vi.advanceTimersByTime(100);
      expect(func).toHaveBeenCalledTimes(2);
      expect(func).toHaveBeenCalledWith('call 2');
    });

    it('should pass multiple arguments correctly', () => {
      const func = vi.fn();
      const debouncedFunc = Utils.debounce(func, 100);

      debouncedFunc('arg1', 'arg2', { key: 'value' });
      vi.advanceTimersByTime(100);

      expect(func).toHaveBeenCalledTimes(1);
      expect(func).toHaveBeenCalledWith('arg1', 'arg2', { key: 'value' });
    });
  });
});
