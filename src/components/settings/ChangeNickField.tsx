import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';

/** Change the current IRC nick. Shown to guests on Profil, and in Compte so a
 *  member can align the visible nick with the account before identifying. */
export function ChangeNickField({ hint }: { hint: string }) {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const nick = useActiveChat((s) => s.nick);
  const nickError = useActiveChat((s) => s.nickError);
  const [newNick, setNewNick] = useState(nick);
  const [prevNick, setPrevNick] = useState(nick);
  if (nick !== prevNick) { setPrevNick(nick); setNewNick(nick); }

  function applyNick() {
    const n = newNick.trim();
    if (n && n !== nick) client?.setNick(n);
  }

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.changeNick')}</label>
          <div className="sfield__row">
            <input className="modal__input" value={newNick} maxLength={client?.server.nicklen ?? 30}
              onChange={(e) => setNewNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyNick()} />
            <button className="upbtn" onClick={applyNick} disabled={!newNick.trim() || newNick.trim() === nick}>{t('settings.account.changeBtn')}</button>
          </div>
          {nickError && <div className="sfield__err" role="alert">{nickError.text}</div>}
          <div className="srow__hint" style={{ marginTop: '.3rem' }}>{hint}</div>
        </div>
      </div>
    </div>
  );
}
