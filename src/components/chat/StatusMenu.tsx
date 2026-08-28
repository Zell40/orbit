import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';

// Presence menu opened by clicking your own avatar in the footer (Slack/Discord
// style): pick Available or Away. Away reveals an editable reason; guests can
// also rename from here. Enter or the action button applies.
export function StatusMenu({ nick, away, anchor, onClose }: { nick: string; away: boolean; anchor: DOMRect; onClose: () => void }) {
  const { t } = useTranslation();
  const setAway = useActiveChat((s) => s.setAway);
  const openUser = useActiveChat((s) => s.openUser);
  const client = useActiveChat((s) => s.client);
  const account = useActiveChat((s) => s.account);
  const [editing, setEditing] = useState<'away' | 'nick' | null>(null);
  const [reason, setReason] = useState(t('sidebar.awayDefault'));
  const [newNick, setNewNick] = useState(nick);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.top });

  // Open upward from the avatar, clamped to the viewport (drops below if no room).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = anchor.left;
    let top = anchor.top - r.height - 8;
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
    if (left < 8) left = 8;
    if (top < 8) top = anchor.bottom + 8;
    setPos({ left, top });
  }, [anchor, editing]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.statusmenu, .appbar__me')) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const setAvailable = () => { setAway(''); onClose(); };
  const confirmAway = () => { setAway(reason.trim() || t('sidebar.awayDefault')); onClose(); };
  const applyNick = () => {
    const n = newNick.trim();
    if (n && n !== nick) client?.setNick(n);
    onClose();
  };

  return (
    <div className="statusmenu" ref={ref} style={{ left: pos.left, top: pos.top }} role="menu">
      <button className={`statusmenu__opt ${!away ? 'is-on' : ''}`} role="menuitemradio" aria-checked={!away} onClick={setAvailable}>
        <span className="statusmenu__dot statusmenu__dot--on" aria-hidden />
        <span className="statusmenu__lbl">{t('sidebar.online')}</span>
        {!away && <span className="statusmenu__check" aria-hidden>✓</span>}
      </button>
      <button className={`statusmenu__opt ${away ? 'is-on' : ''}`} role="menuitemradio" aria-checked={away} onClick={() => setEditing('away')}>
        <span className="statusmenu__dot statusmenu__dot--away" aria-hidden />
        <span className="statusmenu__lbl">{t('sidebar.away')}</span>
        {away && <span className="statusmenu__check" aria-hidden>✓</span>}
      </button>
      {editing === 'away' && (
        <div className="statusmenu__reason">
          <input className="statusmenu__input" value={reason} maxLength={200} autoFocus
            placeholder={t('sidebar.awayReason')} aria-label={t('sidebar.awayReason')}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmAway(); }} />
          <button className="statusmenu__set" onClick={confirmAway}>{t('sidebar.awaySet')}</button>
        </div>
      )}
      <div className="statusmenu__sep" />
      {!account && (
        <>
          <button className="statusmenu__opt statusmenu__opt--link" role="menuitem" onClick={() => setEditing('nick')}>
            {t('sidebar.changeNick')}
          </button>
          {editing === 'nick' && (
            <div className="statusmenu__reason">
              <input className="statusmenu__input" value={newNick} maxLength={client?.server.nicklen ?? 30} autoFocus
                aria-label={t('sidebar.changeNick')}
                onChange={(e) => setNewNick(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyNick(); }} />
              <button className="statusmenu__set" onClick={applyNick} disabled={!newNick.trim() || newNick.trim() === nick}>
                {t('settings.account.changeBtn')}
              </button>
            </div>
          )}
        </>
      )}
      <button className="statusmenu__opt statusmenu__opt--link" role="menuitem" onClick={() => { openUser(nick); onClose(); }}>
        {t('sidebar.viewProfile')}
      </button>
    </div>
  );
}
