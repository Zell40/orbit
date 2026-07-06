// mIRC-style sent-message recall (↑/↓ in the composer), split out of Composer as
// a pure factory so its index bookkeeping is unit-testable without React/DOM.
// idx === -1 means "the live draft"; recalling stashes that draft so ↓ can walk
// all the way back to it. The component keeps one instance in a ref and feeds it
// the serialized editor text.

export function createSentHistory(cap = 100) {
  const items: string[] = [];
  let idx = -1;      // -1 = live draft (not recalling)
  let stash = '';    // the in-progress draft, kept while recalling

  return {
    // Record a just-sent message (skip consecutive duplicates, cap the ring) and
    // leave recall mode.
    record(text: string): void {
      if (items[items.length - 1] !== text) items.push(text);
      if (items.length > cap) items.shift();
      idx = -1; stash = '';
    },
    // Typing exits recall mode.
    reset(): void { idx = -1; },
    // ↑ — older. Returns the text to load, or null if there's nothing to recall.
    recallPrev(current: string): string | null {
      if (!items.length) return null;
      if (idx === -1) stash = current;
      if (idx < items.length - 1) idx++;
      return items[items.length - 1 - idx];
    },
    // ↓ — newer, back toward the live draft. Null when already at the draft.
    recallNext(): string | null {
      if (idx === -1) return null;
      idx--;
      return idx === -1 ? stash : items[items.length - 1 - idx];
    },
  };
}
