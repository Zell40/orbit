// Presentation helpers shared across the chat UI: timestamps, hashed colours, and
// the mIRC/IRC formatting → React renderer. Inline media embeds live in ./media
// and OpenGraph cards in ./link-preview; linkify() below stitches them in.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useChat } from '../core/store';
import i18n from '../core/i18n';
import { isImageUrl, isAudioUrl, youtubeId, ImageAttachment, AudioAttachment, YouTubeEmbed } from './media';

export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString(i18n.language || 'fr', {
    hour: '2-digit', minute: '2-digit', hour12: !useChat.getState().prefs.clock24,
  });

export function hashHue(seed: string): number {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
export function avatarBg(seed: string): string {
  const h = hashHue(seed);
  return `linear-gradient(140deg, hsl(${h},62%,55%), hsl(${(h + 40) % 360},58%,46%))`;
}

export const IRCOP_COLOR = '#009393'; // IRC colour 10 — IRCop nick colour, used everywhere
export function nickColor(nick: string): string {
  return `hsl(${hashHue(nick)},48%,42%)`;
}

// ||text|| hides content until clicked.
function Spoiler({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className={`spoiler ${shown ? 'is-shown' : ''}`} role="button" tabIndex={0}
      onClick={() => setShown(true)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShown(true); } }}>
      {text}
    </span>
  );
}

// `embeds` gates the inline media cards (image/audio/YouTube) — off = plain links,
// so the "Link previews" pref silences every embed, not just the OpenGraph card.
function linkify(text: string, selfMsg = false, embeds = true): ReactNode {
  // Pull out ||spoilers|| first, then linkify the remaining runs.
  return text.split(/(\|\|.+?\|\|)/g).map((seg, si) => {
    const sp = /^\|\|(.+)\|\|$/.exec(seg);
    if (sp) return <Spoiler key={`sp${si}`} text={sp[1]} />;
    return seg.split(/(https?:\/\/[^\s<>"']+)/g).map((p, i) => {
      const k = `${si}-${i}`;
      // Trim trailing punctuation that IRC/bots often leave glued to the URL.
      let url = p;
      let trail = '';
      if (/^https?:\/\//.test(p)) {
        const m = p.match(/^(https?:\/\/[^\s]+?)([),.;:!?\]]+)$/);
        if (m) { url = m[1]; trail = m[2]; }
      } else {
        return <span key={k}>{p}</span>;
      }
      if (embeds && isImageUrl(url)) return <span key={k}><ImageAttachment url={url} defaultShown={selfMsg} />{trail}</span>;
      if (embeds && isAudioUrl(url)) return <span key={k}><AudioAttachment url={url} />{trail}</span>;
      const yt = embeds ? youtubeId(url) : null;
      if (yt) return <span key={k}><YouTubeEmbed id={yt} url={url} />{trail}</span>;
      return <span key={k}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a>{trail}</span>;
    });
  });
}

// ── mIRC / IRC formatting (colors + bold/italic/underline/strike/reverse/mono) ──
export const MIRC_PALETTE = [
  '#ffffff','#000000','#00007f','#009300','#ff0000','#7f0000','#9c009c','#fc7f00',
  '#ffff00','#00fc00','#009393','#00ffff','#0000fc','#ff00ff','#7f7f7f','#d2d2d2',
  '#470000','#472100','#474700','#324700','#004700','#00472c','#004747','#002747',
  '#000047','#2e0047','#470047','#47002a','#740000','#743a00','#747400','#517400',
  '#007400','#007449','#007474','#004074','#000074','#4b0074','#740074','#740045',
  '#b50000','#b56300','#b5b500','#7db500','#00b500','#00b571','#00b5b5','#0063b5',
  '#0000b5','#7500b5','#b500b5','#b5006b','#ff0000','#ff8c00','#ffff00','#b2ff00',
  '#00ff00','#00ffa0','#00ffff','#008cff','#0000ff','#a500ff','#ff00ff','#ff0098',
  '#ff5959','#ffb459','#ffff71','#cfff60','#6fff6f','#65ffc9','#6dffff','#59b4ff',
  '#5959ff','#c459ff','#ff66ff','#ff59bc','#ff9c9c','#ffd39c','#ffff9c','#e2ff9c',
  '#9cff9c','#9cffdb','#9cffff','#9cd3ff','#9c9cff','#dc9cff','#ff9cff','#ff94d3',
  '#000000','#131313','#282828','#363636','#4d4d4d','#656565','#818181','#9f9f9f',
  '#bcbcbc','#e2e2e2','#ffffff',
];
const FMT_RE = /[\x02\x03\x04\x0f\x11\x16\x1d\x1e\x1f]/;

