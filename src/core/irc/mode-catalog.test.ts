import { describe, it, expect } from 'vitest';
import {
  USER_FLAGS,
  CHAN_FLAGS,
  CHAN_PARAMS,
  advertisedModeLetters,
  advertisedUserModes,
  filterCatalog,
  parentalLockedLetters,
  umodeRowState,
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
  it('locks the pack when every letter is set', () => {
    expect([...parentalLockedLetters('ixIgcRw', '+ixIgcRw')].sort().join('')).toBe('IRcgiwx');
    expect(parentalLockedLetters('igx', '+ixIgcRw').size).toBe(0);
  });

  it('locks the whole pack during a parental session even if umodes lag', () => {
    expect([...parentalLockedLetters('', '+ixIgcRw', true)].sort().join('')).toBe('IRcgiwx');
  });

  it('ignores a single-letter pack so voluntary +g is not parental', () => {
    expect(parentalLockedLetters('g', '+g').size).toBe(0);
    expect(parentalLockedLetters('g', '+g', true).size).toBe(0);
  });
});

describe('umodeRowState', () => {
  const cloak = USER_FLAGS.find((f) => f.m === 'x')!;
  const inv = USER_FLAGS.find((f) => f.m === 'i')!;
  const geo = USER_FLAGS.find((f) => f.m === 'y')!;
  const tls = USER_FLAGS.find((f) => f.m === 'z')!;

  it('shows parental pack letters as on and locked even when umodes are empty', () => {
    const pack = parentalLockedLetters('', '+ixIgcRw', true);
    const row = umodeRowState(inv, '', pack, true);
    expect(row).toEqual({ on: true, locked: true, reason: 'parental' });
  });

  it('locks +x when it is on so the real host cannot be revealed', () => {
    const row = umodeRowState(cloak, 'x', new Set(), false);
    expect(row).toEqual({ on: true, locked: true, reason: 'cloak' });
  });

  it('lets +x be turned on when it is off', () => {
    const row = umodeRowState(cloak, '', new Set(), false);
    expect(row).toEqual({ on: false, locked: false, reason: null });
  });

  it('locks +z when it is on', () => {
    expect(umodeRowState(tls, 'z', new Set(), false)).toEqual({
      on: true, locked: true, reason: 'protect',
    });
  });

  it('locks GeoIP on a parental session', () => {
    expect(umodeRowState(geo, '', new Set(), true)).toEqual({
      on: false, locked: true, reason: 'geo',
    });
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

  it('lists RFC channel flags before complementary ones', () => {
    expect(CHAN_FLAGS.filter((f) => f.group === 'classic').map((f) => f.m).join('')).toBe('imntsp');
    const extra = CHAN_FLAGS.findIndex((f) => f.group === 'extra');
    const lastClassic = CHAN_FLAGS.map((f) => f.group).lastIndexOf('classic');
    expect(extra).toBeGreaterThan(lastClassic);
  });

  it('hides +B (bot) from Settings and treats +x as not disableable', () => {
    expect(USER_FLAGS.find((f) => f.m === 'B')?.hidden).toBe(true);
    expect(USER_FLAGS.find((f) => f.m === 'x')?.cannotDisable).toBe(true);
  });
});
