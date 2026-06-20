// Pure result builder for the quick switcher (Ctrl/⌘-K). Kept framework-free and
// side-effect-free so it can be unit-tested. The component maps `kind` to icons
// and i18n labels.
export type SwitcherKind = 'channel' | 'dm' | 'person' | 'join';

export interface SwitcherItem {
  id: string;
  kind: SwitcherKind;
  target: string; // buffer name, nick, or channel to join
  label: string;  // display text
}

interface SwBuffer { name: string; isChannel: boolean; members: Record<string, { nick: string }> }
export interface SwitcherData {
  order: string[];
  buffers: Record<string, SwBuffer>;
  friends: string[];
  nick: string;
}

const SERVER = '$server'; // the console pseudo-buffer — never a switch target

// prefix (3) > substring (2) > subsequence (1) > no match (0).
function score(hay: string, needle: string): number {
  const i = hay.indexOf(needle);
  if (i === 0) return 3;
  if (i > 0) return 2;
  let at = 0;
  for (const ch of needle) {
    at = hay.indexOf(ch, at);
    if (at === -1) return 0;
    at++;
  }
  return 1;
}

export function buildSwitcherResults(query: string, d: SwitcherData, limit = 40): SwitcherItem[] {
  const q = query.trim().toLowerCase();
  const me = d.nick.toLowerCase();

  // Open buffers (channels + DMs), in their sidebar order.
  const buffers: SwitcherItem[] = [];
  const openNames = new Set<string>();
  for (const name of d.order) {
    if (name === SERVER) continue;
    const b = d.buffers[name];
    if (!b) continue;
    openNames.add(name.toLowerCase());
    buffers.push({ id: 'buf:' + name, kind: b.isChannel ? 'channel' : 'dm', target: name, label: b.name });
  }

  // People: members across open channels + friends, minus self and open DMs.
  const people = new Map<string, string>();
  for (const name of d.order) {
    const b = d.buffers[name];
    if (!b?.isChannel) continue;
    for (const m of Object.values(b.members)) {
      const ln = m.nick.toLowerCase();
      if (ln !== me && !openNames.has(ln) && !people.has(ln)) people.set(ln, m.nick);
    }
  }
  for (const f of d.friends) {
    const ln = f.toLowerCase();
    if (ln !== me && !openNames.has(ln) && !people.has(ln)) people.set(ln, f);
  }
  const persons: SwitcherItem[] = [...people.values()].map((n) => ({
    id: 'person:' + n.toLowerCase(), kind: 'person', target: n, label: n,
  }));

  // No query → just the open buffers (a fast "jump to a conversation").
  if (!q) return buffers.slice(0, limit);

  const scored = [...buffers, ...persons]
    .map((it) => ({ it, s: score(it.label.toLowerCase(), q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it);

  // Offer to join a channel the query names but that isn't open.
  const chan = q.startsWith('#') || q.startsWith('&') ? q : '#' + q;
  const haveChan = scored.some((r) => r.kind === 'channel' && r.target.toLowerCase() === chan);
  if (!haveChan && /^[#&]?[a-z0-9._\-|[\]{}^`]+$/i.test(q)) {
    scored.push({ id: 'join:' + chan, kind: 'join', target: chan, label: chan });
  }
  return scored.slice(0, limit);
}
