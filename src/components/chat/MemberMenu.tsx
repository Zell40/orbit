import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveChat } from '@/core/networks';
import { getTheme } from '@/themes';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';

// mIRC-style right-click op menu for a nick in the member list. Whois for
// everyone; native kick / ban / op / voice when you are a channel operator.
// Plugins may add a "Commandes <bot>" flyout (ChanServ) alongside those actions.
// Left-click on the row still opens whois.
type Pending = 'kick' | 'bankick';

export function MemberMenu({ nick, x, y, onClose, onNavigate }: { nick: string; x: number; y: number; onClose: () => void; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const openUser = useActiveChat((s) => s.openUser);
  const whoisText = useActiveChat((s) => s.whoisText);
  const me = useActiveChat((s) => s.nick);
  const active = useActiveChat((s) => s.active);
  const myPrefix = useActiveChat((s) => s.buffers[s.active]?.members[s.nick]?.prefixes || s.buffers[s.active]?.members[s.nick]?.prefix || '');
  const targetMember = useActiveChat((s) => s.buffers[s.active]?.members[nick]);
  const modKick = useActiveChat((s) => s.modKick);
  const modBanOnly = useActiveChat((s) => s.modBanOnly);
  const modSetMode = useActiveChat((s) => s.modSetMode);
  const memberMenus = usePluginRegistry((s) => s.memberMenus);

  const amOp = /[~&@%]/.test(myPrefix);
  const isMe = nick === me;
  const targetIsOp = /[~&@]/.test(targetMember?.prefixes || targetMember?.prefix || '');
  const canModerate = !isMe && amOp && !!targetMember && (active.startsWith('#') || active.startsWith('&'));

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');

  // Keep the menu on-screen: shift it left/up if it would overflow the viewport.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x, ny = y;
    if (x + r.width > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
    if (y + r.height > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - r.height - 8);
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
  }, [x, y, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.memberctx, .memberrsn, .ocs-mm__fly')) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const runReason = () => {
    const r = reason.trim();
    if (pending === 'kick') modKick(nick, r || undefined);
    else if (pending === 'bankick') { modBanOnly(nick); modKick(nick, r || undefined); }
    onClose();
  };

  // Reason dialog (the "window for the reason") — replaces the menu once kick /
  // ban+kick is chosen.
  if (pending) {
    return (
      <div className="memberrsn-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="memberrsn" role="dialog" aria-label={t(pending === 'kick' ? 'members.kickReasonTitle' : 'members.banKickReasonTitle', { nick })}>
          <div className="memberrsn__head">{t(pending === 'kick' ? 'members.kickReasonTitle' : 'members.banKickReasonTitle', { nick })}</div>
          <input className="memberrsn__in" autoFocus value={reason} placeholder={t('members.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runReason(); }} />
          <div className="memberrsn__row">
            <button className="memberrsn__btn" onClick={onClose}>{t('members.cancel')}</button>
            <button className="memberrsn__btn memberrsn__btn--go" onClick={runReason}>
              {t(pending === 'kick' ? 'whois.kick' : 'members.banKick')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="memberctx" role="menu" style={{ left: pos.x, top: pos.y }}>
      <div className="memberctx__nick">{targetMember?.prefix}{nick}</div>
      {memberMenus.map((u) => (
        <PluginBoundary key={u.id} render={() => u.render({ nick, close: onClose })} label="member_menu" />
      ))}
      {memberMenus.length > 0 && <div className="memberctx__sep" />}
      <button className="memberctx__item" role="menuitem" onClick={() => { if (getTheme().startsWith('yomirc')) whoisText(nick); else openUser(nick); onClose(); onNavigate?.(); }}>{t('members.whoisAction')}</button>
      {canModerate && (
        <>
          <div className="memberctx__sep" />
          <button className="memberctx__item" role="menuitem" onClick={() => setPending('kick')}>{t('whois.kick')}</button>
          <button className="memberctx__item memberctx__item--warn" role="menuitem" onClick={() => { modBanOnly(nick); onClose(); }}>{t('whois.ban')}</button>
          <button className="memberctx__item memberctx__item--warn" role="menuitem" onClick={() => setPending('bankick')}>{t('members.banKick')}</button>
          <div className="memberctx__sep" />
          <button className="memberctx__item" role="menuitem" onClick={() => { modSetMode(nick, 'o', !targetIsOp); onClose(); }}>{targetIsOp ? t('whois.opRemove') : t('whois.opAdd')}</button>
          <button className="memberctx__item" role="menuitem" onClick={() => { modSetMode(nick, 'v', true); onClose(); }}>{t('whois.voice')}</button>
        </>
      )}
    </div>
  );
}