// ── Keep user-set text colours readable against the current theme ──────────────
// mIRC palettes include near-black / dark-blue / grey that disappear on a dark
// theme (and white / pale that disappear on a light one). We clamp the foreground
// LIGHTNESS toward the readable side — hue and saturation are preserved, so a dark
// blue becomes a lighter blue rather than a different colour. Only applied when the
// author didn't also set a background (then their fg/bg pair is respected).
function parseColor(s: string): [number, number, number] | null {
  const h = s.trim();
  let m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(h);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(h);
  return rgb ? [+rgb[1], +rgb[2], +rgb[3]] : null;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  }
  return [h, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  h /= 360;
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r = l, g = l, b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
  }
  const to = (x: number) => ('0' + Math.round(x * 255).toString(16)).slice(-2);
  return '#' + to(r) + to(g) + to(b);
}
// Cached per theme id: reading the computed --bg once when the theme changes.
let _themeSig = '', _themeDark = true;
function themeIsDark(): boolean {
  const sig = document.documentElement.dataset.theme ?? '';
  if (sig !== _themeSig) {
    _themeSig = sig;
    const rgb = parseColor(getComputedStyle(document.documentElement).getPropertyValue('--bg'));
    _themeDark = rgb ? (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 < 0.5 : true;
  }
  return _themeDark;
}
function readableColor(hex: string): string {
  const rgb = parseColor(hex);
  if (!rgb) return hex;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const nl = themeIsDark() ? Math.max(l, 0.62) : Math.min(l, 0.42);
  return nl === l ? hex : hslToHex(h, s, nl);
}

interface FmtState { b: boolean; i: boolean; u: boolean; s: boolean; m: boolean; rev: boolean; fg?: string; bg?: string; }

function fmtToStyle(st: FmtState): CSSProperties {
  const css: CSSProperties = {};
  if (st.b) css.fontWeight = 700;
  if (st.i) css.fontStyle = 'italic';
  const deco = [st.u && 'underline', st.s && 'line-through'].filter(Boolean).join(' ');
  if (deco) css.textDecoration = deco;
  if (st.m) css.fontFamily = 'ui-monospace, "SF Mono", Menlo, monospace';
  let fg = st.fg, bg = st.bg;
  if (st.rev) { const t = fg; fg = bg ?? '#000'; bg = t ?? '#fff'; }
  // Adapt the text colour to the theme only when it stands on the theme background
  // (no explicit bg) — otherwise the author's fg/bg pairing is left intact.
  if (fg) css.color = bg ? fg : readableColor(fg);
  if (bg) { css.backgroundColor = bg; css.padding = '0 .15em'; css.borderRadius = '3px'; }
  return css;
}

export function formatIrc(text: string, selfMsg: boolean, embeds = true): ReactNode {
  if (!FMT_RE.test(text)) return linkify(text, selfMsg, embeds);
  const out: ReactNode[] = [];
  const st: FmtState = { b: false, i: false, u: false, s: false, m: false, rev: false };
  let buf = '';
  let key = 0;
  const flush = () => { if (buf) { out.push(<span key={key++} style={fmtToStyle(st)}>{linkify(buf, selfMsg, embeds)}</span>); buf = ''; } };
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    switch (c) {
      case 0x02: flush(); st.b = !st.b; continue;
      case 0x1d: flush(); st.i = !st.i; continue;
      case 0x1f: flush(); st.u = !st.u; continue;
      case 0x1e: flush(); st.s = !st.s; continue;
      case 0x11: flush(); st.m = !st.m; continue;
      case 0x16: flush(); st.rev = !st.rev; continue;
      case 0x0f: flush(); st.b = st.i = st.u = st.s = st.m = st.rev = false; st.fg = st.bg = undefined; continue;
      case 0x03: {
        flush();
        let j = i + 1, n = '';
        while (j < text.length && /\d/.test(text[j]) && n.length < 2) n += text[j++];
        if (n === '') { st.fg = st.bg = undefined; i = j - 1; continue; }
        st.fg = MIRC_PALETTE[parseInt(n, 10)];
        if (text[j] === ',' && /\d/.test(text[j + 1] || '')) {
          j++; let bn = '';
          while (j < text.length && /\d/.test(text[j]) && bn.length < 2) bn += text[j++];
          st.bg = MIRC_PALETTE[parseInt(bn, 10)];
        }
        i = j - 1; continue;
      }
      case 0x04: {
        flush();
        let j = i + 1, h = '';
        while (j < text.length && /[0-9a-fA-F]/.test(text[j]) && h.length < 6) h += text[j++];
        if (h.length < 6) { st.fg = st.bg = undefined; i = j - 1; continue; }
        st.fg = '#' + h;
        if (text[j] === ',' && /[0-9a-fA-F]/.test(text[j + 1] || '')) {
          j++; let bh = '';
          while (j < text.length && /[0-9a-fA-F]/.test(text[j]) && bh.length < 6) bh += text[j++];
          if (bh.length === 6) st.bg = '#' + bh;
        }
        i = j - 1; continue;
      }
      default: buf += text[i];
    }
  }
  flush();
  return out;
}

// Pure text formatters live in ./format-text (i18n only, no store/DOM); re-exported
// here so existing `from '../lib/format'` consumers keep working.
export { fmtDuration, formatUserModes, loosenNoticeText } from './format-text';
