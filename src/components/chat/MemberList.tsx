import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { Member } from '@/core/irc/types';
import { Avatar } from '../Avatar';
import { GenderBadge } from '../GenderBadge';
import { MemberMenu } from './MemberMenu';
import { useActiveChat } from '@/core/networks';
import { roleForPrefix } from '@/lib/roles';
import {
  GENDER_COLOR,
  ageMatchesRange,
  parseProfileGecos,
} from '@/lib/profile-gecos';

type SexOn = Record<'m' | 'f' | 'x', boolean>;

const GENDER_TOGGLES: { id: keyof SexOn; labelKey: string }[] = [
  { id: 'm', labelKey: 'profile.aslMale' },
  { id: 'f', labelKey: 'profile.aslFemale' },
  { id: 'x', labelKey: 'profile.aslOther' },
];

const AGE_RANGES = [
  { id: 'all', labelKey: 'profile.aslAgeAll' },
  { id: '<25', labelKey: 'profile.aslAgeUnder25' },
  { id: '25-45', labelKey: 'profile.aslAge2545' },
  { id: '>45', labelKey: 'profile.aslAgeOver45' },
] as const;

export function MemberList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const membersMap = useActiveChat((s) => s.buffers[s.active]?.members);
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  const openUser = useActiveChat((s) => s.openUser);
  const prefixOrder = useActiveChat((s) => s.client?.server.prefixModes ?? '~&@%+');
  const [q, setQ] = useState('');
  const [ageRange, setAgeRange] = useState<string>('all');
  const [sexOn, setSexOn] = useState<SexOn>({ m: true, f: true, x: true });
  const [menu, setMenu] = useState<{ nick: string; x: number; y: number } | null>(null);

  const needle = q.trim().toLowerCase();
  const aslActive = ageRange !== 'all' || !sexOn.m || !sexOn.f || !sexOn.x || !!needle;

  const all = useMemo(() => (membersMap ? Object.values(membersMap) : []), [membersMap]);
  const groups = useMemo(() => {
    const rank = (p: string) => (!p ? 99 : prefixOrder.indexOf(p) === -1 ? 98 : prefixOrder.indexOf(p));
    const members = all.filter((m) => {
      const profile = parseProfileGecos(m.realname);
      // Kiwi UserBrowser: when any ASL filter is active, only show profiles with ASL.
      if (aslActive) {
        if (!profile) return false;
        if (profile.gender === 'm' || profile.gender === 'f' || profile.gender === 'x') {
          if (!sexOn[profile.gender]) return false;
        } else {
          return false; // Non défini / unknown — Kiwi UserBrowser only lists ASL profiles
        }
        if (!ageMatchesRange(profile.age, ageRange)) return false;
        if (needle) {
          const hay = `${m.nick} ${profile.age ?? ''} ${profile.city ?? ''}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      }
      return true;
    });
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
  }, [all, aslActive, ageRange, sexOn, needle, prefixOrder]);

  if (!isChannel || !membersMap) return <aside className="members" />;

  const shown = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <aside className="members" aria-label={t('a11y.members')}>
      <div className="members__h">{t('topbar.membersCount', { n: all.length })}</div>

      <div className="members__asl" role="search" aria-label={t('profile.filterMembers')}>
        <div className="members__sexes">
          {GENDER_TOGGLES.map(({ id, labelKey }) => (
            <label
              key={id}
              className={`members__sex ${sexOn[id] ? 'is-on' : ''} members__sex--${id}`}
              style={{ '--sex-color': GENDER_COLOR[id] } as CSSProperties}
            >
              <input
                type="checkbox"
                checked={sexOn[id]}
                onChange={(e) => setSexOn((s) => ({ ...s, [id]: e.target.checked }))}
              />
              {t(labelKey)}
            </label>
          ))}
        </div>
        <label className="members__age">
          <span>{t('profile.aslAgeRange')}</span>
          <select value={ageRange} onChange={(e) => setAgeRange(e.target.value)} aria-label={t('profile.aslAgeRange')}>
            {AGE_RANGES.map((r) => (
              <option key={r.id} value={r.id}>{t(r.labelKey)}</option>
            ))}
          </select>
        </label>
        <div className="members__search">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('profile.aslFilterHint')}
            aria-label={t('profile.filterMembers')}
          />
        </div>
        {aslActive && (
          <div className="members__aslmeta">{t('profile.aslShown', { shown, total: all.length })}</div>
        )}
      </div>

      <div className="members__cols" aria-hidden="true">
        <span>{t('profile.aslColNick')}</span>
        <span>{t('profile.aslColAge')}</span>
        <span>{t('profile.aslColCity')}</span>
      </div>

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
                  className={`member member--asl ${m.oper ? 'member--oper' : ''} ${m.away ? 'is-away' : ''} ${profile ? `member--g-${profile.gender}` : ''} ${m.account ? 'member--reg' : ''}`}
                  key={m.nick}
                  title={m.away ? t('members.away', { nick: m.nick }) : m.oper ? t('members.operTitle', { nick: m.nick }) : t('members.viewProfile', { nick: m.nick })}
                  onClick={() => { openUser(m.nick); onNavigate?.(); }}
                  onContextMenu={(e) => { e.preventDefault(); setMenu({ nick: m.nick, x: e.clientX, y: e.clientY }); }}
                >
                  <span className="member__asl-nick">
                    <Avatar nick={m.nick} size={26} account={m.account} ring={genderColor} />
                    <span className="member__name">
                      {m.prefix && <span className={`member__prefix role-${g.role.cls}`}>{m.prefix}</span>}
                      <span className="member__nick" style={genderColor ? { color: genderColor } : undefined}>{m.nick}</span>
                      {m.account && (
                        <span className="member__reg" title={t('whois.registeredTitle', { account: m.account })} aria-label={t('whois.badgeRegistered')}>★</span>
                      )}
                      {profile && <GenderBadge gender={profile.gender} size="sm" />}
                      {m.bot && <span className="member__bot">BOT</span>}
                    </span>
                  </span>
                  <span className="member__asl-age">{profile?.age ?? '—'}</span>
                  <span className="member__asl-city" title={profile?.city}>{profile?.city ?? '—'}</span>
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
