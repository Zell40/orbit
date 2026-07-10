// InspIRCd extban catalogue. Each entry is keyed by the single letter the server
// advertises in ISUPPORT `EXTBAN` (`<prefix>,<letters>`); `name` is the named form
// we send — InspIRCd 4's default extbanformat="any" accepts either the name or the
// letter, and the name is self-describing in the ban list (e.g. `mute:*!*@x`). Only
// entries whose letter the server actually advertises are offered, so the picker
// always reflects the modules that are loaded (core + reputation `score` +
// securitygroups). Labels resolve via i18n (extbans.<name>); `hint` is an example of
// the value shape. `acting` extbans restrict behaviour; the rest match/ban by a trait.
export interface ExtBan { letter: string; name: string; acting: boolean; hint: string; }

export const EXTBANS: ExtBan[] = [
  // Acting — restrict what matching users may do.
  { letter: 'm', name: 'mute',        acting: true,  hint: 'test!test@test.test' },
  { letter: 'c', name: 'blockcolor',  acting: true,  hint: 'test!test@test.test' },
  { letter: 'C', name: 'noctcp',      acting: true,  hint: 'test!test@test.test' },
  { letter: 'N', name: 'nonick',      acting: true,  hint: 'test!test@test.test' },
  { letter: 'T', name: 'nonotice',    acting: true,  hint: 'test!test@test.test' },
  { letter: 'S', name: 'stripcolor',  acting: true,  hint: 'test!test@test.test' },
  { letter: 'Q', name: 'nokick',      acting: true,  hint: 'test!test@test.test' },
  { letter: 'u', name: 'opmoderated', acting: true,  hint: 'test!test@test.test' },
  { letter: 'A', name: 'blockinvite', acting: true,  hint: 'test!test@test.test' },
  { letter: 'd', name: 'redirect',    acting: true,  hint: '#offtopic:test!test@test.test' },
  // Matching — ban by a trait.
  { letter: 'R', name: 'account',     acting: false, hint: 'baduser' },
  { letter: 'U', name: 'unauthed',    acting: false, hint: 'test!test@test.test' },
  { letter: 'g', name: 'securitygroup', acting: false, hint: 'registered' },
  { letter: 'y', name: 'score',       acting: false, hint: '-5' },
  { letter: 'G', name: 'country',     acting: false, hint: 'RU' },
  { letter: 's', name: 'server',      acting: false, hint: '*.example.net' },
  { letter: 'n', name: 'class',       acting: false, hint: 'main' },
  { letter: 'r', name: 'realname',    acting: false, hint: 'spam_bot' },
  { letter: 'a', name: 'realmask',    acting: false, hint: 'test!test@test.test+spam_bot' },
  { letter: 'z', name: 'fingerprint', acting: false, hint: 'a1b2c3d4e5f6' },
  { letter: 'o', name: 'oper',        acting: false, hint: 'admin' },
  { letter: 'O', name: 'opertype',    acting: false, hint: 'NetAdmin' },
  { letter: 'j', name: 'channel',     acting: false, hint: '#staff' },
  { letter: 'b', name: 'share',       acting: false, hint: '#staff' },
  { letter: 'w', name: 'gateway',     acting: false, hint: 'mibbit' },
];

// Parse ISUPPORT EXTBAN ("<prefix>,<letters>", prefix usually empty) into the
// catalogue entries the server supports, preserving catalogue order.
export function availableExtbans(isupport: Record<string, string>): ExtBan[] {
  const raw = isupport.EXTBAN || '';
  const letters = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  if (!letters) return [];
  const set = new Set(letters.split(''));
  return EXTBANS.filter((e) => set.has(e.letter));
}

// Recognise a ban mask that is a typed extban ("name:..." or "letter:...") so the UI
// can label it. Returns the catalogue entry, or null for a plain nick!user@host ban.
export function matchExtban(mask: string): ExtBan | null {
  const head = mask.replace(/^!/, '').split(':', 1)[0];
  return EXTBANS.find((e) => e.name === head || e.letter === head) || null;
}
