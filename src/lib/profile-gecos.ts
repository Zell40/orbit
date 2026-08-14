/** EntreNous-style GECOS / realname.
 *  Current:  "40 - Homme - Paris"
 *  Kiwi:     "[19/F/Nice]"  (H=Homme, F=Femme, A=Autre)
 *  Legacy:   "Femme · 40 ans · Paris"
 */

export type GenderKind = 'm' | 'f' | 'x' | 'u';

export interface ProfileGecos {
  age?: string;
  gender: GenderKind;
  genderLabel?: string;
  city?: string;
}

/** Colours for member list / profile when GECOS matches a known profile shape. */
export const GENDER_COLOR: Record<GenderKind, string> = {
  m: '#2563eb',
  f: '#db2777',
  x: '#7c6a9a', // Autre — soft plum, not flashy
  u: '#2f9e6b', // Non défini / non indiqué — green
};

const MALE = /^(h|m|homme|male|masculin)$/i;
const FEMALE = /^(f|femme|female|feminin|féminin)$/i;
const OTHER = /^(a|autre|other|x|nb|non-?binaire)$/i;
const UNDEFINED = /^(u|\?|nd|n\/?d|non\s*d[eé]fini|undefined|unspecified|inconnu)$/i;

function genderLabelFr(kind: GenderKind, raw?: string): string {
  if (kind === 'm') return 'Homme';
  if (kind === 'f') return 'Femme';
  if (kind === 'u') return 'Non défini';
  if (raw && OTHER.test(raw.trim())) return 'Autre';
  return raw?.trim() || 'Autre';
}

export function genderFromLabel(raw: string | undefined | null): GenderKind {
  const s = (raw || '').trim();
  if (!s || UNDEFINED.test(s)) return 'u';
  if (MALE.test(s)) return 'm';
  if (FEMALE.test(s)) return 'f';
  if (OTHER.test(s)) return 'x';
  return 'u';
}

/** Build the IRC realname string from MonIdentité fields (H/F/A). */
export function formatProfileGecos(age: string | number, sexe: string, ville: string): string | undefined {
  const a = String(age ?? '').trim();
  const city = String(ville ?? '').trim().replace(/[\r\n]/g, ' ').slice(0, 40);
  const kind = genderFromLabel(sexe);
  const label = kind === 'm' ? 'Homme' : kind === 'f' ? 'Femme' : kind === 'x' ? 'Autre' : (sexe.trim() ? 'Non défini' : '');
  if (!a || !label || !city) return undefined;
  return `${a} - ${label} - ${city}`;
}

function isKnownGenderToken(label: string): boolean {
  return MALE.test(label) || FEMALE.test(label) || OTHER.test(label) || UNDEFINED.test(label);
}

/** Parse a realname/GECOS into age / gender / city when it matches known shapes.
 *  Returns null for arbitrary IRC client realnames (no badge / no colour). */
export function parseProfileGecos(realname: string | undefined | null): ProfileGecos | null {
  const raw = (realname || '').trim();
  if (!raw) return null;

  // KiwiIRC legacy: "[19/F/Nice]" (whole string, or without brackets)
  if (/^\[[^\]]+\]$/.test(raw) || /^(\d{1,3})\s*\/\s*[HFAhfauU?\s]\s*\/\s*.+$/.test(raw)) {
    const kiwi = raw.match(/\[?\s*(\d{1,3})\s*\/\s*([HFAhfauU?])\s*\/\s*([^\]]+?)\s*\]?$/);
    if (kiwi) {
      const kind = genderFromLabel(kiwi[2]);
      return {
        age: kiwi[1],
        gender: kind,
        genderLabel: genderLabelFr(kind, kiwi[2]),
        city: kiwi[3].trim(),
      };
    }
  }
  const kiwiEmbedded = raw.match(/\[(\d{1,3})\/([HFAhfauU?])\/([^\]]+)\]/);
  if (kiwiEmbedded) {
    const kind = genderFromLabel(kiwiEmbedded[2]);
    return {
      age: kiwiEmbedded[1],
      gender: kind,
      genderLabel: genderLabelFr(kind, kiwiEmbedded[2]),
      city: kiwiEmbedded[3].trim(),
    };
  }

  // Preferred: "40 - Homme - Paris"
  const m = raw.match(/^(\d{1,3})\s*-\s*([^-]+?)\s*-\s*(.+)$/);
  if (m) {
    const label = m[2].trim();
    if (!isKnownGenderToken(label)) return null;
    const kind = genderFromLabel(label);
    return {
      age: m[1],
      genderLabel: genderLabelFr(kind, label),
      gender: kind,
      city: m[3].trim(),
    };
  }

  // Legacy ConnectScreen: "Femme · 40 ans · Paris"
  const parts = raw.split(/\s*[·•|]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    let age: string | undefined;
    let genderLabel: string | undefined;
    let city: string | undefined;
    for (const p of parts) {
      const am = p.match(/^(\d{1,3})\s*(?:ans)?$/i);
      if (am) { age = am[1]; continue; }
      if (isKnownGenderToken(p)) {
        genderLabel = p;
        continue;
      }
      if (!city) city = p;
    }
    if (age && genderLabel && city) {
      return {
        age,
        genderLabel: genderLabelFr(genderFromLabel(genderLabel), genderLabel),
        gender: genderFromLabel(genderLabel),
        city,
      };
    }
  }

  return null;
}

/** Haystack for member search (nick + age/sexe/ville synonyms). */
export function profileSearchText(realname: string | undefined | null, nick: string): string {
  const bits = [nick];
  const p = parseProfileGecos(realname);
  if (p) {
    if (p.age) bits.push(p.age, `${p.age} ans`);
    if (p.city) bits.push(p.city);
    if (p.genderLabel) bits.push(p.genderLabel);
    if (p.gender === 'm') bits.push('homme', 'h', 'male', 'm');
    if (p.gender === 'f') bits.push('femme', 'f', 'female');
    if (p.gender === 'x') bits.push('autre', 'a', 'other', 'nb');
    if (p.gender === 'u') bits.push('non défini', 'non defini', 'nd', 'undefined');
  }
  return bits.join(' ').toLowerCase();
}
