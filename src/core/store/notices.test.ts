import { describe, it, expect } from 'vitest';
import { NOTICES, noticeBufferName } from './context';
import { nickInMembers, resolveNoticeDest, noticeIsChannelEcho } from './notices';

const chan = (members: string[], joined = true) => ({
  isChannel: true as const,
  joined,
  members: Object.fromEntries(members.map((n) => [n, { nick: n }])),
});

function dest(over: Partial<Parameters<typeof resolveNoticeDest>[0]> & { sender: string }) {
  return resolveNoticeDest({
    active: '#entrenous.chat',
    buffers: {},
    order: [],
    ...over,
  });
}

describe('nickInMembers', () => {
  it('matches case-insensitively', () => {
    expect(nickInMembers({ Bac: { nick: 'Bac' } }, 'bac')).toBe(true);
    expect(nickInMembers({ Bac: { nick: 'Bac' } }, 'Jessie')).toBe(false);
  });
});

describe('resolveNoticeDest', () => {
  it('lands in the active channel when the sender is there', () => {
    expect(dest({
      sender: 'Bac',
      active: '#baccalaureat.chat',
      buffers: { '#baccalaureat.chat': chan(['Bac', 'Jessie']) },
      order: ['#baccalaureat.chat'],
    })).toBe('#baccalaureat.chat');
  });

  it('does not dump into the active channel when the sender is elsewhere', () => {
    expect(dest({
      sender: 'Bac',
      active: '#entrenous.chat',
      buffers: {
        '#entrenous.chat': chan(['Jessie', 'Boris']),
        '#baccalaureat.chat': chan(['Bac', 'Jessie']),
      },
      order: ['#entrenous.chat', '#baccalaureat.chat'],
    })).toBe('#baccalaureat.chat');
  });

  it('opens a per-sender Notices buffer when no joined channel is shared with the sender', () => {
    expect(dest({
      sender: 'Bac',
      buffers: { '#entrenous.chat': chan(['Jessie']) },
      order: ['#entrenous.chat'],
    })).toBe(noticeBufferName('Bac'));
  });

  it('opens a per-sender Notices buffer when the sender is in several channels and the active one is not one of them', () => {
    expect(dest({
      sender: 'Bac',
      active: '#entrenous.chat',
      buffers: {
        '#entrenous.chat': chan(['Jessie']),
        '#baccalaureat.chat': chan(['Bac']),
        '#aide.chat': chan(['Bac']),
      },
      order: ['#entrenous.chat', '#baccalaureat.chat', '#aide.chat'],
    })).toBe(noticeBufferName('Bac'));
  });

  it('prefers +draft/channel-context when we share that channel with the sender', () => {
    expect(dest({
      sender: 'ChanServ',
      active: '#entrenous.chat',
      channelContext: '#ops',
      buffers: {
        '#entrenous.chat': chan(['Jessie']),
        '#ops': chan(['ChanServ', 'Jessie']),
      },
      order: ['#entrenous.chat', '#ops'],
    })).toBe('#ops');
  });

  it('skips a parted channel even if the nick is still in the leftover member map', () => {
    expect(dest({
      sender: 'Bac',
      buffers: { '#baccalaureat.chat': chan(['Bac'], false) },
      order: ['#baccalaureat.chat'],
    })).toBe(noticeBufferName('Bac'));
  });

  it('keeps a notice in an existing query even if the sender also sits in the active channel', () => {
    expect(dest({
      sender: 'EcoutE',
      active: '#entrenous.chat',
      buffers: {
        '#entrenous.chat': chan(['Jessie', 'EcoutE']),
        ecoute: { isChannel: false, joined: false, members: {}, name: 'EcoutE' },
      },
      order: ['#entrenous.chat', 'ecoute'],
    })).toBe('EcoutE');
  });

  it('lands in the current window when the Notices pane is disabled', () => {
    expect(dest({
      sender: 'Operateur',
      active: '#entrenous.chat',
      noticeInbox: false,
      buffers: { '#entrenous.chat': chan(['Jessie']) },
      order: ['#entrenous.chat'],
    })).toBe('#entrenous.chat');
  });

  it('falls back to the combined Notices log when the sender nick is empty', () => {
    expect(dest({
      sender: '',
      active: '#entrenous.chat',
    })).toBe(NOTICES);
  });
});

describe('noticeIsChannelEcho', () => {
  it('detects a PRIVMSG copy of the same line in a shared channel', () => {
    expect(noticeIsChannelEcho({
      sender: 'Bac',
      text: '• Une lettre est tirée au sort.',
      ts: 1000,
      order: ['#baccalaureat.chat'],
      buffers: {
        '#baccalaureat.chat': {
          ...chan(['Bac']),
          messages: [{ kind: 'privmsg', from: 'Bac', text: '• Une lettre est tirée au sort.', ts: 1000 }],
        },
      },
    })).toBe(true);
  });

  it('ignores a personal notice that was not also said in the channel', () => {
    expect(noticeIsChannelEcho({
      sender: 'Bac',
      text: '🧮 Manche : 2',
      ts: 1000,
      order: ['#baccalaureat.chat'],
      buffers: {
        '#baccalaureat.chat': {
          ...chan(['Bac']),
          messages: [{ kind: 'privmsg', from: 'Bac', text: '📢 Nouvelle partie', ts: 1000 }],
        },
      },
    })).toBe(false);
  });
});
