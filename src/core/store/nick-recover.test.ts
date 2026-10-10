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
    })).toEqual({ target: 'Zell', pending: false, dismissed: false, done: false });
  });

  it('marks done when the nick matches after a recover attempt', () => {
    expect(shouldOfferNickRecover({
      status: 'registered',
      account: 'Zell',
      nick: 'Zell',
      wantedNick: 'Zell',
      offer: { target: 'Zell', pending: true, dismissed: false, done: false },
    })).toEqual({ target: 'Zell', pending: false, dismissed: false, done: true });
  });

  it('keeps a done success state until dismissed', () => {
    const done = { target: 'Zell', pending: false, dismissed: false, done: true };
    expect(shouldOfferNickRecover({
      status: 'registered',
      account: 'Zell',
      nick: 'Zell',
      wantedNick: 'Zell',
      offer: done,
    })).toEqual(done);
  });

  it('clears when the nick already matches without an active offer', () => {
    expect(shouldOfferNickRecover({
      status: 'registered',
      account: 'Zell',
      nick: 'Zell',
      wantedNick: 'Zell',
      offer: null,
    })).toBeNull();
  });

  it('clears a dismissed success popup', () => {
    expect(shouldOfferNickRecover({
      status: 'registered',
      account: 'Zell',
      nick: 'Zell',
      wantedNick: 'Zell',
      offer: { target: 'Zell', pending: false, dismissed: true, done: true },
    })).toBeNull();
  });

  it('keeps a dismissed offer so it does not reappear', () => {
    const dismissed = { target: 'Zell', pending: false, dismissed: true, done: false };
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
