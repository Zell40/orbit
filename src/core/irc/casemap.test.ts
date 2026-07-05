import { describe, it, expect } from 'vitest';
import { casefold } from './casemap';

describe('casefold', () => {
  it('lowercases ASCII letters', () => {
    expect(casefold('Bob')).toBe('bob');
    expect(casefold('#Taverne')).toBe('#taverne');
  });

  it('rfc1459 also folds []\\^ to {}|~', () => {
    expect(casefold('Nick[]\\^', 'rfc1459')).toBe('nick{}|~');
  });

  it('rfc1459-strict leaves ^ alone', () => {
    expect(casefold('A[]\\^', 'rfc1459-strict')).toBe('a{}|^');
  });

  it('ascii mapping leaves the extra punctuation alone', () => {
    expect(casefold('A[]\\^', 'ascii')).toBe('a[]\\^');
  });
  it('tolerates a missing/undefined name (crafted line with no target param)', () => {
    expect(casefold(undefined as unknown as string)).toBe('');
    expect(casefold('')).toBe('');
  });
});
