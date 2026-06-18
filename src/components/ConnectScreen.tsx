import { useState } from 'react';
import { useChat } from '../store';
import { getConfig } from '../config';

function param(name: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

// Decorative "presence" bubbles — a hint of the people already inside.
const PEOPLE: { n: string; x: number; y: number; s: number; g: string; d: number }[] = [
  { n: 'Marina', x: 8, y: 22, s: 56, g: 'linear-gradient(140deg,#2a6bff,#5bd0ff)', d: 0 },
  { n: 'Lucas', x: 86, y: 16, s: 48, g: 'linear-gradient(140deg,#1452cc,#5b8cff)', d: 1.2 },
  { n: 'Inès', x: 14, y: 74, s: 44, g: 'linear-gradient(140deg,#3b5bdb,#6ea0ff)', d: 0.6 },
  { n: 'Théo', x: 90, y: 70, s: 60, g: 'linear-gradient(140deg,#0d3aa0,#3ba0ff)', d: 1.8 },
  { n: 'Jade', x: 78, y: 44, s: 38, g: 'linear-gradient(140deg,#5b8cff,#aaccff)', d: 2.4 },
  { n: 'Naël', x: 6, y: 48, s: 40, g: 'linear-gradient(140deg,#1452cc,#3ba0ff)', d: 3 },
];

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
      <div className="connect__bg" aria-hidden="true">
        <i className="connect__orb connect__orb--a" />
        <i className="connect__orb connect__orb--b" />
        <i className="connect__orb connect__orb--c" />
      </div>

      <div className="connect__people" aria-hidden="true">
        {PEOPLE.map((p) => (
          <span
            key={p.n}
            className="connect__bubble"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, fontSize: p.s * 0.4, background: p.g, animationDelay: `${p.d}s` }}
          >
            {p.n[0]}
          </span>
        ))}
      </div>

      <main className="connect__hero">
        <div className="connect__brand">
          <span className="connect__mark"><img src={cfg.branding.icon} alt="" /></span>
          <span className="connect__word"><span className="connect__at">@</span>{cfg.branding.name}</span>
          <span className="connect__live"><i />en direct</span>
        </div>

        <h1 className="connect__title">
          {cfg.branding.tagline}<br />
          <em>{cfg.branding.taglineEm}</em>
        </h1>
        <p className="connect__sub">{cfg.branding.subtitle}</p>

        <form className="connect__form" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <div className={`connect__pill ${ready ? 'is-ready' : ''}`}>
            <span className="connect__pillic">@</span>
            <input
              className="connect__input"
              value={nick}
              maxLength={30}
              autoFocus
              placeholder="Choisis ton pseudo…"
              aria-label="Pseudo"
              onChange={(e) => setNick(e.target.value)}
            />
            <button type="submit" className="connect__go" disabled={connecting || !ready}>
              {connecting ? <span className="connect__spin" /> : <>Entrer<span className="connect__arrow">→</span></>}
            </button>
          </div>

          <div className="connect__row">
            <span className="connect__chip">Tu rejoins&nbsp;<b>{chan}</b></span>
            <button type="button" className="connect__pwtoggle" onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'Masquer le mot de passe' : 'Pseudo déjà enregistré ?'}
            </button>
          </div>

          {showPw && (
            <input
              className="connect__pw"
              type="password"
              value={password}
              placeholder="Mot de passe (si ton pseudo est enregistré)"
              aria-label="Mot de passe"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          )}

          {errors[status] && <div className="connect__err">⚠ {errors[status]}</div>}
        </form>

        <div className="connect__trust">
          <span>🔒 Chiffré de bout en bout</span>
          <span className="connect__sep">·</span>
          <span>Aucune inscription</span>
          <span className="connect__sep">·</span>
          <span>IRCv3 capabilities</span>
        </div>
      </main>
    </div>
  );
}
