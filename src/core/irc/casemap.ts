// IRC case-folding per ISUPPORT CASEMAPPING (https://modern.ircdocs.horse/#casemapping).
// Channel and nick names are case-INSENSITIVE: "#Taverne" ≡ "#taverne", "Bob" ≡ "bob".
// We fold names to a canonical key so the same target never becomes two buffers.
//
//   ascii            — only A-Z fold to a-z
//   rfc1459          — also []\^ fold to {}|~   (the IRC default)
//   rfc1459-strict   — also []\  fold to {}|    (no ^/~)
export function casefold(name: string, mapping = 'rfc1459'): string {
  if (!name) return ''; // a crafted line with a missing target param passes undefined here
  let out = '';
  for (const ch of name) {
    const c = ch.charCodeAt(0);
    if (c >= 0x41 && c <= 0x5a) out += String.fromCharCode(c + 0x20); // A-Z → a-z
    else if (mapping !== 'ascii' && c >= 0x5b && c <= (mapping === 'rfc1459-strict' ? 0x5d : 0x5e))
      out += String.fromCharCode(c + 0x20); // []\^ → {}|~
    else out += ch;
  }
  return out;
}
