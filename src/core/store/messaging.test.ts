import { describe, it, expect } from 'vitest';
import { makeMessaging } from './messaging';
import { parseLine } from '../irc/parser';
import type { ChatMessage } from '../irc/types';
import type { ChatState } from '../store';
import type { StoreHelpers } from './helpers';

function setup(over: Partial<Record<string, unknown>> = {}) {
  const state = {
    active: '#x', isActive: true, ignored: [] as string[],
    reg: { busy: false, challengeUrl: '' }, notifyLevel: {} as Record<string, string>,
    highlightWords: [] as string[], prefs: { sound: false }, pmContext: {} as Record<string, string>,
    ...over,
  };
  const added: { name: string; m: ChatMessage }[] = [];
  const serverLines: string[] = [];
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => Object.assign(state, p);
  const helpers = {
    addMessage: (name: string, m: ChatMessage) => { added.push({ name, m }); },
    patchBuffer: () => {},
    serverLine: (text: string) => { serverLines.push(text); },
    tsOf: () => 1000,
  } as unknown as StoreHelpers;
  const { handleMessaging } = makeMessaging({
    get, set, knownServices: new Set<string>(),
    filehost: { resolve: null, reject: null, timer: null }, helpers,
  } as Parameters<typeof makeMessaging>[0]);
  const on = (line: string, me = 'me') => handleMessaging(parseLine(line), me);
  return { on, added, serverLines, state };
}

describe('messaging (PRIVMSG/NOTICE)', () => {
  it('routes a channel message to the channel buffer', () => {
    const { on, added } = setup();
    on(':bob!u@h PRIVMSG #x :hello');
    expect(added).toHaveLength(1);
    expect(added[0].name).toBe('#x');
    expect(added[0].m).toMatchObject({ from: 'bob', text: 'hello', kind: 'privmsg', self: false });
  });

  it('opens a query for a PM from another user', () => {
    const { on, added } = setup();
    on(':bob!u@h PRIVMSG me :hi there');
    expect(added[0].name).toBe('bob'); // PM buffer keyed by sender
  });

  it('drops a message from an ignored nick', () => {
    const { on, added } = setup({ ignored: ['bad'] });
    on(':bad!u@h PRIVMSG #x :spam');
    expect(added).toHaveLength(0);
  });

  it('parses CTCP ACTION into an action line', () => {
    const { on, added } = setup();
    on(':bob!u@h PRIVMSG #x :\x01ACTION waves\x01');
    expect(added[0].m).toMatchObject({ kind: 'action', text: 'waves' });
  });

  it('ignores other CTCP requests', () => {
    const { on, added } = setup();
    on(':bob!u@h PRIVMSG #x :\x01VERSION\x01');
    expect(added).toHaveLength(0);
  });

  it('sends a server NOTICE (to *) to the console', () => {
    const { on, added, serverLines } = setup();
    on(':irc.server NOTICE * :the MOTD');
    expect(added).toHaveLength(0);
    expect(serverLines).toContain('the MOTD');
  });

  it('captures +draft/channel-context off a service notice', () => {
    const { on, added } = setup();
    on('@+draft/channel-context=#ops :ChanServ!s@services NOTICE me :bob removed your access to #ops');
    expect(added).toHaveLength(1);
    expect(added[0].m).toMatchObject({ kind: 'notice', channelContext: '#ops' });
  });

  it('leaves channelContext unset on a plain notice', () => {
    const { on, added } = setup();
    on(':ChanServ!s@services NOTICE me :hello');
    expect(added[0].m.channelContext).toBeUndefined();
  });

  it('returns false for a non-message command', () => {
    const { on } = setup();
    expect(on(':bob!u@h JOIN #x')).toBe(false);
  });

  it('extracts a FILEHOST token from a services nick NOTICE (not only bare server notices)', () => {
    let token = '';
    const state = {
      active: '#x', isActive: true, ignored: [] as string[],
      reg: { busy: false, challengeUrl: '' }, notifyLevel: {} as Record<string, string>,
      highlightWords: [] as string[], prefs: { sound: false }, pmContext: {} as Record<string, string>,
    };
    const helpers = {
      addMessage: () => {},
      patchBuffer: () => {},
      serverLine: () => {},
      tsOf: () => 1000,
    } as unknown as StoreHelpers;
    const filehost = {
      resolve: ((t: string) => { token = t; }) as ((token: string) => void) | null,
      reject: null as ((err: Error) => void) | null,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    const { handleMessaging } = makeMessaging({
      get: () => state as unknown as ChatState,
      set: (p) => Object.assign(state, p),
      knownServices: new Set<string>(),
      filehost, helpers,
    } as Parameters<typeof makeMessaging>[0]);
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJGSUxFSE9TVCJ9.sig';
    const ok = handleMessaging(parseLine(
      `:FileHost!fh@services NOTICE me :FILEHOST https://webchat.example/app/upload?token=${jwt}`,
    ), 'me');
    expect(ok).toBe(true);
    expect(token).toBe(jwt);
  });
});
