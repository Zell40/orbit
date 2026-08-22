import type { AppConfig } from '@/core/config';

export type AslFields = { sex: string; age: string; city: string };
export type AslBlock = 'gender' | 'age' | 'city' | 'minAge';

/** Why the connect button should stay off, or null when ASL allows connect. */
export function aslGate(asl: AppConfig['asl'] | undefined, fields: AslFields): AslBlock | null {
  if (!asl) return null;
  const ageNum = parseInt(String(fields.age ?? '').trim(), 10);
  const hasAge = Number.isFinite(ageNum);
  if (asl.requireGender && fields.sex !== 'f' && fields.sex !== 'h') return 'gender';
  if (asl.requireAge && !hasAge) return 'age';
  const min = Number(asl.minAge);
  if (min > 0 && (!hasAge || ageNum < min)) return 'minAge';
  if (asl.requireCity && !String(fields.city ?? '').trim()) return 'city';
  return null;
}
