import type { Member } from '../core/irc/types';
import { canon } from '../core/store/context';

function memberOf(members: Record<string, Member>, nick: string): Member | undefined {
  if (!nick) return undefined;
  if (members[nick]) return members[nick];
  const folded = canon(nick);
  for (const k of Object.keys(members)) {
    if (canon(k) === folded) return members[k];
  }
  return undefined;
}

// Who set the topic, as a full nick!user@host mask. Servers that record it (InspIRCd
// maskintopic) already send the mask in 333/TOPIC; otherwise expand a bare nick from
// the nicklist (userhost-in-names / WHOX u+h) when the setter is still in the channel.
export function setterMask(who: string, members: Record<string, Member>): string {
  if (!who) return '';
  if (who.includes('@')) return who;
  const nick = who.includes('!') ? who.slice(0, who.indexOf('!')) : who;
  const m = memberOf(members, nick);
  return m?.user && m?.host ? `${nick}!${m.user}@${m.host}` : who;
}

// Localised relative time, e.g. "2 hours ago" / "il y a 2 heures".
export function ago(ms: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = ms - Date.now(); // negative in the past
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536e6], ['month', 2592e6], ['day', 864e5], ['hour', 36e5], ['minute', 6e4],
  ];
  for (const [u, d] of units) if (abs >= d) return rtf.format(Math.round(diff / d), u);
  return rtf.format(Math.round(diff / 1000), 'second');
}
