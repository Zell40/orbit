import { describe, it, expect } from 'vitest';
import { togglePinIn, unpinIn, PIN_CAP, type Pin } from './persistence';

const mk = (id: string): Pin => ({ id, from: 'ann', text: id, ts: 0 });

describe('pin reducers', () => {
  it('pins a message to the front of its channel', () => {
    const after = togglePinIn({}, '#a', mk('m1'));
    expect(after['#a']).toEqual([mk('m1')]);
  });

  it('toggling the same message off removes it, dropping the empty key', () => {
    const on = togglePinIn({}, '#a', mk('m1'));
    const off = togglePinIn(on, '#a', mk('m1'));
    expect(off['#a']).toBeUndefined();
  });

  it('keeps newest first and caps the list per channel', () => {
    let pins: Record<string, Pin[]> = {};
    for (let i = 0; i <= PIN_CAP; i++) pins = togglePinIn(pins, '#a', mk(`m${i}`));
    expect(pins['#a']).toHaveLength(PIN_CAP);
    expect(pins['#a'][0].id).toBe(`m${PIN_CAP}`); // last pinned is first
    expect(pins['#a'].some((p) => p.id === 'm0')).toBe(false); // oldest fell off
  });

  it('keeps channels independent and does not mutate the input', () => {
    const a = togglePinIn({}, '#a', mk('m1'));
    const both = togglePinIn(a, '#b', mk('m2'));
    expect(Object.keys(both).sort()).toEqual(['#a', '#b']);
    expect(a['#b']).toBeUndefined(); // original left untouched
  });

  it('unpins a specific message and leaves the rest', () => {
    const two = togglePinIn(togglePinIn({}, '#a', mk('m1')), '#a', mk('m2'));
    const after = unpinIn(two, '#a', 'm1');
    expect(after['#a'].map((p) => p.id)).toEqual(['m2']);
  });
});
