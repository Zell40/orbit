import { describe, it, expect } from 'vitest';
import { parseLine, parseTags } from './parser';

describe('parseLine', () => {
  it('parses a full PRIVMSG with prefix and trailing', () => {
    const m = parseLine(':nick!user@host PRIVMSG #chan :hello world');
    expect(m.nick).toBe('nick');
    expect(m.user).toBe('user');
    expect(m.host).toBe('host');
    expect(m.command).toBe('PRIVMSG');
    expect(m.params).toEqual(['#chan', 'hello world']);
  });

  it('parses IRCv3 message tags', () => {
    const m = parseLine('@id=5;account=bob :bob!b@h PRIVMSG #x :hi');
    expect(m.tags.id).toBe('5');
    expect(m.tags.account).toBe('bob');
    expect(m.command).toBe('PRIVMSG');
  });

  it('handles a bare command with one trailing param (PING)', () => {
    const m = parseLine('PING :token');
    expect(m.command).toBe('PING');
    expect(m.params).toEqual(['token']);
  });

  it('parses a numeric from the server', () => {
    const m = parseLine(':server 001 me :Welcome');
    expect(m.command).toBe('001');
    expect(m.params).toEqual(['me', 'Welcome']);
  });
});

describe('parseTags', () => {
  it('unescapes tag values', () => {
    // \s → space, \: → ;, per the IRCv3 tag escape rules
    const tags = parseTags('a=1\\sb;c=x\\:y');
    expect(tags.a).toBe('1 b');
    expect(tags.c).toBe('x;y');
  });
});
