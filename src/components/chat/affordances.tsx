import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/core/irc/types';
import { nickColor } from '@/lib/format';
import { highlightMessage } from './msg-jump';

// A pill linking to the channel a message is associated with (+draft/channel-context):
// the channel a DM started in, or the channel a service notice concerns. Clicking
// switches to that channel. `label` is optional descriptive text before the name.
export function CtxChip({ chan, onJump, label, title }: {
  chan: string; onJump: () => void; label?: string; title?: string;
}) {
  return (
    <button type="button" className="ctx-chip" title={title} onClick={onJump}>
      <span className="ctx-chip__ic">↪</span>{label ? <>{label}&nbsp;</> : null}<b>{chan}</b>
    </button>
  );
}

// The parent a message replies to (+draft/reply), shown above the replying line.
// When `onJump` is given the quote becomes a button that jumps to the parent.
export function ReplyQuote({ quoted, onJump }: { quoted: ChatMessage; onJump?: () => void }) {
  const { t } = useTranslation();
  const txt = quoted.redacted ? t('messages.deleted') : quoted.text.slice(0, 90);
  const body = (
    <>
      <span className="reply-quote__arrow">↪</span>
      <span className="reply-quote__from" style={{ color: nickColor(quoted.from) }}>{quoted.from}</span>
      <span className="reply-quote__txt">{txt}</span>
    </>
  );
  return onJump ? (
    <button type="button" className="reply-quote reply-quote--link" title={t('messages.reply')}
      onMouseEnter={() => highlightMessage(quoted.id, true)}
      onMouseLeave={() => highlightMessage(quoted.id, false)}
      onClick={onJump}>
      {body}
    </button>
  ) : (
    <div className="reply-quote" title={t('messages.reply')}>{body}</div>
  );
}
