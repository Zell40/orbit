import { describe, it, expect } from 'vitest';
import { formatProfileGecos, parseProfileGecos, genderFromLabel } from './profile-gecos';

describe('formatProfileGecos', () => {
  it('builds age - Homme/Femme - ville', () => {
    expect(formatProfileGecos(40, 'H', 'Paris')).toBe('40 - Homme - Paris');
    expect(formatProfileGecos('25', 'F', 'Lyon')).toBe('25 - Femme - Lyon');
    expect(formatProfileGecos(30, 'A', 'Nantes')).toBe('30 - Autre - Nantes');
  });
  it('returns undefined when a field is missing', () => {
    expect(formatProfileGecos('', 'H', 'Paris')).toBeUndefined();
    expect(formatProfileGecos(40, 'H', '')).toBeUndefined();
  });
});

describe('parseProfileGecos', () => {
  it('parses the EntreNous dash format', () => {
    expect(parseProfileGecos('40 - Homme - Paris')).toEqual({
      age: '40', genderLabel: 'Homme', gender: 'm', city: 'Paris',
    });
    expect(parseProfileGecos('25 - Femme - Lyon')).toMatchObject({ gender: 'f', city: 'Lyon' });
  });
  it('parses legacy middle-dot format', () => {
    const p = parseProfileGecos('Femme · 40 ans · Paris');
    expect(p?.gender).toBe('f');
    expect(p?.age).toBe('40');
    expect(p?.city).toBe('Paris');
  });
  it('returns null for unrelated realnames', () => {
    expect(parseProfileGecos('Bob')).toBeNull();
    expect(parseProfileGecos('')).toBeNull();
  });
});

describe('genderFromLabel', () => {
  it('maps common labels', () => {
    expect(genderFromLabel('H')).toBe('m');
    expect(genderFromLabel('Homme')).toBe('m');
    expect(genderFromLabel('F')).toBe('f');
    expect(genderFromLabel('')).toBe('x');
  });
});
