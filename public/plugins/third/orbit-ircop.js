/*
 * Orbit IRCOP — bottom-nav panel for the server team (salon #_bo).
 *
 * Access tier comes from ChanServ / NickServ ALIST on #_bo (QOP, SOP, AOP,
 * HOP, VOP, Fondateurice…), not from the live MODE prefixes in the nicklist.
 * Live prefixes are only a fallback when ALIST is unavailable (guest, RPC down).
 *
 * Mapping (EntreNous × InspIRCd oper types):
 *   QOP / Fondateur     → IRC Administrateur     (panel admin, sans DIE)
 *   SOP                 → Technicien / Oper Gen.  (staff)
 *   AOP                 → IRC Operateur           (oper)
 *   HOP                 → Helpeur                 (helper — OperChat/View)
 *   VOP                 → Helpeur en test / RS
 *   membre #_bo sans xOP→ Opérateur de salon
 *
 * Opening the panel starts with OPER authentication. Once the session has
 * global oper (+o / RPL_YOUREOPER), tools for that ChanServ tier unlock.
 * Authenticated opers also get an "IRCOP" block in the nicklist right-click menu.
 *
 * After a successful OPER, login+password stay in RAM only (never storage) so
 * auto-reconnect can re-OPER. DEOPER / a failed form login / tab close wipes them.
 */
