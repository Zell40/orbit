import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { formatIrc } from '@/lib/format';
import { ago, setterMask } from '@/lib/topic';
import { getConfig } from '@/core/config';
import { previewableUrls, LinkPreview } from '@/lib/link-preview';
import { stripFormatting } from '@/core/store/text';
import { bus } from '@/modules/bus';
import { fetchChanServPublic } from '@/core/store/chanserv-info';
import { Icon } from '../Icon';
import { Modal } from './Modal';
import { formatChannelModes } from '@/core/irc/modes';

function fmtDate(sec: number, locale: string): string {
  if (!sec) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(sec * 1000);
}

function sameChan(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

type CsInfo = { founder: string; description: string; official: boolean };

function OfficialBadge() {
  const { t } = useTranslation();
  return (
    <span className="chaninfo__official" title={t('modals.chaninfo.officialHint')}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M12 2.4 14.6 8l6.2.6-4.7 4.1 1.4 6.1L12 15.8 6.5 18.8l1.4-6.1L3.2 8.6 9.4 8z" />
      </svg>
      {t('modals.chaninfo.official')}
    </span>
  );
}

/** Read-only salon sheet for members who are not channel operators. */
export function ChanInfoModal() {
  const { t, i18n } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const buffer = useActiveChat((s) => s.buffers[s.active]);
  const topicFull = useActiveChat((s) => s.prefs.topicSetterFull);
  const linkPreviews = useActiveChat((s) => s.prefs.linkPreviews);
  const showExtendedModes = useActiveChat((s) => s.prefs.showExtendedModes);
  const locale = i18n.language;
  const account = useActiveChat((s) => s.account);
  const nick = useActiveChat((s) => s.nick);
  const [cs, setCs] = useState<CsInfo>({ founder: '', description: '', official: false });

  useEffect(() => {
    if (!buffer?.name) return;
    const merge = (next: Partial<CsInfo>) => {
      setCs((prev) => ({
        founder: next.founder || prev.founder,
        description: next.description || prev.description,
        official: !!(next.official || prev.official),
      }));
    };
    const onInfo = (...args: unknown[]) => {
      const data = args[0] as { chan?: string; founder?: string; description?: string; official?: boolean } | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.chan && !sameChan(data.chan, buffer.name)) return;
      merge({
        founder: String(data.founder || '').trim(),
        description: String(data.description || '').trim(),
        official: !!data.official,
      });
    };
    const off = bus.on('chanserv:chaninfo', onInfo);
    bus.emit('orbit:panel', 'chaninfo');
    merge({
      founder: buffer.csFounder || '',
      description: buffer.csDescription || '',
      official: !!buffer.csOfficial,
    });
    let cancelled = false;
    if (account) {
      void fetchChanServPublic(account, nick, buffer.name).then((info) => {
        if (cancelled) return;
        if (info.chan && !sameChan(info.chan, buffer.name)) return;
        merge({
          founder: info.founder || '',
          description: info.description || '',
          official: !!info.official,
        });
      });
    }
    return () => { cancelled = true; off(); };
  }, [buffer?.name, buffer?.csFounder, buffer?.csDescription, buffer?.csOfficial, account, nick]);

  if (!buffer || !buffer.isChannel) return null;

  const members = Object.values(buffer.members || {});
  const opCount = members.filter((m) => /[~&@%]/.test(m.prefixes || m.prefix || '')).length;
  const url = (buffer.url || [...buffer.messages].reverse().find((m) => m.kind === 'url')?.text || '').trim();
  const previewUrl = previewableUrls(stripFormatting(url))[0] || (/^https?:\/\//i.test(url) ? url : '');
  const showPreview = !!(previewUrl && linkPreviews && getConfig().features.linkPreviews);
  const owner = cs.founder || members.find((m) => /~/.test(m.prefixes || m.prefix || ''))?.nick || '';
  const close = () => setModal('');

  return (
    <Modal title={t('modals.chaninfo.title', { chan: buffer.name })} onClose={close} wide autoFocus={false}>
      <div className="chaninfo">
        {cs.official ? (
          <div className="chaninfo__badges">
            <OfficialBadge />
          </div>
        ) : null}

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

        {cs.description ? (
          <div className="ca-sec">
            <h4 className="ca-h">{t('modals.chaninfo.description')}</h4>
            <div className="ca-topic is-locked">
              <span className="ca-topic__txt">{formatIrc(cs.description, false, false)}</span>
            </div>
          </div>
        ) : null}

        {owner ? (
          <div className="ca-sec">
            <h4 className="ca-h">{t('modals.chaninfo.owner')}</h4>
            <div className="chaninfo__owner">
              <Icon name="user" size={16} />
              <span className="chaninfo__owner-nick">{owner}</span>
            </div>
          </div>
        ) : null}

        {url ? (
          <div className="ca-sec">
            <h4 className="ca-h">{t('modeline.channelUrlTag')}</h4>
            <div className="chaninfo__url">
              {showPreview
                ? <LinkPreview url={previewUrl} />
                : <a className="chaninfo__urllink" href={/^https?:\/\//i.test(url) ? url : `https://${url}`} target="_blank" rel="noopener noreferrer">{url}</a>}
            </div>
          </div>
        ) : null}

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
            <span className="topbar__modes" title={t('topbar.modes')}>{formatChannelModes(buffer.modes, showExtendedModes ? buffer.modeParams : undefined)}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}
