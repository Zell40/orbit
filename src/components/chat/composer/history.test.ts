import { describe, it, expect } from 'vitest';
import { createSentHistory } from './history';

describe('createSentHistory', () => {
  it('recalls nothing when empty', () => {
    const h = createSentHistory();
    expect(h.recallPrev('draft')).toBeNull();
    expect(h.recallNext()).toBeNull();
  });

  it('walks up through sent messages then back down to the stashed draft', () => {
    const h = createSentHistory();
    h.record('one');
    h.record('two');
    expect(h.recallPrev('live')).toBe('two');   // ↑ stashes "live"
    expect(h.recallPrev('live')).toBe('one');   // ↑
    expect(h.recallPrev('live')).toBe('one');   // ↑ clamps at the oldest
    expect(h.recallNext()).toBe('two');         // ↓
    expect(h.recallNext()).toBe('live');        // ↓ restores the stashed draft
    expect(h.recallNext()).toBeNull();          // ↓ already at the draft
  });

  it('skips consecutive duplicates', () => {
    const h = createSentHistory();
    h.record('same');
    h.record('same');
    expect(h.recallPrev('')).toBe('same');
    expect(h.recallPrev('')).toBe('same'); // only stored once → clamps
  });

  it('caps the ring at the given size, dropping the oldest', () => {
    const h = createSentHistory(2);
    h.record('a'); h.record('b'); h.record('c');
    expect(h.recallPrev('')).toBe('c');
    expect(h.recallPrev('')).toBe('b');
    expect(h.recallPrev('')).toBe('b'); // 'a' evicted
  });

  it('reset() leaves recall mode so the next ↑ re-stashes the current draft', () => {
    const h = createSentHistory();
    h.record('x');
    h.recallPrev('first');
    h.reset();                             // typing
    expect(h.recallPrev('second')).toBe('x');
    expect(h.recallNext()).toBe('second'); // the newer draft is stashed, not "first"
  });

  it('record() after recalling returns to the live draft', () => {
    const h = createSentHistory();
    h.record('a');
    h.recallPrev('draft');
    h.record('b');           // send while recalled
    expect(h.recallNext()).toBeNull(); // back at the draft
    expect(h.recallPrev('')).toBe('b');
  });
});
