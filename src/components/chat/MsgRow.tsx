import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../core/irc/types';
import { fmtTime, nickColor, IRCOP_COLOR, formatIrc } from '../../lib/format';
import { firstPreviewableUrl, LinkPreview } from '../../lib/link-preview';
import { stripFormatting } from '../../core/store/text';
import { getConfig } from '../../core/config';
import { useTheme } from '../../themes';
import { Avatar } from '../Avatar';
import { usePluginRegistry, type MessageInfo } from '../../modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { useActiveChat } from '../../core/networks';

const QUICK = ['👍', '😂', '❤️', '🔥'];

// Scroll to a message by its data-mid and briefly flash it — the jump behind a
// yomIRC reply line (Halloy's clickable reply preview jumps to the original too).
function jumpToMessage(id: string): void {
  const el = document.querySelector(`[data-mid="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('mircline--flash');
  window.setTimeout(() => el.classList.remove('mircline--flash'), 1100);
}

const msgInfo = (m: ChatMessage): MessageInfo =>
  ({ id: m.id, nick: m.from, text: stripFormatting(m.text), raw: m.text, kind: m.kind, ts: m.ts, mine: !!m.self });

// Plugin-contributed inline decorators (badges/chips after the message text).
// Each runs inside its own error boundary so a crashing plugin can't take down the list.
function MsgDecorations({ m }: { m: ChatMessage }) {
  const decs = usePluginRegistry((s) => s.decorators);
  if (!decs.length) return null;
  const info = msgInfo(m);
  return (
    <span className="msg-deco">
      {decs.map((d) => <PluginBoundary key={d.id} render={() => d.render(info)} label="message_decorator" />)}
    </span>
  );
}

// Plugin-contributed buttons for the hover action toolbar (next to reply/react).
function MsgActions({ m }: { m: ChatMessage }) {
  const acts = usePluginRegistry((s) => s.actions);
  if (!acts.length) return null;
  const info = msgInfo(m);
  return <>{acts.map((a) => <PluginBoundary key={a.id} render={() => a.render(info)} label="message_action" />)}</>;
}

// A single privmsg/action row, in either the modern grouped-bubble layout or the
// classic yomIRC single-log-line layout, with reactions + the hover action bar.
export function MsgRow({ m, cont }: { m: ChatMessage; cont: boolean }) {
  const { t } = useTranslation();
  const react = useActiveChat((s) => s.toggleReaction);
  const redact = useActiveChat((s) => s.redact);
  const openUser = useActiveChat((s) => s.openUser);
  const setActive = useActiveChat((s) => s.setActive);
  const setReply = useActiveChat((s) => s.setReplyTarget);
  const togglePin = useActiveChat((s) => s.togglePin);
  const pinned = useActiveChat((s) => s.pins[s.active]?.some((p) => p.id === m.id) ?? false);
  const isOper = useActiveChat((s) => !!s.buffers[s.active]?.members[m.from]?.oper);
  const isBot = useActiveChat((s) => !!s.buffers[s.active]?.members[m.from]?.bot);
  const linkPreviews = useActiveChat((s) => s.prefs.linkPreviews);
  // Avatars resolve by ACCOUNT. Live messages carry the account tag, but
  // chathistory-replayed ones (e.g. on a fresh mobile join) often don't — so
  // fall back to the author's account from the channel member list.
  const memberAccount = useActiveChat((s) => s.buffers[s.active]?.members[m.from]?.account);
  const avatarAccount = m.account || memberAccount;
  const mirc = useTheme().startsWith('yomirc');
  const msgs = useActiveChat((s) => s.buffers[s.active]?.messages);
  const quoted = m.replyTo ? msgs?.find((x) => x.id === m.replyTo) : undefined;
  // +draft/channel-context: badge it only when the context first appears or CHANGES.
  // Compare against the last message that ACTUALLY carried a context (skip untagged
  // ones) — otherwise the other person's untagged replies re-trigger the chip on our
  // next message.
  let showCtx = false;
  if (m.channelContext && msgs) {
    const idx = msgs.indexOf(m);
    let prevCtx: string | undefined;
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].channelContext) { prevCtx = msgs[i].channelContext; break; }
    }
    showCtx = prevCtx !== m.channelContext;
  }

  // yomIRC: classic single log line — [HH:MM] <nick> text (nick on every line, no grouping/avatars).
  if (mirc) {
    const nickStyle = { color: isOper ? IRCOP_COLOR : nickColor(m.from) };
    // Halloy-style reply line above the message: "   ┌── ↩ nick: snippet". The arm
    // rides the mircline's mono grid so ┌ lands under the timestamp; the snippet is
    // dimmed and a touch smaller, and clicking it jumps to the quoted message.
    const quotedText = quoted ? stripFormatting(quoted.text) : '';
    return (
      <>
        {quoted && !m.redacted && (
          <button className="mircline-reply" title={quoted.redacted ? t('messages.deleted') : quotedText}
            onClick={() => jumpToMessage(quoted.id)}>
            {'   ┌── ↩ '}
            <b style={{ color: nickColor(quoted.from) }}>{quoted.from}</b>{': '}
            <span className="mircline-reply__txt">{quoted.redacted ? t('messages.deleted') : quotedText.replace(/\s+/g, ' ').slice(0, 140)}</span>
          </button>
        )}
        <div data-mid={m.id} className={`mircline ${m.kind === 'action' ? 'mircline--action' : ''} ${m.redacted ? 'is-redacted' : ''}`}>
          <span className="mircline__time">[{fmtTime(m.ts)}]</span>{' '}
          <button className="mircline__nick" style={nickStyle} onClick={() => openUser(m.from)}>
            {m.kind === 'action' ? '* ' : '<'}{m.from}
            {isBot && <span className="nick-bot" aria-label="bot">🤖</span>}
            {m.kind !== 'action' && '>'}
          </button>{' '}
          <span className="mircline__txt">
            {m.redacted ? `⊘ ${t('messages.deleted')}` : formatIrc(m.text, m.self, linkPreviews)}
            {!m.redacted && <MsgDecorations m={m} />}
          </span>
          {m.reactions && m.reactions.length > 0 && (
            <span className="reactions reactions--inline">
              {m.reactions.map((r) => (
                <button key={r.emoji} className={`reaction ${r.mine ? 'mine' : ''}`} onClick={() => react(m.id, r.emoji)}>
                  {r.emoji} <b>{r.count}</b>
                </button>
              ))}
            </span>
          )}
          {!m.redacted && (
            <span className="msg-actions">
              {QUICK.map((e) => <button key={e} title={t('messages.react')} onClick={() => react(m.id, e)}>{e}</button>)}
              <button title={t('messages.respond')} onClick={() => setReply(m.id)}>↩</button>
              <button className={pinned ? 'is-pinned' : ''} title={t(pinned ? 'pins.unpin' : 'pins.pin')} onClick={() => togglePin(m.id)}>📌</button>
              <MsgActions m={m} />
              {m.self && <button title={t('messages.delete')} onClick={() => redact(m.id)}>🗑</button>}
            </span>
          )}
        </div>
      </>
    );
  }

  return (
    <div data-mid={m.id} className={`group ${cont ? 'group--cont' : ''}`}>
      {cont
        ? <span className="group__avatar group__time-rail">{fmtTime(m.ts)}</span>
        : <button className="group__avbtn" title={t('messages.profileOf', { nick: m.from })} onClick={() => openUser(m.from)}><Avatar nick={m.from} account={avatarAccount} /></button>}
      <div className="group__body">
        {!cont && (
          <div className="group__head">
            <button className="group__nick" style={{ color: isOper ? IRCOP_COLOR : nickColor(m.from) }} onClick={() => openUser(m.from)}>{m.from}{isBot && <span className="nick-bot" aria-label="bot">🤖</span>}</button>
            <span className="group__time">{fmtTime(m.ts)}</span>
          </div>
        )}
        {quoted && (
          <div className="reply-quote" title={t('messages.reply')}>
            <span className="reply-quote__arrow">↪</span>
            <span className="reply-quote__from" style={{ color: nickColor(quoted.from) }}>{quoted.from}</span>
            <span className="reply-quote__txt">{quoted.redacted ? t('messages.deleted') : quoted.text.slice(0, 90)}</span>
          </div>
        )}
        <div className={`line ${m.kind === 'action' ? 'line--action' : ''} ${m.kind === 'notice' ? 'line--notice' : ''} ${m.redacted ? 'line--redacted' : ''}`}>
          {m.redacted ? `⊘ ${t('messages.deleted')}` : (m.kind === 'action' ? <em>{formatIrc(m.text, m.self, linkPreviews)}</em> : formatIrc(m.text, m.self, linkPreviews))}
          {!m.redacted && <MsgDecorations m={m} />}
        </div>
        {!m.redacted && linkPreviews && getConfig().features.linkPreviews && (() => {
          const pu = firstPreviewableUrl(stripFormatting(m.text));
          return pu ? <LinkPreview url={pu} /> : null;
        })()}
        {showCtx && (
          <button
            className="ctx-chip"
            title={t('messages.dmStarted', { chan: m.channelContext })}
            onClick={() => setActive(m.channelContext!)}
          >
            <span className="ctx-chip__ic">↪</span>{t('messages.fromChannel')}&nbsp;<b>{m.channelContext}</b>
          </button>
        )}
        {m.reactions && m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} className={`reaction ${r.mine ? 'mine' : ''}`} onClick={() => react(m.id, r.emoji)}>
                {r.emoji} <b>{r.count}</b>
              </button>
            ))}
          </div>
        )}
      </div>
      {!m.redacted && (
        <div className="msg-actions">
          {QUICK.map((e) => <button key={e} title={t('messages.react')} aria-label={t('messages.react')} onClick={() => react(m.id, e)}>{e}</button>)}
          <button title={t('messages.respond')} aria-label={t('messages.respond')} onClick={() => setReply(m.id)}>↩</button>
          <button className={pinned ? 'is-pinned' : ''} title={t(pinned ? 'pins.unpin' : 'pins.pin')} aria-label={t(pinned ? 'pins.unpin' : 'pins.pin')} onClick={() => togglePin(m.id)}>📌</button>
          <MsgActions m={m} />
          {m.self && <button title={t('messages.delete')} aria-label={t('messages.delete')} onClick={() => redact(m.id)}>🗑</button>}
        </div>
      )}
    </div>
  );
}
