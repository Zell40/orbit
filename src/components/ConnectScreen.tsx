import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat } from '../store';
import { getConfig } from '../config';

function param(name: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

// Ambient chatter for the live-room preview (decorative — aria-hidden). Warm, French,
// no impersonation of real users; it conveys "the room is alive" before you join.
type Line = { who: string; hue: number; text: string; react?: string };
const POOL: Line[] = [
  { who: 'Marina', hue: 8, text: 'coucou tout le monde 👋' },
  { who: 'Lucas', hue: 205, text: 'quelqu’un de Lyon ce soir ?' },
  { who: 'Inès', hue: 322, text: 'j’adore l’ambiance ici 🥰', react: '❤️' },
  { who: 'Théo', hue: 150, text: 'salut Marina !' },
  { who: 'Jade', hue: 265, text: 'bonsoir la compagnie 🌙' },
  { who: 'Naël', hue: 32, text: 'on parle de quoi ce soir ?' },
  { who: 'Sofia', hue: 188, text: 'haha excellent 😂', react: '😂' },
  { who: 'Hugo', hue: 96, text: 'bienvenue Jade 🙌' },
  { who: 'Léa', hue: 340, text: 'quelqu’un pour papoter ?' },
  { who: 'Adam', hue: 228, text: 'cette playlist envoie 🎶' },
  { who: 'Camille', hue: 50, text: 'première fois ici, c’est sympa !' },
  { who: 'Yanis', hue: 170, text: 'oui carrément 😌' },
  { who: 'Manon', hue: 300, text: 'on est nombreux ce soir 😮' },
  { who: 'Eliott', hue: 120, text: 'bonsoir tout le monde ✨' },
];

function avaStyle(hue: number): CSSProperties {
  return { background: `linear-gradient(140deg, hsl(${hue},58%,55%), hsl(${(hue + 38) % 360},56%,45%))` };
}

// Isolated so the streaming interval never re-renders the join form.
function LiveFeed({ chan }: { chan: string }) {
  const [msgs, setMsgs] = useState<(Line & { id: number })[]>(
    () => POOL.slice(0, 4).map((l, i) => ({ ...l, id: i })),
  );
  const [typing, setTyping] = useState('');
  const idx = useRef(4);

  useEffect(() => {
    let alive = true;
    let toMsg = 0;
    let toNext = 0;
    const step = () => {
      const next = POOL[idx.current % POOL.length];
      setTyping(next.who);
      toMsg = window.setTimeout(() => {
        if (!alive) return;
        setTyping('');
        setMsgs((m) => [...m.slice(-6), { ...next, id: idx.current }]);
        idx.current += 1;
        toNext = window.setTimeout(step, 1500 + Math.random() * 900);
      }, 850);
    };
    const start = window.setTimeout(step, 1200);
    return () => { alive = false; clearTimeout(start); clearTimeout(toMsg); clearTimeout(toNext); };
  }, []);

  return (
    <aside className="cfeed" aria-hidden="true">
      <div className="cfeed__head">
        <span className="cfeed__tag">{chan}</span>
        <span className="cfeed__count"><i />en direct</span>
      </div>
      <div className="cfeed__stream">
        {msgs.map((m) => (
          <div className="cmsg" key={m.id}>
            <span className="cmsg__ava" style={avaStyle(m.hue)}>{m.who[0]}</span>
            <div className="cmsg__body">
              <div className="cmsg__who" style={{ color: `hsl(${m.hue},55%,70%)` }}>{m.who}</div>
              <span className="cmsg__bubble">{m.text}</span>
              {m.react && <span className="cmsg__react">{m.react}</span>}
            </div>
          </div>
        ))}
        <div className="ctyping">
          {typing
            ? <><span>{typing} écrit</span><span className="ctyping__dots"><i /><i /><i /></span></>
            : <span className="ctyping__dots"><i /><i /><i /></span>}
        </div>
      </div>
    </aside>
  );
}

// Aide / FAQ — a polished in-app help overlay reachable from the welcome. `focus`
// pre-opens one entry (e.g. "register" or "forgot" from the welcome links).
type Faq = { id: string; q: string; a: ReactNode };
function FaqOverlay({ focus, onClose }: { focus: string; onClose: () => void }) {
  const cfg = getConfig();
  const site = cfg.branding.url.replace(/^https?:\/\//, '');
  const [open, setOpen] = useState(focus);
  const items: Faq[] = [
    { id: 'register', q: 'Comment créer un compte ?', a: (
      <>Pas besoin de t’inscrire pour discuter — mais un compte <b>réserve ton pseudo</b> et garde ton avatar, ton 2FA et tes réglages.
        <ol className="cfaq__steps">
          <li>Entre d’abord avec le pseudo que tu veux garder.</li>
          <li>Ouvre les <b>Réglages</b> (⚙, en bas à gauche) → onglet <b>Compte</b>.</li>
          <li>Choisis <b>« Créer un compte »</b>, indique ton e-mail et un mot de passe.</li>
          <li>Saisis le code reçu par e-mail — ton pseudo est protégé ✅</li>
        </ol></>) },
    { id: 'forgot', q: 'J’ai oublié mon mot de passe', a: (
      <>Si tu es <b>encore connecté</b> à ton compte, change-le dans <b>Réglages → Compte → Sécurité</b>.<br />
        Sinon, demande de l’aide à un modérateur dans le salon, ou via <a href={cfg.branding.url} target="_blank" rel="noopener">{site}</a> — la réinitialisation par e-mail arrive bientôt.</>) },
    { id: 'free', q: 'C’est vraiment gratuit ?', a: <>Oui, entièrement. Aucun paiement, aucune publicité. {cfg.branding.name} est un service ouvert.</> },
    { id: 'noaccount', q: 'Suis-je obligé de m’inscrire ?', a: <>Non. Choisis un pseudo et tu es dans le salon. Le compte est <b>optionnel</b> : il sert à protéger ton identité.</> },
    { id: 'taken', q: 'Mon pseudo est déjà pris', a: <>Un pseudo protégé appartient à un compte. Si c’est le tien, clique <b>« Pseudo déjà enregistré ? »</b> pour t’identifier. Sinon, choisis-en un autre.</> },
    { id: 'privacy', q: 'Mes conversations sont-elles privées ?', a: <>La connexion est <b>chiffrée</b> (TLS) et il n’y a aucune revente de données. Les messages privés ne circulent qu’entre toi et ton interlocuteur.</> },
    { id: 'mobile', q: 'Ça marche sur mobile ?', a: <>Oui — c’est une appli installable (PWA). Depuis ton navigateur, « Ajouter à l’écran d’accueil » et tu l’as comme une vraie appli, notifications comprises.</> },
    { id: 'what', q: `C’est quoi ${cfg.branding.name} ?`, a: <>Un tchat français en direct, bâti sur le protocole ouvert <b>IRCv3</b> et propulsé par <a href={cfg.branding.projectUrl} target="_blank" rel="noopener">Orbit</a>, un client web libre.</> },
  ];
  return (
    <div className="cfaq-scrim" onClick={onClose}>
      <div className="cfaq" role="dialog" aria-label="Aide et FAQ" onClick={(e) => e.stopPropagation()}>
        <div className="cfaq__head">
          <span className="ic"><img src={cfg.branding.icon} alt="" width={18} height={18} style={{ borderRadius: 4 }} /></span>
          <h2>Aide &amp; FAQ</h2>
          <button className="cfaq__close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="cfaq__body">
          {items.map((it) => (
            <div className={`cfaq__item ${open === it.id ? 'is-open' : ''}`} key={it.id}>
              <button className="cfaq__q" onClick={() => setOpen(open === it.id ? '' : it.id)}>
                {it.q}<span className="chev">›</span>
              </button>
              <div className="cfaq__a">{it.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ConnectScreen() {
  const { t } = useTranslation();
  const cfg = getConfig();
  const [faq, setFaq] = useState<string | null>(null);
  const connect = useChat((s) => s.connect);
  const status = useChat((s) => s.status);
  const [nick, setNick] = useState(param('nick', ''));
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  // `channel` may be a comma-separated list, e.g. "#rencontre,#taverne" — join
  // them all (the first is the active/primary one). Defaults come from config.
  const channels = param('channel', cfg.startup.channels.join(','))
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => (c.startsWith('#') || c.startsWith('&') ? c : `#${c}`));
  if (!channels.length) channels.push(...cfg.startup.channels);
  const chan = channels[0];

  const connecting = status === 'connecting';
  const ready = nick.trim().length >= 2;
  const errors: Record<string, string> = {
    error: t('connect.error_error'),
    closed: t('connect.error_closed'),
    'sasl-failed': t('connect.error_sasl'),
  };

  function go() {
    if (!ready) return;
    connect({ url: cfg.server.url, nick: nick.trim(), password: password || undefined, channels });
  }

  return (
    <div className="connect">
      <section className="cjoin">
        <div className="cjoin__brand">
          <span className="cjoin__mark"><img src={cfg.branding.icon} alt="" /></span>
          <span className="cjoin__name"><span className="at">@</span>{cfg.branding.name}</span>
          <span className="cjoin__dot"><i />en direct</span>
        </div>

        <h1 className="cjoin__title">
          {cfg.branding.tagline}<br />
          <em>{cfg.branding.taglineEm}</em>
        </h1>
        <p className="cjoin__sub">{cfg.branding.subtitle}</p>

        <form onSubmit={(e) => { e.preventDefault(); go(); }}>
          <div className="cjoin__composer">
            <span className="cjoin__ava">{nick.trim() ? nick.trim()[0].toUpperCase() : '?'}</span>
            <input
              className="cjoin__input"
              name="nick"
              value={nick}
              maxLength={30}
              autoFocus
              autoComplete="off"
              placeholder={t('connect.pseudoPlaceholder')}
              aria-label="Pseudo"
              onChange={(e) => setNick(e.target.value)}
            />
            <button type="submit" className="cjoin__send" disabled={connecting || !ready} aria-label={t('connect.enter')}>
              {connecting ? <span className="cjoin__sendspin" /> : <span className="arr">➔</span>}
            </button>
          </div>

          <div className="cjoin__row">
            <span className="cjoin__chip">{t('connect.joinHint')}&nbsp;<b>{chan}</b></span>
            <button type="button" className="cjoin__pw-t" onClick={() => setShowPw((v) => !v)}>
              {showPw ? t('connect.hidePassword') : t('connect.registered')}
            </button>
          </div>

          {showPw && (
            <input
              className="cjoin__pw"
              type="password"
              name="password"
              value={password}
              placeholder={t('connect.passwordPlaceholder')}
              aria-label={t('connect.passwordLabel')}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          )}

          {errors[status] && <div className="cjoin__err">⚠ {errors[status]}</div>}
        </form>

        <div className="cjoin__links">
          <button type="button" className="primary" onClick={() => setFaq('register')}>{t('connect.createButton')}</button>
          <span className="d">·</span>
          <button type="button" onClick={() => setFaq('forgot')}>{t('connect.forgotButton')}</button>
          <span className="d">·</span>
          <button type="button" onClick={() => setFaq('')}>{t('connect.helpButton')}</button>
        </div>

        <div className="cjoin__trust">
          <span>🔒 {t('connect.encrypted')}</span>
          <span className="sep">·</span>
          <span>{t('connect.noData')}</span>
          <span className="sep">·</span>
          <span>IRCv3</span>
        </div>
      </section>

      <LiveFeed chan={chan} />

      {faq !== null && <FaqOverlay focus={faq} onClose={() => setFaq(null)} />}
    </div>
  );
}
