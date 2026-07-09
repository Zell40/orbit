import type { Member } from '../core/irc/types';

// Who set the topic, as a full nick!user@host mask. Servers that record it (InspIRCd)
// already send the mask in 333/TOPIC; otherwise expand a bare nick from the
// userhost-in-names member data when the setter is still in the channel.
export function setterMask(who: string, members: Record<string, Member>): string {
  if (!who || who.includes('@')) return who;
  const m = members[who];
  return m?.user && m?.host ? `${who}!${m.user}@${m.host}` : who;
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
