import { canon } from './context';

export type NickRecoverOffer = {
  target: string;
  pending: boolean;
  dismissed: boolean;
  /** RECOVER succeeded — show confirmation before auto-close. */
  done: boolean;
};

/** Offer NickServ RECOVER only when the reserved account nick is still held by a ghost. */
export function shouldOfferNickRecover(opts: {
  status: string;
  account: string;
  nick: string;
  wantedNick: string;
  offer: NickRecoverOffer | null;
}): NickRecoverOffer | null {
  const wanted = (opts.wantedNick || '').trim();
  const account = (opts.account || '').trim();
  if (opts.status !== 'registered' || !account || !wanted) return null;
  const offer = opts.offer;
  const sameTarget = !!offer && canon(offer.target) === canon(wanted);
  const owns = canon(wanted) === canon(account);

  // Nick reclaimed: keep a success popup until the user dismisses (or auto-close).
  if (canon(opts.nick) === canon(wanted)) {
    if (owns && sameTarget && !offer!.dismissed && (offer!.pending || offer!.done)) {
      return { target: wanted, pending: false, dismissed: false, done: true };
    }
    return null;
  }

  // A suffix nick (Zell742) is not the reserved nick. Don't offer to "recover" it
  // after the user has already moved onto their account nick.
  if (!owns) return null;

  if (sameTarget && offer!.dismissed) return offer;
  if (sameTarget) return offer;
  return { target: wanted, pending: false, dismissed: false, done: false };
}
