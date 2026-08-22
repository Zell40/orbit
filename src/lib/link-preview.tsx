// OpenGraph link previews: a lazy, IntersectionObserver-gated card that unfurls a
// URL through the server's same-origin endpoint (so no third-party host ever sees
// the viewer). Split out of format.tsx.
import { useState, useRef, useEffect } from 'react';
import { isImageUrl, isAudioUrl, youtubeId } from './media';

interface Preview { url: string; title?: string | null; description?: string | null; image?: string | null; siteName?: string | null }
const UNFURL_PATHS = [
  '/app/accounts/api/unfurl/?url=',
  '/app/unfurl.php?url=',
  '/accounts/api/unfurl/?url=',
  '/unfurl.php?url=',
];
const previewCache = new Map<string, Promise<Preview | null>>();
const PREVIEW_CACHE_MAX = 200; // bound: evict oldest so a long-lived tab can't grow forever

// The first http(s) URL in a message worth a card — i.e. not one that already
// renders its own inline embed (image / audio / YouTube).
export function firstPreviewableUrl(text: string): string | null {
  const all = previewableUrls(text);
  return all[0] ?? null;
}

export function previewableUrls(text: string): string[] {
  const m = text.match(/https?:\/\/[^\s<>"']+/g);
  if (!m) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of m) {
    const u = raw.replace(/[\u200b-\u200d\ufeff]/g, '').replace(/[),.;:!?\]]+$/g, '');
    if (!u || isImageUrl(u) || isAudioUrl(u) || youtubeId(u) || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function fetchPreview(url: string): Promise<Preview | null> {
  let p = previewCache.get(url);
  if (!p) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    p = (async () => {
      for (const prefix of UNFURL_PATHS) {
        try {
          const r = await fetch(prefix + encodeURIComponent(url), { signal: ctrl.signal });
          if (!r.ok) continue;
          const ct = r.headers.get('content-type') || '';
          if (!ct.includes('json')) continue;
          const d = await r.json() as Preview | null;
          if (d && (d.title || d.description || d.image)) return d;
        } catch {
          if (ctrl.signal.aborted) break;
        }
      }
      return null;
    })().finally(() => clearTimeout(timer));
    if (previewCache.size >= PREVIEW_CACHE_MAX) previewCache.delete(previewCache.keys().next().value!);
    previewCache.set(url, p);
    void p.then((d) => { if (!d) previewCache.delete(url); });
  }
  return p;
}

// Lazy: only unfurls when the card scrolls into view (busy-channel friendly), and
// renders nothing until/unless there's something to show. The image is same-origin
// (the server proxies it), so no third-party host ever sees the viewer.
export function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<Preview | null | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let started = false;
    const run = () => {
      if (started || cancelled) return;
      started = true;
      fetchPreview(url).then((d) => { if (!cancelled) setData(d); });
    };
    const root = el.closest('.messages');
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        run();
      }
    }, { root: root instanceof Element ? root : null, rootMargin: '240px', threshold: 0 });
    io.observe(el);
    // Split chess layout (overflow:hidden on .main) can make a visible row look
    // non-intersecting to the viewport observer — still unfurl after a beat.
    const kick = window.setTimeout(run, 350);
    return () => { cancelled = true; io.disconnect(); window.clearTimeout(kick); };
  }, [url]);
  return (
    <div className="lp-anchor" ref={ref}>
      {data && (
        <a className="lpcard" href={data.url || url} target="_blank" rel="noopener noreferrer">
          {data.image && <img className="lpcard__img" src={data.image} alt="" loading="lazy" decoding="async" width={92} height={92} referrerPolicy="no-referrer" />}
          <span className="lpcard__body">
            {data.siteName && <span className="lpcard__site">{data.siteName}</span>}
            {data.title && <span className="lpcard__title">{data.title}</span>}
            {data.description && <span className="lpcard__desc">{data.description}</span>}
          </span>
        </a>
      )}
      {data === null && (
        <a className="lpcard lpcard--plain" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
      )}
    </div>
  );
}
