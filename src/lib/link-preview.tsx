// OpenGraph link previews: a lazy, IntersectionObserver-gated card that unfurls a
// URL through the server's same-origin endpoint (so no third-party host ever sees
// the viewer). Split out of format.tsx.
import { useState, useRef, useEffect } from 'react';
import { isImageUrl, isAudioUrl, youtubeId } from './media';

interface Preview { url: string; title?: string | null; description?: string | null; image?: string | null; siteName?: string | null }
const UNFURL = '/accounts/api/unfurl/?url=';
const previewCache = new Map<string, Promise<Preview | null>>();
const PREVIEW_CACHE_MAX = 200; // bound: evict oldest so a long-lived tab can't grow forever

// The first http(s) URL in a message worth a card — i.e. not one that already
// renders its own inline embed (image / audio / YouTube).
export function firstPreviewableUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/g);
  if (!m) return null;
  for (const raw of m) {
    const u = raw.replace(/[),.;:!?\]]+$/g, '');
    if (u && !isImageUrl(u) && !isAudioUrl(u) && !youtubeId(u)) return u;
  }
  return null;
}

function fetchPreview(url: string): Promise<Preview | null> {
  let p = previewCache.get(url);
  if (!p) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000); // don't hang on a slow unfurl endpoint
    p = fetch(UNFURL + encodeURIComponent(url), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Preview | null) => (d && (d.title || d.description || d.image) ? d : null))
      .catch(() => null)
      .finally(() => clearTimeout(timer));
    if (previewCache.size >= PREVIEW_CACHE_MAX) previewCache.delete(previewCache.keys().next().value!);
    previewCache.set(url, p);
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
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        fetchPreview(url).then((d) => setData(d));
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [url]);
  return (
    <div className="lp-anchor" ref={ref}>
      {data && (
        <a className="lpcard" href={data.url || url} target="_blank" rel="noopener noreferrer">
          {data.image && <img className="lpcard__img" src={data.image} alt="" loading="lazy" decoding="async" width={92} height={92} />}
          <span className="lpcard__body">
            {data.siteName && <span className="lpcard__site">{data.siteName}</span>}
            {data.title && <span className="lpcard__title">{data.title}</span>}
            {data.description && <span className="lpcard__desc">{data.description}</span>}
          </span>
        </a>
      )}
    </div>
  );
}
