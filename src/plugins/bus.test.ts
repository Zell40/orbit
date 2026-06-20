import { describe, it, expect, vi } from 'vitest';
import { bus } from './bus';

describe('plugin event bus', () => {
  it('delivers emitted args to a subscriber', () => {
    const fn = vi.fn();
    bus.on('evt-a', fn);
    bus.emit('evt-a', 1, 'two');
    expect(fn).toHaveBeenCalledWith(1, 'two');
  });

  it('on() returns an unsubscribe function', () => {
    const fn = vi.fn();
    const off = bus.on('evt-b', fn);
    off();
    bus.emit('evt-b');
    expect(fn).not.toHaveBeenCalled();
  });

  it('off() removes a handler', () => {
    const fn = vi.fn();
    bus.on('evt-c', fn);
    bus.off('evt-c', fn);
    bus.emit('evt-c');
    expect(fn).not.toHaveBeenCalled();
  });

  it('once() fires at most once', () => {
    const fn = vi.fn();
    bus.once('evt-d', fn);
    bus.emit('evt-d');
    bus.emit('evt-d');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing handler from the others', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    bus.on('evt-e', () => { throw new Error('boom'); });
    bus.on('evt-e', good);
    expect(() => bus.emit('evt-e')).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('emitting an event with no subscribers is a no-op', () => {
    expect(() => bus.emit('nobody-home', 42)).not.toThrow();
  });
});
