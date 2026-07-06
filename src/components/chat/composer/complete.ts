// Pure tab-completion candidate logic, split out of Composer so it can be
// unit-tested without a DOM. Given the editor's plain text and caret position,
// work out which token is under the caret and what it can complete to:
//   :name  → emoji            (anywhere)
//   /cmd   → slash command    (only at the very start of the line)
//   nick   → channel member   (': ' suffix at line start, ' ' otherwise)
// The DOM insertion + cycle-through-matches state stays in the component.

export interface CompleteContext {
  members: string[];
  pluginCmds: string[];
  slashCommands: string[];
  emojiNames: Record<string, string>;
}

export interface Completion {
  start: number;        // index where the token begins (replace start..pos)
  candidates: string[];
}

export function completeToken(text: string, pos: number, ctx: CompleteContext): Completion | null {
  const before = text.slice(0, pos);
  const token = (before.match(/(\S*)$/)?.[1]) ?? '';
  if (!token) return null;
  const start = pos - token.length;
  let candidates: string[];

  if (token.startsWith(':') && token.length > 1) {
    const q = token.slice(1).toLowerCase();
    candidates = Object.keys(ctx.emojiNames).filter((n) => n.startsWith(q)).map((n) => ctx.emojiNames[n]);
  } else if (token.startsWith('/') && start === 0) {
    const q = token.slice(1).toLowerCase();
    candidates = [...ctx.slashCommands, ...ctx.pluginCmds].filter((c) => c.startsWith(q)).map((c) => '/' + c + ' ');
  } else {
    const q = token.toLowerCase();
    const tail = start === 0 ? ': ' : ' ';
    candidates = ctx.members.filter((n) => n.toLowerCase().startsWith(q)).sort((a, b) => a.localeCompare(b))
      .map((n) => n + tail);
  }
  if (!candidates.length) return null;
  return { start, candidates };
}
