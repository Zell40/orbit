import { describe, it, expect } from 'vitest';
import { completeToken, type CompleteContext } from './complete';

const ctx = (over: Partial<CompleteContext> = {}): CompleteContext => ({
  members: ['alice', 'Albert', 'bob'],
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
    expect(r).toEqual({ start: 0, candidates: ['🔥'] });
  });

  it('completes a /command only at the start of the line', () => {
    expect(completeToken('/m', 2, ctx())).toEqual({ start: 0, candidates: ['/me ', '/msg '] });
    // not at column 0 → treated as a nick token, no member matches "/m"
    expect(completeToken('hi /m', 5, ctx())).toBeNull();
  });

  it('includes plugin commands in slash completion', () => {
    expect(completeToken('/g', 2, ctx())).toEqual({ start: 0, candidates: ['/giphy '] });
  });

  it('completes a nick, sorted, with a ": " suffix at line start', () => {
    expect(completeToken('al', 2, ctx())).toEqual({ start: 0, candidates: ['Albert: ', 'alice: '] });
  });

  it('uses a plain-space suffix for a nick mid-line', () => {
    expect(completeToken('hey al', 6, ctx())).toEqual({ start: 4, candidates: ['Albert ', 'alice '] });
  });

  it('returns null when nothing matches', () => {
    expect(completeToken('zzz', 3, ctx())).toBeNull();
  });
});
