// ASCII emoticons typed in the composer ("sourire = :)") become the glyph
// itself, as soon as the code is finished at the caret.

const TEXT_SMILEYS: ReadonlyArray<readonly [string, string]> = [
  [":'(", '😢'],
  [":-)", '😀'],
  [":-(", '😢'],
  [":-D", '😃'],
  [":-P", '😛'],
  [":-p", '😛'],
  [":-O", '😮'],
  [":-o", '😮'],
  [";-)", '😉'],
  [":-/", '😕'],
  ["</3", '💔'],
  [":)", '😀'],
  [":(", '😢'],
  [":D", '😃'],
  [":P", '😛'],
  [":p", '😛'],
  [":O", '😮'],
  [":o", '😮'],
  [";)", '😉'],
  [":/", '😕'],
  [":*", '😘'],
  [":3", '😺'],
  ["xD", '🤣'],
  ["XD", '🤣'],
  ["B)", '😎'],
  ["8)", '😎'],
  ["<3", '❤️'],
];

export function textSmileyAt(text: string, pos: number): { start: number; emoji: string } | null {
  if (pos <= 0 || pos > text.length) return null;
  const before = text.slice(0, pos);
  for (const [code, emoji] of TEXT_SMILEYS) {
    if (code.length > before.length || !before.endsWith(code)) continue;
    const start = pos - code.length;
    const prev = start > 0 ? before.charAt(start - 1) : '';
    if (prev && /[\p{L}\p{N}_]/u.test(prev)) continue;
    return { start, emoji };
  }
  return null;
}
