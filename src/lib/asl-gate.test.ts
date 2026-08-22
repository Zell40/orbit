import { describe, expect, it } from 'vitest';
import { aslFieldOk, aslGate } from './asl-gate';

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
    expect(aslGate({ requireGender: true }, { sex: 'a', age: '', city: '' })).toBeNull();
  });

  it('blocks under the minimum age, including a blank age', () => {
    expect(aslGate({ minAge: 10 }, empty)).toBe('minAge');
    expect(aslGate({ minAge: 10 }, { sex: 'f', age: '9', city: 'Paris' })).toBe('minAge');
    expect(aslGate({ minAge: 10 }, { sex: 'f', age: '10', city: 'Paris' })).toBeNull();
  });

  it('accepts a complete profile', () => {
    expect(aslGate(
      { requireAge: true, requireGender: true, requireCity: true, minAge: 10 },
      { sex: 'h', age: '40', city: 'Lyon' },
    )).toBeNull();
    expect(aslGate(
      { requireAge: true, requireGender: true, requireCity: true, minAge: 10 },
      { sex: 'a', age: '15', city: 'Nantes' },
    )).toBeNull();
  });
});

describe('aslFieldOk', () => {
  it('marks each field independently', () => {
    expect(aslFieldOk({ minAge: 10 }, empty)).toEqual({ gender: false, age: false, city: false });
    expect(aslFieldOk({ minAge: 10 }, { sex: 'a', age: '10', city: 'Nantes' }))
      .toEqual({ gender: true, age: true, city: true });
    expect(aslFieldOk({ minAge: 10 }, { sex: 'h', age: '9', city: 'Nantes' }).age).toBe(false);
  });
});
