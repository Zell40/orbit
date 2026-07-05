import { describe, it, expect } from 'vitest';
import { hostmask, maskMatches, isService, maskSecret, detectServiceLeak, stripFormatting, tidyOutgoing } from './text';

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

describe('isService', () => {
  it('recognises the standard services (case-insensitive)', () => {
    expect(isService('NickServ')).toBe(true);
    expect(isService('chanserv')).toBe(true);
    expect(isService('HostServ')).toBe(true);
    expect(isService('MemoServ')).toBe(true);
    expect(isService('BotServ')).toBe(true);
    expect(isService('OperServ')).toBe(true);
    expect(isService('alice')).toBe(false);
    expect(isService('observer')).toBe(false);
  });
});

describe('maskSecret', () => {
  it('masks the password but keeps the account in IDENTIFY <acct> <pw>', () => {
    expect(maskSecret('IDENTIFY Mik hunter2!')).toBe('IDENTIFY Mik ••••••••');
  });
  it('masks the single-arg IDENTIFY <pw>', () => {
    expect(maskSecret('IDENTIFY hunter2!')).toBe('IDENTIFY ••••••••');
  });
  it('masks GHOST nick pass (keeps the nick)', () => {
    expect(maskSecret('GHOST Mik secret9')).toBe('GHOST Mik ••••••••');
  });
});

describe('detectServiceLeak', () => {
  it('catches a credential-shaped IDENTIFY typed without a slash', () => {
    expect(detectServiceLeak('IDENTIFY Mik avaava2020@!!'))
      .toEqual({ service: 'NickServ', command: 'IDENTIFY Mik avaava2020@!!' });
  });
  it('does NOT hijack normal chat that starts with "identify"', () => {
    expect(detectServiceLeak('identify the killer')).toBeNull();
  });
  it('routes an explicit "ns identify …" to NickServ', () => {
    const r = detectServiceLeak('ns identify hunter2');
    expect(r?.service).toBe('NickServ');
    expect(r?.command).toBe('identify hunter2');
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
});

describe('hostmask', () => {
  it('builds user@host or empty when missing', () => {
    expect(hostmask({ user: 'u', host: 'h' } as never)).toBe('u@h');
    expect(hostmask({ user: '', host: '' } as never)).toBe('');
  });
});
