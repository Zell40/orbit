import { memo, Fragment, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/core/irc/types';
import { fmtTime, nickColor, formatIrc, splitNoticeLines, groupModeDisplay, formatModeChange, isNickModeGroup, type ModeDisplayGroup } from '@/lib/format';
import { isChannelName } from '@/core/store/context';
import { previewableUrls, LinkPreview } from '@/lib/link-preview';
import { stripFormatting } from '@/core/store/text';
import { getConfig } from '@/core/config';
import { useTheme } from '@/themes';
import { useActiveChat } from '@/core/networks';
import { MODE_LETTER_ROLE } from '@/lib/roles';
import { CtxChip, ReplyQuote } from './affordances';
import { jumpToMessage } from './msg-jump';
import { firstOfRun } from './msg-runs';

function CalloutPreviews({ text }: { text: string }) {
  const enabled = useActiveChat((s) => s.prefs.linkPreviews);
  if (!enabled || !getConfig().features.linkPreviews) return null;
  const urls = previewableUrls(stripFormatting(text));
  return urls.length ? <>{urls.map((url) => <LinkPreview key={url} url={url} />)}</> : null;
}

// Shared NOTICE callout — one bubble, stacked lines when several notices share a sender.
function NoticeCallout({ messages }: { messages: ChatMessage[] }) {
  const { t } = useTranslation();
  const linkPreviews = useActiveChat((s) => s.prefs.linkPreviews);
  const setActive = useActiveChat((s) => s.setActive);
  const msgs = useActiveChat((s) => s.buffers[s.active]?.messages);
  const inChannel = useActiveChat((s) => isChannelName(s.active));
  const head = messages[0];
  const showCtx = firstOfRun(msgs, head, (x) => x.channelContext);
  const combined = messages.map((m) => m.text).join('\n');
  const lines = messages.flatMap((m) =>
    splitNoticeLines(m.text).map((text, i) => ({ key: `${m.id}-${i}`, text, self: m.self })),
  );
  const stacked = lines.length > 1;
  const previewUrls = linkPreviews && getConfig().features.linkPreviews
    ? previewableUrls(stripFormatting(combined)) : [];
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const clipRef = useRef<HTMLDivElement>(null);
  // Fold only in channels — Status / Notices / PMs keep the full callout.
  const canClamp = inChannel;
  useLayoutEffect(() => {
    if (!canClamp) { setOverflows(false); return; }
    const el = clipRef.current;
    if (!el) return;
    if (expanded) { setOverflows(true); return; }
    setOverflows(el.scrollHeight > el.clientHeight + 1 || previewUrls.length > 0);
  }, [canClamp, combined, expanded, lines.length, previewUrls.length]);
  const clamped = canClamp && !expanded;
  const showToggle = canClamp && (overflows || previewUrls.length > 0);
  return (
    <div className="noticeline">
      <div className="noticeline__head">
        <span className="modeline__tag noticeline__tag">NOTICE</span>
        {head.from && <span className="modeline__who" style={{ color: nickColor(head.from) }}>{head.from}</span>}
      </div>
      <div ref={clipRef} className={`noticeline__body${stacked ? ' noticeline__body--stack' : ''}${clamped ? ' is-clamped' : ''}`}>
        {lines.map((line) => (
          <span key={line.key} className="noticeline__txt">{formatIrc(line.text, line.self, linkPreviews)}</span>
        ))}
        {showCtx && head.channelContext && <CtxChip chan={head.channelContext} onJump={() => setActive(head.channelContext!)} />}
      </div>
      {!clamped && previewUrls.length > 0 && <CalloutPreviews text={combined} />}
      {showToggle && (
        <button type="button" className="noticeline__more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t('messages.seeLess') : t('messages.seeMore')}
        </button>
      )}
    </div>
  );
}

function NoticeLine({ m }: { m: ChatMessage }) {
  const msgs = useActiveChat((s) => s.buffers[s.active]?.messages);
  const quoted = m.replyTo ? msgs?.find((x) => x.id === m.replyTo) : undefined;
  const showReply = !!quoted && firstOfRun(msgs, m, (x) => x.replyTo);
  const row = <NoticeCallout messages={[m]} />;
  if (!showReply || !quoted) return row;
  return (
    <div className="noticeline-wrap">
      <ReplyQuote quoted={quoted} onJump={() => jumpToMessage(quoted.id)} />
      {row}
    </div>
  );
}

function ModeNick({ nick }: { nick: string }) {
  return <span className="modeline__who" style={{ color: nickColor(nick) }}>{nick}</span>;
}

function joinRoleNodes(nodes: ReactNode[], andWord: string): ReactNode {
  if (nodes.length <= 1) return nodes[0] ?? null;
  if (nodes.length === 2) return <>{nodes[0]} {andWord} {nodes[1]}</>;
  return (
    <>
      {nodes.slice(0, -1).map((n, i) => <Fragment key={i}>{n}, </Fragment>)}
      {andWord} {nodes[nodes.length - 1]}
    </>
  );
}

function ModeRoles({ letters, labels }: { letters: string[]; labels: string[] }) {
  const { t } = useTranslation();
  const nodes = labels.map((label, i) => {
    const cls = MODE_LETTER_ROLE[letters[i]]?.cls;
    return <span key={i} className={cls ? `modeline__role role-${cls}` : 'modeline__role'}>{label}</span>;
  });
  return <span className="modeline__roles">{joinRoleNodes(nodes, t('modeline.and'))}</span>;
}

function ModeClause({ g }: { g: ModeDisplayGroup }) {
  if (isNickModeGroup(g) && g.target) {
    return (
      <Trans
        i18nKey={g.add ? 'modeline.promotedRich' : 'modeline.demotedRich'}
        components={{
          nick: <ModeNick nick={g.target} />,
          roles: <ModeRoles letters={g.letters} labels={g.labels} />,
        }}
      />
    );
  }
  return <span className={g.add ? 'mode-add' : 'mode-rm'}>{formatModeChange(g)}</span>;
}

export const NoticeGroup = memo(function NoticeGroup({ messages }: { messages: ChatMessage[] }) {
  if (!messages.length) return null;
  const msgs = useActiveChat((s) => s.buffers[s.active]?.messages);
  const head = messages[0];
  const quoted = head.replyTo ? msgs?.find((x) => x.id === head.replyTo) : undefined;
  const showReply = !!quoted && firstOfRun(msgs, head, (x) => x.replyTo);
  const row = <NoticeCallout messages={messages} />;
  if (!showReply || !quoted) return row;
  return (
    <div className="noticeline-wrap">
      <ReplyQuote quoted={quoted} onJump={() => jumpToMessage(quoted.id)} />
      {row}
    </div>
  );
});

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
    const chanLabel = isChannelName(m.bufferName) ? m.bufferName : '';
    return (
      <div className="urlline">
        <div className="urlline__head">
          <span className="urlline__tag">{t('modeline.channelUrlTag')}</span>
          {chanLabel && <span className="urlline__chan">{chanLabel}</span>}
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
    const groups = groupModeDisplay(modes, margs);
    return (
      <div className="modeline">
        <span className="modeline__tag">{t('modeline.modeTag')}</span>
        <ModeNick nick={m.from} />
        <span className="modeline__body">{groups.map((g, i) => (
          <Fragment key={i}>
            <ModeClause g={g} />
            {i < groups.length - 1 ? ' · ' : ''}
          </Fragment>
        ))}</span>
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
