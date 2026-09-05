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
  profileSearchText,
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

function groupMembers(members: Member[], prefixOrder: string) {
  const rank = (p: string) => (!p ? 99 : prefixOrder.indexOf(p) === -1 ? 98 : prefixOrder.indexOf(p));
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
}

export function MemberList({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const membersMap = useActiveChat((s) => s.buffers[s.active]?.members);
  const isChannel = useActiveChat((s) => !!s.buffers[s.active]?.isChannel);
  const openUser = useActiveChat((s) => s.openUser);
  const prefixOrder = useActiveChat((s) => s.client?.server.prefixModes ?? '~&@%+');

  // Classic nicklist by default; ASL browser is a separate Kiwi-style mode.
  const [aslBrowser, setAslBrowser] = useState(false);
  const [q, setQ] = useState('');
  const [ageRange, setAgeRange] = useState<string>('all');
  const [sexOn, setSexOn] = useState<SexOn>({ m: true, f: true, x: true });
  const [menu, setMenu] = useState<{ nick: string; x: number; y: number } | null>(null);

  const needle = q.trim().toLowerCase();
  const all = useMemo(() => (membersMap ? Object.values(membersMap) : []), [membersMap]);

  const groups = useMemo(() => {
    if (!aslBrowser) {
      const members = needle
        ? all.filter((m) => profileSearchText(m.realname, m.nick).includes(needle))
        : all;
      return groupMembers(members, prefixOrder);
    }
    const members = all.filter((m) => {
      const profile = parseProfileGecos(m.realname);
      if (!profile) return false;
      if (profile.gender === 'm' || profile.gender === 'f' || profile.gender === 'x') {
        if (!sexOn[profile.gender]) return false;
      } else {
        return false;
      }
      if (!ageMatchesRange(profile.age, ageRange)) return false;
      if (needle) {
        const hay = `${m.nick} ${profile.age ?? ''} ${profile.city ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return groupMembers(members, prefixOrder);
  }, [all, aslBrowser, ageRange, sexOn, needle, prefixOrder]);

  if (!isChannel || !membersMap) return null;

  const shown = groups.reduce((n, g) => n + g.list.length, 0);

  return (
    <aside className={`members ${aslBrowser ? 'members--asl' : ''}`} aria-label={t('a11y.members')}>
      <div className="members__h">
        <span>{t('topbar.membersCount', { n: all.length })}</span>
        <button
          type="button"
          className={`members__aslbtn ${aslBrowser ? 'is-on' : ''}`}
          title={t('profile.aslToggle')}
          aria-label={t('profile.aslToggle')}
          aria-pressed={aslBrowser}
          onClick={() => { setAslBrowser((v) => !v); setQ(''); }}
        >
          ♥
        </button>
      </div>

      {aslBrowser ? (
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
          <div className="members__aslmeta">{t('profile.aslShown', { shown, total: all.length })}</div>
          <div className="members__cols" aria-hidden="true">
            <span>{t('profile.aslColNick')}</span>
            <span>{t('profile.aslColAge')}</span>
            <span>{t('profile.aslColCity')}</span>
          </div>
        </div>
      ) : (
        all.length > 12 && (
          <div className="members__search members__search--simple">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('profile.filterMembersHint')}
              aria-label={t('profile.filterMembers')}
            />
          </div>
        )
      )}

      <div className="members__list">
        {groups.map((g) => (
          <div className="mgroup" key={g.p || 'none'}>
            <div className={`mgroup__h role-${g.role.cls}`}>{t(`members.roles.${g.role.key}`)}<span className="mgroup__n">{g.list.length}</span></div>
            {g.list.map((m) => {
              const profile = parseProfileGecos(m.realname);
              const genderColor = profile ? GENDER_COLOR[profile.gender] : undefined;
              const title = m.away
                ? t('members.away', { nick: m.nick })
                : m.oper
                  ? t('members.operTitle', { nick: m.nick })
                  : t('members.viewProfile', { nick: m.nick });
              if (aslBrowser) {
                return (
                  <button
                    type="button"
                    className={`member member--asl ${m.oper ? 'member--oper' : ''} ${m.away ? 'is-away' : ''} ${profile ? `member--g-${profile.gender}` : ''} ${m.account ? 'member--reg' : ''}`}
                    key={m.nick}
                    title={title}
                    onClick={() => { openUser(m.nick); onNavigate?.(); }}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ nick: m.nick, x: e.clientX, y: e.clientY }); }}
                  >
                    <span className="member__asl-nick">
                      <Avatar nick={m.nick} size={26} account={m.account} ring={genderColor} bot={m.bot} />
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
              }
              return (
                <button
                  type="button"
                  className={`member ${m.oper ? 'member--oper' : ''} ${m.away ? 'is-away' : ''} ${profile ? `member--g-${profile.gender}` : ''} ${m.account ? 'member--reg' : ''}`}
                  key={m.nick}
                  title={title}
                  onClick={() => { openUser(m.nick); onNavigate?.(); }}
                  onContextMenu={(e) => { e.preventDefault(); setMenu({ nick: m.nick, x: e.clientX, y: e.clientY }); }}
                >
                  <Avatar nick={m.nick} size={30} account={m.account} ring={genderColor} bot={m.bot} />
                  <span className="member__name">
                    {m.prefix && <span className={`member__prefix role-${g.role.cls}`}>{m.prefix}</span>}
                    <span className="member__nick" style={genderColor ? { color: genderColor } : undefined}>{m.nick}</span>
                    {m.account && (
                      <span className="member__reg" title={t('whois.registeredTitle', { account: m.account })} aria-label={t('whois.badgeRegistered')}>★</span>
                    )}
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
      {menu && <MemberMenu nick={menu.nick} x={menu.x} y={menu.y} onClose={() => setMenu(null)} onNavigate={onNavigate} />}
    </aside>
  );
}
