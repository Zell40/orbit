import { useState, useEffect, useRef } from 'react';
import { useChat } from '../../store';
import { getConfig } from '../../config';
import { getTheme, setTheme, type Theme } from '../../ui/theme';
import { isPushSupported, pushEnabledPref, enablePush, disablePush } from '../../services/push';
import { Avatar } from '../Avatar';
import { Turnstile } from '../Turnstile';

const SETTINGS_SECTIONS = [
  { id: 'profil',    icon: '👤', label: 'Profil',        desc: 'Pseudo & avatar' },
  { id: 'apparence', icon: '🎨', label: 'Apparence',     desc: 'Thème & affichage' },
  { id: 'notifs',    icon: '🔔', label: 'Notifications', desc: 'Alertes & sons' },
  { id: 'compte',    icon: '🔑', label: 'Compte',        desc: 'Connexion & sécurité' },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

export function SettingsModal() {
  const setModal = useChat((s) => s.setModal);
  const account = useChat((s) => s.account);
  const [section, setSection] = useState<SettingsSection>('profil');
  const [drilled, setDrilled] = useState(false); // mobile: are we inside a section?
  const close = () => setModal('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = SETTINGS_SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="settings-backdrop" onClick={close}>
      <div className={`settings ${drilled ? 'is-drilled' : ''}`} onClick={(e) => e.stopPropagation()}>
        {/* left rail (desktop) / section list (mobile) */}
        <aside className="settings__nav">
          <div className="settings__brand">
            <span className="settings__brand-title">Réglages</span>
            <button className="settings__close" onClick={close} aria-label="Fermer">✕</button>
          </div>
          <nav className="settings__navlist">
            {SETTINGS_SECTIONS.map((s) => (
              <button key={s.id} className={`settings__navitem ${section === s.id ? 'is-on' : ''}`}
                onClick={() => { setSection(s.id); setDrilled(true); }}>
                <span className="settings__navic" aria-hidden>{s.icon}</span>
                <span className="settings__navtxt">
                  <span className="settings__navlabel">{s.label}</span>
                  <span className="settings__navdesc">{s.id === 'compte' && account ? `@${account}` : s.desc}</span>
                </span>
                <span className="settings__navchev" aria-hidden>›</span>
              </button>
            ))}
          </nav>
          <a className="settings__about" href={getConfig().branding.projectUrl} target="_blank" rel="noopener noreferrer">
            <span className="settings__about-mark" aria-hidden>◐</span>
            <span className="settings__about-txt">
              <span className="settings__about-name">Propulsé par Orbit</span>
              <span className="settings__about-sub">client IRCv3 · code & projet ↗</span>
            </span>
          </a>
        </aside>

        {/* content pane */}
        <section className="settings__pane">
          <header className="settings__top">
            <button className="settings__back" onClick={() => setDrilled(false)} aria-label="Retour">‹</button>
            <span className="settings__top-ic" aria-hidden>{cur.icon}</span>
            <h3 className="settings__top-title">{cur.label}</h3>
            <button className="settings__close settings__close--pane" onClick={close} aria-label="Fermer">✕</button>
          </header>
          <div className="settings__content" key={section}>
            {section === 'profil' && <ProfileSection />}
            {section === 'apparence' && <AppearanceSection />}
            {section === 'notifs' && <NotificationsSection />}
            {section === 'compte' && <LoginTab />}
          </div>
        </section>
      </div>
    </div>
  );
}

// One toggle row: icon · label/hint · switch.
function PushRow() {
  const client = useChat((s) => s.client);
  const supported = isPushSupported();
  const [on, setOn] = useState(pushEnabledPref());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hasVapid = !!client?.vapid;

  async function toggle() {
    if (!client || busy) return;
    setBusy(true); setErr('');
    if (on) {
      await disablePush(client);
      setOn(false);
    } else {
      const r = await enablePush(client);
      if (r.ok) setOn(true);
      else setErr(r.reason === 'denied' ? 'Autorisation refusée.' : r.reason === 'no-vapid' ? 'Indisponible sur ce serveur.' : 'Échec de l’activation.');
    }
    setBusy(false);
  }

  const hint = !supported ? 'Non pris en charge par ce navigateur.'
    : !hasVapid ? 'Indisponible sur ce serveur.'
    : err ? err
    : on ? 'Actif — alertes même app fermée (au mieux si connecté à ton compte).'
    : 'Reçois les MP et mentions même quand l’app est fermée.';

  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>📲</span>
      <div className="srow__txt">
        <div className="srow__label">Notifications push</div>
        <div className="srow__hint" style={err ? { color: 'var(--danger, #d33)' } : undefined}>{hint}</div>
      </div>
      {supported && hasVapid
        ? <button className={`switch ${on ? 'is-on' : ''} ${busy ? 'is-busy' : ''}`} role="switch" aria-checked={on}
            aria-label="Notifications push" disabled={busy} onClick={toggle}><span className="switch__dot" /></button>
        : <span className="srow__hint">—</span>}
    </div>
  );
}

