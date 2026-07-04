// Presentation helpers shared across the chat UI: timestamps, hashed colours,
// link/image/YouTube rendering, and the mIRC/IRC formatting → React renderer.
import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat } from '../store';
import i18n from '../i18n';

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

const isImageUrl = (u: string) => /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(u);
const isAudioUrl = (u: string) => /\.(opus|ogg|mp3|m4a|wav|weba)(\?|#|$)/i.test(u)
  || /\/files\/[^/?#]+\.webm(\?|#|$)/i.test(u); // filehost voice messages use a .webm audio container

/* Voice message / audio attachment: a compact inline player. */
function AudioAttachment({ url }: { url: string }) {
  const { t } = useTranslation();
  return (
    <div className="audcard">
      <span className="audcard__ic" aria-hidden="true">🎤</span>
      <audio className="audcard__player" src={url} controls preload="metadata" />
      <a className="audcard__act" href={url} target="_blank" rel="noopener noreferrer">{t('media.open')}</a>
    </div>
  );
}

/* Element-style image attachment: friendly caption bar + collapsible thumbnail + lightbox. */
function ImageAttachment({ url, defaultShown = false }: { url: string; defaultShown?: boolean }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(defaultShown);
  const [zoom, setZoom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Keep the timeline pinned to the bottom when an image grows the content,
  // but only if the user was already near the bottom (don't yank history readers).
  // Deferred to the next frame so the new image height is laid out first
  // (onLoad fires before reflow → otherwise scrollHeight is stale).
  const snapIfStuck = () => {
    requestAnimationFrame(() => {
      const c = ref.current?.closest('.messages') as HTMLElement | null;
      if (c && c.scrollHeight - c.scrollTop - c.clientHeight < 460) c.scrollTop = c.scrollHeight;
    });
  };
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);
  return (
    <div className="imgcard" ref={ref}>
      <div className="imgcard__bar">
        <span className="imgcard__ic">🖼️</span>
        <span className="imgcard__label">{t('media.image')}</span>
        <a className="imgcard__act" href={url} target="_blank" rel="noopener noreferrer">{t('media.open')}</a>
        <button className="imgcard__act imgcard__toggle" onClick={() => { setShown((s) => !s); snapIfStuck(); }}>
          {shown ? t('media.hide') : t('media.show')}
        </button>
      </div>
      {shown && (
        <button className="imgcard__thumb" onClick={() => setZoom(true)} title={t('media.enlarge')}>
          <img className="msg-img" src={url} alt={t('media.sharedImage')} loading="lazy" onLoad={snapIfStuck} />
        </button>
      )}
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(false)}>
          <img className="lightbox__img" src={url} alt={t('media.sharedImage')} onClick={(e) => e.stopPropagation()} />
          <a className="lightbox__open" href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{t('media.openOriginal')}</a>
          <button className="lightbox__x" onClick={() => setZoom(false)} aria-label={t('modals.closeButton')}>✕</button>
        </div>
      )}
    </div>
  );
}

// Extract a YouTube video id from the common URL shapes.
function youtubeId(u: string): string | null {
  const m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function YouTubeEmbed({ id, url }: { id: string; url: string }) {
  const { t } = useTranslation();
  const [play, setPlay] = useState(false);
  return (
    <div className="ytcard">
      {play ? (
        <iframe className="ytcard__frame" src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title="YouTube" allow="accelerator;autoplay;encrypted-media;picture-in-picture" allowFullScreen />
      ) : (
        <button className="ytcard__thumb" onClick={() => setPlay(true)} title={t('media.playVideo')}>
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={t('media.ytPreview')} loading="lazy" />
          <span className="ytcard__play">▶</span>
          <span className="ytcard__badge">YouTube</span>
        </button>
      )}
      <a className="ytcard__link" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
    </div>
  );
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

function linkify(text: string, selfMsg = false): ReactNode {
  // Pull out ||spoilers|| first, then linkify the remaining runs.
  return text.split(/(\|\|.+?\|\|)/g).map((seg, si) => {
    const sp = /^\|\|(.+)\|\|$/.exec(seg);
    if (sp) return <Spoiler key={`sp${si}`} text={sp[1]} />;
    return seg.split(/(https?:\/\/[^\s]+)/g).map((p, i) => {
      const k = `${si}-${i}`;
      if (!/^https?:\/\//.test(p)) return <span key={k}>{p}</span>;
      if (isImageUrl(p)) return <ImageAttachment key={k} url={p} defaultShown={selfMsg} />;
      if (isAudioUrl(p)) return <AudioAttachment key={k} url={p} />;
      const yt = youtubeId(p);
      if (yt) return <YouTubeEmbed key={k} id={yt} url={p} />;
      return <a key={k} href={p} target="_blank" rel="noopener noreferrer">{p}</a>;
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
  if (fg) css.color = fg;
  if (bg) { css.backgroundColor = bg; css.padding = '0 .15em'; css.borderRadius = '3px'; }
  return css;
}

export function formatIrc(text: string, selfMsg: boolean): ReactNode {
  if (!FMT_RE.test(text)) return linkify(text, selfMsg);
  const out: ReactNode[] = [];
  const st: FmtState = { b: false, i: false, u: false, s: false, m: false, rev: false };
  let buf = '';
  let key = 0;
  const flush = () => { if (buf) { out.push(<span key={key++} style={fmtToStyle(st)}>{linkify(buf, selfMsg)}</span>); buf = ''; } };
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

export function fmtDuration(sec: number): string {
  if (sec < 60) return i18n.t('units.sec', { n: sec });
  if (sec < 3600) return i18n.t('units.min', { n: Math.floor(sec / 60) });
  if (sec < 86400) return i18n.t('units.hourMin', { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60) });
  return i18n.t('units.day', { n: Math.floor(sec / 86400) });
}

// "+iwx" → "+iwx · invisible, wallops, masked host" (named where we know them).
export function formatUserModes(modes: string): string {
  const letters = modes.replace(/^\+/, '').split('').filter(Boolean);
  if (!letters.length) return '+';
  const named = letters.map((c) => i18n.t(`umodes.${c}`, '')).filter(Boolean);
  return `+${letters.join('')}${named.length ? ` · ${named.join(', ')}` : ''}`;
}