Orbit.plugin('orbit-ircop', (orbit, log) => {
  const { useState, useEffect, useRef, useLayoutEffect } = orbit.React;
  const html = orbit.html;
  const TEAM = '#_bo';
  const CS_RPC = '/app/plugins/third/orbit-chanserv/chanserv-rpc.php';

  const T = (key, vars) => {
    const full = 'plugins.ircop.' + key;
    const out = orbit.i18n.t(full, vars);
    return out === full ? key : out;
  };

  function fold(s) {
    return String(s || '').toLowerCase();
  }

  /** Strongest ChanServ xOP / FR label → panel tier. */
  function rankFromCsToken(raw) {
    const code = String(raw || '').replace(/[,.;]+$/g, '').trim();
    const c = fold(code);
    if (/fondat|founder|^qop$|^owner$/.test(c)) return { id: 'admin', level: 50, ch: '~', code };
    if (/successeur|successor|^sop$|^10$/.test(c)) return { id: 'staff', level: 40, ch: '&', code };
    if (/^aop$|^5$/.test(c)) return { id: 'oper', level: 30, ch: '@', code };
    if (/^hop$|^4$/.test(c)) return { id: 'helper', level: 20, ch: '%', code };
    if (/^vop$|^3$/.test(c)) return { id: 'voice', level: 10, ch: '+', code };
    return null;
  }

  function rankFromCsAccess(raw) {
    const parts = String(raw || '').split(/[,/|]+/).map((s) => s.trim()).filter(Boolean);
    let best = null;
    for (const p of parts) {
      const r = rankFromCsToken(p);
      if (r && (!best || r.level > best.level)) best = r;
    }
    if (best) return { ...best, source: 'chanserv', access: String(raw || '').trim() };
    return { id: 'team', level: 5, ch: '', code: String(raw || '').trim() || 'MEM', source: 'chanserv', access: String(raw || '').trim() };
  }

  // Live nicklist prefixes — fallback only.
  const PREFIX_RANKS = [
    { ch: '~', id: 'admin', level: 50 },
    { ch: '&', id: 'staff', level: 40 },
    { ch: '@', id: 'oper', level: 30 },
    { ch: '%', id: 'helper', level: 20 },
    { ch: '+', id: 'voice', level: 10 },
  ];

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

  function rankFromLivePrefix() {
    const b = teamBuffer();
    if (!b || !b.joined) return null;
    const me = findMember(b.members, orbit.state.nick());
    if (!me) return null;
    const pfx = String(me.prefixes || me.prefix || '');
    for (const r of PREFIX_RANKS) {
      if (pfx.includes(r.ch)) return { ...r, prefix: pfx, source: 'prefix', access: pfx };
    }
    return { id: 'team', level: 5, ch: '', prefix: pfx, source: 'prefix', access: '' };
  }

  /** Prefer ChanServ ALIST; fall back to live #_bo prefix / membership. */
  function teamAccess() {
    if (store.csAccess) return store.csAccess;
    if (store.csAccess === null && store.csTried) {
      // Explicitly no ALIST row — still allow live membership on #_bo.
      return rankFromLivePrefix();
    }
    return rankFromLivePrefix();
  }

  function isOperSession() {
    const um = String(orbit.state.get().umodes || '');
    return /o/i.test(um);
  }

  // ── store ──
  const store = {
    open: false,
    authBusy: false,
    authError: '',
    authOk: false,
    csAccess: undefined, // undefined=loading/unknown, null=no row, object=rank
    csTried: false,
    csLabel: '',
    anchor: null,
    subs: new Set(),
  };
  // OPER credentials: RAM only, never on `store` (React/DevTools), never storage.
  let operMem = null; // { name, pass } | null
  let operReplayTimer = 0;
  let operReplayTries = 0;

  function forgetOper() {
    operMem = null;
    operReplayTries = 0;
    if (operReplayTimer) { window.clearTimeout(operReplayTimer); operReplayTimer = 0; }
  }
  function rememberOper(name, pass) {
    const n = String(name || '');
    const p = String(pass || '');
    operMem = (n && p) ? { name: n, pass: p } : null;
  }
  function sendOper(name, pass) {
    orbit.irc.send('OPER ' + name + ' ' + pass);
  }
  function replayOper() {
    if (!operMem || !operMem.name || !operMem.pass) return;
    if (isOperSession()) return;
    if (operReplayTries >= 2) return;
    operReplayTries += 1;
    store.authBusy = true;
    store.authError = '';
    notify();
    sendOper(operMem.name, operMem.pass);
  }
  function scheduleReplay(ms) {
    if (!operMem) return;
    if (operReplayTimer) window.clearTimeout(operReplayTimer);
    operReplayTimer = window.setTimeout(() => {
      operReplayTimer = 0;
      replayOper();
    }, ms || 700);
  }

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

  // Minimal ALIST line parse (same shapes as nickserv-info.ts).
  function parseAlistBlob(raw) {
    const rows = [];
    const seen = new Set();
    const text = String(raw || '').replace(/\r\n?/g, '\n');
    for (const line of text.split('\n')) {
      const s = line.replace(/\x03\d{0,2}(?:,\d{1,2})?|\x02|\x1d|\x1f|\x16|\x0f/g, '').replace(/\s+/g, ' ').trim();
      if (!s) continue;
      if (/^(fin\s+de|end of|num[eé]ro|number\s+channel|n[°º]\b)/i.test(s)) continue;
      if (/a acc[eè]s|has access on|access list|liste d['’]acc[eè]s/i.test(s)) continue;
      const eq = s.match(/^\d+\s*[:.)]\s+(!?[#&][^\s=]*)\s*=\s*(.+)$/);
      if (eq) {
        const chan = eq[1].replace(/^!+/, '');
        const key = fold(chan);
        if (chan && !seen.has(key)) { seen.add(key); rows.push({ channel: chan, access: eq[2].replace(/\s+\(.*$/, '').trim() }); }
        continue;
      }
      const numbered = s.match(/^\d+\s+(!?[#&]\S+)\s+(\S+)/);
      const simple = numbered ? null : s.match(/^(!?[#&]\S+)\s+(\S+)/);
      const m = numbered || simple;
      if (!m) continue;
      const chan = m[1].replace(/^!+/, '');
      const key = fold(chan);
      if (!chan || seen.has(key)) continue;
      seen.add(key);
      rows.push({ channel: chan, access: m[2].replace(/[,.;]+$/, '') });
    }
    return rows;
  }

  let alistInflight = null;
  async function refreshCsAccess() {
    const account = orbit.state.account();
    const nick = orbit.state.nick();
    if (!account) {
      store.csAccess = undefined;
      store.csTried = true;
      store.csLabel = '';
      notify();
      return;
    }
    if (alistInflight) return alistInflight;
    alistInflight = (async () => {
      const ctrl = new AbortController();
      const to = window.setTimeout(() => ctrl.abort(), 6000);
      try {
        const r = await fetch(CS_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ account, nick, action: 'nsalist' }),
          signal: ctrl.signal,
        });
        const data = await r.json();
        store.csTried = true;
        if (!data || !data.ok || data.list == null) {
          store.csAccess = undefined;
          store.csLabel = '';
          notify();
          return;
        }
        const rows = parseAlistBlob(String(data.list));
        const hit = rows.find((row) => fold(row.channel) === fold(TEAM));
        if (!hit) {
          store.csAccess = null;
          store.csLabel = '';
        } else {
          store.csAccess = rankFromCsAccess(hit.access);
          store.csLabel = hit.access;
        }
        notify();
      } catch (e) {
        store.csTried = true;
        log('alist failed', e);
        notify();
      } finally {
        window.clearTimeout(to);
        alistInflight = null;
      }
    })();
    return alistInflight;
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
      store.open = false;
      operReplayTries = 0;
      notify();
    } else if (cmd === '491' || cmd === '464' || (cmd === '461' && fold(msg.params && msg.params[1]) === 'oper')) {
      store.authBusy = false;
      store.authError = (msg.params && msg.params[msg.params.length - 1]) || T('authFailed');
      store.authOk = false;
      // Form login refused → drop RAM creds. Auto-replay may retry once (cloak/ident lag).
      if (operReplayTries === 0) forgetOper();
      else if (operMem && operReplayTries < 2) scheduleReplay(2000);
      else forgetOper();
      notify();
    } else if (cmd === 'MODE') {
      notify();
      if (operMem && store.authOk && orbit.state.get().status === 'registered' && !isOperSession()) {
        forgetOper();
        store.authOk = false;
        notify();
      }
    }
  });

  orbit.on('status', (s) => {
    if (s !== 'registered') {
      store.authBusy = false;
      store.authOk = false;
      store.authError = '';
      store.csAccess = undefined;
      store.csTried = false;
      operReplayTries = 0;
      if (operReplayTimer) { window.clearTimeout(operReplayTimer); operReplayTimer = 0; }
      try { orbit.state.get().setEchoServerTo?.(null); } catch (_) { /* */ }
      notify();
    } else {
      refreshCsAccess();
      scheduleReplay(700);
    }
  });

  orbit.on('connected', () => { refreshCsAccess(); });
  window.addEventListener('pagehide', forgetOper);
  // Account may land after SASL / bouncer attach.
  setInterval(() => {
    if (orbit.state.account() && store.csAccess === undefined) refreshCsAccess();
  }, 8000);
  refreshCsAccess();

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
      refreshCsAccess();
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
    rememberOper(n, p);
    operReplayTries = 0;
    store.authBusy = true;
    store.authError = '';
    store.authOk = false;
    notify();
    sendOper(n, p);
  }

  function deoper() {
    const nick = orbit.state.nick();
    if (nick) orbit.irc.send('MODE ' + nick + ' -o');
    forgetOper();
    store.authOk = false;
    notify();
  }

  function sendRaw(line) {
    const l = String(line || '').trim();
    if (!l) return;
    orbit.irc.send(l);
  }

  /** Print WHOIS as classic text in the active buffer (not the profile panel / Status). */
  function whoisActive(nick) {
    const n = String(nick || '').trim().split(/\s+/)[0];
    if (!n) return;
    const s = orbit.state.get();
    if (typeof s.whoisText === 'function') s.whoisText(n);
    else sendRaw('WHOIS ' + n + ' ' + n);
  }

  /** Divert Status-bound server replies (CHECK, numerics, NOTICE *) into the active buffer for a few seconds. */
  let echoTimer = 0;
  function echoToActive(ms) {
    const s = orbit.state.get();
    const dest = orbit.state.active();
    if (!dest || typeof s.setEchoServerTo !== 'function') return;
    s.setEchoServerTo(dest);
    if (echoTimer) clearTimeout(echoTimer);
    echoTimer = setTimeout(() => {
      echoTimer = 0;
      try { orbit.state.get().setEchoServerTo(null); } catch (_) { /* */ }
    }, ms || 12000);
  }

  function checkActive(nick) {
    const n = String(nick || '').trim().split(/\s+/)[0];
    if (!n) return;
    echoToActive(15000);
    sendRaw('CHECK ' + n);
  }

  // ── UI ──
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
          onGo=${(v) => whoisActive(v)} />
      </div>` : null}

      ${/* Helpeur (+ HOP): OperChat — pas de BanControl */ ''}
      ${can(10) ? html`<div>
        <div style=${sectionTitle}>${T('sec.helper')}</div>
        <${FieldRow} label=${T('act.globops')} placeholder=${T('ph.message')}
          onGo=${(v) => { if (v.trim()) sendRaw('GLOBOPS :' + v.trim()); }} />
        <${FieldRow} label=${T('act.wallops')} placeholder=${T('ph.message')}
          onGo=${(v) => { if (v.trim()) sendRaw('WALLOPS :' + v.trim()); }} />
        <button onClick=${() => sendRaw('OPERMOTD')} style=${btnBase}>${T('act.opermotd')}</button>
      </div>` : null}

      ${/* IRC Operateur (AOP): BanControl + SACommands + HostCloak… */ ''}
      ${can(30) ? html`<div>
        <div style=${sectionTitle}>${T('sec.oper')}</div>
        <${FieldRow} label=${T('act.kill')} placeholder=${T('ph.kill')} danger=${true}
          onGo=${(v) => { const [nick, ...rest] = v.trim().split(/\s+/); if (nick) sendRaw('KILL ' + nick + ' :' + (rest.join(' ') || 'IRCOP')); }} />
        <${FieldRow} label=${T('act.kline')} placeholder=${T('ph.kline')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('KLINE ' + v.trim()); }} />
        <${FieldRow} label=${T('act.check')} placeholder=${T('ph.nick')}
          onGo=${(v) => checkActive(v)} />
        <${FieldRow} label=${T('act.sajoin')} placeholder=${T('ph.sajoin')}
          onGo=${(v) => { const p = v.trim().split(/\s+/); if (p.length >= 2) sendRaw('SAJOIN ' + p[0] + ' ' + p[1]); }} />
        <${FieldRow} label=${T('act.sapart')} placeholder=${T('ph.sapart')}
          onGo=${(v) => { const p = v.trim().split(/\s+/); if (p.length >= 2) sendRaw('SAPART ' + p[0] + ' ' + p[1]); }} />
        <${FieldRow} label=${T('act.sanick')} placeholder=${T('ph.sanick')}
          onGo=${(v) => { const p = v.trim().split(/\s+/); if (p.length >= 2) sendRaw('SANICK ' + p[0] + ' ' + p[1]); }} />
        <${FieldRow} label=${T('act.sethost')} placeholder=${T('ph.sethost')}
          onGo=${(v) => { const p = v.trim().split(/\s+/); if (p.length >= 1) sendRaw('SETHOST ' + p.join(' ')); }} />
      </div>` : null}

      ${/* Technicien / Oper General (SOP): + GLINE/ZLINE, REHASH, FILTER… */ ''}
      ${can(40) ? html`<div>
        <div style=${sectionTitle}>${T('sec.staff')}</div>
        <${FieldRow} label=${T('act.gline')} placeholder=${T('ph.gline')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('GLINE ' + v.trim()); }} />
        <${FieldRow} label=${T('act.zline')} placeholder=${T('ph.zline')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('ZLINE ' + v.trim()); }} />
        <${FieldRow} label=${T('act.shun')} placeholder=${T('ph.shun')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('SHUN ' + v.trim()); }} />
        <button onClick=${() => sendRaw('REHASH')} style=${btnBase}>${T('act.rehash')}</button>
        <button onClick=${() => sendRaw('MODULES')} style=${btnBase}>${T('act.modules')}</button>
        <${FieldRow} label=${T('act.filter')} placeholder=${T('ph.filter')}
          onGo=${(v) => { if (v.trim()) sendRaw('FILTER ' + v.trim()); }} />
      </div>` : null}

      ${/* IRC Administrateur (QOP): modules — pas de DIE */ ''}
      ${can(50) ? html`<div>
        <div style=${sectionTitle}>${T('sec.admin')}</div>
        <${FieldRow} label=${T('act.loadmodule')} placeholder=${T('ph.module')}
          onGo=${(v) => { if (v.trim()) sendRaw('LOADMODULE ' + v.trim()); }} />
        <${FieldRow} label=${T('act.unloadmodule')} placeholder=${T('ph.module')} danger=${true}
          onGo=${(v) => { if (v.trim()) sendRaw('UNLOADMODULE ' + v.trim()); }} />
        <${FieldRow} label=${T('act.reloadmodule')} placeholder=${T('ph.module')}
          onGo=${(v) => { if (v.trim()) sendRaw('RELOADMODULE ' + v.trim()); }} />
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
    const A = s.anchor;
    const W = window.innerWidth, H = window.innerHeight, PW = Math.min(360, W * 0.94);
    const pos = A
      ? {
          left: Math.round(Math.min(Math.max(A.left + A.width / 2 - PW / 2, 8), W - PW - 8)) + 'px',
          bottom: Math.round(H - A.top + 10) + 'px',
        }
      : { right: '14px', bottom: '74px' };

    return html`<div style=${{
      position: 'fixed', ...pos, zIndex: 70,
      width: PW + 'px', maxWidth: '94vw', maxHeight: 'min(70vh, 640px)', overflowY: 'auto',
      background: 'var(--bg2, var(--bg, #15151a))', color: 'var(--tx, var(--ink, #eee))',
      border: '1px solid var(--border, #333)', borderRadius: '14px',
      boxShadow: '0 24px 60px -20px rgba(0,0,0,.55)', padding: '.9rem 1rem 1rem',
    }}>
      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.55rem' }}>
        <div>
          <strong style=${{ fontWeight: 800, fontSize: '.98rem' }}>${T('title')}</strong>
          <div style=${{ fontSize: '.72rem', color: 'var(--muted, #9aa)' }}>
            ${T('role.' + live.id)} · ${TEAM}
          </div>
        </div>
        <button onClick=${() => { store.open = false; notify(); }}
          style=${{ ...btnBase, width: 'auto', marginBottom: 0, padding: '.2rem .5rem' }}>✕</button>
      </div>
      ${unlocked ? html`<${Tools} access=${live} />` : html`<${AuthForm} />`}
    </div>`;
  }

  function ShieldIcon() {
    return html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>`;
  }

  function IrcopTab() {
    useStore();
    useTick(2500);
    const access = teamAccess();
    if (!access) return null;
    const tip = T('tip') + ' — ' + T('role.' + access.id);
    return html`<button className=${'tab' + (store.open || isOperSession() ? ' is-active' : '')}
      title=${tip} aria-label=${tip} aria-expanded=${store.open}
      onClick=${(e) => {
        store.anchor = e.currentTarget.getBoundingClientRect();
        openPanel();
      }}>
      <span className="tab__ic"><${ShieldIcon} /></span>
      <span className="tab__lb">${T('title')}</span>
    </button>`;
  }

  function Overlay() {
    useStore();
    if (!store.open || !teamAccess()) return null;
    return html`<${Panel} />`;
  }

  // Right-click nicklist: "Commandes IRCOP" flyout tab (same pattern as ChanServ),
  // only when OPER-authenticated. Sorted to the top of the menu by MemberMenu.
  // Opens on hover (desktop) like ChanServ; click still toggles for touch.
  function normChan(raw) {
    const c = String(raw || '').trim().split(/\s+/)[0];
    if (!c) return '';
    return (c[0] === '#' || c[0] === '&') ? c : '#' + c;
  }

  function MemberIrcop({ nick, close }) {
    useStore();
    const [open, setOpen] = useState(false);
    const [ask, setAsk] = useState(null); // null | 'sajoin'
    const [chan, setChan] = useState('');
    const closeT = useRef(0);
    const flyRef = useRef(null);
    const askRef = useRef(ask);
    askRef.current = ask;

    // Same hover contract as orbit-chanserv: delayed close + overlap/bridge so
    // sliding the pointer from the tab onto the flyout does not snap it shut.
    const keepOpen = () => {
      if (closeT.current) { clearTimeout(closeT.current); closeT.current = 0; }
      setOpen(true);
    };
    const delayClose = () => {
      if (askRef.current) return;
      if (closeT.current) clearTimeout(closeT.current);
      closeT.current = setTimeout(() => {
        closeT.current = 0;
        setOpen(false);
        setAsk(null);
      }, 280);
    };
    useEffect(() => () => { if (closeT.current) clearTimeout(closeT.current); }, []);
    useLayoutEffect(() => {
      if (!open) return undefined;
      const el = flyRef.current;
      if (!el) return undefined;
      if (window.innerWidth <= 880) {
        el.style.top = '';
        el.style.bottom = '';
        el.style.maxHeight = '';
        return undefined;
      }
      el.style.top = '-4px';
      el.style.bottom = 'auto';
      el.style.maxHeight = '';
      const pad = 8;
      let r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight - pad) {
        el.style.top = 'auto';
        el.style.bottom = '0px';
        r = el.getBoundingClientRect();
      }
      if (r.top < pad) {
        el.style.top = 'auto';
        el.style.bottom = '0px';
        r = el.getBoundingClientRect();
        if (r.top < pad) el.style.maxHeight = Math.max(120, window.innerHeight - pad * 2) + 'px';
      }
      return undefined;
    }, [open, nick, ask]);

    if (!isOperSession() && !store.authOk) return null;
    const access = teamAccess();
    if (!access || access.level < 10) return null;
    const level = access.level;
    const me = fold(orbit.state.nick());
    if (fold(nick) === me) return null;
    const active = orbit.state.active();
    const inChan = active && (active[0] === '#' || active[0] === '&');

    const run = (fn) => { fn(); close(); };
    const item = (label, onClick, danger) => html`<button type="button" role="menuitem"
      className=${'memberctx__item' + (danger ? ' memberctx__item--warn' : '')}
      onClick=${(e) => { e.stopPropagation(); onClick(); }}>${label}</button>`;

    const doSajoin = () => {
      const dest = normChan(chan);
      if (!dest) return;
      run(() => sendRaw('SAJOIN ' + nick + ' ' + dest));
    };

    return html`<div className=${'ircopmm' + (open ? ' is-open' : '')}
      onMouseEnter=${keepOpen}
      onMouseLeave=${delayClose}>
      <button type="button" className="memberctx__item memberctx__item--sub ircopmm__trig"
        aria-expanded=${open} aria-haspopup="menu"
        onClick=${(e) => {
          e.stopPropagation();
          if (open) {
            if (closeT.current) clearTimeout(closeT.current);
            setOpen(false);
            setAsk(null);
          } else keepOpen();
        }}>
        <span className="ircopmm__chev" aria-hidden="true">‹</span>
        <span className="ircopmm__ic" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <span className="ircopmm__lbl">${T('mm.tab')}</span>
      </button>
      ${open ? html`<div className="ircopmm__bridge" aria-hidden="true"></div>` : null}
      ${open ? html`<div ref=${(n) => { flyRef.current = n; }} className="ircopmm__fly" role="menu" aria-label=${T('mm.tab')}>
        ${item(T('mm.whois'), () => run(() => whoisActive(nick)))}
        ${level >= 10 ? item(T('mm.notice'), () => run(() => {
          const msg = window.prompt(T('mm.noticePrompt', { nick }));
          if (msg) sendRaw('NOTICE ' + nick + ' :' + msg);
        })) : null}
        ${level >= 30 ? item(T('mm.check'), () => run(() => checkActive(nick))) : null}
        ${level >= 30 ? item(T('mm.kill'), () => run(() => {
          const reason = window.prompt(T('mm.killPrompt', { nick })) || 'IRCOP';
          sendRaw('KILL ' + nick + ' :' + reason);
        }), true) : null}
        ${level >= 30 ? item(T('mm.kline'), () => run(() => {
          const rest = window.prompt(T('mm.klinePrompt', { nick }));
          if (rest) sendRaw('KLINE ' + rest);
        }), true) : null}
        ${level >= 40 ? item(T('mm.gline'), () => run(() => {
          const rest = window.prompt(T('mm.glinePrompt', { nick }));
          if (rest) sendRaw('GLINE ' + rest);
        }), true) : null}
        ${level >= 30 ? (ask === 'sajoin'
          ? html`<div className="ircopmm__ask" onMouseDown=${(e) => e.stopPropagation()}>
              <label className="ircopmm__asklbl">${T('mm.sajoinAsk', { nick })}</label>
              <input className="ircopmm__in" autoFocus spellcheck=${false}
                placeholder=${T('mm.sajoinPlaceholder')}
                value=${chan}
                onInput=${(e) => setChan(e.target.value)}
                onKeyDown=${(e) => {
                  if (e.key === 'Enter') { e.stopPropagation(); doSajoin(); }
                  if (e.key === 'Escape') { e.stopPropagation(); setAsk(null); }
                }} />
              <button type="button" className="ircopmm__askgo"
                onClick=${(e) => { e.stopPropagation(); doSajoin(); }}>${T('act.sajoin')}</button>
            </div>`
          : item(T('mm.sajoin'), () => { setAsk('sajoin'); setChan(''); })) : null}
        ${level >= 30 && inChan ? item(T('mm.sapartHere'), () => run(() => sendRaw('SAPART ' + nick + ' ' + active))) : null}
        ${level >= 30 ? item(T('mm.sanick'), () => run(() => {
          const nn = window.prompt(T('mm.sanickPrompt', { nick }));
          if (nn) sendRaw('SANICK ' + nick + ' ' + nn.trim());
        })) : null}
      </div>` : null}
    </div>`;
  }

  orbit.addUi('nav_item', () => orbit.h(IrcopTab));
  orbit.addUi('overlay', () => orbit.h(Overlay));
  orbit.addMemberMenu((ctx) => orbit.h(MemberIrcop, { nick: ctx.nick, close: ctx.close }));
  log('ircop panel ready (ChanServ ALIST on ' + TEAM + ')');
});
