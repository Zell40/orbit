import { useState } from 'react';
import { useChat } from '../../store';
import type { Member } from '../../irc/types';
import { Avatar } from '../Avatar';
const ROLES: Record<string, { label: string; cls: string }> = {
  '~': { label: 'Fondateurs', cls: 'owner' },
  '&': { label: 'Administrateurs', cls: 'admin' },
  '!': { label: 'Propriétaires', cls: 'owner' },
  '@': { label: 'Opérateurs', cls: 'op' },
  '%': { label: 'Modérateurs', cls: 'halfop' },
  '+': { label: 'Voix', cls: 'voice' },
  '': { label: 'Membres', cls: 'member' },
};

export function MemberList({ onNavigate }: { onNavigate?: () => void }) {
  const buffer = useChat((s) => s.buffers[s.active]);
  const openUser = useChat((s) => s.openUser);
  const prefixOrder = useChat((s) => s.client?.prefixModes ?? '~&@%+');
  const [q, setQ] = useState('');
  if (!buffer || !buffer.isChannel) return <aside className="members" />;

  const rank = (p: string) => (!p ? 99 : prefixOrder.indexOf(p) === -1 ? 98 : prefixOrder.indexOf(p));
  const all = Object.values(buffer.members);
  const needle = q.trim().toLowerCase();
  const members = needle ? all.filter((m) => m.nick.toLowerCase().includes(needle)) : all;

  // Group by prefix (role), order groups by rank, sort names within each.
  const byPrefix = new Map<string, Member[]>();
  for (const m of members) {
    const p = m.prefix || '';
    (byPrefix.get(p) ?? byPrefix.set(p, []).get(p)!).push(m);
  }
  const groups = [...byPrefix.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([p, list]) => ({
      p,
      role: ROLES[p] ?? { label: 'Privilégiés', cls: 'op' },
      list: list.sort((a, b) => a.nick.localeCompare(b.nick, 'fr', { sensitivity: 'base' })),
    }));

  return (
    <aside className="members">
      <div className="members__h">Membres · {all.length}</div>
      {all.length > 12 && (
        <div className="members__search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer les membres" aria-label="Filtrer les membres" />
        </div>
      )}
      <div className="members__list">
        {groups.map((g) => (
          <div className="mgroup" key={g.p || 'none'}>
            <div className={`mgroup__h role-${g.role.cls}`}>{g.role.label}<span className="mgroup__n">{g.list.length}</span></div>
            {g.list.map((m) => (
              <button
                type="button"
                className={`member ${m.oper ? 'member--oper' : ''} ${m.away ? 'is-away' : ''}`}
                key={m.nick}
                title={m.away ? `${m.nick} — absent` : m.oper ? `${m.nick} — Opérateur réseau (IRCop)` : `Voir le profil de ${m.nick}`}
                onClick={() => { openUser(m.nick); onNavigate?.(); }}
              >
                <Avatar nick={m.nick} size={30} account={m.account} />
                <span className="member__name">
                  {m.prefix && <span className={`member__prefix role-${g.role.cls}`}>{m.prefix}</span>}
                  {m.nick}
                </span>
                {m.bot && <span className="member__bot">BOT</span>}
              </button>
            ))}
          </div>
        ))}
        {members.length === 0 && <div className="rooms-empty">Aucun membre</div>}
      </div>
    </aside>
  );
}

// Info fields whose values are long → span the full width of the 2-column grid.
/* ---- Modal shell + dialogs ---- */
