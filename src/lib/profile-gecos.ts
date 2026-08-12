/** EntreNous-style GECOS / realname: "40 - Homme - Paris" (also accepts older "Femme · 40 ans · Paris"). */

export type GenderKind = 'm' | 'f' | 'x';

export interface ProfileGecos {
  age?: string;
  gender: GenderKind;
  genderLabel?: string;
  city?: string;
}

const MALE = /^(h|m|homme|male|masculin)$/i;
const FEMALE = /^(f|femme|female|feminin|féminin)$/i;

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

/** Parse a realname/GECOS into age / gender / city when it matches known shapes. */
export function parseProfileGecos(realname: string | undefined | null): ProfileGecos | null {
  const raw = (realname || '').trim();
  if (!raw) return null;

  // Preferred: "40 - Homme - Paris"
  let m = raw.match(/^(\d{1,3})\s*-\s*([^-]+?)\s*-\s*(.+)$/);
  if (m) {
    return {
      age: m[1],
      genderLabel: m[2].trim(),
      gender: genderFromLabel(m[2]),
      city: m[3].trim(),
    };
  }

  // Legacy ConnectScreen: "Femme · 40 ans · Paris" (any order of sex / age / city)
  const parts = raw.split(/\s*[·•|]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    let age: string | undefined;
    let genderLabel: string | undefined;
    let city: string | undefined;
    for (const p of parts) {
      const am = p.match(/^(\d{1,3})\s*(?:ans)?$/i);
      if (am) { age = am[1]; continue; }
      const g = genderFromLabel(p);
      if (g !== 'x' || /^(homme|femme|autre|h|f|a)$/i.test(p)) {
        genderLabel = p;
        continue;
      }
      if (!city) city = p;
    }
    if (age || genderLabel || city) {
      return {
        age,
        genderLabel,
        gender: genderFromLabel(genderLabel),
        city,
      };
    }
  }

  return null;
}
