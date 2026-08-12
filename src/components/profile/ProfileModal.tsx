import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { IRCOP_COLOR, hashHue, fmtDuration, formatUserModes } from '@/lib/format';
import { Avatar } from '../Avatar';
import { GenderBadge } from '../GenderBadge';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { useActiveChat } from '@/core/networks';
import { parseProfileGecos } from '@/lib/profile-gecos';

// Which info rows take the full width — keyed by stable id (not the translated label).
const PM_WIDE_KEYS = new Set(['identifier', 'server', 'channels', 'certfp', 'info', 'umodes', 'bio', 'url']);

/* Wide horizontal profile card — pops over a blurred "nebula" of the app */
export function ProfileModal() {
  const { t } = useTranslation();
  const nick = useActiveChat((s) => s.profileUser);
  const info = useActiveChat((s) => s.whois[s.profileUser]);
  const me = useActiveChat((s) => s.nick);
  const openQuery = useActiveChat((s) => s.openQuery);
  const refreshUser = useActiveChat((s) => s.refreshUser);
  const close = useActiveChat((s) => s.closeProfile);
  const activeChan = useActiveChat((s) => s.active); // channel this profile was opened from (for +draft/channel-context)
  const ignored = useActiveChat((s) => s.ignored);
  const toggleIgnore = useActiveChat((s) => s.toggleIgnore);
  const reportUser = useActiveChat((s) => s.reportUser);
  const friends = useActiveChat((s) => s.friends);
  const addFriend = useActiveChat((s) => s.addFriend);
  const removeFriend = useActiveChat((s) => s.removeFriend);
  const modKick = useActiveChat((s) => s.modKick);
  const modBan = useActiveChat((s) => s.modBan);
  const modSetMode = useActiveChat((s) => s.modSetMode);
  const active = useActiveChat((s) => s.active);
  const myPrefix = useActiveChat((s) => s.buffers[s.active]?.members[s.nick]?.prefixes || s.buffers[s.active]?.members[s.nick]?.prefix || '');
  const targetMember = useActiveChat((s) => s.buffers[s.active]?.members[s.profileUser]);
  const myUmodes = useActiveChat((s) => s.umodes);
  const userActions = usePluginRegistry((s) => s.userActions);
  const [spinning, setSpinning] = useState(false);

  const doRefresh = () => {
    setSpinning(true);
    refreshUser(nick);
    window.setTimeout(() => setSpinning(false), 700); // guaranteed-visible spin even if WHOIS is instant
  };

  useEffect(() => {
    if (!nick) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nick, close]);

  if (!nick) return null;
  const isMe = nick === me;
  const hue = hashHue(nick);
  const isIgnored = ignored.some((n) => n.toLowerCase() === nick.toLowerCase());
  const isFriend = friends.some((f) => f.toLowerCase() === nick.toLowerCase());
  const amOp = /[~&@%]/.test(myPrefix);
  const targetIsOp = /[~&@]/.test(targetMember?.prefixes || targetMember?.prefix || '');
  const canModerate = !isMe && amOp && !!targetMember && (active.startsWith('#') || active.startsWith('&'));

  // [icon, stable key id, value] — the label is translated from the key at render.
  const rows: Array<[string, string, ReactNode]> = [];
  const profileEarly = parseProfileGecos(info?.realname || targetMember?.realname);
  // Structured age/sexe/ville is shown under the nick; keep raw GECOS only when it
  // doesn't match the EntreNous "40 - Homme - Paris" shape.
  if (info?.realname && !profileEarly) rows.push(['📝', 'realname', info.realname]);
  // draft/metadata-2 account profile — published by services from the website.
  if (info?.meta?.pronouns) rows.push(['🗣️', 'pronouns', info.meta.pronouns]);
  if (info?.meta?.bio) rows.push(['📖', 'bio', info.meta.bio]);
  if (info?.meta?.timezone) rows.push(['🕰️', 'timezone', info.meta.timezone]);
  if (info?.meta?.url) rows.push(['🔗', 'url',
    <a className="pm-link" href={info.meta.url} target="_blank" rel="noopener noreferrer nofollow">{info.meta.url}</a>]);
  if (info?.user || info?.host) rows.push(['🪪', 'identifier', `${info?.user ?? '?'}@${info?.host ?? '?'}`]);
  if (info?.server) rows.push(['🛰️', 'server', info.server + (info.serverInfo ? ` · ${info.serverInfo}` : '')]);
  if (info?.channels) rows.push(['#️⃣', 'channels', info.channels]);
  if (info?.signon) rows.push(['🕓', 'signon', new Date(info.signon * 1000).toLocaleString()]);
  if (info?.idle != null) rows.push(['💤', 'idle', fmtDuration(info.idle)]);
  if (info?.secure) rows.push(['🔒', 'connection', t('whois.secureTls')]);
  const shownModes = info?.modes || (isMe ? myUmodes : '');
  if (shownModes) rows.push(['⚙️', 'umodes', formatUserModes(shownModes)]);
  if (info?.certfp) rows.push(['🔑', 'certfp', <code className="pm-fp">{info.certfp}</code>]);
  for (const line of info?.special ?? []) {
    const verif = line.match(/verified\s+(\S+)\s+account\s*\(([^)]+)\)/i);
    const groups = line.match(/security groups?:?\s*(.+)/i);
    const score = line.match(/score:?\s*([\d.]+)/i);
    if (verif) {
      rows.push(['✅', 'verified',
        <span className="pm-verif"><span className="pm-check pm-check--inline">✓</span>{verif[2]}<span className="pm-verif__net"> · {verif[1]}</span></span>]);
    } else if (groups) {
      rows.push(['🛡️', 'groups',
        <span className="pm-groups">{groups[1].split(/[\s,]+/).filter(Boolean).map((g) => <span className="pm-grouptag" key={g}>{g}</span>)}</span>]);
    } else if (score) {
      rows.push(['📊', 'score', score[1]]);
    } else {
      rows.push(['ℹ️', 'info', line]);
    }
  }

  const statusText = info?.offline ? t('whois.offline') : info?.away ? t('whois.away') : t('whois.online');
  const statusKey = !info?.offline && !info?.away ? 'on' : 'away';
  const chCount = info?.channels?.trim() ? info.channels.trim().split(/\s+/).length : null;
  const profile = profileEarly;
  const gender = profile?.gender ?? 'x';

  return (
    <div className="pm-backdrop" onClick={close}>
      <div className="pm-neb pm-neb--1" /><div className="pm-neb pm-neb--2" />
      <div className="pm-card" style={{ ['--hue' as string]: String(hue) } as CSSProperties} onClick={(e) => e.stopPropagation()}>
        <button className="pm-x" onClick={close} aria-label={t('profile.close')}>✕</button>
        <div className="pm-cover"><span className="pm-cover__glow" /></div>
        <div className="pm-hero">
        <div className="pm-avwrap">
          <span className="pm-avring" />
          <Avatar nick={nick} size={92} account={info?.account} url={info?.meta?.avatar} />
          <span className={`pm-presence pm-presence--${statusKey}`} />
          <span className="pm-gender"><GenderBadge gender={gender} size="md" /></span>
        </div>
        <div className="pm-id">
          <div className="pm-name" style={info?.oper ? { color: IRCOP_COLOR } : undefined}>
            {nick}
            {info?.account && <span className="pm-check" title={t('whois.registeredTitle', { account: info.account })}>✓</span>}
          </div>
          <div className="pm-handle">{info?.loading && !info?.user ? t('whois.loading') : (info?.account ? `@${info.account}` : t('whois.visitor'))}</div>
          {profile && (
            <div className="pm-profile-gecos">
              {profile.age && <span>{profile.age} ans</span>}
              {profile.genderLabel && <span>{profile.genderLabel}</span>}
              {profile.city && <span>{profile.city}</span>}
            </div>
          )}
        </div>
        </div>

        <div className="pm-meta">
          <div className="pm-badges">
            <span className={`pm-status pm-status--${statusKey}`}>● {statusText}</span>
            {info?.bot && <span className="pm-badge pm-badge--bot">🤖 BOT</span>}
            {info?.oper && <span className="pm-badge pm-badge--op">🛡 {t('whois.badgeOp')}</span>}
            {info?.account
              ? <span className="pm-badge pm-badge--ok">✓ {t('whois.badgeRegistered')}</span>
              : <span className="pm-badge">{t('whois.badgeGuest')}</span>}
            {info?.secure && <span className="pm-badge">🔒 TLS</span>}
          </div>
          {info?.away && <div className="pm-away">💤 {info.away}</div>}
        </div>

        <div className="pm-stats">
          <div className="pm-stat">
            <span className="pm-stat__val"><i className={`pm-dot pm-dot--${statusKey}`} />{statusText}</span>
            <span className="pm-stat__key">{t('whois.statStatus')}</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat__val">{chCount ?? '—'}</span>
            <span className="pm-stat__key">{t('whois.statCommon')}</span>
          </div>
          <div className="pm-stat">
            <span className="pm-stat__val">{info?.secure ? '🔒' : info?.loading ? '…' : '—'}</span>
            <span className="pm-stat__key">{info?.secure ? t('whois.statSecure') : t('whois.connection')}</span>
          </div>
        </div>

        {!isMe && (
          <div className="pm-actions">
            <button className="pm-btn pm-btn--primary" onClick={() => { openQuery(nick, activeChan.startsWith('#') ? activeChan : undefined); close(); }}>💬 {t('whois.dm')}</button>
            <button className={`pm-btn pm-btn--icon ${spinning ? 'is-spinning' : ''}`} onClick={doRefresh} disabled={spinning} title={t('profile.refresh')} aria-label={t('profile.refresh')}><span className="pm-spin">↻</span></button>
          </div>
        )}

        {!isMe && (
          <div className="pm-modrow">
            <button className={`pm-chip ${isFriend ? 'is-on' : ''}`} onClick={() => isFriend ? removeFriend(nick) : addFriend(nick)}>
              {isFriend ? `⭐ ${t('whois.friend')}` : `☆ ${t('whois.friendAdd')}`}
            </button>
            <button className={`pm-chip ${isIgnored ? 'is-on' : ''}`} onClick={() => toggleIgnore(nick)}>
              {isIgnored ? `🔔 ${t('whois.unignore')}` : `🔕 ${t('whois.ignore')}`}
            </button>
            <button className="pm-chip pm-chip--warn" onClick={() => { reportUser(nick); close(); }}>🚩 {t('whois.report')}</button>
          </div>
        )}

        {!isMe && userActions.length > 0 && (
          <div className="pm-modrow">
            {userActions.map((a) => <PluginBoundary key={a.id} render={() => a.render({ nick, close })} label="user_action" />)}
          </div>
        )}

        {canModerate && (
          <div className="pm-modrow pm-modrow--ops">
            <span className="pm-modrow__lbl">🛡 {t('whois.moderation')}</span>
            <div className="pm-modbtns">
              <button className="pm-chip" onClick={() => modKick(nick)}>👢 {t('whois.kick')}</button>
              <button className="pm-chip pm-chip--warn" onClick={() => modBan(nick)}>🚫 {t('whois.ban')}</button>
              <button className="pm-chip" onClick={() => modSetMode(nick, 'o', !targetIsOp)}>{targetIsOp ? `➖ ${t('whois.opRemove')}` : `➕ ${t('whois.opAdd')}`}</button>
              <button className="pm-chip" onClick={() => modSetMode(nick, 'v', true)}>🔊 {t('whois.voice')}</button>
            </div>
          </div>
        )}

        <div className="pm-info">
          {rows.length > 0 && <div className="pm-section">{t('whois.section')}</div>}
          {info?.loading && rows.length === 0 && (
            <div className="pm-skeleton"><i /><i /><i /></div>
          )}
          {rows.map(([icon, k, v], i) => (
            <div className={`pm-row ${PM_WIDE_KEYS.has(k) ? 'pm-row--wide' : ''}`} key={`${k}-${i}`}>
              <span className="pm-row__ic">{icon}</span>
              <div className="pm-row__txt">
                <div className="pm-row__k">{t('whois.' + k)}</div>
                <div className="pm-row__v">{v}</div>
              </div>
            </div>
          ))}
          {!info?.loading && rows.length === 0 && <div className="pm-empty">{t('profile.noInfo')}</div>}
        </div>
      </div>
    </div>
  );
}
