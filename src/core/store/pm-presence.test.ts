import { describe, it, expect, beforeEach } from 'vitest';
import {
  announcePmOnline,
  clearPmPeerOffline,
  isPmPeerOffline,
  markPmPeerOffline,
  maybeMphistoryQueuedHint,
  queryBufferKey,
  takePmPeerOnline,
} from './pm-presence';
import type { Buffer } from '../irc/types';

function buf(name: string, isChannel = false): Buffer {
  return {
    name,
    isChannel,
    messages: [],
    members: {},
    topic: '',
    unread: 0,
    joined: false,
    readTs: 0,
    peerReadTs: 0,
    typing: {},
  } as Buffer;
}

beforeEach(() => {
  clearPmPeerOffline('Quen');
  clearPmPeerOffline('bob');
});

describe('pm-presence', () => {
  it('queryBufferKey finds an open PM and ignores channels / pseudo buffers', () => {
    const buffers = {
      quen: buf('Quen'),
      '#x': buf('#x', true),
      $server: buf('$server'),
    };
    expect(queryBufferKey(buffers, 'Quen')).toBe('quen');
    expect(queryBufferKey(buffers, 'nobody')).toBeUndefined();
    expect(queryBufferKey(buffers, '#x')).toBeUndefined();
  });

  it('takePmPeerOnline fires once after markPmPeerOffline', () => {
    expect(takePmPeerOnline('Quen')).toBe(false);
    markPmPeerOffline('Quen');
    expect(isPmPeerOffline('Quen')).toBe(true);
    expect(takePmPeerOnline('Quen')).toBe(true);
    expect(takePmPeerOnline('Quen')).toBe(false);
  });

  it('announcePmOnline posts a single online line into the open query', () => {
    const lines: { name: string; text: string; kind: string; from?: string }[] = [];
    const buffers = { quen: buf('Quen') };
    markPmPeerOffline('Quen');
    announcePmOnline(buffers, (name, text, kind, from) => {
      lines.push({ name, text, kind, from });
    }, 'Quen', 1234);
    expect(lines).toEqual([{
      name: 'quen', text: expect.stringContaining('Quen'), kind: 'online', from: 'Quen',
    }]);
    announcePmOnline(buffers, (name, text, kind, from) => {
      lines.push({ name, text, kind, from });
    }, 'Quen', 1235);
    expect(lines).toHaveLength(1);
  });

  it('maybeMphistoryQueuedHint posts once when CAP is on and peer is offline', () => {
    const lines: { name: string; text: string; kind: string }[] = [];
    const buffers = { quen: buf('Quen') };
    markPmPeerOffline('Quen');
    const opts = {
      hasMphistoryCap: true,
      buffers,
      order: ['quen'],
      nick: 'Quen',
      sysLine: (name: string, text: string, kind: string) => { lines.push({ name, text, kind }); },
    };
    expect(maybeMphistoryQueuedHint(opts)).toBe(true);
    expect(lines[0]).toMatchObject({ name: 'quen', kind: 'info' });
    expect(maybeMphistoryQueuedHint(opts)).toBe(false);
    expect(lines).toHaveLength(1);
  });

  it('maybeMphistoryQueuedHint is a no-op without the CAP', () => {
    const lines: unknown[] = [];
    markPmPeerOffline('Quen');
    expect(maybeMphistoryQueuedHint({
      hasMphistoryCap: false,
      buffers: { quen: buf('Quen') },
      order: ['quen'],
      nick: 'Quen',
      sysLine: () => { lines.push(1); },
    })).toBe(false);
    expect(lines).toHaveLength(0);
  });
});
