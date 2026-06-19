import { useState, useEffect, useRef, type CSSProperties } from 'react';
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

export function ConnectScreen() {
  const cfg = getConfig();
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
    error: 'Connexion impossible. Réessaie dans un instant.',
    closed: 'La connexion a été fermée.',
    'sasl-failed': 'Pseudo ou mot de passe incorrect.',
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
              placeholder="Écris ton pseudo pour entrer…"
              aria-label="Pseudo"
              onChange={(e) => setNick(e.target.value)}
            />
            <button type="submit" className="cjoin__send" disabled={connecting || !ready} aria-label="Entrer">
              {connecting ? <span className="cjoin__sendspin" /> : <span className="arr">➔</span>}
            </button>
          </div>

          <div className="cjoin__row">
            <span className="cjoin__chip">Tu entres dans&nbsp;<b>{chan}</b></span>
            <button type="button" className="cjoin__pw-t" onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'Masquer le mot de passe' : 'Pseudo déjà enregistré ?'}
            </button>
          </div>

          {showPw && (
            <input
              className="cjoin__pw"
              type="password"
              name="password"
              value={password}
              placeholder="Mot de passe (si ton pseudo est enregistré)"
              aria-label="Mot de passe"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          )}

          {errors[status] && <div className="cjoin__err">⚠ {errors[status]}</div>}
        </form>

        <div className="cjoin__trust">
          <span>🔒 Chiffré de bout en bout</span>
          <span className="sep">·</span>
          <span>Aucune inscription</span>
          <span className="sep">·</span>
          <span>IRCv3</span>
        </div>
      </section>

      <LiveFeed chan={chan} />
    </div>
  );
}
