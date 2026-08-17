import { describe, it, expect } from 'vitest';
import { makeHelpers } from './helpers';
import type { ChatState } from '../store';
import type { ChatMessage } from '../irc/types';

function setup() {
  const state = {
    active: '#aide.chat',
    nick: 'me',
    order: ['#aide.chat', 'aidemoi'] as string[],
    buffers: {
      '#aide.chat': {
        name: '#Aide.chat',
        isChannel: true,
        members: {},
        messages: [] as ChatMessage[],
        unread: 0,
        joined: true,
      },
      aidemoi: {
        name: 'AideMoi',
        isChannel: false,
        members: {},
        messages: [] as ChatMessage[],
        unread: 0,
        joined: false,
      },
    },
    whois: {},
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
});
