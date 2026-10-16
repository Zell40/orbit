import { describe, expect, it } from 'vitest';
import {
  bootPhase, bootProgress, displayReady, identityReady,
  pluginReadyFrac, pluginsRegistered, priorityPluginIds, roomFrac, roomsListed,
  roomsReady, selfInPrimaryRoom,
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
      '/app/plugins/third/orbit-callerid/orbit-callerid.js?v=35',
    ])).toEqual(['orbit-conference', 'orbit-callerid']);
  });

  it('maps URL slugs to the ids Orbit.plugin() actually registers', () => {
    expect(priorityPluginIds([
      '/app/plugins/third/orbit-room-gallery/orbit-room-gallery.js?v=38',
      '/app/plugins/third/orbit-helpdesk/orbit-helpdesk.js?v=5',
      '/app/plugins/third/orbit-navbar.js',
      '/app/plugins/third/orbit-anope/orbit-anope.js?v=11',
      '/app/plugins/third/orbit-rss/orbit-rss.js?v=32',
    ])).toEqual(['orbit-navbar', 'room-gallery', 'helpdesk', 'orbit-rss', 'orbit-anope']);
  });

  it('treats missing optional plugins as already registered', () => {
    expect(pluginsRegistered([], ['orbit-clock'])).toBe(true);
    expect(pluginsRegistered(['orbit-conference'], ['orbit-asl'])).toBe(false);
    expect(pluginsRegistered(['orbit-conference'], ['orbit-conference', 'orbit-asl'])).toBe(true);
    expect(pluginsRegistered(['room-gallery'], ['orbit-room-gallery'])).toBe(false);
    expect(pluginsRegistered(['room-gallery', 'helpdesk'], ['room-gallery', 'helpdesk'])).toBe(true);
  });

  it('counts registered click-now factories for the splash bar', () => {
    expect(pluginReadyFrac([], ['x'])).toBe(1);
    expect(pluginReadyFrac(['room-gallery', 'helpdesk'], ['helpdesk'])).toBe(0.5);
    expect(pluginReadyFrac(['room-gallery'], ['room-gallery'])).toBe(1);
  });

  it('waits for a NickServ account only when one is expected', () => {
    expect(identityReady(false, '')).toBe(true);
    expect(identityReady(true, '')).toBe(false);
    expect(identityReady(true, 'Jessie')).toBe(true);
  });

  it('needs topbar and click-now plugins before display is ready', () => {
    expect(displayReady({ topbar: true, pluginsOk: true })).toBe(true);
    expect(displayReady({ topbar: false, pluginsOk: true })).toBe(false);
    expect(displayReady({ topbar: true, pluginsOk: false })).toBe(false);
  });
});

describe('bootProgress / bootPhase', () => {
  it('uses discrete connection then real plugin/room/display fractions', () => {
    expect(bootProgress({
      status: 'connecting', pluginFrac: 0, roomFrac: 0, displayFrac: 0, ready: false,
    })).toBe(12);
    expect(bootProgress({
      status: 'registered', pluginFrac: 0.5, roomFrac: 0, displayFrac: 0, ready: false,
    })).toBe(49);
    expect(bootProgress({
      status: 'registered', pluginFrac: 1, roomFrac: 1, displayFrac: 1, ready: true,
    })).toBe(100);
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
