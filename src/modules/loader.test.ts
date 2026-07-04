import { describe, it, expect } from 'vitest';
import { scriptAttrs } from './loader';

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
