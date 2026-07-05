// Pure text/IRC helpers used by the store (no state, no closure) — ban-mask
// matching and formatting-code stripping/tidying. Services-specific helpers
// (identity, credential masking, leak detection) live in ../services.
import type { IrcMessage } from '../irc/types';

// "user@host" for an event source, or '' when the server didn't give us one.
export function hostmask(msg: IrcMessage): string {
  return msg.user && msg.host ? `${msg.user}@${msg.host}` : '';
}

// Linear-time glob matcher for `*` (any run) and `?` (any one char). Iterative
// with a single backtrack point, so it can't blow up the way a `.*.*.*…` regex
// does — a mask packed with wildcards is O(len(pat)·len(str)), not exponential.
function globMatch(pat: string, str: string): boolean {
  let p = 0, s = 0, star = -1, mark = 0;
  while (s < str.length) {
    if (p < pat.length && (pat[p] === '?' || pat[p] === str[s])) { p++; s++; }
    else if (p < pat.length && pat[p] === '*') { star = p++; mark = s; }
    else if (star !== -1) { p = star + 1; s = ++mark; }
    else return false;
  }
  while (p < pat.length && pat[p] === '*') p++;
  return p === pat.length;
}

// Match an IRC ban mask (nick!user@host with * and ? wildcards) against `who`,
// so we can list which present members a +b/-b actually hits (like mIRC).
export function maskMatches(mask: string, who: string): boolean {
  if (!mask || !who) return false;
  const m = mask.includes('!') || mask.includes('@') ? mask : `${mask}!*@*`;
  return globMatch(m.toLowerCase(), who.toLowerCase());
}

// Strip IRC formatting control codes (bold/italic/underline/strike/mono/reverse/
// reset + mIRC colour). Needed so a line is still recognised as a /command even
// when "sticky" formatting (e.g. bold left on) prefixes it with a control byte.
const IRC_FMT_RE = /\x03\d{0,2}(?:,\d{1,2})?|\x04[0-9A-Fa-f]{0,6}|[\x02\x1d\x1f\x1e\x11\x16\x0f]/g;
export function stripFormatting(s: string): string { return s.replace(IRC_FMT_RE, ''); }

// Tidy a user's outgoing message so the channel can't be padded/spammed with
// runs of blank space (e.g. a screenful of spaces then a lone "."). Collapses
// space/tab runs to one, strips whitespace hugging line breaks, caps blank-line
// runs and trims the ends. Formatting control bytes aren't whitespace, so they
// pass through untouched. NB: a client-side nicety only — the network-wide guard
// belongs on the ircd (flood/repeat modes), which any raw client can't dodge.
export function tidyOutgoing(s: string): string {
  return s
    .replace(/[^\S\r\n]{2,}/g, ' ')                 // collapse runs of spaces/tabs
    .replace(/[^\S\r\n]*(\r?\n)[^\S\r\n]*/g, '$1')  // drop spaces hugging newlines
    .replace(/(\r?\n){3,}/g, '\n\n')                // cap consecutive blank lines
    .trim();
}