function ToggleRow({ icon, label, hint, prefKey }: { icon: string; label: string; hint?: string; prefKey: 'sound' | 'hideJoinQuit' | 'compact' }) {
  const value = useChat((s) => s.prefs[prefKey]);
  const setPref = useChat((s) => s.setPref);
  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>{icon}</span>
      <div className="srow__txt">
        <div className="srow__label">{label}</div>
        {hint && <div className="srow__hint">{hint}</div>}
      </div>
      <button className={`switch ${value ? 'is-on' : ''}`} role="switch" aria-checked={value}
        aria-label={label} onClick={() => setPref(prefKey, !value)}><span className="switch__dot" /></button>
    </div>
  );
}

function HighlightWordsRow() {
  const words = useChat((s) => s.highlightWords);
  const setWords = useChat((s) => s.setHighlightWords);
  const [val, setVal] = useState(words.join(', '));
  const save = () => setWords(val.split(',').map((w) => w.trim()).filter(Boolean));
  return (
    <div className="sfield">
      <label className="sfield__label">🔆 Mots-clés de surbrillance</label>
      <div className="sfield__row">
        <input className="modal__input" value={val} placeholder="ex : tchatou, rdv, urgent"
          onChange={(e) => setVal(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </div>
      <div className="srow__hint" style={{ marginTop: '.3rem' }}>En plus de ton pseudo, ces mots déclenchent une alerte (séparés par des virgules).</div>
    </div>
  );
}

function ProfileSection() {
  const client = useChat((s) => s.client);
  const nick = useChat((s) => s.nick);
  const account = useChat((s) => s.account);

  return (
    <>
      <div className="scard">
        <div className="scard__body">
          <div className="srow">
            <span className="srow__ic" style={{ background: 'transparent', padding: 0 }}><Avatar nick={nick} size={42} account={account} /></span>
            <div className="srow__txt">
              <div className="srow__label">{nick}</div>
              <div className="srow__hint">{account ? <>Connecté · <strong style={{ color: 'var(--green-d)' }}>@{account}</strong></> : 'Invité — non connecté'}</div>
            </div>
          </div>
        </div>
      </div>

      <button className="set-leave" onClick={() => { client?.disconnect(); location.reload(); }}>Quitter le tchat</button>
    </>
  );
}

// Change the current IRC nick — lives in the Compte section so you can align
// your pseudo with your account name BEFORE identifying.
function ChangeNickField({ hint }: { hint: string }) {
  const client = useChat((s) => s.client);
  const nick = useChat((s) => s.nick);
  const [newNick, setNewNick] = useState(nick);
  // Keep the field in sync if the server confirms a nick change elsewhere.
  useEffect(() => { setNewNick(nick); }, [nick]);

  function applyNick() {
    const n = newNick.trim();
    if (n && n !== nick) client?.setNick(n);
  }

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">Changer de pseudo</label>
          <div className="sfield__row">
            <input className="modal__input" value={newNick} maxLength={30}
              onChange={(e) => setNewNick(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyNick()} />
            <button className="upbtn" onClick={applyNick} disabled={!newNick.trim() || newNick.trim() === nick}>Changer</button>
          </div>
          <div className="srow__hint" style={{ marginTop: '.3rem' }}>{hint}</div>
        </div>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const clock24 = useChat((s) => s.prefs.clock24);
  const setPref = useChat((s) => s.setPref);
  const [theme, setT] = useState<Theme>(getTheme());
  function pick(t: Theme) { setT(t); setTheme(t); }

  const THEME_OPTS: Array<{ id: Theme; icon: string; label: string }> = [
    { id: 'light', icon: '☀️', label: 'Clair' },
    { id: 'dark', icon: '🌙', label: 'Sombre' },
    { id: 'orbit', icon: '🛰️', label: 'Orbit' },
    { id: 'orbit-dark', icon: '🌑', label: 'Orbit sombre' },
    { id: 'yomirc', icon: '🖥️', label: 'yomIRC' },
    { id: 'yomirc-dark', icon: '🌑', label: 'yomIRC nuit' },
  ];

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">Thème</label>
          <div className="theme-grid">
            {THEME_OPTS.map((t) => (
              <button key={t.id} className={`theme-opt ${theme === t.id ? 'is-on' : ''}`} onClick={() => pick(t.id)}>
                <span className="theme-opt__ic" aria-hidden>{t.icon}</span>
                <span className="theme-opt__label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
        <ToggleRow icon="🗜️" label="Mode compact" hint="Messages plus denses, plus d’infos à l’écran." prefKey="compact" />
        <div className="srow">
          <span className="srow__ic" aria-hidden>🕓</span>
          <div className="srow__txt"><div className="srow__label">Format de l’heure</div></div>
          <div className="srow__ctrl"><div className="sseg">
            <button className={clock24 ? 'is-on' : ''} onClick={() => setPref('clock24', true)}>24 h</button>
            <button className={!clock24 ? 'is-on' : ''} onClick={() => setPref('clock24', false)}>12 h</button>
          </div></div>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [notif, setNotif] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported');
  function askNotif() {
    if ('Notification' in window) Notification.requestPermission().then(setNotif);
  }

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="srow">
          <span className="srow__ic" aria-hidden>🔔</span>
          <div className="srow__txt">
            <div className="srow__label">Notifications navigateur</div>
            <div className="srow__hint">{notif === 'granted' ? 'Tu seras alerté hors de l’onglet.' : notif === 'denied' ? 'Bloquées dans ton navigateur.' : 'Reçois une alerte même hors de l’onglet.'}</div>
          </div>
          <div className="srow__ctrl">
            {notif === 'granted' ? <span className="sbadge-ok">✓ Activées</span>
              : notif === 'unsupported' || notif === 'denied' ? <span className="srow__hint">—</span>
              : <button className="upbtn upbtn--sm" onClick={askNotif}>Activer</button>}
          </div>
        </div>
        {getConfig().features.push && <PushRow />}
        <ToggleRow icon="🔊" label="Sons" hint="Un bip sur mention ou message privé." prefKey="sound" />
        <ToggleRow icon="🙈" label="Masquer entrées / sorties" hint="Cache les « a rejoint / a quitté »." prefKey="hideJoinQuit" />
        <HighlightWordsRow />
      </div>
    </div>
  );
}

function LoginTab() {
  const client = useChat((s) => s.client);
  const account = useChat((s) => s.account);
  const nick = useChat((s) => s.nick);
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
          <div className="login-card__title">Connecté</div>
          <div className="login-card__sub">Tu es identifié comme <strong>{account}</strong></div>
        </div>
        <ChangeNickField hint="Change le pseudo affiché dans les salons." />
        <ChangePassword />
        <button className="set-leave" onClick={logout}>Se déconnecter du compte</button>
      </>
    );
  }

  // Not logged in → login / register switcher (register hidden if disabled in config).
  const canRegister = getConfig().features.register;
  return (
    <>
      {canRegister && (
        <div className="login-switch">
          <button className={mode === 'login' ? 'is-on' : ''} onClick={() => setMode('login')}>Se connecter</button>
          <button className={mode === 'register' ? 'is-on' : ''} onClick={() => setMode('register')}>Créer un compte</button>
        </div>
      )}

      {(mode === 'login' || !canRegister) ? (
        <div className="scard">
          <div className="scard__h">🔑 Se connecter</div>
          <div className="scard__body">
            <div className="sfield">
              <div className="sfield__intro">Identifie-toi à ton compte enregistré, quel que soit ton pseudo actuel — on te renomme automatiquement.</div>
            </div>
            <div className="sfield">
              <label className="sfield__label">Compte</label>
              <input className="modal__input" autoComplete="username" placeholder="Nom du compte" value={acct} maxLength={30}
                onChange={(e) => { setAcct(e.target.value); if (phase === 'error') setPhase('idle'); }}
                onKeyDown={(e) => e.key === 'Enter' && login()} />
            </div>
            <div className="sfield">
              <label className="sfield__label">Mot de passe</label>
              <div className="sfield__row">
                <input className="modal__input" type="password" autoComplete="current-password"
                  placeholder="Mot de passe" value={pw}
                  onChange={(e) => { setPw(e.target.value); if (phase === 'error') setPhase('idle'); }}
                  onKeyDown={(e) => e.key === 'Enter' && login()} />
                <button className={`upbtn upbtn--primary ${phase === 'pending' ? 'is-loading' : ''}`}
                  onClick={login} disabled={!acct.trim() || !pw.trim() || phase === 'pending'}>
                  {phase === 'pending' ? 'Connexion…' : 'Se connecter'}
                </button>
              </div>
              {phase === 'error' && <div className="sfield__err">Compte inconnu ou mot de passe incorrect.</div>}
            </div>
          </div>
        </div>
      ) : (
        <RegisterForm />
      )}
    </>
  );
}

// Change the account password — updates BOTH Anope (IRC) and Django (site).
function ChangePassword() {
  const change = useChat((s) => s.accountChangePassword);
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
      <div className="scard__h">🔒 Sécurité</div>
      <div className="scard__body">
        <div className="sfield">
          <label className="sfield__label">Mot de passe actuel</label>
          <input className="modal__input" type="password" autoComplete="current-password"
            placeholder="Mot de passe actuel" value={cur}
            onChange={(e) => { setCur(e.target.value); setMsg(null); }} />
        </div>
        <div className="sfield">
          <label className="sfield__label">Nouveau mot de passe</label>
          <div className="sfield__row">
            <input className="modal__input" type="password" autoComplete="new-password"
              placeholder="Min. 6 caractères" value={np}
              onChange={(e) => { setNp(e.target.value); setMsg(null); }}
              onKeyDown={(e) => e.key === 'Enter' && go()} />
            <button className={`upbtn upbtn--primary ${busy ? 'is-loading' : ''}`} onClick={go}
              disabled={busy || cur.length < 1 || np.trim().length < 6}>
              {busy ? 'Maj…' : 'Mettre à jour'}
            </button>
          </div>
          {msg && (msg.ok ? <div className="sfield__ok">✓ {msg.text}</div> : <div className="sfield__err">{msg.text}</div>)}
        </div>
      </div>
    </div>
  );
}

// Create a Tchatou account via IRCv3 draft/account-registration (REGISTER → e-mail
// code → VERIFY → the server auto-logs you in).
function RegisterForm() {
  const nick = useChat((s) => s.nick);
  const reg = useChat((s) => s.reg);
  const doRegister = useChat((s) => s.accountRegister);
  const doVerify = useChat((s) => s.accountVerify);
  const doResend = useChat((s) => s.accountResend);
  const reset = useChat((s) => s.resetReg);
  const challengeComplete = useChat((s) => s.accountChallengeComplete);

  const [account, setAccount] = useState(nick);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  // Step 2: enter the e-mail verification code (+ anti-bot challenge if required).
  if (reg.step === 'code') {
    return (
      <div className="scard">
        <div className="scard__h">📧 Vérification</div>
        <div className="scard__body">
          {reg.challengeUrl ? (
            <div className="sfield">
              <div className="challenge">
                <div className="challenge__head">
                  <span className="challenge__icon" aria-hidden>🛡️</span>
                  <div>
                    <div className="challenge__title">Vérification anti-robot</div>
                    <div className="challenge__txt">Valide ce rapide défi. Ton code te sera ensuite envoyé par e-mail.</div>
                  </div>
                </div>
                <Turnstile sitekey={getConfig().turnstile.sitekey} theme={getTheme().includes('dark') ? 'dark' : 'light'}
                  onVerify={(t) => challengeComplete(t)}
                  onError={() => useChat.setState((s) => ({ reg: { ...s.reg, error: 'Le défi anti-robot n’a pas pu se charger. Réessaie.' } }))} />
                {reg.busy && <div className="challenge__busy">Validation…</div>}
              </div>
            </div>
          ) : (
            <div className="sfield"><div className="sfield__intro">
              {reg.info ? reg.info : <>📧 Un code a été envoyé à <strong>{email || 'ton e-mail'}</strong>. Saisis-le pour activer <strong>{reg.account}</strong>.</>}
            </div></div>
          )}
          <div className="sfield">
            <label className="sfield__label">Code de vérification</label>
            <div className="sfield__row">
              <input className="modal__input" inputMode="numeric" placeholder="Ex : 123456" value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && code.trim() && doVerify(code.trim())} />
              <button className={`upbtn upbtn--primary ${reg.busy ? 'is-loading' : ''}`}
                onClick={() => doVerify(code.trim())} disabled={!code.trim() || reg.busy}>
                {reg.busy ? 'Vérification…' : 'Valider'}
              </button>
            </div>
            {reg.error && <div className="sfield__err">{reg.error}</div>}
            <div className="reg-foot">
              <button className="linkbtn" onClick={() => doResend()}>Renvoyer le code</button>
              <button className="linkbtn" onClick={() => reset()}>Recommencer</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: account / email / password.
  return (
    <div className="scard">
      <div className="scard__h">✨ Créer un compte</div>
      <div className="scard__body">
        <div className="sfield"><div className="sfield__intro">Choisis un pseudo, ton e-mail et un mot de passe. Tu recevras un code pour valider.</div></div>
        <div className="sfield">
          <label className="sfield__label">Pseudo</label>
          <input className="modal__input" placeholder="Pseudo" value={account} maxLength={30}
            onChange={(e) => setAccount(e.target.value)} />
        </div>
        <div className="sfield">
          <label className="sfield__label">E-mail</label>
          <input className="modal__input" type="email" autoComplete="email" placeholder="toi@exemple.fr"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="sfield">
          <label className="sfield__label">Mot de passe</label>
          <input className="modal__input" type="password" autoComplete="new-password"
            placeholder="Min. 6 caractères" value={password}
            onChange={(e) => setPassword(e.target.value)} />
          {reg.error && <div className="sfield__err">{reg.error}</div>}
          <button className={`upbtn upbtn--primary ${reg.busy ? 'is-loading' : ''}`} style={{ marginTop: '.2rem' }}
            onClick={() => doRegister(account.trim(), email.trim(), password)}
            disabled={reg.busy || !account.trim() || !email.trim() || password.length < 6}>
            {reg.busy ? 'Création…' : 'Créer mon compte'}
          </button>
        </div>
      </div>
    </div>
  );
}

