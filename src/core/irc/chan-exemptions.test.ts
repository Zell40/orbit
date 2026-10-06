import { describe, it, expect } from 'vitest';
import {
  advertisedExemptions,
  explainExemptEntry,
  formatExemptEntry,
  parseExemptEntry,
} from './chan-exemptions';

describe('parseExemptEntry', () => {
  it('splits restriction and prefix', () => {
    expect(parseExemptEntry('anticaps:o')).toEqual({ restriction: 'anticaps', prefix: 'o' });
    expect(parseExemptEntry('auditorium-see:h')).toEqual({ restriction: 'auditorium-see', prefix: 'h' });
    expect(parseExemptEntry('bad')).toBeNull();
  });
});

describe('formatExemptEntry', () => {
  it('builds wire form', () => {
    expect(formatExemptEntry('flood', 'o')).toBe('flood:o');
  });
});

describe('explainExemptEntry', () => {
  it('names the restriction and the exempted rank', () => {
    expect(explainExemptEntry('flood:h')).toBe('exception au flood pour les halfops');
    expect(explainExemptEntry('repeat:o')).toBe('exception à la répétition pour les opérateurs');
    expect(explainExemptEntry('nickflood:a')).toBe('exception au flood de pseudos pour les admins');
    expect(explainExemptEntry('flood:*')).toBe('exception au flood pour tout le monde');
  });
});

describe('advertisedExemptions', () => {
  it('keeps only exemptions whose mode letter is advertised', () => {
    const set = advertisedExemptions(new Set(['f', 'E', 't']));
    expect(set.map((e) => e.name).sort()).toEqual(['flood', 'repeat', 'topiclock']);
  });
});
