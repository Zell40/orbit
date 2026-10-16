import { describe, it, expect, beforeEach } from 'vitest';
import {
  announcePmOnline,
  queryPresence,
  clearPmPeerOffline,
  isMphistoryStored,
  isPmPeerOffline,
  listOpenQueryNicks,
  markMphistoryStored,
  markPmPeerOffline,
  queryBufferKey,
  showMphistoryStoredHint,
  showOfflinePeerWarn,
  takeMphistoryStored,
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

  it('listOpenQueryNicks lists PM windows and skips channels / services / self', () => {
    const buffers = {
      quen: buf('Quen'),
      bob: buf('bob'),
      '#x': buf('#x', true),
      $server: buf('$server'),
      nickserv: buf('NickServ'),
    };
    expect(listOpenQueryNicks(buffers, ['#x', 'quen', 'nickserv', 'bob', '$server'], 'Me')).toEqual(['Quen', 'bob']);
    expect(listOpenQueryNicks(buffers, ['quen'], 'Quen')).toEqual([]);
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

  it('showMphistoryStoredHint posts once per offline spell', () => {
    const lines: { name: string; text: string; kind: string }[] = [];
    const buffers = { quen: buf('Quen') };
    const opts = {
      buffers,
      nick: 'Quen',
      sysLine: (name: string, text: string, kind: string) => { lines.push({ name, text, kind }); },
    };
    expect(showMphistoryStoredHint(opts)).toBe(true);
    expect(lines[0]).toMatchObject({ name: 'quen', kind: 'info' });
    expect(showMphistoryStoredHint(opts)).toBe(false);
    expect(lines).toHaveLength(1);
  });

  it('markMphistoryStored / takeMphistoryStored is one-shot', () => {
    expect(isMphistoryStored('bob')).toBe(false);
    markMphistoryStored('bob');
    expect(isMphistoryStored('bob')).toBe(true);
    expect(takeMphistoryStored('bob')).toBe(true);
    expect(isMphistoryStored('bob')).toBe(false);
    expect(takeMphistoryStored('bob')).toBe(false);
  });

  it('clearPmPeerOffline clears mphistory stored mark', () => {
    markMphistoryStored('bob');
    clearPmPeerOffline('bob');
    expect(isMphistoryStored('bob')).toBe(false);
  });

  it('queryPresence is on, off, or unknown for a private nick only', () => {
    const buffers = {
      bob: buf('bob'),
      '#x': buf('#x', true),
      $server: buf('$server'),
    };
    buffers['#x'].members = { Bob: { nick: 'Bob', prefix: '' } };
    expect(queryPresence('bob', { bob: false }, buffers)).toBe('off');
    expect(queryPresence('bob', { bob: true }, buffers)).toBe('on');
    expect(queryPresence('Bob', {}, buffers)).toBe('on');
    expect(queryPresence('zoe', {}, buffers)).toBe('');
    expect(queryPresence('#x', {}, buffers)).toBe('');
    expect(queryPresence('$server', {}, buffers)).toBe('');
  });

  it('showOfflinePeerWarn notes the offline spell once and stays out of the transcript', () => {
    const buffers = { bob: buf('bob') };
    expect(showOfflinePeerWarn({ buffers, nick: 'bob' })).toBe(true);
    expect(showOfflinePeerWarn({ buffers, nick: 'bob' })).toBe(false);
  });
});
