// contentEditable composer helpers: IRC-formatting ⇄ HTML serialization and
// caret/selection utilities (used by the rich message composer).
import { MIRC_PALETTE } from './format';
import { escapeHtml } from './escape';

// hex (#rrggbb, lowercase) -> mIRC palette index, for the 16 base colours.
const HEX2IDX: Record<string, number> = {};
MIRC_PALETTE.slice(0, 16).forEach((hex, i) => { if (!(hex in HEX2IDX)) HEX2IDX[hex] = i; });

function rgbToHex(c: string): string {
  c = (c || '').trim();
  if (!c) return '';
  if (c[0] === '#') return c.length === 4 ? ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase() : c.slice(0, 7).toLowerCase();
  const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return '';
  const h = (n: number) => ('0' + (+n).toString(16)).slice(-2);
  return ('#' + h(+m[1]) + h(+m[2]) + h(+m[3])).toLowerCase();
}

// A colour as an IRC code: \x03NN for a palette colour, \x04rrggbb otherwise.
function colorCode(hex: string): string {
  if (!hex) return '';
  const idx = HEX2IDX[hex];
  return idx !== undefined ? '\x03' + ('0' + idx).slice(-2) : '\x04' + hex.replace('#', '');
}

// Formatting that applies to a text node, read from its ancestor elements.
function nodeFmt(node: Node, root: HTMLElement) {
  let b = false, i = false, u = false, s = false, fg = '';
  let el = node.parentElement;
  while (el && el !== root && root.contains(el)) {
    const tag = el.tagName;
    const cs = el.style;
    const fw = cs.fontWeight;
    if (tag === 'B' || tag === 'STRONG' || fw === 'bold' || (/^\d+$/.test(fw) && +fw >= 600)) b = true;
    if (tag === 'I' || tag === 'EM' || cs.fontStyle === 'italic') i = true;
    const td = cs.textDecorationLine || cs.textDecoration || '';
    if (tag === 'U' || td.includes('underline')) u = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || td.includes('line-through')) s = true;
    if (!fg) { const hx = rgbToHex(el.getAttribute('color') || cs.color || ''); if (hx) fg = hx; }
    el = el.parentElement;
  }
  return { b, i, u, s, fg };
}

// contentEditable DOM -> IRC formatting codes.
export function serialize(root: HTMLElement): string {
  let out = '';
  const cur = { b: false, i: false, u: false, s: false, fg: '' };
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent || '';
        if (!t) continue;
        const f = nodeFmt(child, root);
        if (f.fg !== cur.fg) {
          // Dropping a colour: reset everything then re-assert the surviving styles
          // (a bare \x03 before digit text would be mis-parsed as a colour number).
          if (!f.fg) { out += '\x0f'; cur.b = cur.i = cur.u = cur.s = false; cur.fg = ''; }
          else { out += colorCode(f.fg); cur.fg = f.fg; }
        }
        if (f.b !== cur.b) { out += '\x02'; cur.b = f.b; }
        if (f.i !== cur.i) { out += '\x1d'; cur.i = f.i; }
        if (f.u !== cur.u) { out += '\x1f'; cur.u = f.u; }
        if (f.s !== cur.s) { out += '\x1e'; cur.s = f.s; }
        out += t;
      } else if (child.nodeName === 'BR') {
        out += '\n';
      } else {
        if ((child.nodeName === 'DIV' || child.nodeName === 'P') && out && !out.endsWith('\n')) out += '\n';
        visit(child);
      }
    }
  };
  visit(root);
  return out;
}

// IRC formatting codes -> HTML, for putting a saved draft back into the editor.
export function ircToHtml(text: string): string {
  if (!text) return '';
  const st = { b: false, i: false, u: false, s: false, fg: '' };
  let html = '', buf = '';
  const style = () => {
    const p: string[] = [];
    if (st.b) p.push('font-weight:700');
    if (st.i) p.push('font-style:italic');
    if (st.u && st.s) p.push('text-decoration:underline line-through');
    else if (st.u) p.push('text-decoration:underline');
    else if (st.s) p.push('text-decoration:line-through');
    if (st.fg) p.push('color:' + st.fg);
    return p.join(';');
  };
  const flush = () => { if (buf) { const s = style(); html += s ? `<span style="${s}">${escapeHtml(buf)}</span>` : escapeHtml(buf); buf = ''; } };
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x02) { flush(); st.b = !st.b; continue; }
    if (c === 0x1d) { flush(); st.i = !st.i; continue; }
    if (c === 0x1f) { flush(); st.u = !st.u; continue; }
    if (c === 0x1e) { flush(); st.s = !st.s; continue; }
    if (c === 0x0f) { flush(); st.b = st.i = st.u = st.s = false; st.fg = ''; continue; }
    if (c === 0x0a) { flush(); html += '<br>'; continue; }
    if (c === 0x03) {
      flush(); let j = i + 1, n = '';
      while (j < text.length && /\d/.test(text[j]) && n.length < 2) n += text[j++];
      st.fg = n === '' ? '' : (MIRC_PALETTE[parseInt(n, 10)] || '');
      if (text[j] === ',' && /\d/.test(text[j + 1] || '')) { j++; while (j < text.length && /\d/.test(text[j])) j++; }
      i = j - 1; continue;
    }
    if (c === 0x04) {
      flush(); let j = i + 1, h = '';
      while (j < text.length && /[0-9a-fA-F]/.test(text[j]) && h.length < 6) h += text[j++];
      if (h.length === 6) st.fg = '#' + h.toLowerCase();
      i = j - 1; continue;
    }
    buf += text[i];
  }
  flush();
  return html;
}

// Linear caret offset within the editor's plain text (for tab-completion).
export function caretIndex(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return (root.textContent || '').length;
  const r = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString().length;
}
function locate(root: HTMLElement, index: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  if (!node) return { node: root, offset: 0 };
  let n = index;
  while (node) {
    const len = (node.textContent || '').length;
    if (n <= len) return { node, offset: n };
    n -= len;
    const nx = walker.nextNode();
    if (!nx) return { node, offset: len };
    node = nx;
  }
  return { node, offset: 0 };
}
export function selectRange(root: HTMLElement, start: number, end: number) {
  const a = locate(root, start), b = locate(root, end);
  const r = document.createRange();
  r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset);
  const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
}

// Is the caret on the first / last visual line of the editor? Lets ArrowUp/Down
// move between lines in a multi-line draft, but recall history at the edges.
export function caretAtEdge(root: HTMLElement): { top: boolean; bottom: boolean } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { top: true, bottom: true };
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getClientRects()[0];
  const er = root.getBoundingClientRect();
  if (!rect || rect.height === 0) return { top: true, bottom: true }; // empty/blank line
  const lh = parseFloat(getComputedStyle(root).lineHeight) || 20;
  return { top: rect.top - er.top < lh * 0.75, bottom: er.bottom - rect.bottom < lh * 0.75 };
}

// Place the caret at the very end of the editor (after recalling history).
export function caretToEnd(root: HTMLElement) {
  const sel = window.getSelection(); if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(root); r.collapse(false);
  sel.removeAllRanges(); sel.addRange(r);
}
