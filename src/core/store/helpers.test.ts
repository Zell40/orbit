import { describe, it, expect } from 'vitest';
import { makeHelpers, rememberQueryAccount, presenceInterrupted, sameReplayEvent } from './helpers';
import type { ChatState } from '../store';
import type { ChatMessage, Member, WhoisInfo } from '../irc/types';

function setup() {
  const state = {
    active: '#aide.chat',
    nick: 'me',
    order: ['#aide.chat', 'aidemoi'] as string[],
    buffers: {
      '#aide.chat': {
        name: '#Aide.chat',
        isChannel: true,
        members: {} as Record<string, Member>,
        messages: [] as ChatMessage[],
        unread: 0,
        highlight: false,
        joined: true,
        sessionJoinedAt: undefined as number | undefined,
      },
      aidemoi: {
        name: 'AideMoi',
        isChannel: false,
        members: {} as Record<string, Member>,
        messages: [] as ChatMessage[],
        unread: 0,
        highlight: false,
        joined: false,
      },
    },
    whois: {} as Record<string, WhoisInfo>,
    prefs: { showStatus: false },
    profileUser: '',
  };
  const get = () => state as unknown as ChatState;
  const set = (p: Partial<typeof state>) => Object.assign(state, p);
  const helpers = makeHelpers(set as never, get, new Set());
  const notice = (text: string, id: string, ts = 1000): ChatMessage => ({
    id, bufferName: '#Aide.chat', from: 'AideMoi', text, ts, kind: 'notice', self: false,
  });
  const pm = (text: string, id: string, ts = 1000): ChatMessage => ({
    id, bufferName: 'AideMoi', from: 'AideMoi', text, ts, kind: 'privmsg', self: false,
  });
  return { helpers, state, notice, pm };
}

describe('addMessage notice coalesce', () => {
  it('merges rapid consecutive NOTICEs from the same nick into one bubble', () => {
    const { helpers, state, notice } = setup();
    helpers.addMessage('#Aide.chat', notice('Bienvenue sur #Aide.chat. Un ticket', 'n1', 1000));
    helpers.addMessage('#Aide.chat', notice("n'est ouvert qu'une fois votre problème compris.", 'n2', 1100));
    const msgs = state.buffers['#aide.chat'].messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe(
      "Bienvenue sur #Aide.chat. Un ticket n'est ouvert qu'une fois votre problème compris.",
    );
  });

  it('keeps bullet list notices on separate lines inside the bubble', () => {
    const { helpers, state, notice } = setup();
    helpers.addMessage('#Aide.chat', notice('Modes disponibles :', 'n1', 1000));
    helpers.addMessage('#Aide.chat', notice('• Facile → 3 catégories, 30 secondes.', 'n2', 1100));
    helpers.addMessage('#Aide.chat', notice('• Moyen → 5 catégories, 40 secondes.', 'n3', 1200));
    const msgs = state.buffers['#aide.chat'].messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe(
      'Modes disponibles :\n• Facile → 3 catégories, 30 secondes.\n• Moyen → 5 catégories, 40 secondes.',
    );
  });

  it('keeps a bot help screen line-per-frame instead of one paragraph', () => {
    const { helpers, state, notice } = setup();
    const frames = [
      'Tickets',
      'LIST — lister tickets ouverts + TODO/PROJET',
      'SHOW — ticket complet (#id), messages #id.n',
      'RESPONSE — réponse de clôture, puis fermeture auto',
      'CLOSE — fermer un ticket, TODO ou PROJET',
    ];
    frames.forEach((text, i) => helpers.addMessage('#Aide.chat', notice(text, `f${i}`, 1000 + i * 100)));
    const msgs = state.buffers['#aide.chat'].messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe(frames.join('\n'));
  });

  it('does not merge notices from different nicks or after a gap', () => {
    const { helpers, state, notice } = setup();
    helpers.addMessage('#Aide.chat', notice('first', 'a', 1000));
    helpers.addMessage('#Aide.chat', { ...notice('other bot', 'b', 1100), from: 'Operateur' });
    helpers.addMessage('#Aide.chat', notice('later', 'c', 5000));
    expect(state.buffers['#aide.chat'].messages).toHaveLength(3);
  });
});

