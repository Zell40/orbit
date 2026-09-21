import { describe, it, expect } from 'vitest';
import {
  USER_FLAGS,
  CHAN_FLAGS,
  CHAN_PARAMS,
  advertisedChanFlags,
  advertisedModeLetters,
  advertisedUserModes,
  filterCatalog,
  looksLikeMlock,
  mergeMlock,
  mlockLetters,
  parseMlockNotice,
  parentalLockedLetters,
  plainDesc,
  simpleChanFlags,
  umodeRowState,
  looksLikeVhost,
  SIMPLE_CHAN_GROUPS,
} from './mode-catalog';

describe('simplified channel panel', () => {
  it('keeps the group order and drops letters the ircd never advertised', () => {
    const flags = CHAN_FLAGS.filter((f) => 'isnmt'.includes(f.m));
    expect(simpleChanFlags(flags, 'isR').map((f) => f.m)).toEqual(['i', 's']);
    expect(simpleChanFlags(flags, 'nmM').map((f) => f.m)).toEqual(['n', 'm']);
  });

  it('only lists flags the catalogue actually defines', () => {
    const known = new Set(CHAN_FLAGS.map((f) => f.m));
    for (const { letters } of SIMPLE_CHAN_GROUPS) {
      for (const m of letters) expect(known.has(m)).toBe(true);
    }
  });

  it('strips the trailing mode letter from a description', () => {
    expect(plainDesc('Il faut être invité pour entrer (+i)')).toBe('Il faut être invité pour entrer');
    expect(plainDesc('Bloque les requêtes CTCP (+C)')).toBe('Bloque les requêtes CTCP');
    // Nothing to strip, and a parenthesis that is not a mode tag stays put.
    expect(plainDesc('Salon permanent')).toBe('Salon permanent');
    expect(plainDesc('Limite (10 personnes)')).toBe('Limite (10 personnes)');
  });
});

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

  it('lets +x be toggled when no vHost is set', () => {
    expect(umodeRowState(cloak, 'x', new Set(), false)).toEqual({
      on: true, locked: false, reason: null,
    });
    expect(umodeRowState(cloak, '', new Set(), false)).toEqual({
      on: false, locked: false, reason: null,
    });
  });

  it('locks +x off while an Anope vHost is active', () => {
    expect(umodeRowState(cloak, '', new Set(), false, true)).toEqual({
      on: false, locked: true, reason: 'vhost',
    });
  });

  it('keeps parental +x in sync with the live umode (vHost may have removed it)', () => {
    const pack = parentalLockedLetters('', '+ixIgcRw', true);
    expect(umodeRowState(cloak, '', pack, true)).toEqual({
      on: false, locked: true, reason: 'parental',
    });
    expect(umodeRowState(cloak, 'x', pack, true)).toEqual({
      on: true, locked: true, reason: 'parental',
    });
  });

  it('lets +z be turned off', () => {
    expect(umodeRowState(tls, 'z', new Set(), false)).toEqual({
      on: true, locked: false, reason: null,
    });
  });

  it('locks GeoIP on a parental session', () => {
    expect(umodeRowState(geo, '', new Set(), true)).toEqual({
      on: false, locked: true, reason: 'geo',
    });
  });
});

describe('looksLikeVhost', () => {
  it('detects Anope user/nick vHosts when +x is off', () => {
    expect(looksLikeVhost('user/Harry', '')).toBe(true);
    expect(looksLikeVhost('user/Harry', 'x')).toBe(false);
    expect(looksLikeVhost('abc.reseau-entrenous.fr', 'x')).toBe(false);
    expect(looksLikeVhost('', '')).toBe(false);
  });
});

