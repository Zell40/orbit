import type { AppConfig } from '@/core/config';

export type AslFields = { sex: string; age: string; city: string };
export type AslBlock = 'gender' | 'age' | 'city' | 'minAge';

/** Homme, Femme, or “non indiqué” (stored as Autre in GECOS). */
export function aslHasGender(sex: string): boolean {
  const s = String(sex ?? '').trim().toLowerCase();
  return s === 'f' || s === 'h' || s === 'a' || s === 'x';
}

function ageNum(age: string): number {
  return parseInt(String(age ?? '').trim(), 10);
}

/** Why connect is refused, or null when ASL allows it. */
export function aslGate(asl: AppConfig['asl'] | undefined, fields: AslFields): AslBlock | null {
  if (!asl) return null;
  const n = ageNum(fields.age);
  const hasAge = Number.isFinite(n);
  if (asl.requireGender && !aslHasGender(fields.sex)) return 'gender';
  if (asl.requireAge && !hasAge) return 'age';
  const min = Number(asl.minAge);
  if (min > 0 && (!hasAge || n < min)) return 'minAge';
  if (asl.requireCity && !String(fields.city ?? '').trim()) return 'city';
  return null;
}

/** Per-field validity for red/green borders (independent of first-failure order). */
export function aslFieldOk(asl: AppConfig['asl'] | undefined, fields: AslFields): { gender: boolean; age: boolean; city: boolean } {
  const n = ageNum(fields.age);
  const hasAge = Number.isFinite(n);
  const min = Number(asl?.minAge);
  const ageOk = hasAge && (!(min > 0) || n >= min);
  return {
    gender: aslHasGender(fields.sex),
    age: ageOk,
    city: !!String(fields.city ?? '').trim(),
  };
}
