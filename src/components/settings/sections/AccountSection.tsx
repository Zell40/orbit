import { useState, useEffect, useRef, useCallback } from 'react';
import { escapeHtml } from '@/lib/escape';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';
import { getTheme } from '@/themes';
import { Turnstile } from '@/components/Turnstile';
import { useActiveChat, activeStore } from '@/core/networks';
import { ChangeNickField } from '../ChangeNickField';
import { Icon } from '@/components/Icon';
import {
  fetchNickServHelp, fetchNickServList,
  nickServAjoinAdd, nickServAjoinDel, mergeAlistAndAjoin,
  describeAlistAccess, alistCanInvite, isNickServNicksRow, nickServHelpIsOper,
  parseNickServOptionPills, sendChanServInvite, NICKSERV_SET_TOGGLES, NICKSERV_LIST_FLAGS,
  loadNickServAccountSnapshot, markNickServAutoQuery, NS_ACCOUNT_WAIT_MS,
  type NickServInfo, type NickServAccessRow,
} from '@/core/store/nickserv-info';

export function AccountSection() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const account = useActiveChat((s) => s.account);
  const nick = useActiveChat((s) => s.nick);
  const status = useActiveChat((s) => s.status); // re-render once (re)registration acks the caps
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [acct, setAcct] = useState(nick);
  const [pw, setPw] = useState('');
  const [phase, setPhase] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const wasAccount = useRef(account);

  // React to the server confirming login (RPL_LOGGEDIN → account fills in) —
  // covers both manual IDENTIFY and the auto-login after a fresh VERIFY. On
  // success, auto-align the visible nick to the account we just logged into, so
  // the user doesn't have to change it by hand (a no-op if it already matches).
  useEffect(() => {
    if (account && account !== wasAccount.current) {
      setPhase('success');
      setPw('');
      // Drop focus so the mobile keyboard closes before the form swaps to the
      // connected view (otherwise the unmounted input leaves the layout shrunk).
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (client && nick && nick.toLowerCase() !== account.toLowerCase()) client.setNick(account);
    }
    wasAccount.current = account;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // While pending, give up after a few seconds (wrong password → no 900).
  useEffect(() => {
    if (phase !== 'pending') return;
    const t = setTimeout(() => setPhase((p) => (p === 'pending' ? 'error' : p)), 5000);
    return () => clearTimeout(t);
  }, [phase]);

  // One step: IDENTIFY to the named account (works from ANY nick), then the
  // success handler above renames us to it.
  function login() {
    const a = acct.trim();
    const p = pw.trim();
    if (!a || !p || !client) return;
    client.privmsg('NickServ', `IDENTIFY ${a} ${p}`);
    setPhase('pending');
  }
  function logout() {
    void import('@/core/resume').then(({ clearSaslResume }) => clearSaslResume());
    client?.privmsg('NickServ', 'LOGOUT');
    setPhase('idle');
  }

  // Logged in → account hero + security card + logout.
  // Require a live IRC session: after a drop/restart `account` is cleared, but
  // also hide the hero if status isn't registered (stale race).
  if (account && status === 'registered') {
    return (
      <>
        <div className={`login-card login-card--ok ${phase === 'success' ? 'is-burst' : ''}`}>
          <div className="login-card__check" aria-hidden>
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M14 27 l8 8 l16 -18" /></svg>
          </div>
          <div className="login-card__title">{t('settings.account.loggedIn')}</div>
          <div className="login-card__sub">{t('settings.account.identifiedPre')} <strong>{account}</strong></div>
        </div>
        <ChangeNickField hint={t('settings.account.nickHint')} />
        <ChangePassword />
        <NickServInfoCard account={account} nick={nick} />
        <NickServAlistCard account={account} nick={nick} />
        <NickServSearchCard account={account} nick={nick} />
        <button className="set-leave" onClick={logout}>{t('settings.account.logoutAccount')}</button>
      </>
    );
  }

  // Not logged in → login / register switcher. Registration needs BOTH the build
  // to enable it AND the server to advertise draft/account-registration; otherwise
  // REGISTER would just come back as an unknown command (e.g. a leaner ircd).
  const canRegister = getConfig().features.register
    && status === 'registered' && !!client?.ircv3.hasCap('draft/account-registration');
  return (
    <>
      {canRegister && (
        <div className="login-switch">
          <button className={mode === 'login' ? 'is-on' : ''} onClick={() => setMode('login')}>{t('settings.account.signin')}</button>
          <button className={mode === 'register' ? 'is-on' : ''} onClick={() => setMode('register')}>{t('settings.account.createTitle')}</button>
        </div>
      )}

      {(mode === 'login' || !canRegister) ? (
        <div className="scard">
          <div className="scard__h">🔑 {t('settings.account.signin')}</div>
          <div className="scard__body">
            <div className="sfield">
              <div className="sfield__intro">{t('settings.account.loginIntro')}</div>
            </div>
            <div className="sfield">
              <label className="sfield__label">{t('settings.sections.account')}</label>
              <input className="modal__input" autoComplete="username" placeholder={t('settings.account.accountPlaceholder')} value={acct} maxLength={30}
                onChange={(e) => { setAcct(e.target.value); if (phase === 'error') setPhase('idle'); }}
                onKeyDown={(e) => e.key === 'Enter' && login()} />
            </div>
            <div className="sfield">
              <label className="sfield__label">{t('settings.account.password')}</label>
              <div className="sfield__row">
                <input className="modal__input" type="password" autoComplete="current-password"
                  placeholder={t('settings.account.passwordPlaceholder')} value={pw}
                  onChange={(e) => { setPw(e.target.value); if (phase === 'error') setPhase('idle'); }}
                  onKeyDown={(e) => e.key === 'Enter' && login()} />
                <button className={`upbtn upbtn--primary ${phase === 'pending' ? 'is-loading' : ''}`}
                  onClick={login} disabled={!acct.trim() || !pw.trim() || phase === 'pending'}>
                  {phase === 'pending' ? t('settings.account.connecting') : t('settings.account.signin')}
                </button>
              </div>
              {phase === 'error' && <div className="sfield__err">{t('settings.account.unknownError')}</div>}
            </div>
          </div>
        </div>
      ) : (
        <RegisterForm />
      )}
    </>
  );
}

function RefreshIconBtn({ onClick, disabled, label, spinning }: { onClick: () => void; disabled?: boolean; label: string; spinning?: boolean }) {
  return (
    <button
      className={`linkbtn nsinfo__refresh nsinfo__refresh--ico${spinning ? ' is-busy' : ''}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon name="refresh" size={16} />
    </button>
  );
}

function NickServWait({ label }: { label: string }) {
  return (
    <div className="sfield nsinfo-wait">
      <Icon name="refresh" size={18} />
      <div className="sfield__intro">{label}</div>
    </div>
  );
}

function NickServInfoCard({ account, nick }: { account: string; nick: string }) {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const [phase, setPhase] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [info, setInfo] = useState<NickServInfo | null>(null);
  const [nicks, setNicks] = useState<string[]>([]);
  const gen = useRef(0);

  const load = useCallback((opts?: { withUpdate?: boolean; force?: boolean }) => {
    const mine = ++gen.current;
    setPhase('loading');
    if (opts?.withUpdate) {
      markNickServAutoQuery();
      client?.privmsg('NickServ', 'UPDATE');
    }
    const wait = opts?.withUpdate ? 700 : 0;
    const failAt = window.setTimeout(() => {
      if (mine !== gen.current) return;
      setPhase((p) => (p === 'loading' ? 'empty' : p));
    }, NS_ACCOUNT_WAIT_MS);
    window.setTimeout(() => {
      void loadNickServAccountSnapshot(account, nick, { force: !!(opts?.force || opts?.withUpdate) }).then((snap) => {
        window.clearTimeout(failAt);
        if (mine !== gen.current) return;
        if (!snap.info) { setInfo(null); setNicks(snap.glist); setPhase('empty'); return; }
        setInfo(snap.info);
        const fromInfo = snap.info.rows.find((r) => isNickServNicksRow(r.key))?.value
          .split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean) || [];
        setNicks(snap.glist.length ? snap.glist : fromInfo);
        setPhase('ok');
      }).catch(() => {
        window.clearTimeout(failAt);
        if (mine !== gen.current) return;
        setPhase('empty');
      });
    }, wait);
  }, [account, nick, client]);

  useEffect(() => {
    load();
    return () => { gen.current++; };
  }, [load]);

  const rows = (info?.rows || []).filter((row) => !isNickServNicksRow(row.key));

  return (
    <div className="scard nsinfo">
      <div className="scard__h">
        <span>🪪 {t('settings.account.nickservTitle')}</span>
        <RefreshIconBtn
          onClick={() => load({ withUpdate: true })}
          disabled={phase === 'loading'}
          spinning={phase === 'loading'}
          label={t('profile.refresh')}
        />
      </div>
      <div className="scard__body">
        {phase === 'loading' && <NickServWait label={t('settings.account.nickservLoading')} />}
        {phase === 'empty' && <div className="sfield"><div className="sfield__intro">{t('settings.account.nickservUnavailable')}</div></div>}
        {phase === 'ok' && info && (
          <dl className="nsinfo-dl">
            {rows.map((row, i) => (
              <div className="nsinfo-row" key={`${row.key}-${i}`}>
                <dt className="nsinfo-row__k">{row.key}</dt>
                <dd className="nsinfo-row__v">
                  {row.pills
                    ? <NickServSetToggles pills={row.pills} onChanged={() => load({ force: true })} />
                    : (row.value || '—')}
                </dd>
              </div>
            ))}
            <div className="nsinfo-row">
              <dt className="nsinfo-row__k">{t('settings.account.glistLabel')}</dt>
              <dd className="nsinfo-row__v">{nicks.length ? nicks.join(' ') : '—'}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}

function NickServSetToggles({ pills, onChanged }: { pills: string[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const [busy, setBusy] = useState('');
  const on = parseNickServOptionPills(pills);
  const noExpire = on.has('NOEXPIRE');

  function toggle(set: string, next: boolean) {
    if (!client || busy) return;
    setBusy(set);
    client.privmsg('NickServ', `SET ${set} ${next ? 'ON' : 'OFF'}`);
    window.setTimeout(() => { setBusy(''); onChanged(); }, 900);
  }

  return (
    <div className="nsset">
      {NICKSERV_SET_TOGGLES.map((opt) => {
        const active = on.has(opt.set);
        return (
          <div className="nsset-row" key={opt.set}>
            <span className="nsset-row__lab">
              {t(`settings.account.nsSet.${opt.key}`)}
              <button
                type="button"
                className="tipi"
                title={t(`settings.account.nsSet.${opt.key}Hint`)}
                aria-label={t(`settings.account.nsSet.${opt.key}Hint`)}
              >i</button>
            </span>
            <button
              type="button"
              className={`switch${active ? ' is-on' : ''}${busy === opt.set ? ' is-locked' : ''}`}
              role="switch"
              aria-checked={active}
              aria-label={t(`settings.account.nsSet.${opt.key}`)}
              disabled={busy === opt.set}
              onClick={() => toggle(opt.set, !active)}
            >
              <span className="switch__dot" />
            </button>
          </div>
        );
      })}
      {noExpire ? (
        <div className="nsset-row nsset-row--locked">
          <span className="nsset-row__lab">
            {t('settings.account.nsSet.noexpire')}
            <button
              type="button"
              className="tipi"
              title={t('settings.account.nsSet.noexpireHint')}
              aria-label={t('settings.account.nsSet.noexpireHint')}
            >i</button>
          </span>
          <span className="nsset-lock" title={t('settings.account.nsSet.noexpireHint')}>{t('settings.account.nsSet.locked')}</span>
        </div>
      ) : null}
    </div>
  );
}

function NickServAlistCard({ account, nick }: { account: string; nick: string }) {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const setActive = useActiveChat((s) => s.setActive);
  const setModal = useActiveChat((s) => s.setModal);
  const [phase, setPhase] = useState<'loading' | 'ok' | 'empty' | 'fail'>('loading');
  const [rows, setRows] = useState<NickServAccessRow[]>([]);
  const [addChan, setAddChan] = useState('');
  const [addKey, setAddKey] = useState('');
  const [busy, setBusy] = useState('');
  const gen = useRef(0);

  const load = useCallback((opts?: { silent?: boolean; force?: boolean }) => {
    const mine = ++gen.current;
    if (!opts?.silent) setPhase('loading');
    const failAt = window.setTimeout(() => {
      if (mine !== gen.current) return;
      setPhase((p) => (p === 'loading' ? 'fail' : p));
    }, NS_ACCOUNT_WAIT_MS);
    void loadNickServAccountSnapshot(account, nick, { force: !!opts?.force }).then((snap) => {
      window.clearTimeout(failAt);
      if (mine !== gen.current) return;
      if (snap.alist == null && snap.ajoin == null) { setRows([]); setPhase('fail'); return; }
      const merged = mergeAlistAndAjoin(snap.alist || [], snap.ajoin || []);
      setRows(merged);
      setPhase(merged.length ? 'ok' : 'empty');
    }).catch(() => {
      window.clearTimeout(failAt);
      if (mine !== gen.current) return;
      setPhase('fail');
    });
  }, [account, nick]);

  useEffect(() => {
    load();
    return () => { gen.current++; };
  }, [load]);

  function openChan(ch: string) {
    client?.join(ch);
    setActive(ch);
    setModal('');
  }

  function inviteChan(ch: string) {
    sendChanServInvite(client, ch);
    setActive(ch);
    setModal('');
  }

  async function addAjoin() {
    const name = addChan.trim();
    if (!name || busy) return;
    setBusy('add');
    const ok = await nickServAjoinAdd(account, nick, name, addKey.trim());
    setBusy('');
    if (ok) { setAddChan(''); setAddKey(''); }
    load({ silent: true, force: true });
  }

  async function delAjoin(ch: string) {
    if (busy) return;
    setBusy(ch);
    await nickServAjoinDel(account, nick, ch);
    setBusy('');
    load({ silent: true, force: true });
  }

  return (
    <div className="scard nsinfo">
      <div className="scard__h">
        <span>🏠 {t('settings.account.alistTitle')}</span>
        <RefreshIconBtn
          onClick={() => load({ force: true })}
          disabled={phase === 'loading'}
          spinning={phase === 'loading'}
          label={t('profile.refresh')}
        />
      </div>
      <div className="scard__body">
        <p className="nsajoin__intro">{t('settings.account.ajoinIntro')}</p>
        {phase === 'loading' && <NickServWait label={t('settings.account.alistLoading')} />}
        {phase === 'fail' && <div className="sfield"><div className="sfield__intro">{t('settings.account.alistUnavailable')}</div></div>}
        {phase === 'empty' && <div className="sfield"><div className="sfield__intro">{t('settings.account.alistEmpty')}</div></div>}
        {phase === 'ok' && (
          <div className="nsaccess">
            {rows.map((row) => {
              const hasAccess = !!row.access;
              const acc = describeAlistAccess(row.access);
              const role = hasAccess
                ? (acc.labelKey ? t(`settings.account.alistRole.${acc.labelKey}`) : acc.code)
                : '';
              const canInvite = hasAccess && alistCanInvite(row.access);
              return (
                <div className="nsaccess-row" key={row.channel}>
                  <button type="button" className="nsaccess-main" onClick={() => openChan(row.channel)}>
                    <span className={`nsaccess-pfx nsaccess-pfx--${hasAccess ? (acc.labelKey || 'other') : 'ajoin'}`} aria-hidden>
                      {hasAccess ? (acc.prefix || '#') : '↪'}
                    </span>
                    <span className="nsaccess-txt">
                      <span className="nsaccess-chanline">
                        <span className="nsaccess-chan">{row.channel}</span>
                        {row.ajoin ? (
                          <span className="nsaccess-ajoin" title={t('settings.account.ajoinHint')}>
                            {t('settings.account.ajoinPill')}
                          </span>
                        ) : null}
                        {hasAccess ? (
                          <span className="nsaccess-keep" title={t('settings.account.accessPillHint')}>
                            {t('settings.account.accessPill')}
                          </span>
                        ) : null}
                        {row.noExpire ? (
                          <span className="nsaccess-keep" title={t('settings.account.alistNoExpireHint')}>
                            {t('settings.account.alistNoExpire')}
                          </span>
                        ) : null}
                      </span>
                      {row.description ? <span className="nsaccess-desc">{row.description}</span> : null}
                    </span>
                  </button>
                  <span className="nsaccess-meta">
                    {hasAccess ? (
                      <span className="nsaccess-role">
                        {acc.prefix ? <b>{acc.prefix}</b> : null}
                        {role}
                      </span>
                    ) : null}
                    {canInvite ? (
                      <button
                        type="button"
                        className="nsaccess-invite"
                        title={t('settings.account.alistInviteHint')}
                        onClick={() => inviteChan(row.channel)}
                      >
                        {t('settings.account.alistInvite')}
                      </button>
                    ) : null}
                    {row.ajoin ? (
                      <button
                        type="button"
                        className="nsaccess-del"
                        title={t('settings.account.ajoinDel')}
                        disabled={busy === row.channel}
                        onClick={() => void delAjoin(row.channel)}
                      >
                        {t('settings.account.ajoinDelShort')}
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {phase !== 'loading' && phase !== 'fail' ? (
          <div className="nsajoin-add">
            <div className="nsajoin-add__lab">{t('settings.account.ajoinAddLabel')}</div>
            <p className="nsajoin-add__hint">{t('settings.account.ajoinAddHint')}</p>
            <div className="nsajoin-add__row">
              <input
                className="modal__input"
                value={addChan}
                placeholder={t('settings.account.ajoinAddPlaceholder')}
                aria-label={t('settings.account.ajoinAddPlaceholder')}
                disabled={!!busy}
                onChange={(e) => setAddChan(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addAjoin()}
              />
              <input
                className="modal__input nsajoin-key"
                value={addKey}
                placeholder={t('settings.account.ajoinKeyPlaceholder')}
                aria-label={t('settings.account.ajoinKeyPlaceholder')}
                disabled={!!busy}
                onChange={(e) => setAddKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void addAjoin()}
              />
              <button
                className={`upbtn upbtn--primary ${busy === 'add' ? 'is-loading' : ''}`}
                type="button"
                onClick={() => void addAjoin()}
                disabled={!addChan.trim() || !!busy}
                title={t('settings.account.ajoinAddHint')}
              >
                {t('settings.account.ajoinAdd')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function NickServSearchCard({ account, nick }: { account: string; nick: string }) {
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState(false);
  const [isOper, setIsOper] = useState(false);
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ok' | 'empty' | 'deny'>('idle');
  const [hits, setHits] = useState<string[]>([]);
  const gen = useRef(0);

  useEffect(() => {
    let live = true;
    void fetchNickServHelp(account, nick).then((cmds) => {
      if (!live) return;
      setAllowed(!!cmds && cmds.has('LIST'));
      setIsOper(nickServHelpIsOper(cmds));
    });
    return () => { live = false; };
  }, [account, nick]);

  function toggleFlag(flag: string) {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag); else next.add(flag);
      return next;
    });
  }

  function search() {
    const q = pattern.trim();
    if (!q || phase === 'loading') return;
    const mine = ++gen.current;
    setPhase('loading');
    void fetchNickServList(account, nick, q, isOper ? [...flags] : []).then((res) => {
      if (mine !== gen.current) return;
      if (!res) { setHits([]); setPhase('deny'); return; }
      if (res.denied) { setHits([]); setPhase('deny'); return; }
      setHits(res.nicks);
      setPhase(res.nicks.length ? 'ok' : 'empty');
    });
  }

  if (!allowed) return null;

  return (
    <div className="scard nsinfo">
      <div className="scard__h">
        <span>🔎 {t('settings.account.nsSearchTitle')}</span>
      </div>
      <div className="scard__body nssearch">
        <p className="nssearch__intro">{t('settings.account.nsSearchIntro')}</p>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.nsSearchPattern')}</label>
          <div className="sfield__row">
            <input
              className="modal__input"
              value={pattern}
              placeholder={t('settings.account.nsSearchPlaceholder')}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
            />
            <button
              className={`upbtn upbtn--primary ${phase === 'loading' ? 'is-loading' : ''}`}
              type="button"
              onClick={search}
              disabled={!pattern.trim() || phase === 'loading'}
            >
              {phase === 'loading' ? t('settings.account.nsSearchLoading') : t('settings.account.nsSearchRun')}
            </button>
          </div>
        </div>
        {isOper ? (
          <div className="nsset nssearch__flags">
            {NICKSERV_LIST_FLAGS.map((flag) => {
              const on = flags.has(flag);
              const key = flag.toLowerCase();
              return (
                <div className="nsset-row" key={flag}>
                  <span className="nsset-row__lab">
                    {t(`settings.account.nsSearchFlag.${key}`)}
                    <button
                      type="button"
                      className="tipi"
                      title={t(`settings.account.nsSearchFlag.${key}Hint`)}
                      aria-label={t(`settings.account.nsSearchFlag.${key}Hint`)}
                    >i</button>
                  </span>
                  <button
                    type="button"
                    className={`switch${on ? ' is-on' : ''}`}
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggleFlag(flag)}
                  >
                    <span className="switch__dot" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        {phase === 'deny' ? <p className="nssearch__msg">{t('settings.account.nsSearchUnavailable')}</p> : null}
        {phase === 'empty' ? <p className="nssearch__msg">{t('settings.account.nsSearchEmpty')}</p> : null}
        {phase === 'ok' ? (
          <div className="nssearch__hits">
            {hits.map((n) => <span className="nsinfo-pill" key={n}>{n}</span>)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Change the account password — updates BOTH Anope (IRC) and Django (site).
function ChangePassword() {
  const { t } = useTranslation();
  const change = useActiveChat((s) => s.accountChangePassword);
  const [cur, setCur] = useState('');
  const [np, setNp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function go() {
    if (cur.length < 1 || np.trim().length < 6 || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await change(cur, np.trim());
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) { setCur(''); setNp(''); }
  }

  return (
    <div className="scard">
      <div className="scard__h">🔒 {t('settings.account.security')}</div>
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.currentPassword')}</label>
          <input className="modal__input" type="password" autoComplete="current-password"
            placeholder={t('settings.account.currentPassword')} value={cur}
            onChange={(e) => { setCur(e.target.value); setMsg(null); }} />
        </div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.newPassword')}</label>
          <div className="sfield__row">
            <input className="modal__input" type="password" autoComplete="new-password"
              placeholder={t('settings.account.minPassword')} value={np}
              onChange={(e) => { setNp(e.target.value); setMsg(null); }}
              onKeyDown={(e) => e.key === 'Enter' && go()} />
            <button className={`upbtn upbtn--primary ${busy ? 'is-loading' : ''}`} onClick={go}
              disabled={busy || cur.length < 1 || np.trim().length < 6}>
              {busy ? t('settings.account.updating') : t('settings.account.update')}
            </button>
          </div>
          {msg && (msg.ok ? <div className="sfield__ok">✓ {msg.text}</div> : <div className="sfield__err">{msg.text}</div>)}
        </div>
      </div>
    </div>
  );
}

// Create an account via IRCv3 draft/account-registration (REGISTER → e-mail
// code → VERIFY → the server auto-logs you in).
function RegisterForm() {
  const { t } = useTranslation();
  const nick = useActiveChat((s) => s.nick);
  const reg = useActiveChat((s) => s.reg);
  const doRegister = useActiveChat((s) => s.accountRegister);
  const doVerify = useActiveChat((s) => s.accountVerify);
  const doResend = useActiveChat((s) => s.accountResend);
  const reset = useActiveChat((s) => s.resetReg);
  const challengeComplete = useActiveChat((s) => s.accountChallengeComplete);

  const [account, setAccount] = useState(nick);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // Step 2: enter the e-mail verification code (+ anti-bot challenge if required).
  if (reg.step === 'code') {
    return (
      <div className="scard">
        <div className="scard__h">📧 {t('settings.account.verifyTitle')}</div>
        <div className="scard__body">
          {reg.challengeUrl ? (
            <div className="sfield">
              <div className="challenge">
                <div className="challenge__head">
                  <span className="challenge__icon" aria-hidden>🛡️</span>
                  <div>
                    <div className="challenge__title">{t('settings.account.antiBot')}</div>
                    <div className="challenge__txt">{t('settings.account.antiBotDesc')}</div>
                  </div>
                </div>
                {getConfig().turnstile.enabled ? (
                  <Turnstile sitekey={getConfig().turnstile.sitekey} theme={getTheme().includes('dark') ? 'dark' : 'light'}
                    onVerify={(tok) => challengeComplete(tok)}
                    onError={() => activeStore().setState((s) => ({ reg: { ...s.reg, error: t('settings.account.challengeLoadError') } }))} />
                ) : (
                  // turnstile.enabled=false: don't load Cloudflare's script — link to the verification page instead.
                  <a className="challenge__link" href={reg.challengeUrl} target="_blank" rel="noopener noreferrer">
                    {t('settings.account.challengeOpen')}
                  </a>
                )}
                {reg.busy && <div className="challenge__busy">{t('settings.account.validating')}</div>}
              </div>
            </div>
          ) : (
            <div className="sfield"><div className="sfield__intro">
              {reg.info ? reg.info : <span dangerouslySetInnerHTML={{ __html: t('settings.account.codeSentHtml', { email: escapeHtml(email || t('settings.account.yourEmail')), account: escapeHtml(reg.account) }) }} />}
            </div></div>
          )}
          <div className="sfield">
            <label className="sfield__label">{t('settings.account.verificationCode')}</label>
            <div className="sfield__row">
              <input className="modal__input" inputMode="numeric" placeholder={t('settings.account.totpCode')} value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && code.trim() && doVerify(code.trim())} />
              <button className={`upbtn upbtn--primary ${reg.busy ? 'is-loading' : ''}`}
                onClick={() => doVerify(code.trim())} disabled={!code.trim() || reg.busy}>
                {reg.busy ? t('settings.account.validating') : t('settings.account.verify')}
              </button>
            </div>
            {reg.error && <div className="sfield__err">{reg.error}</div>}
            <div className="reg-foot">
              <button className="linkbtn" onClick={() => doResend()}>{t('settings.account.resend')}</button>
              <button className="linkbtn" onClick={() => reset()}>{t('settings.account.restart')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: account / email / password.
  return (
    <div className="scard">
      <div className="scard__h">✨ {t('settings.account.createTitle')}</div>
      <div className="scard__body">
        <div className="sfield"><div className="sfield__intro">{t('settings.account.registerIntro')}</div></div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.nickLabel')}</label>
          <input className="modal__input" placeholder={t('settings.account.nickPlaceholder')} value={account} maxLength={30}
            onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.emailLabel')}</label>
          <input className="modal__input" type="email" autoComplete="email" placeholder={t('settings.account.emailPlaceholder')}
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="sfield">
          <label className="sfield__label">{t('settings.account.password')}</label>
          <input className="modal__input" type="password" autoComplete="new-password"
            placeholder={t('settings.account.minPassword')} value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {reg.error && <div className="sfield__err">{reg.error}</div>}
          <button className={`upbtn upbtn--primary ${reg.busy ? 'is-loading' : ''}`} style={{ marginTop: '.2rem' }}
            onClick={() => doRegister(account.trim(), email.trim(), password)}
            disabled={reg.busy || !account.trim() || !email.trim() || password.length < 6}>
            {reg.busy ? t('settings.account.creating') : t('settings.account.createCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
