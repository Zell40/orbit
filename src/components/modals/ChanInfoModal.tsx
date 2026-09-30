import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { formatIrc } from '@/lib/format';
import { ago, setterMask } from '@/lib/topic';
import { Modal } from './Modal';
import { ChannelUrlCard } from '../chat/SystemLine';

function fmtDate(sec: number, locale: string): string {
  if (!sec) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(sec * 1000);
}

/** Read-only salon sheet for members who are not channel operators. */
export function ChanInfoModal() {
  const { t, i18n } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const buffer = useActiveChat((s) => s.buffers[s.active]);
  const topicFull = useActiveChat((s) => s.prefs.topicSetterFull);
  const locale = i18n.language;

  if (!buffer || !buffer.isChannel) return null;

  const members = Object.values(buffer.members || {});
  const opCount = members.filter((m) => /[~&@%]/.test(m.prefixes || m.prefix || '')).length;
  const url = (buffer.url || [...buffer.messages].reverse().find((m) => m.kind === 'url')?.text || '').trim();
  const close = () => setModal('');

  return (
    <Modal title={t('modals.chaninfo.title', { chan: buffer.name })} onClose={close} wide autoFocus={false}>
      <div className="chaninfo">
        <div className="ca-sec ca-topicrow">
          <h4 className="ca-h">{t('modals.chanadmin.subject')}</h4>
          <div className="ca-topic is-locked">
            <span className="ca-topic__txt">
              {buffer.topic
                ? formatIrc(buffer.topic, false, false)
                : <span className="ca-topic__empty">{t('modals.chaninfo.noTopic')}</span>}
            </span>
          </div>
          {buffer.topicBy ? (
            <div className="ca-topicby">
              <span className="ca-topicby__by">
                {t('modals.chanadmin.topicBy')}{' '}
                <span className="ca-topicby__who">
                  {topicFull
                    ? setterMask(buffer.topicBy, buffer.members || {})
                    : buffer.topicBy.split('!')[0]}
                </span>
              </span>
              {buffer.topicAt ? <span className="ca-topicby__when"> · {ago(buffer.topicAt, locale)}</span> : null}
            </div>
          ) : null}
        </div>

        <div className="ca-stats">
          <div className="ca-stat"><b className="ca-stat__n">{members.length}</b><span className="ca-stat__l">{t('modals.chanadmin.members')}</span></div>
          <div className="ca-stat"><b className="ca-stat__n">{opCount}</b><span className="ca-stat__l">{t('modals.chanadmin.ops')}</span></div>
          {buffer.createdAt ? (
            <div className="ca-stat ca-stat--wide">
              <b className="ca-stat__n">{fmtDate(buffer.createdAt, locale)}</b>
              <span className="ca-stat__l">{t('modals.chanadmin.created')}</span>
            </div>
          ) : null}
        </div>

        {buffer.modes && buffer.modes !== '+' && (
          <p className="chaninfo__modes">
            <span className="topbar__modes" title={t('topbar.modes')}>{buffer.modes}</span>
          </p>
        )}

        <div className="ca-sec">
          <h4 className="ca-h">{t('modeline.channelUrlTag')}</h4>
          {url
            ? <ChannelUrlCard text={url} channel={buffer.name} />
            : <p className="chaninfo__empty">{t('modals.chaninfo.noUrl')}</p>}
        </div>
      </div>
    </Modal>
  );
}
