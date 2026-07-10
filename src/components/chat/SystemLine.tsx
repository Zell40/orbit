import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../core/irc/types';
import { fmtTime, nickColor, formatIrc } from '../../lib/format';
import { useTheme } from '../../themes';
import { useActiveChat } from '../../core/networks';

// Renders a non-message event (join/part/mode/topic/ban/notice/info/warning/…)
// as its own status line. The container routes every kind that isn't a
// privmsg/action here; MsgRow handles the message rows.
export const SystemLine = memo(function SystemLine({ m }: { m: ChatMessage }) {
  const { t } = useTranslation();
  const linkPreviews = useActiveChat((s) => s.prefs.linkPreviews);
  const mirc = useTheme().startsWith('yomirc');

  // yomIRC: render every server event as a classic mIRC status line — [HH:MM] * …
  // (notice keeps its own styled line below, as in the modern theme).
  if (mirc && m.kind !== 'notice') {
    let body: ReactNode;
    if (m.kind === 'mode') {
      const [modes, ...margs] = m.text.split(' ');
      body = <>{m.from} {t('modeline.modeVerb')} {modes}{margs.length ? ' ' + margs.join(' ') : ''}</>;
    } else if (m.kind === 'topic') {
      body = m.text
        ? <>{m.from} {t('modeline.topicChanged')} {formatIrc(m.text, false, linkPreviews)}</>
        : <>{m.from} {t('modeline.topicRemoved')}</>;
    } else if (m.kind === 'info' || m.kind === 'ban') {
      body = m.text.replace(/^[*•»]+\s*/, '');
    } else { // join / part / quit / nick / kick / system
      const rest = m.text.replace(m.from, '').trim();
      body = m.from
        ? <>{m.from}{m.mask ? <span className="mircline__host"> ({m.mask})</span> : null} {rest}</>
        : m.text.replace(/^[*•»]+\s*/, '');
    }
    return (
      <div className={`mircline mircline--sys mircline--sys-${m.kind}`}>
        <span className="mircline__time">[{fmtTime(m.ts)}]</span>{' '}
        <span className="mircline__star">*</span>{' '}
        <span className="mircline__sys">{body}</span>
      </div>
    );
  }
  if (m.kind === 'info') {
    return (
      <div className="infoline">
        <span className="infoline__tag">Info</span>
        <span className="infoline__txt">{m.text.replace(/^[*•]+\s*/, '')}</span>
      </div>
    );
  }
  if (m.kind === 'warning') {
    return (
      <div className="warnline">
        <span className="warnline__ic" aria-hidden>🛡️</span>
        <div className="warnline__body">
          <span className="warnline__tag">{t('security.tag')}</span>
          <span className="warnline__txt">{m.text}</span>
        </div>
      </div>
    );
  }
  if (m.kind === 'mode') {
    const [modes, ...margs] = m.text.split(' ');
    const segs = modes.split(/(?=[+-])/).filter(Boolean);
    return (
      <div className="sysline sysline--mode">
        <span className="modeline__tag">{t('modeline.modeTag')}</span>
        <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>
        <span className="modeline__verb">{t('modeline.modeVerb')}</span>
        <span className="modeline__chg">[{segs.map((p, i) => (
          <span key={i} className={p[0] === '+' ? 'mode-add' : 'mode-rm'}>{p}</span>
        ))}{margs.length ? ' ' + margs.join(' ') : ''}]</span>
      </div>
    );
  }
  if (m.kind === 'ban') {
    return <div className="banline">{m.text}</div>;
  }
  if (m.kind === 'topic') {
    return (
      <div className="sysline sysline--mode">
        <span className="modeline__tag modeline__tag--topic">{t('modeline.topicTag')}</span>
        <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>
        <span className="modeline__verb">{m.text ? t('modeline.topicChanged') : t('modeline.topicRemoved')}</span>
        {m.text && <span className="topicline__txt">{formatIrc(m.text, false, linkPreviews)}</span>}
      </div>
    );
  }
  if (['join', 'part', 'quit', 'nick', 'system'].includes(m.kind)) {
    const isCmd = m.text.startsWith('»');
    const isAlert = m.text.startsWith('\x01ALERT\x01');
    if (isAlert) {
      const body = m.text.slice(8);
      return (
        <div className="sysline sysline--alert" role="alert">
          <svg className="sysline--alert__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span className="sysline--alert__body">{body}</span>
        </div>
      );
    }
    return <div className={`sysline ${isCmd ? 'sysline--cmd' : ''}`}><span className="who">{m.from}</span> {m.text.replace(m.from, '').trim()}</div>;
  }
  if (m.kind === 'notice') {
    return (
      <div className="sysline sysline--mode noticeline">
        <span className="modeline__tag noticeline__tag">NOTICE</span>
        {m.from && <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>}
        <span className="noticeline__txt">{formatIrc(m.text, m.self, linkPreviews)}</span>
      </div>
    );
  }
  return null;
});
