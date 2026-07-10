import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';

export function TypingIndicator() {
  const { t } = useTranslation();
  const buffer = useActiveChat((s) => s.buffers[s.active]);
  if (!buffer) return null;
  const now = Date.now();
  const who = Object.entries(buffer.typing).filter(([, exp]) => exp > now).map(([n]) => n);
  if (!who.length) return <div className="typing" />;
  const label = who.length === 1
    ? t('composer.typingOne', { nick: who[0] })
    : who.length === 2
      ? t('composer.typingTwo', { a: who[0], b: who[1] })
      : t('composer.typingMany', { n: who.length });
  return (
    <div className="typing">
      <span className="typing__dots"><i /><i /><i /></span>{label}…
    </div>
  );
}
