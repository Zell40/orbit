import { describe, it, expect } from 'vitest';
import { translateUmodeNotice } from './umode-notices';

describe('translateUmodeNotice', () => {
  it('swallows InspIRCd private-deaf notices (enable and disable)', () => {
    expect(translateUmodeNotice('You are now private deaf (+D)')).toBe('');
    expect(translateUmodeNotice('You are no longer private deaf (+D)')).toBe('');
  });

  it('leaves unrelated server notices alone', () => {
    expect(translateUmodeNotice('Looking up your hostname...')).toBeNull();
  });
});
