import { describe, it, expect } from 'vitest';
import { buildSwitcherResults, type SwitcherData } from './switcher';

const data: SwitcherData = {
  nick: 'me',
  friends: ['offlinepal'],
  order: ['$server', '#taverne', '#help', 'bob'],
  buffers: {
    $server: { name: '$server', isChannel: false, members: {} },
    '#taverne': { name: '#taverne', isChannel: true, members: { me: { nick: 'me' }, alice: { nick: 'alice' }, bob: { nick: 'bob' } } },
    '#help': { name: '#help', isChannel: true, members: { carol: { nick: 'carol' } } },
    bob: { name: 'bob', isChannel: false, members: {} },
  },
};

describe('buildSwitcherResults', () => {
  it('with no query returns open buffers only (no server console)', () => {
    const r = buildSwitcherResults('', data);
    expect(r.map((x) => x.target)).toEqual(['#taverne', '#help', 'bob']);
    expect(r.every((x) => x.target !== '$server')).toBe(true);
  });

  it('matches channels by name', () => {
    const r = buildSwitcherResults('tav', data);
    expect(r[0]).toMatchObject({ kind: 'channel', target: '#taverne' });
  });

  it('surfaces people from open channels, excluding self and open DMs', () => {
    const r = buildSwitcherResults('al', data);
    expect(r.some((x) => x.kind === 'person' && x.target === 'alice')).toBe(true);
    // 'me' (self) and 'bob' (already an open DM) never appear as a person
    const carol = buildSwitcherResults('car', data);
    expect(carol.some((x) => x.kind === 'person' && x.target === 'carol')).toBe(true);
    expect(buildSwitcherResults('bob', data).some((x) => x.kind === 'person')).toBe(false);
  });

  it('ranks a prefix match above a substring match', () => {
    const d = { ...data, order: ['#help', '#xhelp'], buffers: {
      '#help': { name: '#help', isChannel: true, members: {} },
      '#xhelp': { name: '#xhelp', isChannel: true, members: {} },
    } };
    const r = buildSwitcherResults('help', d);
    expect(r[0].target).toBe('#help');
  });

  it('offers to join a channel that is not open', () => {
    const r = buildSwitcherResults('random', data);
    const join = r.find((x) => x.kind === 'join');
    expect(join).toMatchObject({ kind: 'join', target: '#random' });
  });

  it('does not offer join for an already-open channel', () => {
    const r = buildSwitcherResults('#taverne', data);
    expect(r.some((x) => x.kind === 'join')).toBe(false);
  });
});
