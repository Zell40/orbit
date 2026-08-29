// Mobile conversation drawer (`nav-open` in Chat.tsx). Selecting a buffer —
// sidebar row, Explore / room-gallery join, /join, a channel link — must hide
// the drawer so the chat is visible. Bound once from Chat; called from setActive.
let close: () => void = () => {};

export function bindMobileNavClose(fn: () => void): () => void {
  close = fn;
  return () => { if (close === fn) close = () => {}; };
}

export function closeMobileNav(): void {
  close();
}
