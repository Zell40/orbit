// Inline media embeds for chat messages: image attachments (collapsible + lightbox),
// voice/audio players, and click-to-load YouTube cards. Split out of format.tsx;
// the IRC formatter's linkify() renders these for recognised URLs.
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const isImageUrl = (u: string) => /\.(png|jpe?g|gif|webp)(\?|#|$)/i.test(u);
export const isAudioUrl = (u: string) => /\.(opus|ogg|mp3|m4a|wav|weba)(\?|#|$)/i.test(u)
  || /\/files\/[^/?#]+\.webm(\?|#|$)/i.test(u); // filehost voice messages use a .webm audio container

/* Voice message / audio attachment: a compact inline player. */
export function AudioAttachment({ url }: { url: string }) {
  const { t } = useTranslation();
  return (
    <div className="audcard">
      <span className="audcard__ic" aria-hidden="true">🎤</span>
      {/* preload="none": don't fetch the media until the user hits play, so a posted
          audio link can't passively harvest every viewer's IP on render (images are
          click-to-load for the same reason). */}
      <audio className="audcard__player" src={url} controls preload="none" />
      <a className="audcard__act" href={url} target="_blank" rel="noopener noreferrer">{t('media.open')}</a>
    </div>
  );
}

/* Element-style image attachment: friendly caption bar + collapsible thumbnail + lightbox. */
export function ImageAttachment({ url, defaultShown = false }: { url: string; defaultShown?: boolean }) {
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
export function youtubeId(u: string): string | null {
  const m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function YouTubeEmbed({ id, url }: { id: string; url: string }) {
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
