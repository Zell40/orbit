import { useState, useEffect, useRef, useCallback } from 'react';
import { escapeHtml } from '@/lib/escape';
import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';
import { getTheme } from '@/themes';
import { Turnstile } from '@/components/Turnstile';
import { useActiveChat, activeStore } from '@/core/networks';
import { ChangeNickField } from '../ChangeNickField';
import { fetchNickServInfo, fetchNickServAlist, type NickServInfo, type NickServAccess } from '@/core/store/nickserv-info';

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
  if (account) {
    return (
      <>
        <div className={`login-card login-card--ok ${phase === 'success' ? 'is-burst' : ''}`}>
          <div className="login-card__check" aria-hidden>
            <svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M14 27 l8 8 l16 -18" /></svg>
          </div>
          <div className="login-card__title">{t('settings.account.loggedIn')}</div>
          <div className="login-card__sub">{t('settings.account.identifiedPre')} <strong>{account}</strong></div>
        </div>
        <NickServInfoCard account={account} nick={nick} />
        <NickServAlistCard account={account} nick={nick} />
        <ChangeNickField hint={t('settings.account.nickHint')} />
        <ChangePassword />
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

function NickServInfoCard({ account, nick }: { account: string; nick: string }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'loading' | 'ok' | 'empty'>('loading');
  const [info, setInfo] = useState<NickServInfo | null>(null);
  const gen = useRef(0);

  const load = useCallback(() => {
    const mine = ++gen.current;
    setPhase('loading');
    void fetchNickServInfo(account, nick).then((parsed) => {
      if (mine !== gen.current) return;
      if (!parsed) { setInfo(null); setPhase('empty'); return; }
      setInfo(parsed);
      setPhase('ok');
    });
  }, [account, nick]);

  useEffect(() => {
    load();
    return () => { gen.current++; };
  }, [load]);

  return (
    <div className="scard nsinfo">
      <div className="scard__h">
        <span>🪪 {t('settings.account.nickservTitle')}</span>
        <button className="linkbtn nsinfo__refresh" type="button" onClick={() => load()}
          disabled={phase === 'loading'}>{t('profile.refresh')}</button>
      </div>
      <div className="scard__body">
        {phase === 'loading' && <div className="sfield"><div className="sfield__intro">{t('settings.account.nickservLoading')}</div></div>}
        {phase === 'empty' && <div className="sfield"><div className="sfield__intro">{t('settings.account.nickservUnavailable')}</div></div>}
        {phase === 'ok' && info && (
          <dl className="nsinfo-dl">
            {info.rows.map((row, i) => (
              <div className="nsinfo-row" key={`${row.key}-${i}`}>
                <dt className="nsinfo-row__k">{row.key}</dt>
                <dd className="nsinfo-row__v">
                  {row.pills?.length
                    ? <span className="nsinfo-pills">{row.pills.map((p) => <span className="nsinfo-pill" key={p}>{p}</span>)}</span>
                    : row.value || '—'}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function NickServAlistCard({ account, nick }: { account: string; nick: string }) {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const setActive = useActiveChat((s) => s.setActive);
  const setModal = useActiveChat((s) => s.setModal);
  const [phase, setPhase] = useState<'loading' | 'ok' | 'empty' | 'fail'>('loading');
  const [rows, setRows] = useState<NickServAccess[]>([]);
  const gen = useRef(0);

  const load = useCallback(() => {
    const mine = ++gen.current;
    setPhase('loading');
    void fetchNickServAlist(account, nick).then((list) => {
      if (mine !== gen.current) return;
      if (!list) { setRows([]); setPhase('fail'); return; }
      setRows(list);
      setPhase(list.length ? 'ok' : 'empty');
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

  return (
    <div className="scard nsinfo">
      <div className="scard__h">
        <span>🏠 {t('settings.account.alistTitle')}</span>
        <button className="linkbtn nsinfo__refresh" type="button" onClick={() => load()}
          disabled={phase === 'loading'}>{t('profile.refresh')}</button>
      </div>
      <div className="scard__body">
        {phase === 'loading' && <div className="sfield"><div className="sfield__intro">{t('settings.account.alistLoading')}</div></div>}
        {phase === 'fail' && <div className="sfield"><div className="sfield__intro">{t('settings.account.alistUnavailable')}</div></div>}
        {phase === 'empty' && <div className="sfield"><div className="sfield__intro">{t('settings.account.alistEmpty')}</div></div>}
        {phase === 'ok' && (
          <div className="nsaccess">
            {rows.map((row) => (
              <div className="nsaccess-row" key={row.channel}>
                <div className="nsaccess-txt">
                  <button type="button" className="nsaccess-chan" onClick={() => openChan(row.channel)}>{row.channel}</button>
                  {row.description ? <div className="nsaccess-desc">{row.description}</div> : null}
                </div>
                <span className="nsinfo-pill">{row.access}</span>
              </div>
            ))}
          </div>
        )}
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
