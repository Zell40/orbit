import { describe, it, expect } from 'vitest';
import { hostmask, maskMatches, stripFormatting, tidyOutgoing } from './text';

describe('tidyOutgoing', () => {
  it('strips the "screenful of blank space + a dot" padding spam', () => {
    expect(tidyOutgoing(' '.repeat(120) + '.')).toBe('.');
    expect(tidyOutgoing('.' + ' '.repeat(120) + '.')).toBe('. .');
  });
  it('collapses runs of spaces/tabs to a single space and trims the ends', () => {
    expect(tidyOutgoing('  hello    world  ')).toBe('hello world');
    expect(tidyOutgoing('a\t\t\tb')).toBe('a b');
  });
  it('keeps single spaces and normal text intact', () => {
    expect(tidyOutgoing('hello world')).toBe('hello world');
  });
  it('preserves newlines but caps blank-line runs and trims each line', () => {
    expect(tidyOutgoing('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(tidyOutgoing('a   \n   b')).toBe('a\nb');
  });
  it('leaves formatting control bytes untouched', () => {
    expect(tidyOutgoing('\x02bold\x02')).toBe('\x02bold\x02');
  });
});

describe('stripFormatting', () => {
  it('removes mIRC control codes so a /command is still detected', () => {
    expect(stripFormatting('\x02/join #dev\x02')).toBe('/join #dev');
  });
});

describe('maskMatches', () => {
  it('matches a wildcard ban mask against a hostmask', () => {
    expect(maskMatches('*!*@evil.host', 'bad!x@evil.host')).toBe(true);
    expect(maskMatches('*!*@evil.host', 'ok!x@good.host')).toBe(false);
  });
  it('handles ? and case-insensitivity', () => {
    expect(maskMatches('b?d!*@*', 'BAD!x@h')).toBe(true);
    expect(maskMatches('b?d!*@*', 'bard!x@h')).toBe(false);
  });
  it('does not blow up on a wildcard-packed mask (no ReDoS)', () => {
    const mask = '*a'.repeat(30) + '!*@*';
    const who = 'a'.repeat(60) + 'b!user@host';
    const t0 = performance.now();
    expect(maskMatches(mask, who)).toBe(false);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe('hostmask', () => {
  it('builds user@host or empty when missing', () => {
    expect(hostmask({ user: 'u', host: 'h' } as never)).toBe('u@h');
    expect(hostmask({ user: '', host: '' } as never)).toBe('');
  });
});
