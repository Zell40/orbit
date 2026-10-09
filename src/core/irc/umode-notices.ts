/**
 * InspIRCd m_deaf server NOTICE → Orbit handling.
 * Enabling +D/+d is announced from MODE (mode.ts) in the UI language.
 * These English (or mixed) notices are swallowed so unblock never shows
 * « tu as activé » and so we don't duplicate the MODE warning.
 */
export function translateUmodeNotice(text: string, _nick?: string): string | null {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/private deaf/i.test(s)) return ''; // hide (enable/disable)
  if (/\bdeaf mode\b/i.test(s) && !/private/i.test(s)) return '';
  return null;
}

/** True when the notice was recognised and must not be shown raw. */
export function shouldSwallowUmodeNotice(translated: string | null): boolean {
  return translated !== null;
}
