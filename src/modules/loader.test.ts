import { describe, it, expect } from 'vitest';
import { isDeferredPluginUrl, scriptAttrs } from './loader';

describe('isDeferredPluginUrl', () => {
  it('defers games and extras so boot does not parse them on the main thread', () => {
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-petitbac/orbit-petitbac.js?v=80')).toBe(true);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-echecs/orbit-echecs.js?v=58')).toBe(true);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-harrypotter/orbit-harrypotter.js?v=8')).toBe(true);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-rss/orbit-rss.js?v=31')).toBe(true);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-memoserv/orbit-memoserv.js?v=22')).toBe(true);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-radio.js?v=5')).toBe(true);
  });

  it('keeps salon / nick / CP chrome on the first wave', () => {
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-room-gallery/orbit-room-gallery.js?v=37')).toBe(false);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-chanserv/orbit-chanserv.js?v=104')).toBe(false);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-callerid/orbit-callerid.js?v=35')).toBe(false);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-anope/orbit-anope.js?v=11')).toBe(false);
    expect(isDeferredPluginUrl('/app/plugins/third/orbit-navbar.js')).toBe(false);
  });
});

describe('scriptAttrs', () => {
  it('wraps a bare URL string with no SRI', () => {
    expect(scriptAttrs('/app/plugins/x.js')).toEqual({ url: '/app/plugins/x.js' });
  });

  it('keeps the integrity hash and defaults crossorigin to anonymous (required for SRI)', () => {
    expect(scriptAttrs({ url: 'https://cdn/y.js', integrity: 'sha384-abc' }))
      .toEqual({ url: 'https://cdn/y.js', integrity: 'sha384-abc', crossorigin: 'anonymous' });
  });

  it('respects an explicit crossorigin alongside integrity', () => {
    expect(scriptAttrs({ url: 'https://cdn/y.js', integrity: 'sha384-abc', crossorigin: 'use-credentials' }))
      .toEqual({ url: 'https://cdn/y.js', integrity: 'sha384-abc', crossorigin: 'use-credentials' });
  });

  it('passes crossorigin through without integrity', () => {
    expect(scriptAttrs({ url: 'https://cdn/y.js', crossorigin: 'anonymous' }))
      .toEqual({ url: 'https://cdn/y.js', crossorigin: 'anonymous' });
  });
});
