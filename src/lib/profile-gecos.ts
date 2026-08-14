/** EntreNous-style GECOS / realname.
 *  Current:  "40 - Homme - Paris"
 *  Kiwi:     "[19/F/Nice]"  (H=Homme, F=Femme, A=Autre)
 *  Legacy:   "Femme · 40 ans · Paris"
 */

export type GenderKind = 'm' | 'f' | 'x';

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
  x: '#78839a', // Autre / non-binaire déclaré — neutre, pas « inconnu »
};

const MALE = /^(h|m|homme|male|masculin)$/i;
const FEMALE = /^(f|femme|female|feminin|féminin)$/i;

function genderLabelFr(kind: GenderKind, raw?: string): string {
  if (kind === 'm') return 'Homme';
  if (kind === 'f') return 'Femme';
  if (raw && /^(a|autre|other)$/i.test(raw.trim())) return 'Autre';
  return raw?.trim() || 'Autre';
}

export function genderFromLabel(raw: string | undefined | null): GenderKind {
  const s = (raw || '').trim();
  if (!s) return 'x';
  if (MALE.test(s)) return 'm';
  if (FEMALE.test(s)) return 'f';
  if (/^(a|autre|other|x|nb|non-?binaire)$/i.test(s)) return 'x';
  return 'x';
}

/** Build the IRC realname string from MonIdentité fields (H/F/A). */
export function formatProfileGecos(age: string | number, sexe: string, ville: string): string | undefined {
  const a = String(age ?? '').trim();
  const city = String(ville ?? '').trim().replace(/[\r\n]/g, ' ').slice(0, 40);
  const kind = genderFromLabel(sexe);
  const label = kind === 'm' ? 'Homme' : kind === 'f' ? 'Femme' : (sexe.trim() ? 'Autre' : '');
  if (!a || !label || !city) return undefined;
  return `${a} - ${label} - ${city}`;
}

/** Parse a realname/GECOS into age / gender / city when it matches known shapes.
 *  Returns null for arbitrary IRC client realnames (no badge / no colour). */
export function parseProfileGecos(realname: string | undefined | null): ProfileGecos | null {
  const raw = (realname || '').trim();
  if (!raw) return null;

  // KiwiIRC legacy: "[19/F/Nice]" (whole string, or without brackets)
  if (/^\[[^\]]+\]$/.test(raw) || /^(\d{1,3})\s*\/\s*[HFAhfa]\s*\/\s*.+$/.test(raw)) {
    const kiwi = raw.match(/\[?\s*(\d{1,3})\s*\/\s*([HFAhfa])\s*\/\s*([^\]]+?)\s*\]?$/);
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
  const kiwiEmbedded = raw.match(/\[(\d{1,3})\/([HFAhfa])\/([^\]]+)\]/);
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
    const kind = genderFromLabel(m[2]);
    // Require a recognisable gender token so random "1 - foo - bar" realnames
    // from other clients don't get a gender colour.
    const label = m[2].trim();
    if (!MALE.test(label) && !FEMALE.test(label) && !/^(a|autre|other)$/i.test(label)) {
      return null;
    }
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
      if (MALE.test(p) || FEMALE.test(p) || /^(a|autre|other|h|f)$/i.test(p)) {
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
