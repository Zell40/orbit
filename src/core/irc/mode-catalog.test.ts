import { describe, it, expect } from 'vitest';
import {
  USER_FLAGS,
  CHAN_FLAGS,
  CHAN_PARAMS,
  advertisedModeLetters,
  advertisedUserModes,
  filterCatalog,
  parentalLockedLetters,
} from './mode-catalog';

describe('advertisedModeLetters', () => {
  it('splits an ISUPPORT USERMODES/CHANMODES token into letters', () => {
    expect([...advertisedModeLetters(',,s,iowx')].sort().join('')).toBe('ioswx');
  });

  it('returns empty for a missing token', () => {
    expect(advertisedModeLetters(undefined).size).toBe(0);
    expect(advertisedModeLetters('').size).toBe(0);
  });
});

describe('advertisedUserModes', () => {
  it('prefers USERMODES over RPL_MYINFO', () => {
    const set = advertisedUserModes({ USERMODES: ',,,ixg' }, 'iowx');
    expect(set.has('g')).toBe(true);
    expect(set.has('o')).toBe(false);
  });

  it('falls back to MYINFO usermodes when USERMODES is absent', () => {
    const set = advertisedUserModes({}, 'iowx');
    expect([...set].sort().join('')).toBe('iowx');
  });
});

describe('filterCatalog', () => {
  it('keeps the full catalogue when the server advertised nothing', () => {
    expect(filterCatalog(USER_FLAGS, new Set())).toHaveLength(USER_FLAGS.length);
  });

  it('drops letters the ircd does not have', () => {
    const shown = filterCatalog(USER_FLAGS, new Set(['i', 'g', 'x']));
    expect(shown.map((f) => f.m).join('')).toBe('ixg');
  });
});

describe('parentalLockedLetters', () => {
  it('locks the pack only when every letter is set', () => {
    expect([...parentalLockedLetters('ixIgcRw', '+ixIgcRw')].sort().join('')).toBe('IRcgiwx');
    expect(parentalLockedLetters('igx', '+ixIgcRw').size).toBe(0);
  });

  it('ignores a single-letter pack so voluntary +g is not parental', () => {
    expect(parentalLockedLetters('g', '+g').size).toBe(0);
  });
});

describe('catalogues', () => {
  it('does not put +k/+l in the flags or extra params lists', () => {
    expect(CHAN_FLAGS.some((f) => f.m === 'k' || f.m === 'l')).toBe(false);
    expect(CHAN_PARAMS.some((f) => f.m === 'k' || f.m === 'l')).toBe(false);
  });

  it('marks +r as read-only', () => {
    expect(CHAN_FLAGS.find((f) => f.m === 'r')?.readonly).toBe(true);
  });
});
