// Scroll to a message by its data-mid and briefly flash it, so a reply/quote line
// can jump to the message it refers to.
export function jumpToMessage(id: string): void {
  const el = document.querySelector(`[data-mid="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('mircline--flash');
  window.setTimeout(() => el.classList.remove('mircline--flash'), 1400);
}

// Softly tint the referenced message while its reply line is hovered.
export function highlightMessage(id: string, on: boolean): void {
  document.querySelector(`[data-mid="${CSS.escape(id)}"]`)?.classList.toggle('mircline--replytarget', on);
}
