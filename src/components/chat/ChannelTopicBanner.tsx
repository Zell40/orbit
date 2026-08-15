import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { avatarBg, formatIrc } from '@/lib/format';
import { setterMask, ago } from '@/lib/topic';
import { stripFormatting } from '@/core/store/text';
import { useActiveChat } from '@/core/networks';

/** Sticky channel header inside the message list: room image + topic + setter.
 *  Frees the topbar for action icons; gallery plugin fills `.chan-hero__media`. */
export function ChannelTopicBanner() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'fr';
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  const bname = useActiveChat((s) => s.buffers[s.active]?.name ?? '');
  const topic = useActiveChat((s) => s.buffers[s.active]?.topic ?? '');
  const topicBy = useActiveChat((s) => s.buffers[s.active]?.topicBy ?? '');
  const topicAt = useActiveChat((s) => s.buffers[s.active]?.topicAt ?? 0);
  const members = useActiveChat((s) => s.buffers[s.active]?.members);
  const n = members ? Object.keys(members).length : 0;
  const full = useActiveChat((s) => s.prefs.topicSetterFull);
  const topicRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => { setExpanded(false); }, [bname, topic]);

  useLayoutEffect(() => {
    const el = topicRef.current;
    if (!el || !topic) { setOverflows(false); return; }
    const measure = () => {
      if (expanded) return;
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [topic, expanded, bname]);

  if (!isChannel || !bname) return null;

  const who = topicBy
    ? (full ? setterMask(topicBy, members || {}) : topicBy.split('!')[0])
    : '';
  const label = bname.replace(/^#/, '');

  return (
    <div className={`chan-hero ${expanded ? 'chan-hero--topic-open' : ''}`} data-chan={bname}>
      <div
        className="chan-hero__media"
        style={{ background: avatarBg(bname) }}
        role="img"
        aria-label={label}
      />
      <div className="chan-hero__body">
        {topic ? (
          <>
            <div
              ref={topicRef}
              className={`chan-hero__topic ${expanded ? 'is-expanded' : ''}`}
              title={expanded ? undefined : stripFormatting(topic)}
            >
              {formatIrc(topic, false)}
            </div>
            {overflows && (
              <button
                type="button"
                className="chan-hero__more"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? t('topbar.topicCollapse') : t('topbar.topicExpand')}
              </button>
            )}
          </>
        ) : (
          <div className="chan-hero__topic chan-hero__topic--muted">{t('topbar.publicChannel', { n })}</div>
        )}
        {who && (
          <div className="chan-hero__by">
            {t('modals.chanadmin.topicBy')}{' '}
            <span className="chan-hero__who">{who}</span>
            {topicAt ? <span className="chan-hero__when"> · {ago(topicAt, locale)}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
