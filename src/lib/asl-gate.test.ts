import { describe, expect, it } from 'vitest';
import { aslGate } from './asl-gate';

const empty = { sex: '', age: '', city: '' };

describe('aslGate', () => {
  it('lets anyone through when ASL config is off', () => {
    expect(aslGate(undefined, empty)).toBeNull();
    expect(aslGate({}, empty)).toBeNull();
  });

  it('blocks missing gender / age / city when required', () => {
    expect(aslGate({ requireGender: true }, empty)).toBe('gender');
    expect(aslGate({ requireAge: true }, empty)).toBe('age');
    expect(aslGate({ requireCity: true }, { sex: 'h', age: '40', city: '' })).toBe('city');
  });

  it('blocks under the minimum age, including a blank age', () => {
    expect(aslGate({ minAge: 18 }, empty)).toBe('minAge');
    expect(aslGate({ minAge: 18 }, { sex: 'f', age: '17', city: 'Paris' })).toBe('minAge');
    expect(aslGate({ minAge: 18 }, { sex: 'f', age: '18', city: 'Paris' })).toBeNull();
  });

  it('accepts a complete profile', () => {
    expect(aslGate(
      { requireAge: true, requireGender: true, requireCity: true, minAge: 18 },
      { sex: 'h', age: '40', city: 'Lyon' },
    )).toBeNull();
  });
});
