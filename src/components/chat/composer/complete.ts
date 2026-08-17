// Pure tab-completion candidate logic, split out of Composer so it can be
// unit-tested without a DOM. Given the editor's plain text and caret position,
// work out which token is under the caret and what it can complete to:
//   :name  → emoji            (anywhere)
//   /cmd   → slash command    (only at the very start of the line)
//   #chan  → channel name     (from the network list — e.g. /join #part<Tab>)
//   nick   → channel member   (': ' suffix at line start, ' ' otherwise)
// The DOM insertion + cycle-through-matches state stays in the component.

export interface CompleteContext {
  members: string[];
  channels: string[];
  pluginCmds: string[];
  slashCommands: string[];
  emojiNames: Record<string, string>;
}

export type CompletionKind = 'slash' | 'channel' | 'nick' | 'emoji';

export interface Completion {
  start: number;        // index where the token begins (replace start..pos)
  candidates: string[];
  kind: CompletionKind;
}

function sortAlpha(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

export function completeToken(text: string, pos: number, ctx: CompleteContext): Completion | null {
  const before = text.slice(0, pos);
  const token = (before.match(/(\S*)$/)?.[1]) ?? '';
  if (!token) return null;
  const start = pos - token.length;
  let candidates: string[];
  let kind: CompletionKind;

  if (token.startsWith(':') && token.length > 1) {
    const q = token.slice(1).toLowerCase();
    candidates = Object.keys(ctx.emojiNames).filter((n) => n.startsWith(q)).map((n) => ctx.emojiNames[n]);
    kind = 'emoji';
  } else if (token.startsWith('/') && start === 0) {
    // "/jo" → /join ; bare "/" lists every known command for discovery.
    const q = token.slice(1).toLowerCase();
    candidates = [...ctx.slashCommands, ...ctx.pluginCmds]
      .filter((c) => c.toLowerCase().startsWith(q))
      .sort(sortAlpha)
      .map((c) => '/' + c + ' ');
    kind = 'slash';
  } else if (token.startsWith('#') || /^\/(?:join|part|names|topic)\s+/i.test(before.slice(0, start))) {
    // Channel. Support comma-separated lists (/join #a,#b<Tab>) by completing
    // only the segment under the caret, and drop the trailing space while a list
    // is being built so it doesn't terminate the /join argument.
    // After /join|/part|… also complete a bare name by prefixing '#'.
    const seg = token.includes(',') ? token.slice(token.lastIndexOf(',') + 1) : token;
    const raw = seg.startsWith('#') ? seg : `#${seg}`;
    if (raw.length < 2) return null; // need at least "#x"
    const q = raw.toLowerCase();
    const suffix = token.includes(',') ? '' : ' ';
    candidates = ctx.channels
      .filter((c) => c.toLowerCase().startsWith(q))
      .sort(sortAlpha)
      .map((c) => c + suffix);
    if (!candidates.length) return null;
    return { start: pos - seg.length, candidates, kind: 'channel' };
  } else {
    // Avoid offering nicks for a lone punctuation token.
    if (!/[\p{L}\p{N}_-]/u.test(token)) return null;
    const q = token.toLowerCase();
    const tail = start === 0 ? ': ' : ' ';
    candidates = ctx.members
      .filter((n) => n.toLowerCase().startsWith(q))
      .sort(sortAlpha)
      .map((n) => n + tail);
    kind = 'nick';
  }
  if (!candidates.length) return null;
  return { start, candidates, kind };
}
