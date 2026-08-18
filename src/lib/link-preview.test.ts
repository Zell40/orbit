import { describe, it, expect } from 'vitest';
import { firstPreviewableUrl } from './link-preview';

describe('firstPreviewableUrl', () => {
  it('returns the first http(s) URL', () => {
    expect(firstPreviewableUrl('voir https://entrenous.chat/actu/12 pour plus')).toBe(
      'https://entrenous.chat/actu/12',
    );
  });

  it('strips trailing punctuation glued to the URL', () => {
    expect(firstPreviewableUrl('lien: https://example.com/a.')).toBe('https://example.com/a');
    expect(firstPreviewableUrl('(https://example.com/a)')).toBe('https://example.com/a');
  });

  it('skips image URLs that already get an inline embed', () => {
    expect(firstPreviewableUrl('https://cdn.example.com/pic.jpg')).toBeNull();
  });
});
