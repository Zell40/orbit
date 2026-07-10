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
  { letter: 'm', name: 'mute',        acting: true,  hint: 'nick!user@host' },
  { letter: 'c', name: 'blockcolor',  acting: true,  hint: 'nick!user@host' },
  { letter: 'C', name: 'noctcp',      acting: true,  hint: 'nick!user@host' },
  { letter: 'N', name: 'nonick',      acting: true,  hint: 'nick!user@host' },
  { letter: 'T', name: 'nonotice',    acting: true,  hint: 'nick!user@host' },
  { letter: 'S', name: 'stripcolor',  acting: true,  hint: 'nick!user@host' },
  { letter: 'Q', name: 'nokick',      acting: true,  hint: 'nick!user@host' },
  { letter: 'u', name: 'opmoderated', acting: true,  hint: 'nick!user@host' },
  { letter: 'A', name: 'blockinvite', acting: true,  hint: 'nick!user@host' },
  { letter: 'd', name: 'redirect',    acting: true,  hint: '#channel:nick!user@host' },
  // Matching — ban by a trait.
  { letter: 'R', name: 'account',     acting: false, hint: 'account' },
  { letter: 'U', name: 'unauthed',    acting: false, hint: 'nick!user@host' },
  { letter: 'g', name: 'securitygroup', acting: false, hint: 'registered' },
  { letter: 'y', name: 'score',       acting: false, hint: '-5' },
  { letter: 'G', name: 'country',     acting: false, hint: 'FR' },
  { letter: 's', name: 'server',      acting: false, hint: '*.example.net' },
  { letter: 'n', name: 'class',       acting: false, hint: 'class' },
  { letter: 'r', name: 'realname',    acting: false, hint: 'real name' },
  { letter: 'a', name: 'realmask',    acting: false, hint: 'nick!user@host+real name' },
  { letter: 'z', name: 'fingerprint', acting: false, hint: 'fingerprint' },
  { letter: 'o', name: 'oper',        acting: false, hint: 'oper account' },
  { letter: 'O', name: 'opertype',    acting: false, hint: 'oper type' },
  { letter: 'j', name: 'channel',     acting: false, hint: '#channel' },
  { letter: 'b', name: 'share',       acting: false, hint: '#channel' },
  { letter: 'w', name: 'gateway',     acting: false, hint: 'gateway' },
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
