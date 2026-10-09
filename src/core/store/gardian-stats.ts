import { stripFormatting } from './text';

/**
 * Gardian's "Services statistics report" is meant once at login. Anope
 * `anope.identify` from plugin RPC used to re-fire it on every Compte / mémo
 * probe — we also gate duplicates client-side for the session.
 */
let seenThisSession = false;
/** Swallow continuation lines of a multi-NOTICE Gardian dump. */
let dumpUntil = 0;
/** First dump of the session stays visible through its sticky window. */
let allowFirstDumpUntil = 0;

export function resetGardianStatsGate(): void {
  seenThisSession = false;
  dumpUntil = 0;
  allowFirstDumpUntil = 0;
}

function fold(text: string): string {
  return stripFormatting(text).replace(/\s+/g, ' ').trim();
}

export function isGardianStatsHeader(s: string): boolean {
  return /\*{3,}.*statistiques?\s+services|rapport statistiques?\s+services|services statistics report|\*{3,}.*services statistics/i.test(s);
}

export function isGardianStatsField(s: string): boolean {
  return /^(dur[eé]e de fonctionnement|utilisateurs actuels|maximum d['’]?utilisateurs|pseudos enregistr|salons enregistr|akills|snlines|sqlines|uptime|current users|max users|registered nicks|registered channels)\b/i.test(s);
}

function looksLikeStatsLine(s: string, now: number): boolean {
  if (isGardianStatsHeader(s) || isGardianStatsField(s)) return true;
  if (now > dumpUntil) return false;
  // Continuations: "44 (18 opérateurs)", dates, "il y a …"
  return /^[\d*]/.test(s) || /il y a |ago\b|\d+\s*(op[eé]rateur|operator)/i.test(s);
}

/** True → hide this NOTICE (duplicate dump after the first login report). */
export function shouldHideGardianStatsNotice(nick: string, text: string): boolean {
  if (!/^gardian$/i.test(String(nick || '').trim())) return false;
  const s = fold(text);
  if (!s) return false;

  const now = Date.now();
  if (!looksLikeStatsLine(s, now)) return false;

  dumpUntil = now + 4_000;

  if (!seenThisSession) {
    seenThisSession = true;
    allowFirstDumpUntil = now + 4_000;
    return false;
  }
  if (now <= allowFirstDumpUntil) return false;
  return true;
}
