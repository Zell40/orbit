// Which CHATHISTORY event-playback commands to drop before they hit the buffer.
// JOIN/PART/QUIT are always noise; the rest follow the user's display prefs.
import type { Prefs } from '@/ui/prefs';

export function skipHistoryCommand(
  command: string,
  prefs: Pick<Prefs, 'hideKicks' | 'hideNickEvents' | 'hideTopicEvents'>,
): boolean {
  if (command === 'JOIN' || command === 'PART' || command === 'QUIT') return true;
  if (command === 'KICK') return prefs.hideKicks;
  if (command === 'NICK' || command === 'CHGHOST') return prefs.hideNickEvents;
  if (command === 'TOPIC') return prefs.hideTopicEvents;
  return false;
}

/** When true, historical MODE lines (+o/+v/…) are not stored (bans still are). */
export function skipHistoryModeLine(prefs: Pick<Prefs, 'hideModes'>): boolean {
  return prefs.hideModes;
}
