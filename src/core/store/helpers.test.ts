import { describe, it, expect } from 'vitest';
import { makeHelpers } from './helpers';
import type { ChatState } from '../store';
import type { ChatMessage } from '../irc/types';

function setup() {
  const state = {
    active: '#aide.chat',
    nick: 'me',
    order: ['#aide.chat'] as string[],
    buffers: {
      '#aide.chat': {
        name: '#Aide.chat',
        isChannel: true,
        members: {},
        messages: [] as ChatMessage[],
        unread: 0,
        joined: true,
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
  return { helpers, state, notice };
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
