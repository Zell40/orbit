import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/core/irc/types';
import { fmtTime, nickColor, formatIrc, loosenNoticeText } from '@/lib/format';
import { previewableUrls, LinkPreview } from '@/lib/link-preview';
import { stripFormatting } from '@/core/store/text';
import { getConfig } from '@/core/config';
import { useTheme } from '@/themes';
import { useActiveChat } from '@/core/networks';
import { CtxChip, ReplyQuote } from './affordances';
import { jumpToMessage } from './msg-jump';
import { firstOfRun } from './msg-runs';

function CalloutPreviews({ text }: { text: string }) {
  const enabled = useActiveChat((s) => s.prefs.linkPreviews);
  if (!enabled || !getConfig().features.linkPreviews) return null;
  const urls = previewableUrls(stripFormatting(text));
  return urls.length ? <>{urls.map((url) => <LinkPreview key={url} url={url} />)}</> : null;
}

// A service NOTICE, rendered as its violet callout, surfacing the IRCv3 tags it
// may carry: a +draft/channel-context chip inline (jump to the channel it concerns)
// and, above the row, the +draft/reply parent it answers — the parent resolved by
// msgid among the buffer's messages, shown once at the head of a reply run.
function NoticeLine({ m }: { m: ChatMessage }) {
  const linkPreviews = useActiveChat((s) => s.prefs.linkPreviews);
  const setActive = useActiveChat((s) => s.setActive);
  const msgs = useActiveChat((s) => s.buffers[s.active]?.messages);
  const quoted = m.replyTo ? msgs?.find((x) => x.id === m.replyTo) : undefined;
  const showReply = !!quoted && firstOfRun(msgs, m, (x) => x.replyTo);
  const showCtx = firstOfRun(msgs, m, (x) => x.channelContext);
  const row = (
    <div className="noticeline">
      <div className="noticeline__head">
        <span className="modeline__tag noticeline__tag">NOTICE</span>
        {m.from && <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>}
      </div>
      <div className="noticeline__body">
        <span className="noticeline__txt">{formatIrc(loosenNoticeText(m.text), m.self, linkPreviews)}</span>
        {showCtx && <CtxChip chan={m.channelContext!} onJump={() => setActive(m.channelContext!)} />}
      </div>
      <CalloutPreviews text={m.text} />
    </div>
  );
  if (!showReply || !quoted) return row;
  return (
    <div className="noticeline-wrap">
      <ReplyQuote quoted={quoted} onJump={() => jumpToMessage(quoted.id)} />
      {row}
    </div>
  );
}

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
    } else if (m.kind === 'motd') {
      body = formatIrc(m.text, false, false);
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
    const infoText = m.text.replace(/^[*•]+\s*/, '');
    return (
      <div className="infoline">
        <div className="infoline__head">
          <span className="infoline__tag">Info</span>
          <span className="infoline__txt">{formatIrc(infoText, false, linkPreviews)}</span>
        </div>
        <CalloutPreviews text={infoText} />
      </div>
    );
  }
  if (m.kind === 'url') {
    const urls = previewableUrls(stripFormatting(m.text));
    const showPreviews = linkPreviews && getConfig().features.linkPreviews && urls.length > 0;
    return (
      <div className="urlline">
        <div className="urlline__head">
          <span className="urlline__tag">URL</span>
          {!showPreviews && <span className="urlline__txt">{formatIrc(m.text, false, false)}</span>}
        </div>
        {showPreviews ? <CalloutPreviews text={m.text} /> : null}
      </div>
    );
  }
  if (m.kind === 'motd') {
    return (
      <div className="motdline">
        <span className="motdline__tag">MOTD</span>
        <span className="motdline__txt">{formatIrc(m.text, false, false)}</span>
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
      <div className="modeline">
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
      <div className="topicline">
        <div className="topicline__head">
          <span className="modeline__tag modeline__tag--topic">{t('modeline.topicTag')}</span>
          <span className="modeline__who" style={{ color: nickColor(m.from) }}>{m.from}</span>
          <span className="modeline__verb">{m.text ? t('modeline.topicChanged') : t('modeline.topicRemoved')}</span>
        </div>
        {m.text && <span className="topicline__txt">{formatIrc(m.text, false, linkPreviews)}</span>}
        {m.text && <CalloutPreviews text={m.text} />}
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
    return <NoticeLine m={m} />;
  }
  return null;
});
