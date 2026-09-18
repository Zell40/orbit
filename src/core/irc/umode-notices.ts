import i18n from '../i18n';

/** InspIRCd m_deaf English notices → Orbit i18n. */
export function translateUmodeNotice(text: string, nick: string): string | null {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/\+D\b/.test(s) && /private deaf/i.test(s)) {
    return i18n.t('system.privDeafOn', { nick });
  }
  if (/\+d\b/.test(s) && /deaf mode/i.test(s)) {
    return i18n.t('system.deafOn', { nick });
  }
  return null;
}
