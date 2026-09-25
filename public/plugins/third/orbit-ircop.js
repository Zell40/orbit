/*
 * Orbit IRCOP — topbar panel for the server team (salon #_bo).
 *
 * Visibility & tool tiers come from the user's prefix in #_bo:
 *   ~  Fondateur          → Administrateur serveur (panel complet)
 *   &  Administrateur     → IRCOP général / Technicien IRC
 *   @  Opérateur          → IRCOP de base
 *   %  Halfop             → Helpeur
 *   +  Voice              → Helpeur en test / RS
 *   (aucun)               → Membre équipe (opérateur de salon)
 *
 * Opening the panel always starts with OPER authentication. Once the session
 * has global oper (+o / RPL_YOUREOPER), the tools for that #_bo tier unlock.
 */
Orbit.plugin('orbit-ircop', (orbit, log) => {
  const { useState, useEffect } = orbit.React;
  const html = orbit.html;
  const TEAM = '#_bo';

  const T = (key, vars) => {
    const full = 'plugins.ircop.' + key;
    const out = orbit.i18n.t(full, vars);
    return out === full ? key : out;
  };

  // Strongest-first rank from #_bo prefixes.
  const RANKS = [
    { ch: '~', id: 'admin', level: 50 },
    { ch: '&', id: 'staff', level: 40 },
    { ch: '@', id: 'oper', level: 30 },
    { ch: '%', id: 'helper', level: 20 },
    { ch: '+', id: 'voice', level: 10 },
  ];

  function fold(s) {
    return String(s || '').toLowerCase();
  }

  function teamBuffer() {
    const buffers = orbit.state.get().buffers || {};
    for (const [k, b] of Object.entries(buffers)) {
      const name = fold(b && b.name ? b.name : k);
      if (name === fold(TEAM)) return b;
    }
    return null;
  }

  function findMember(members, nick) {
    if (!members || !nick) return null;
    if (members[nick]) return members[nick];
    const want = fold(nick);
    for (const [k, m] of Object.entries(members)) {
      if (fold(k) === want || fold(m && m.nick) === want) return m;
    }
    return null;
  }

  function teamAccess() {
    const b = teamBuffer();
    if (!b || !b.joined) return null;
    const me = findMember(b.members, orbit.state.nick());
    if (!me) return null;
    const pfx = String(me.prefixes || me.prefix || '');
    for (const r of RANKS) {
      if (pfx.includes(r.ch)) return { ...r, prefix: pfx };
    }
    return { ch: '', id: 'team', level: 5, prefix: pfx };
  }

  function isOperSession() {
    const um = String(orbit.state.get().umodes || '');
    return /o/i.test(um);
  }

  // ── tiny store (open / auth feedback / form scratch) ──
  const store = {
    open: false,
    authBusy: false,
    authError: '',
    authOk: false,
    subs: new Set(),
  };
  const notify = () => store.subs.forEach((f) => f());
  function useStore() {
    const [, set] = useState(0);
    useEffect(() => {
      const f = () => set((x) => x + 1);
      store.subs.add(f);
      return () => store.subs.delete(f);
    }, []);
    return store;
  }

  orbit.on('orbit:panel', (id) => {
    if (id !== 'orbit-ircop' && store.open) {
      store.open = false;
      notify();
    }
  });

  orbit.on('raw', (msg) => {
    if (!msg || !msg.command) return;
    const cmd = String(msg.command);
    if (cmd === '381') {
      store.authBusy = false;
      store.authError = '';
      store.authOk = true;
      notify();
    } else if (cmd === '491' || cmd === '464' || (cmd === '461' && fold(msg.params && msg.params[1]) === 'oper')) {
      store.authBusy = false;
      store.authError = (msg.params && msg.params[msg.params.length - 1]) || T('authFailed');
      store.authOk = false;
      notify();
    } else if (cmd === 'MODE') {
      // +o/-o on ourselves flips the unlocked tools without waiting for a re-open.
      notify();
    }
  });

  orbit.on('status', (s) => {
    if (s !== 'registered') {
      store.authBusy = false;
      store.authOk = false;
      store.authError = '';
      notify();
    }
  });

  // Periodic refresh so joins/modes in #_bo update the topbar button.
  function useTick(ms) {
    const [, set] = useState(0);
    useEffect(() => {
      const id = setInterval(() => set((n) => n + 1), ms);
      return () => clearInterval(id);
    }, [ms]);
  }

  function openPanel() {
    store.open = !store.open;
    if (store.open) {
      store.authError = '';
      orbit.emit('orbit:panel', 'orbit-ircop');
    }
    notify();
  }

  function submitOper(name, pass) {
    const n = String(name || '').trim();
    const p = String(pass || '');
    if (!n || !p) {
      store.authError = T('authNeedBoth');
      notify();
      return;
    }
    store.authBusy = true;
    store.authError = '';
    store.authOk = false;
    notify();
    // Never log the password. OPER is sent as a raw IRC command.
    orbit.irc.send('OPER ' + n + ' ' + p);
  }

  function deoper() {
    const nick = orbit.state.nick();
    if (nick) orbit.irc.send('MODE ' + nick + ' -o');
    store.authOk = false;
    notify();
  }

  function sendRaw(line) {
    const l = String(line || '').trim();
    if (!l) return;
    orbit.irc.send(l);
  }

  // ── UI bits ──
  const btnBase = {
    display: 'block', width: '100%', textAlign: 'left',
    border: '1px solid var(--border, #444)', background: 'var(--bg-soft, transparent)',
    color: 'inherit', borderRadius: '10px', padding: '.55rem .7rem',
    font: 'inherit', fontSize: '.84rem', cursor: 'pointer', marginBottom: '.45rem',
  };
  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '.5rem .6rem',
    borderRadius: '8px', border: '1px solid var(--border, #444)',
    background: 'var(--bg, #0e0e12)', color: 'inherit', font: 'inherit', fontSize: '.86rem',
  };
  const labelStyle = { display: 'block', fontSize: '.72rem', fontWeight: 650, color: 'var(--muted, #9aa)', margin: '0 0 .25rem' };
  const sectionTitle = { fontSize: '.72rem', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted, #9aa)', margin: '.85rem 0 .4rem' };

  function AuthForm() {
    const s = useStore();
    const [name, setName] = useState(orbit.state.nick() || '');
    const [pass, setPass] = useState('');
    return html`<div>
      <p style=${{ margin: '0 0 .7rem', fontSize: '.82rem', lineHeight: 1.45, color: 'var(--muted, #9aa)' }}>
        ${T('authIntro')}
      </p>
      <label style=${labelStyle}>${T('operName')}</label>
      <input style=${{ ...inputStyle, marginBottom: '.55rem' }} value=${name}
        autoComplete="username" spellcheck=${false}
        onInput=${(e) => setName(e.target.value)} />
      <label style=${labelStyle}>${T('operPass')}</label>
      <input style=${{ ...inputStyle, marginBottom: '.65rem' }} type="password" value=${pass}
        autoComplete="current-password"
        onInput=${(e) => setPass(e.target.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter') submitOper(name, pass); }} />
      ${s.authError ? html`<div style=${{ fontSize: '.78rem', color: 'var(--danger, #dc2626)', marginBottom: '.5rem' }}>${s.authError}</div>` : null}
      <button disabled=${s.authBusy} onClick=${() => submitOper(name, pass)}
        style=${{ ...btnBase, textAlign: 'center', fontWeight: 700, background: 'var(--accent, #3b7bff)', color: '#fff', borderColor: 'transparent', opacity: s.authBusy ? .6 : 1 }}>
        ${s.authBusy ? T('authPending') : T('authSubmit')}
      </button>
    </div>`;
  }

  function FieldRow({ label, placeholder, onGo, danger }) {
    const [v, setV] = useState('');
    return html`<div style=${{ display: 'flex', gap: '.4rem', marginBottom: '.45rem' }}>
      <input style=${{ ...inputStyle, flex: 1 }} placeholder=${placeholder} value=${v}
        spellcheck=${false} onInput=${(e) => setV(e.target.value)}
        onKeyDown=${(e) => { if (e.key === 'Enter') { onGo(v); setV(''); } }} />
      <button onClick=${() => { onGo(v); setV(''); }}
        style=${{ ...btnBase, width: 'auto', marginBottom: 0, padding: '.5rem .75rem', fontWeight: 700,
          background: danger ? 'rgba(220,38,38,.12)' : 'var(--bg-soft, transparent)',
          borderColor: danger ? 'rgba(220,38,38,.35)' : undefined,
          color: danger ? 'var(--danger, #dc2626)' : 'inherit' }}>${label}</button>
    </div>`;
  }

  function Tools({ access }) {
    const level = access.level;
    const can = (min) => level >= min;

    return html`<div>
      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.55rem' }}>
        <div>
          <div style=${{ fontWeight: 800, fontSize: '.9rem' }}>${T('role.' + access.id)}</div>
          <div style=${{ fontSize: '.72rem', color: 'var(--muted, #9aa)' }}>${T('roleHint.' + access.id)}</div>
        </div>
        <button onClick=${deoper} style=${{ ...btnBase, width: 'auto', marginBottom: 0, padding: '.35rem .55rem', fontSize: '.75rem' }}>${T('deoper')}</button>
      </div>

      ${can(5) ? html`<div>
        <div style=${sectionTitle}>${T('sec.team')}</div>
        <${FieldRow} label=${T('act.notice')} placeholder=${T('ph.notice')}
          onGo=${(v) => { const [nick, ...rest] = v.trim().split(/\s+/); if (nick && rest.length) sendRaw('NOTICE ' + nick + ' :' + rest.join(' ')); }} />
        <${FieldRow} label=${T('act.whois')} placeholder=${T('ph.nick')}
          onGo=${(v) => { const nick = v.trim().split(/\s+/)[0]; if (nick) sendRaw('WHOIS ' + nick + ' ' + nick); }} />
      </div>` : null}

      ${can(10) ? html`<div>
        <div style=${sectionTitle}>${T('sec.voice')}</div>
        <${FieldRow} label=${T('act.globops')} placeholder=${T('ph.message')}
          onGo=${(v) => { if (v.trim()) sendRaw('GLOBOPS :' + v.trim()); }} />
      </div>` : null}

      ${can(20) ? html`<div>
        <div style=${sectionTitle}>${T('sec.helper')}</div>
        <${FieldRow} label=${T('act.kill')} placeholder=${T('ph.kill')} danger=${true}
          onGo=${(v) => { const [nick, ...rest] = v.trim().split(/\s+/); if (nick) sendRaw('KILL ' + nick + ' :' + (rest.join(' ') || 'IRCOP')); }} />
      </div>` : null}

      ${can(30) ? html`<div>
        <div style=${sectionTitle}>${T('sec.oper')}</div>
        <${FieldRow} label=${T('act.kline')} placeholder=${T('ph.kline')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('KLINE ' + v.trim()); }} />
        <${FieldRow} label=${T('act.sajoin')} placeholder=${T('ph.sajoin')}
          onGo=${(v) => { const p = v.trim().split(/\s+/); if (p.length >= 2) sendRaw('SAJOIN ' + p[0] + ' ' + p[1]); }} />
        <${FieldRow} label=${T('act.sapart')} placeholder=${T('ph.sapart')}
          onGo=${(v) => { const p = v.trim().split(/\s+/); if (p.length >= 2) sendRaw('SAPART ' + p[0] + ' ' + p[1]); }} />
        <button onClick=${() => sendRaw('WALLOPS :' + (window.prompt(T('ph.message')) || ''))}
          style=${btnBase}>${T('act.wallops')}</button>
      </div>` : null}

      ${can(40) ? html`<div>
        <div style=${sectionTitle}>${T('sec.staff')}</div>
        <${FieldRow} label=${T('act.gline')} placeholder=${T('ph.gline')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('GLINE ' + v.trim()); }} />
        <${FieldRow} label=${T('act.zline')} placeholder=${T('ph.zline')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('ZLINE ' + v.trim()); }} />
        <button onClick=${() => sendRaw('REHASH')} style=${btnBase}>${T('act.rehash')}</button>
        <button onClick=${() => sendRaw('MODULES')} style=${btnBase}>${T('act.modules')}</button>
      </div>` : null}

      ${can(50) ? html`<div>
        <div style=${sectionTitle}>${T('sec.admin')}</div>
        <${FieldRow} label=${T('act.loadmodule')} placeholder=${T('ph.module')}
          onGo=${(v) => { if (v.trim()) sendRaw('LOADMODULE ' + v.trim()); }} />
        <${FieldRow} label=${T('act.unloadmodule')} placeholder=${T('ph.module')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('UNLOADMODULE ' + v.trim()); }} />
        <button onClick=${() => {
          if (window.confirm(T('dieConfirm'))) sendRaw('DIE ' + (window.prompt(T('dieReason')) || 'admin'));
        }} style=${{ ...btnBase, color: 'var(--danger, #dc2626)', fontWeight: 700 }}>${T('act.die')}</button>
      </div>` : null}

      <div style=${sectionTitle}>${T('sec.raw')}</div>
      <${FieldRow} label=${T('act.raw')} placeholder=${T('ph.raw')}
        onGo=${(v) => sendRaw(v)} />
    </div>`;
  }

  function Panel() {
    const s = useStore();
    useTick(2000);
    const live = teamAccess();
    const unlocked = isOperSession() || s.authOk;

    if (!live) return null;

    return html`<div style=${{
      position: 'fixed', right: '14px', top: '58px', zIndex: 70,
      width: '360px', maxWidth: '94vw', maxHeight: 'min(78vh, 640px)', overflowY: 'auto',
      background: 'var(--bg2, var(--bg, #15151a))', color: 'var(--tx, var(--ink, #eee))',
      border: '1px solid var(--border, #333)', borderRadius: '14px',
      boxShadow: '0 24px 60px -20px rgba(0,0,0,.55)', padding: '.9rem 1rem 1rem',
    }}>
      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.55rem' }}>
        <div>
          <strong style=${{ fontWeight: 800, fontSize: '.98rem' }}>${T('title')}</strong>
          <div style=${{ fontSize: '.72rem', color: 'var(--muted, #9aa)' }}>
            ${live.ch ? live.ch + ' ' : ''}${T('role.' + live.id)} · ${TEAM}
          </div>
        </div>
        <button onClick=${() => { store.open = false; notify(); }}
          style=${{ ...btnBase, width: 'auto', marginBottom: 0, padding: '.2rem .5rem' }}>✕</button>
      </div>
      ${unlocked ? html`<${Tools} access=${live} />` : html`<${AuthForm} />`}
    </div>`;
  }

  function ShieldIcon() {
    return html`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style=${{ display: 'block' }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>`;
  }

  function IrcopButton({ compact }) {
    useStore();
    useTick(2500);
    const access = teamAccess();
    if (!access) return null;
    const tip = T('tip') + ' — ' + T('role.' + access.id);
    if (compact) {
      return html`<button type="button" className="topmore__item" onClick=${() => { openPanel(); }}
        style=${{ display: 'flex', alignItems: 'center', gap: '.55rem', width: '100%',
          background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer',
          padding: '.55rem .7rem', textAlign: 'left' }}>
        <${ShieldIcon} />
        <span>${T('title')}</span>
      </button>`;
    }
    return html`<button title=${tip} aria-label=${tip} onClick=${openPanel}
      style=${{ display: 'flex', alignItems: 'center', background: 'transparent', border: 0,
        color: store.open || isOperSession() ? 'var(--accent, #3b7bff)' : 'inherit',
        cursor: 'pointer', padding: '0 .4rem', alignSelf: 'center' }}>
      <${ShieldIcon} />
    </button>`;
  }

  function Overlay() {
    useStore();
    if (!store.open || !teamAccess()) return null;
    return html`<${Panel} />`;
  }

  orbit.addUi('topbar_item', () => orbit.h(IrcopButton, { compact: false }));
  orbit.addUi('topbar_more_item', () => orbit.h(IrcopButton, { compact: true }));
  orbit.addUi('overlay', () => orbit.h(Overlay));
  log('ircop panel ready (team ' + TEAM + ')');
});
