import { describe, expect, it } from 'vitest';
import { textSmileyAt } from './smileys';

describe('textSmileyAt', () => {
  it('turns :) into the smile glyph at the caret', () => {
    expect(textSmileyAt('salut :)', 8)).toEqual({ start: 6, emoji: '😀' });
  });

  it('prefers the longer nose form', () => {
    expect(textSmileyAt(':-)', 3)?.emoji).toBe('😀');
    expect(textSmileyAt(':-)', 3)?.start).toBe(0);
  });

  it('does not match inside a word or a url', () => {
    expect(textSmileyAt('http://x', 7)).toBeNull();
    expect(textSmileyAt('abc:)', 5)).toBeNull();
  });

  it('ignores a code the caret has left', () => {
    expect(textSmileyAt(':) ok', 2)).toEqual({ start: 0, emoji: '😀' });
    expect(textSmileyAt(':) ok', 5)).toBeNull();
  });
});
