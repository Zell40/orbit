import { useState, type CSSProperties } from 'react';
import { useChat } from '../store';
import { getConfig } from '../config';

function param(name: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

// Satellites riding the orbit rings — a living hint of the people already inside.
const RINGS: { cls: string; rev?: boolean; sats: { sz: number; c: string; d: number }[] }[] = [
  { cls: 'orbit--1', sats: [{ sz: 11, c: '#46c35c', d: -7 }, { sz: 7, c: '#7ee08c', d: -27 }, { sz: 6, c: '#bdeccb', d: -42 }] },
  { cls: 'orbit--2', rev: true, sats: [{ sz: 9, c: '#3fb950', d: -4 }, { sz: 6, c: '#5bd0c0', d: -20 }] },
  { cls: 'orbit--3', sats: [{ sz: 8, c: '#7ee08c', d: -11 }, { sz: 5, c: '#9be8ab', d: -22 }] },
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
      <div className="connect__sky" aria-hidden="true" />

      {/* Orbital system — the entry pill sits at its centre of gravity */}
      <div className="orbit-sys" aria-hidden="true">
        <div className="orbit-core" />
        {RINGS.map((r) => (
          <div key={r.cls} className={`orbit ${r.cls} ${r.rev ? 'orbit--rev' : ''}`}>
            <div className="orbit__line" />
            {r.sats.map((s, i) => (
              <div key={i} className="orbit__spin" style={{ animationDelay: `${s.d}s` }}>
                <span className="sat" style={{ '--sz': `${s.sz}px`, '--c': s.c } as CSSProperties} />
              </div>
            ))}
          </div>
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
              name="nick"
              value={nick}
              maxLength={30}
              autoFocus
              autoComplete="off"
              placeholder="Choisis ton pseudo…"
              aria-label="Pseudo"
              onChange={(e) => setNick(e.target.value)}
            />
            <button type="submit" className="connect__go" disabled={connecting || !ready}>
              {connecting ? <span className="connect__spin" /> : <>Entrer<span className="connect__arrow">→</span></>}
            </button>
          </div>

          <div className="connect__row">
            <span className="connect__chip">En orbite autour de&nbsp;<b>{chan}</b></span>
            <button type="button" className="connect__pwtoggle" onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'Masquer le mot de passe' : 'Pseudo déjà enregistré ?'}
            </button>
          </div>

          {showPw && (
            <input
              className="connect__pw"
              type="password"
              name="password"
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
