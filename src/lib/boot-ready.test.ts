import { describe, expect, it } from 'vitest';
import {
  bootPhase, bootProgress, displayReady, identityReady,
  pluginsRegistered, priorityPluginIds, roomFrac, roomsListed, roomsReady,
  selfInPrimaryRoom,
} from './boot-ready';

const empty = {};
const one = { '#taverne': { name: '#Taverne', isChannel: true, joined: true } };
const pending = { '#taverne': { name: '#Taverne', isChannel: true, joined: false } };
const seated = {
  '#taverne': {
    name: '#Taverne', isChannel: true, joined: true,
    members: { Jessie: { nick: 'Jessie' } },
  },
};

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

describe('selfInPrimaryRoom', () => {
  it('requires our nick on the first expected salon', () => {
    expect(selfInPrimaryRoom(one, ['#taverne'], 'Jessie')).toBe(false);
    expect(selfInPrimaryRoom(seated, ['#taverne'], 'jessie')).toBe(true);
  });
});

describe('priority plugins / identity / display', () => {
  it('picks only installed priority plugins from URLs', () => {
    expect(priorityPluginIds([
      '/app/plugins/third/orbit-conference/orbit-conference.js?v=21',
      '/app/plugins/third/orbit-petitbac/orbit-petitbac.js?v=77',
    ])).toEqual(['orbit-conference']);
  });

  it('treats missing optional plugins as already registered', () => {
    expect(pluginsRegistered([], ['orbit-clock'])).toBe(true);
    expect(pluginsRegistered(['orbit-conference'], ['orbit-asl'])).toBe(false);
    expect(pluginsRegistered(['orbit-conference'], ['orbit-conference', 'orbit-asl'])).toBe(true);
  });

  it('waits for a NickServ account only when one is expected', () => {
    expect(identityReady(false, '')).toBe(true);
    expect(identityReady(true, '')).toBe(false);
    expect(identityReady(true, 'Jessie')).toBe(true);
  });

  it('needs topbar, plugins, identity and nicklist before display is ready', () => {
    expect(displayReady({
      topbar: true, pluginsOk: true, identityOk: true, selfInRoom: true,
    })).toBe(true);
    expect(displayReady({
      topbar: false, pluginsOk: true, identityOk: true, selfInRoom: true,
    })).toBe(false);
  });
});

describe('bootProgress / bootPhase', () => {
  it('crawls while connecting, then fills with plugins, rooms and display', () => {
    expect(bootProgress({
      status: 'connecting', pluginFrac: 0, roomFrac: 0, displayFrac: 0, connectingForMs: 0,
    })).toBe(8);
    expect(bootPhase({
      status: 'registered', pluginsDone: false, roomsDone: false, displayDone: false,
    })).toBe('plugins');
    expect(bootPhase({
      status: 'registered', pluginsDone: true, roomsDone: false, displayDone: false,
    })).toBe('rooms');
    expect(bootPhase({
      status: 'registered', pluginsDone: true, roomsDone: true, displayDone: false,
    })).toBe('display');
    expect(bootPhase({
      status: 'registered', pluginsDone: true, roomsDone: true, displayDone: true,
    })).toBe('almost');
  });
});
