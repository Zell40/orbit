import { useTranslation } from 'react-i18next';
import { nickColor } from '../../../lib/format';
import { useActiveChat } from '../../../core/networks';

export function ReplyBar() {
  const { t } = useTranslation();
  const reply = useActiveChat((s) => s.replyTarget);
  const clear = useActiveChat((s) => s.clearReply);
  if (!reply) return null;
  return (
    <div className="replybar">
      <span className="replybar__icon">↩</span>
      <span className="replybar__txt">
        {t('composer.replyTo')} <b style={{ color: nickColor(reply.from) }}>{reply.from}</b> — {reply.text}
      </span>
      <button className="replybar__x" onClick={clear} aria-label={t('composer.cancelReply')}>✕</button>
    </div>
  );
}
