// Channel-mode parsing, exactly per https://modern.ircdocs.horse/#channel-modes
//
// A MODE change has four parameter behaviours, decided by ISUPPORT CHANMODES
// ("A,B,C,D") plus the membership prefixes from ISUPPORT PREFIX:
//
//   Type A (list)   — ALWAYS takes a param, on set AND unset (bans +b, excepts +e,
//                     invite-exceptions +I). Maintained as a per-channel list.
//   Type B (param)  — ALWAYS takes a param, on set AND unset (key +k).
//   Type C (setparam) — takes a param ONLY when set (+l); none when unset.
//   Type D (flag)   — NEVER takes a param (+i +m +n +s +t).
//   Prefix modes    — membership grants (+o/+v/…); ALWAYS take a nick param.

export type ModeKind = 'prefix' | 'list' | 'param' | 'flag';

export interface ModeChange {
  add: boolean;          // true for '+', false for '-'
  mode: string;          // the mode letter
  param?: string;        // the consumed parameter, if any
  kind: ModeKind;
  prefix?: string;       // for prefix modes: the symbol (@ + …)
}

export interface ModeContext {
  typeA: Set<string>;    // list modes
  typeB: Set<string>;    // always-param modes
  typeC: Set<string>;    // param-on-set modes
  typeD: Set<string>;    // no-param flags
  prefixModeToChar: Record<string, string>; // o -> @, v -> +, …
}

export function buildModeContext(
  isupport: Record<string, string>,
  prefixModeToChar: Record<string, string>,
): ModeContext {
  const cm = (isupport['CHANMODES'] || '').split(',');
  const set = (s: string | undefined) => new Set((s || '').split('').filter(Boolean));
  return {
    typeA: set(cm[0]),
    typeB: set(cm[1]),
    typeC: set(cm[2]),
    typeD: set(cm[3]),
    prefixModeToChar,
  };
}

// Per the spec's parameter rules, does this mode consume a parameter here?
function takesParam(mode: string, add: boolean, ctx: ModeContext): boolean {
  if (ctx.prefixModeToChar[mode]) return true; // prefix: always
  if (ctx.typeA.has(mode)) return true;         // A: always
  if (ctx.typeB.has(mode)) return true;         // B: always
  if (ctx.typeC.has(mode)) return add;          // C: on set only
  return false;                                  // D (or unknown): never
}

function kindOf(mode: string, ctx: ModeContext): ModeKind {
  if (ctx.prefixModeToChar[mode]) return 'prefix';
  if (ctx.typeA.has(mode)) return 'list';
  if (ctx.typeB.has(mode) || ctx.typeC.has(mode)) return 'param';
  return 'flag';
}

// Parse a MODE change ("+o-v+b" + params) into an ordered list of changes,
// consuming parameters left-to-right exactly as the spec describes.
export function parseModeChanges(modestring: string, params: string[], ctx: ModeContext): ModeChange[] {
  const out: ModeChange[] = [];
  let add = true;
  let pi = 0;
  for (const ch of modestring) {
    if (ch === '+') { add = true; continue; }
    if (ch === '-') { add = false; continue; }
    const param = takesParam(ch, add, ctx) ? params[pi++] : undefined;
    out.push({ add, mode: ch, param, kind: kindOf(ch, ctx), prefix: ctx.prefixModeToChar[ch] });
  }
  return out;
}

// ---- User modes ---------------------------------------------------------
// User modes are global per-user and take NO parameters (per the spec). Apply a
// "+iw-o" change string to the current set of user-mode letters, returning the
// sorted set. Also used to seed from RPL_UMODEIS by passing current = ''.
export function applyUserModes(current: string, modestring: string): string {
  const set = new Set(current.replace(/^\+/, '').split('').filter(Boolean));
  let add = true;
  for (const ch of modestring) {
    if (ch === '+') { add = true; continue; }
    if (ch === '-') { add = false; continue; }
    if (add) set.add(ch); else set.delete(ch);
  }
  return [...set].sort().join('');
}

// Friendly names for the common user modes are resolved via i18n (umodes.*) in
// lib/format → formatUserModes.

// Apply a type B/C/D channel-flag change to the stored mode letters + params.
// Type B/C carry a param (key +k, limit +l) which we keep; type D are bare flags.
export function applyChannelFlag(
  modes: string,
  modeParams: Record<string, string>,
  c: ModeChange,
): { modes: string; modeParams: Record<string, string> } {
  const letters = modes.replace(/^\+/, '').split('').filter(Boolean);
  const mp = { ...modeParams };
  if (c.add) {
    if (!letters.includes(c.mode)) letters.push(c.mode);
    if (c.param !== undefined) mp[c.mode] = c.param;
  } else {
    const i = letters.indexOf(c.mode);
    if (i > -1) letters.splice(i, 1);
    delete mp[c.mode];
  }
  return { modes: letters.length ? '+' + letters.join('') : '', modeParams: mp };
}
