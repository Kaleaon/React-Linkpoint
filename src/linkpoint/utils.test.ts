import { describe, it, expect, vi } from 'vitest';
import { Utils } from './utils';

describe('Utils.EventEmitter', () => {
  it('should register and emit events', () => {
    const emitter = new Utils.EventEmitter();
    const listener = vi.fn();

    emitter.on('test-event', listener);
    emitter.emit('test-event', 'arg1', 42);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('arg1', 42);
  });

  it('should unregister events with off()', () => {
    const emitter = new Utils.EventEmitter();
    const listener = vi.fn();

    emitter.on('test-event', listener);
    emitter.off('test-event', listener);
    emitter.emit('test-event');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should only trigger once when registered with once()', () => {
    const emitter = new Utils.EventEmitter();
    const listener = vi.fn();

    emitter.once('test-event', listener);

    emitter.emit('test-event', 'first');
    emitter.emit('test-event', 'second');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('first');
  });

  it('should handle multiple listeners for the same event', () => {
    const emitter = new Utils.EventEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    emitter.on('test-event', listener1);
    emitter.on('test-event', listener2);

    emitter.emit('test-event');

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should safely handle emitting events with no listeners', () => {
    const emitter = new Utils.EventEmitter();
    // Should not throw
    expect(() => emitter.emit('non-existent')).not.toThrow();
  });

  it('should safely handle off() with no listeners', () => {
    const emitter = new Utils.EventEmitter();
    const listener = vi.fn();
    // Should not throw
    expect(() => emitter.off('non-existent', listener)).not.toThrow();
  });

  it('should safely handle off() for an existing event but wrong listener', () => {
    const emitter = new Utils.EventEmitter();
    const listener1 = vi.fn();
    const listenerToRemove = vi.fn();

    emitter.on('test-event', listener1);
    emitter.off('test-event', listenerToRemove);

    emitter.emit('test-event');

    expect(listener1).toHaveBeenCalledTimes(1);
  });
});
