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
  if (!isChannel || !bname) return null;

  const who = topicBy
    ? (full ? setterMask(topicBy, members || {}) : topicBy.split('!')[0])
    : '';
  const label = bname.replace(/^#/, '');

  return (
    <div className="chan-hero" data-chan={bname}>
      <div
        className="chan-hero__media"
        style={{ background: avatarBg(bname) }}
        role="img"
        aria-label={label}
      />
      <div className="chan-hero__body">
        {topic
          ? <div className="chan-hero__topic" title={stripFormatting(topic)}>{formatIrc(topic, false)}</div>
          : <div className="chan-hero__topic chan-hero__topic--muted">{t('topbar.publicChannel', { n })}</div>}
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
