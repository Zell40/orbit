import { describe, it, expect } from 'vitest';
import { completeToken, type CompleteContext } from './complete';

const ctx = (over: Partial<CompleteContext> = {}): CompleteContext => ({
  members: ['alice', 'Albert', 'bob'],
  channels: ['#orbit', '#offtopic', '#dev'],
  pluginCmds: ['giphy'],
  slashCommands: ['me', 'msg', 'join'],
  emojiNames: { fire: '🔥', feu: '🔥', smile: '😀' },
  ...over,
});

describe('completeToken', () => {
  it('returns null when the caret is not on a token', () => {
    expect(completeToken('hello ', 6, ctx())).toBeNull();
  });

  it('completes :name to emoji', () => {
    const r = completeToken(':fi', 3, ctx());
    expect(r).toEqual({ start: 0, candidates: ['🔥'], kind: 'emoji' });
  });

  it('completes a /command only at the start of the line', () => {
    expect(completeToken('/m', 2, ctx())).toEqual({
      start: 0, candidates: ['/me ', '/msg '], kind: 'slash',
    });
    // not at column 0 → treated as a nick token, no member matches "/m"
    expect(completeToken('hi /m', 5, ctx())).toBeNull();
  });

  it('lists every slash command after a bare /', () => {
    const r = completeToken('/', 1, ctx());
    expect(r?.kind).toBe('slash');
    expect(r?.candidates).toEqual(['/giphy ', '/join ', '/me ', '/msg ']);
  });

  it('includes plugin commands in slash completion', () => {
    expect(completeToken('/g', 2, ctx())).toEqual({ start: 0, candidates: ['/giphy '], kind: 'slash' });
  });

  it('completes a #channel token from the known channel list', () => {
    expect(completeToken('/join #o', 8, ctx())).toEqual({
      start: 6, candidates: ['#offtopic ', '#orbit '], kind: 'channel',
    });
    // matches anywhere a #token sits, not just after /join
    expect(completeToken('see #d', 6, ctx())).toEqual({ start: 4, candidates: ['#dev '], kind: 'channel' });
    // a lone '#' completes nothing (needs at least one char)
    expect(completeToken('#', 1, ctx())).toBeNull();
  });

  it('keeps one channel when LIST and the buffer key differ only by case', () => {
    expect(completeToken('/join #edf', 11, ctx({
      channels: ['#edfgdf.chat', '#EDFGDF.chat', '#edf-other'],
    }))).toEqual({
      start: 6, candidates: ['#edf-other ', '#EDFGDF.chat '], kind: 'channel',
    });
  });

  it('completes a bare channel name after /join', () => {
    expect(completeToken('/join o', 7, ctx())).toEqual({
      start: 6, candidates: ['#offtopic ', '#orbit '], kind: 'channel',
    });
  });

  it('completes the last channel in a comma-separated /join list', () => {
    // only "#d" is completed (replaced from its own start), and no trailing
    // space is added so the list can keep growing (/join #orbit,#dev,#…).
    const text = '/join #orbit,#d';
    expect(completeToken(text, text.length, ctx())).toEqual({ start: 13, candidates: ['#dev'], kind: 'channel' });
    // a bare trailing comma has nothing to complete
    expect(completeToken('/join #orbit,', 13, ctx())).toBeNull();
  });

  it('completes a nick, sorted, with a ": " suffix at line start', () => {
    expect(completeToken('al', 2, ctx())).toEqual({
      start: 0, candidates: ['Albert: ', 'alice: '], kind: 'nick',
    });
  });

  it('uses a plain-space suffix for a nick mid-line', () => {
    expect(completeToken('hey al', 6, ctx())).toEqual({
      start: 4, candidates: ['Albert ', 'alice '], kind: 'nick',
    });
  });

  it('returns null when nothing matches', () => {
    expect(completeToken('zzz', 3, ctx())).toBeNull();
  });
});
