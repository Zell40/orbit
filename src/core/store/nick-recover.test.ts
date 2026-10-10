import { describe, expect, it } from 'vitest';
import { shouldOfferNickRecover } from './nick-recover';

describe('shouldOfferNickRecover', () => {
  it('offers when identified under a suffixed nick', () => {
    expect(shouldOfferNickRecover({
      status: 'registered',
      account: 'Zell',
      nick: 'Zell742',
      wantedNick: 'Zell',
      offer: null,
    })).toEqual({ target: 'Zell', pending: false, dismissed: false });
  });

  it('clears when the nick already matches', () => {
    expect(shouldOfferNickRecover({
      status: 'registered',
      account: 'Zell',
      nick: 'Zell',
      wantedNick: 'Zell',
      offer: { target: 'Zell', pending: false, dismissed: false },
    })).toBeNull();
  });

  it('keeps a dismissed offer so it does not reappear', () => {
    const dismissed = { target: 'Zell', pending: false, dismissed: true };
    expect(shouldOfferNickRecover({
      status: 'registered',
      account: 'Zell',
      nick: 'Zell742',
      wantedNick: 'Zell',
      offer: dismissed,
    })).toBe(dismissed);
  });

  it('needs an account and a registered session', () => {
    expect(shouldOfferNickRecover({
      status: 'registered',
      account: '',
      nick: 'Zell742',
      wantedNick: 'Zell',
      offer: null,
    })).toBeNull();
  });
});