describe('addMessage query privmsg coalesce', () => {
  it('merges rapid consecutive PMs from the same nick into one bubble', () => {
    const { helpers, state, pm } = setup();
    helpers.addMessage('AideMoi', pm(
      "Le ticket #1 est maintenant ouvert. Un membre de l'équipe va s'en occuper dès que possible. Vous",
      'p1',
      1000,
    ));
    helpers.addMessage('AideMoi', pm(
      'pouvez continuer à envoyer des messages ici ; ils seront ajoutés au ticket.',
      'p2',
      1100,
    ));
    const msgs = state.buffers.aidemoi.messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe(
      "Le ticket #1 est maintenant ouvert. Un membre de l'équipe va s'en occuper dès que possible. Vous pouvez continuer à envoyer des messages ici ; ils seront ajoutés au ticket.",
    );
  });

  it('merges rapid consecutive channel privmsgs from the same nick', () => {
    const { helpers, state, pm } = setup();
    const chanPm = (text: string, id: string, ts = 1000): ChatMessage => ({
      ...pm(text, id, ts), bufferName: '#Aide.chat',
    });
    helpers.addMessage('#Aide.chat', chanPm('part one of a long line', 'c1', 1000));
    helpers.addMessage('#Aide.chat', chanPm('continues here.', 'c2', 1100));
    const msgs = state.buffers['#aide.chat'].messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe('part one of a long line continues here.');
  });

  it('keeps HelpServ LIST tickets and section headers on their own lines', () => {
    const { helpers, state, pm } = setup();
    helpers.addMessage('AideMoi', pm('IDEA (3)', 'h1', 1000));
    helpers.addMessage('AideMoi', pm('#15 IDEA · en cours · Zell — Création d\'un systeme avec multi id', 'h2', 1100));
    helpers.addMessage('AideMoi', pm('pour les messages enregistré de...', 'h3', 1200));
    helpers.addMessage('AideMoi', pm('#17 IDEA · à traiter · Jessie — Fermeture de salon', 'h4', 1300));
    helpers.addMessage('AideMoi', pm('TODO (3)', 'h5', 1400));
    helpers.addMessage('AideMoi', pm('#20 TODO · à faire · Zell — Gestion du mode +g chanfilter', 'h6', 1500));
    const msgs = state.buffers.aidemoi.messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe([
      'IDEA (3)',
      '#15 IDEA · en cours · Zell — Création d\'un systeme avec multi id pour les messages enregistré de...',
      '#17 IDEA · à traiter · Jessie — Fermeture de salon',
      'TODO (3)',
      '#20 TODO · à faire · Zell — Gestion du mode +g chanfilter',
    ].join('\n'));
  });
});

describe('addMessage echo reconcile', () => {
  it('upgrades the optimistic copy in place and keeps a stable row key', () => {
    const { helpers, state } = setup();
    const mine = (id: string, ts: number, msgid?: string): ChatMessage => ({
      id, msgid, bufferName: '#Aide.chat', from: 'me', text: 'salut', ts, kind: 'privmsg', self: true,
    });
    helpers.addMessage('#Aide.chat', mine('local-1', 1000));
    helpers.addMessage('#Aide.chat', mine('srv-msgid', 1050, 'srv-msgid'));
    const msgs = state.buffers['#aide.chat'].messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ id: 'srv-msgid', msgid: 'srv-msgid', ts: 1050 });
    // The React key must not change when the echo lands, or the row remounts.
    expect(msgs[0].rowId).toBe('local-1');
  });
});

describe('addMessage replay events', () => {
  it('drops a JOIN that matches one already shown with a different timestamp', () => {
    const { helpers, state } = setup();
    helpers.addMessage('#Aide.chat', {
      id: 'live', bufferName: '#Aide.chat', from: 'Quen', text: 'Quen est entré',
      ts: 50_000, kind: 'join', self: false,
    });
    helpers.addMessage('#Aide.chat', {
      id: 'hist', bufferName: '#Aide.chat', from: 'Quen', text: 'Quen est entré',
      ts: 48_000, kind: 'join', self: false,
    });
    expect(state.buffers['#aide.chat'].messages).toHaveLength(1);
    expect(state.buffers['#aide.chat'].messages[0].ts).toBe(48_000);
  });
});

