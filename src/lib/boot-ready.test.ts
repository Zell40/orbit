import { describe, expect, it } from 'vitest';
import { bootPhase, bootProgress, roomFrac, roomsListed, roomsReady } from './boot-ready';

const empty = {};
const one = { '#taverne': { name: '#Taverne', isChannel: true, joined: true } };
const pending = { '#taverne': { name: '#Taverne', isChannel: true, joined: false } };

describe('roomsReady', () => {
  it('waits for any joined channel when none were requested (bouncer)', () => {
    expect(roomsReady(empty, [])).toBe(false);
    expect(roomsReady(one, [])).toBe(true);
  });

  it('requires each requested channel to be joined, ignoring case', () => {
    expect(roomsReady(pending, ['#Taverne'])).toBe(false);
    expect(roomsReady(one, ['#taverne'])).toBe(true);
    expect(roomsReady(one, ['#Taverne', '#rencontre'])).toBe(false);
  });
});

describe('roomsListed', () => {
  it('matches sidebar labels with or without a leading #', () => {
    expect(roomsListed(['#EntreNous.chat'], ['EntreNous.chat'])).toBe(true);
    expect(roomsListed(['#taverne', '#rencontre'], ['Taverne'])).toBe(false);
    expect(roomsListed([], [])).toBe(false);
    expect(roomsListed([], ['Taverne'])).toBe(true);
  });
});

describe('roomFrac', () => {
  it('counts joined expected channels', () => {
    expect(roomFrac(one, ['#taverne', '#rencontre'])).toBe(0.5);
  });
});

describe('bootProgress / bootPhase', () => {
  it('crawls while connecting, then fills with plugins and rooms', () => {
    expect(bootProgress({
      status: 'connecting', pluginFrac: 0, roomFrac: 0, connectingForMs: 0,
    })).toBe(8);
    expect(bootPhase({
      status: 'registered', pluginsDone: false, roomsDone: false,
    })).toBe('plugins');
    expect(bootPhase({
      status: 'registered', pluginsDone: true, roomsDone: false,
    })).toBe('rooms');
    expect(bootPhase({
      status: 'registered', pluginsDone: true, roomsDone: true,
    })).toBe('almost');
  });
});