describe('catalogues', () => {
  it('lists +k as a read-only classic flag and keeps +l off the lists', () => {
    expect(CHAN_FLAGS.find((f) => f.m === 'k')?.readonly).toBe(true);
    expect(CHAN_FLAGS.some((f) => f.m === 'l')).toBe(false);
    expect(CHAN_PARAMS.some((f) => f.m === 'k' || f.m === 'l')).toBe(false);
  });

  it('marks +r as read-only', () => {
    expect(CHAN_FLAGS.find((f) => f.m === 'r')?.readonly).toBe(true);
    expect(CHAN_FLAGS.find((f) => f.m === 'r')?.lock).toBe('services');
    expect(CHAN_FLAGS.find((f) => f.m === 'k')?.lock).toBe('overview');
  });

  it('lists RFC channel flags before complementary ones', () => {
    expect(CHAN_FLAGS.filter((f) => f.group === 'classic').map((f) => f.m).join('')).toBe('imntspk');
    const extra = CHAN_FLAGS.findIndex((f) => f.group === 'extra');
    const lastClassic = CHAN_FLAGS.map((f) => f.group).lastIndexOf('classic');
    expect(extra).toBeGreaterThan(lastClassic);
  });

  it('hides +B (bot) and oper-only +W from Settings; +x stays user-toggleable', () => {
    expect(USER_FLAGS.find((f) => f.m === 'B')?.hidden).toBe(true);
    expect(USER_FLAGS.find((f) => f.m === 'W')?.hidden).toBe(true);
    expect(USER_FLAGS.find((f) => f.m === 'x')?.cannotDisable).toBeFalsy();
  });

  it('includes +k among advertised classic flags when CHANMODES has a key', () => {
    const shown = advertisedChanFlags(new Set(['i', 'm', 'n', 't', 's', 'p']), new Set(['k']));
    expect(shown.map((f) => f.m).join('')).toContain('k');
    expect(shown.find((f) => f.m === 'k')?.readonly).toBe(true);
  });

  it('lists +g as a complementary list mode and keeps +G off unless type D has it', () => {
    expect(CHAN_FLAGS.find((f) => f.m === 'g')).toMatchObject({
      key: 'chanfilter', group: 'extra', readonly: true, lock: 'list',
    });
    const noFilter = advertisedChanFlags(new Set(['i', 'm', 'n', 't', 'P', 'T', 'V']), new Set(['k']));
    expect(noFilter.some((f) => f.m === 'g' || f.m === 'G')).toBe(false);
    const withG = advertisedChanFlags(new Set(['i', 'G']), new Set(['k']));
    expect(withG.find((f) => f.m === 'G')?.key).toBe('censor');
    expect(withG.some((f) => f.m === 'g')).toBe(false);
    const withg = advertisedChanFlags(new Set(['i']), new Set(['k']), new Set(['g']));
    expect(withg.find((f) => f.m === 'g')?.lock).toBe('list');
    expect(withg.some((f) => f.m === 'G')).toBe(false);
  });
});

describe('mlock tokens', () => {
  it('keeps mode letters and ignores a trailing sentence', () => {
    expect(mlockLetters('+PtTVn')).toBe('PtTVn');
    expect(mlockLetters('PtTVn')).toBe('PtTVn');
    expect(mlockLetters('+nt-k')).toBe('ntk');
    expect(looksLikeMlock('PtTVn')).toBe(true);
    expect(looksLikeMlock('+nt-k')).toBe(true);
    expect(looksLikeMlock('Mode cannot be changed as it has been locked on by services!')).toBe(false);
    expect(mergeMlock('nt', 'PtTVn')).toBe('ntPTV');
  });

  it('parses ChanServ INFO/MODE lock lines', () => {
    expect(parseMlockNotice('Mode lock: +PtTVn')).toEqual({ mlock: 'PtTVn' });
    expect(parseMlockNotice('MLOCK is +nt-k')).toEqual({ mlock: 'ntk' });
    expect(parseMlockNotice('Modes verrouillés : +nPtTV')).toEqual({ mlock: 'nPtTV' });
    expect(parseMlockNotice('Verrouillage des modes de #foo : +nPtTV')).toEqual({
      chan: '#foo', mlock: 'nPtTV',
    });
    expect(parseMlockNotice('Information for channel #EntreNous.chat: Mode lock: +nt')).toEqual({
      chan: '#EntreNous.chat', mlock: 'nt',
    });
    expect(parseMlockNotice('Founder: Zell')).toBeNull();
  });
});