describe('addMessage unread while chat is covered', () => {
  it('counts a NOTICE on the active salon when a game hides the timeline', () => {
    const { helpers, state } = setup();
    (state as { chatCovered?: boolean }).chatCovered = true;
    helpers.addMessage('#Aide.chat', {
      id: 'n1', bufferName: '#Aide.chat', from: 'ChanServ', text: 'You have been invited',
      ts: 1000, kind: 'notice', self: false,
    });
    expect(state.buffers['#aide.chat'].unread).toBe(1);
    expect(state.buffers['#aide.chat'].highlight).toBe(true);
  });

  it('does not count a channel PRIVMSG from the game bot while covered', () => {
    const { helpers, state } = setup();
    (state as { chatCovered?: boolean }).chatCovered = true;
    helpers.addMessage('#Aide.chat', {
      id: 'p1', bufferName: '#Aide.chat', from: 'Bac', text: 'Lettre : A',
      ts: 1000, kind: 'privmsg', self: false,
    });
    expect(state.buffers['#aide.chat'].unread).toBe(0);
  });
});

describe('patchWhois casemapping', () => {
  it('applies a differently-cased reply onto the in-flight /whois entry', () => {
    const { helpers, state } = setup();
    state.whois = { borisismo: { nick: 'borisismo', loading: true } };
    helpers.patchWhois('Borisismo', (w) => ({ ...w, user: 'u', host: 'h', loading: false }));
    expect(state.whois.borisismo).toMatchObject({ user: 'u', host: 'h', loading: false });
    expect(state.whois.Borisismo).toBeUndefined();
  });
});

describe('rememberQueryAccount', () => {
  it('stores the account on a query buffer and ignores channels', () => {
    const { helpers, state } = setup();
    rememberQueryAccount(helpers.patchBuffer, 'AideMoi', 'AideMoi', 'harry');
    expect(state.buffers.aidemoi.members['AideMoi']?.account).toBe('harry');
    rememberQueryAccount(helpers.patchBuffer, '#Aide.chat', 'bob', 'bobacct');
    expect(state.buffers['#aide.chat'].members.bob).toBeUndefined();
  });
});

describe('presence replay dedup', () => {
  const join = (nick: string, ts: number, id: string): ChatMessage => ({
    id, bufferName: '#Aide.chat', from: nick, text: `${nick} est entré`, ts, kind: 'join', self: false,
  });
  const quit = (nick: string, ts: number, id: string): ChatMessage => ({
    id, bufferName: '#Aide.chat', from: nick, text: `${nick} s'est déconnecté`, ts, kind: 'quit', self: false,
  });

  it('sameReplayEvent still matches a JOIN replayed within 90s', () => {
    expect(sameReplayEvent(join('Zell363', 1000, 'a'), join('Zell363', 5000, 'b'))).toBe(true);
  });

  it('presenceInterrupted after QUIT so a rapid re-JOIN is a new visit', () => {
    const msgs = [join('Zell363', 1000, 'j1'), quit('Zell363', 2000, 'q1')];
    expect(presenceInterrupted(msgs, 0, join('Zell363', 3000, 'j2'))).toBe(true);
    expect(presenceInterrupted([join('Zell363', 1000, 'j1')], 0, join('Zell363', 3000, 'j2'))).toBe(false);
  });

  it('keeps a second JOIN after QUIT on the timeline', () => {
    const { helpers, state } = setup();
    state.buffers['#aide.chat'].sessionJoinedAt = 1;
    helpers.addMessage('#Aide.chat', join('Zell363', 10_000, 'j1'));
    helpers.addMessage('#Aide.chat', quit('Zell363', 11_000, 'q1'));
    helpers.addMessage('#Aide.chat', join('Zell363', 12_000, 'j2'));
    const kinds = state.buffers['#aide.chat'].messages.map((m) => `${m.kind}:${m.id}`);
    expect(kinds).toEqual(['join:j1', 'quit:q1', 'join:j2']);
  });

  it('still collapses a true JOIN replay without an intervening leave', () => {
    const { helpers, state } = setup();
    state.buffers['#aide.chat'].sessionJoinedAt = 1;
    helpers.addMessage('#Aide.chat', join('Quen', 50_100, 'live-join'));
    helpers.addMessage('#Aide.chat', join('Quen', 48_200, 'hist-join'));
    expect(state.buffers['#aide.chat'].messages.filter((m) => m.kind === 'join')).toHaveLength(1);
  });
});
