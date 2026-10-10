import { canon } from './context';

export type NickRecoverOffer = {
  target: string;
  pending: boolean;
  dismissed: boolean;
};

/** Should we offer NickServ RECOVER for the nick requested at connect? */
export function shouldOfferNickRecover(opts: {
  status: string;
  account: string;
  nick: string;
  wantedNick: string;
  offer: NickRecoverOffer | null;
}): NickRecoverOffer | null {
  const wanted = (opts.wantedNick || '').trim();
  if (opts.status !== 'registered' || !opts.account || !wanted) return null;
  if (canon(opts.nick) === canon(wanted)) return null;
  if (opts.offer?.dismissed && canon(opts.offer.target) === canon(wanted)) {
    return opts.offer;
  }
  if (opts.offer && canon(opts.offer.target) === canon(wanted)) return opts.offer;
  return { target: wanted, pending: false, dismissed: false };
}
