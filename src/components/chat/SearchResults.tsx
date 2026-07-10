import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/core/irc/types';
import { fmtTime, nickColor } from '@/lib/format';
import { useActiveChat } from '@/core/networks';

// In-buffer text search: flat list of matching privmsg/action/notice lines with
// the hit highlighted, newest first.
export function SearchResults({ messages, query }: { messages: ChatMessage[]; query: string }) {
  const { t } = useTranslation();
  const openUser = useActiveChat((s) => s.openUser);
  const q = query.trim().toLowerCase();
  const hits = messages.filter((m) => (m.kind === 'privmsg' || m.kind === 'action' || m.kind === 'notice')
    && !m.redacted && m.text.toLowerCase().includes(q));
  return (
    <div className="messages messages--search">
      <div className="search-count">{t('messages.searchResults', { count: hits.length, q: query })}</div>
      {hits.slice().reverse().map((m) => {
        const i = m.text.toLowerCase().indexOf(q);
        return (
          <div key={m.id} className="search-hit">
            <button className="search-hit__from" style={{ color: nickColor(m.from) }} onClick={() => openUser(m.from)}>{m.from}</button>
            <span className="search-hit__time">{fmtTime(m.ts)}</span>
            <div className="search-hit__txt">
              {m.text.slice(Math.max(0, i - 30), i)}<mark>{m.text.slice(i, i + query.length)}</mark>{m.text.slice(i + query.length, i + query.length + 60)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
