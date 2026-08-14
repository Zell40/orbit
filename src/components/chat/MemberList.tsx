import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Member } from '@/core/irc/types';
import { Avatar } from '../Avatar';
import { GenderBadge } from '../GenderBadge';
import { MemberMenu } from './MemberMenu';
import { useActiveChat } from '@/core/networks';
import { roleForPrefix } from '@/lib/roles';
import { GENDER_COLOR, parseProfileGecos } from '@/lib/profile-gecos';

export function MemberList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const membersMap = useActiveChat((s) => s.buffers[s.active]?.members);
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  const openUser = useActiveChat((s) => s.openUser);
  const prefixOrder = useActiveChat((s) => s.client?.server.prefixModes ?? '~&@%+');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const [menu, setMenu] = useState<{ nick: string; x: number; y: number } | null>(null);

  const all = useMemo(() => (membersMap ? Object.values(membersMap) : []), [membersMap]);
  const groups = useMemo(() => {
    const rank = (p: string) => (!p ? 99 : prefixOrder.indexOf(p) === -1 ? 98 : prefixOrder.indexOf(p));
    const members = needle ? all.filter((m) => m.nick.toLowerCase().includes(needle)) : all;
    const byPrefix = new Map<string, Member[]>();
    for (const m of members) {
      const p = m.prefix || '';
      (byPrefix.get(p) ?? byPrefix.set(p, []).get(p)!).push(m);
    }
    return [...byPrefix.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]))
      .map(([p, list]) => ({
        p,
        role: roleForPrefix(p),
        list: list.sort((a, b) => a.nick.localeCompare(b.nick, 'fr', { sensitivity: 'base' })),
      }));
  }, [all, needle, prefixOrder]);

  if (!isChannel || !membersMap) return <aside className="members" />;

  return (
    <aside className="members" aria-label={t('a11y.members')}>
      <div className="members__h">{t('topbar.membersCount', { n: all.length })}</div>
      {all.length > 12 && (
        <div className="members__search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('profile.filterMembers')} aria-label={t('profile.filterMembers')} />
        </div>
      )}
      <div className="members__list">
        {groups.map((g) => (
          <div className="mgroup" key={g.p || 'none'}>
            <div className={`mgroup__h role-${g.role.cls}`}>{t(`members.roles.${g.role.key}`)}<span className="mgroup__n">{g.list.length}</span></div>
            {g.list.map((m) => {
              const profile = parseProfileGecos(m.realname);
              const genderColor = profile ? GENDER_COLOR[profile.gender] : undefined;
              return (
                <button
                  type="button"
                  className={`member ${m.oper ? 'member--oper' : ''} ${m.away ? 'is-away' : ''} ${profile ? `member--g-${profile.gender}` : ''}`}
                  key={m.nick}
                  title={m.away ? t('members.away', { nick: m.nick }) : m.oper ? t('members.operTitle', { nick: m.nick }) : t('members.viewProfile', { nick: m.nick })}
                  onClick={() => { openUser(m.nick); onNavigate?.(); }}
                  onContextMenu={(e) => { e.preventDefault(); setMenu({ nick: m.nick, x: e.clientX, y: e.clientY }); }}
                >
                  <Avatar nick={m.nick} size={30} account={m.account} ring={genderColor} />
                  <span className="member__name">
                    {m.prefix && <span className={`member__prefix role-${g.role.cls}`}>{m.prefix}</span>}
                    <span className="member__nick" style={genderColor ? { color: genderColor } : undefined}>{m.nick}</span>
                    {profile && <GenderBadge gender={profile.gender} size="sm" />}
                  </span>
                  {m.bot && <span className="member__bot">BOT</span>}
                </button>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && <div className="rooms-empty">{t('profile.noMembers')}</div>}
      </div>
      {menu && <MemberMenu nick={menu.nick} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </aside>
  );
}
