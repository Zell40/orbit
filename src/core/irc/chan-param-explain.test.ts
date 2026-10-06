import { describe, it, expect } from 'vitest';
import {
  normalizeRedirectTarget, formatModeToken, parseChanParam, explainChanParam,
} from './chan-param-explain';

describe('normalizeRedirectTarget', () => {
  it('prefixes a missing hash', () => {
    expect(normalizeRedirectTarget('Aide.chat')).toBe('#Aide.chat');
    expect(normalizeRedirectTarget('#Aide.chat')).toBe('#Aide.chat');
    expect(normalizeRedirectTarget('  &help  ')).toBe('&help');
  });
});

describe('formatModeToken', () => {
  it('shows letter and value together', () => {
    expect(formatModeToken('j', '5:10')).toBe('+j 5:10');
    expect(formatModeToken('L', '#Aide.chat')).toBe('+L #Aide.chat');
    expect(formatModeToken('j', '')).toBe('+j');
  });
});

describe('parseChanParam', () => {
  it('reads join-flood and redirect forms', () => {
    expect(parseChanParam('j', '5:10')).toEqual({ kind: 'pair', a: 5, b: 10, flag: undefined });
    expect(parseChanParam('f', '*5:10')).toEqual({ kind: 'pair', a: 5, b: 10, flag: '*' });
    expect(parseChanParam('L', 'Aide.chat')).toEqual({ kind: 'chan', chan: '#Aide.chat' });
    expect(parseChanParam('d', '5')).toEqual({ kind: 'num', n: 5 });
    expect(parseChanParam('H', '20:1d')).toEqual({ kind: 'countDur', n: 20, dur: '1d' });
  });
});

describe('explainChanParam', () => {
  it('explains +j 5:10 in the active locale', () => {
    const text = explainChanParam('j', '5:10');
    expect(text).toMatch(/5/);
    expect(text).toMatch(/10/);
  });
});
