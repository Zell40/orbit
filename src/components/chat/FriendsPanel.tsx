import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../Avatar';
import { useActiveChat } from '@/core/networks';
import { bus } from '@/modules/bus';

// The Friends panel opens anchored above its footer tab, like the radio and games
// windows. Its open + anchor state lives in a tiny module store (the tab toggles it,
// the panel — rendered at the app root — subscribes), and it joins the shared
// 'orbit:panel' exclusion so opening it closes the others (and vice versa).
const store = { open: false, anchor: null as DOMRect | null, subs: new Set<() => void>() };
const notify = () => store.subs.forEach((f) => f());
function close() { if (store.open) { store.open = false; notify(); } }

export function toggleFriendsPanel(rect: DOMRect): void {
  store.anchor = rect;
  store.open = !store.open;
  if (store.open) bus.emit('orbit:panel', 'friends');
  notify();
}
bus.on('orbit:panel', (id) => { if (id !== 'friends') close(); });

export function FriendsPanel() {
  const open = useSyncExternalStore((cb) => { store.subs.add(cb); return () => store.subs.delete(cb); }, () => store.open);
  const { t } = useTranslation();
  const friends = useActiveChat((s) => s.friends);
  const online = useActiveChat((s) => s.friendsOnline);
  const add = useActiveChat((s) => s.addFriend);
  const remove = useActiveChat((s) => s.removeFriend);
  const openUser = useActiveChat((s) => s.openUser);
  const openQuery = useActiveChat((s) => s.openQuery);
  const [nick, setNick] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(el) && !el.closest('.tab')) close();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  if (!open) return null;
  const submit = () => { const n = nick.trim(); if (n) { add(n); setNick(''); } };
  const sorted = [...friends].sort((a, b) =>
    Number(!!online[b.toLowerCase()]) - Number(!!online[a.toLowerCase()]) || a.localeCompare(b, 'fr'));

  // Anchor above the tab (centred, clamped), else the corner.
  const a = store.anchor, W = window.innerWidth, H = window.innerHeight, PW = Math.min(320, W * 0.92);
  const style = a
    ? { left: Math.round(Math.min(Math.max(a.left + a.width / 2 - PW / 2, 8), W - PW - 8)), bottom: Math.round(H - a.top + 10) }
    : { right: 14, bottom: 74 };

  return (
    <div ref={ref} className="opanel" role="dialog" aria-label={t('modals.friends.title')} style={style}>
      <div className="opanel__hd">
        <b>{t('modals.friends.title')}</b>
        <button className="opanel__x" aria-label={t('profile.close')} onClick={close}>✕</button>
      </div>
      <div className="opanel__add">
        <input className="opanel__in" autoFocus value={nick} placeholder={t('modals.dm.search')}
          onChange={(e) => setNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button className="opanel__btn" onClick={submit}>{t('modals.friends.add')}</button>
      </div>
      {sorted.length === 0
        ? <div className="opanel__empty">{t('modals.friends.noFriends')}</div>
        : <ul className="friends-list">
            {sorted.map((f) => {
              const on = !!online[f.toLowerCase()];
              return (
                <li key={f} className="friend">
                  <Avatar nick={f} size={32} />
                  <span className="friend__name">{f}</span>
                  <span className={`friend__dot friend__dot--${on ? 'on' : 'off'}`} />
                  <span className="friend__state">{on ? t('modals.friends.online') : t('modals.friends.offline')}</span>
                  <button className="friend__act" title={t('modals.friends.dm')} onClick={() => { openQuery(f); close(); }}>💬</button>
                  <button className="friend__act" title={t('modals.friends.profile')} onClick={() => { openUser(f); close(); }}>👤</button>
                  <button className="friend__act friend__act--rm" title={t('modals.friends.remove')} onClick={() => remove(f)}>✕</button>
                </li>
              );
            })}
          </ul>}
    </div>
  );
}
