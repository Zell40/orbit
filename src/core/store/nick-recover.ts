import { canon } from './context';

export type NickRecoverOffer = {
  target: string;
  pending: boolean;
  dismissed: boolean;
  /** RECOVER succeeded — show confirmation before auto-close. */
  done: boolean;
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
  const offer = opts.offer;
  const sameTarget = !!offer && canon(offer.target) === canon(wanted);

  // Nick reclaimed: keep a success popup until the user dismisses (or auto-close).
  if (canon(opts.nick) === canon(wanted)) {
    if (sameTarget && !offer!.dismissed && (offer!.pending || offer!.done)) {
      return { target: wanted, pending: false, dismissed: false, done: true };
    }
    return null;
  }

  if (sameTarget && offer!.dismissed) return offer;
  if (sameTarget) return offer;
  return { target: wanted, pending: false, dismissed: false, done: false };
}
