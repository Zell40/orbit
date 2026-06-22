/*
 * Orbit games — a THIN client for the server-authoritative GameServ referee.
 *
 * GameServ (Anope, modules/third/GameServ/gs_board) runs the actual games
 * (tic-tac-toe, Connect Four, chess), validates every move and keeps the
 * account-keyed ranked ladder. This plugin holds NO game logic: it sends
 * commands (CHALLENGE/ACCEPT/MOVE/RESIGN/STATS/TOP), renders the board state
 * GameServ pushes, and hides GameServ's machine-readable control lines from chat.
 *
 * Wire protocol (GameServ -> client, in an invisible +tchatou.fr/gs tag we parse):
 *   GS# <id> g=<game> s=<encstate> t=<turn> me=<side> opp=<nick> st=<offer|pending|active|over> r=<none|win|loss|draw>
 *   GS$ <account> <game> r=<rank> p=<pts> w=<n> l=<n> d=<n>   (one per game type)
 *   GS$TOPSTART <game> ; GS$TOPROW <game> <i> <account> <rank> <pts>   (per-game ladder)
 */
Orbit.plugin('games', (orbit, log) => {
  const { useState, useEffect } = orbit.React;
  const html = orbit.html;
  const GS = 'gameserv'; // GameServ nick, lower-cased for comparison

  // ════════════════════════ decoding GameServ's state ════════════════════════
  const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const PROMO = { q: '♛', r: '♜', b: '♝', n: '♞' };
  const cf = (s) => s & 7, cr = (s) => s >> 3, csq = (f, r) => r * 8 + f;
  const cName = (s) => String.fromCharCode(97 + cf(s)) + (cr(s) + 1);
  // comma-FEN ("rows,turn,castling,ep") -> board[64], index a1=0..h8=63, '' empty
  function chessDecode(enc) {
    const bd = (enc || '').split(',')[0], board = new Array(64).fill(''), ranks = bd.split('/');
    for (let i = 0; i < 8 && i < ranks.length; i++) { const r = 7 - i; let f = 0; for (const ch of ranks[i]) { if (ch >= '1' && ch <= '8') f += +ch; else { if (f < 8) board[csq(f, r)] = ch; f++; } } }
    return board;
  }
  const flatDecode = (enc) => (enc || '').split('').map((c) => (c === '.' ? '' : c));

  // ════════════════════════ board components (render-only) ════════════════════════
  function TttBoard({ game, play }) {
    const b = game.board, myTurn = game.status === 'active' && game.turn === game.mySide;
    return html`<div style=${{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '6px', width: '224px', maxWidth: '66vw', margin: '.35rem auto 0' }}>
      ${b.map((c, i) => html`<div key=${i} onClick=${() => { if (myTurn && !c) play('' + i); }} style=${{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px', background: 'var(--card,#1a1a20)', border: '2px solid var(--border,rgba(255,255,255,.12))', fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, cursor: myTurn && !c ? 'pointer' : 'default', color: c === 'X' ? '#5b8cff' : '#e0577a' }}>${c}</div>`)}
    </div>`;
  }
  function C4Board({ game, play }) {
    const b = game.board, W = 7, H = 6, myTurn = game.status === 'active' && game.turn === game.mySide;
    const colFull = (c) => b[(H - 1) * W + c];
    const rows = []; for (let r = H - 1; r >= 0; r--) rows.push(r);
    return html`<div style=${{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', width: '266px', maxWidth: '74vw', background: '#2a3550', borderRadius: '10px', padding: '6px', margin: '.35rem auto 0' }}>
      ${rows.map((r) => Array.from({ length: W }, (_, c) => { const v = b[r * W + c], playable = myTurn && !colFull(c); return html`<div key=${r * W + c} onClick=${() => { if (playable) play('' + c); }} style=${{ aspectRatio: '1', borderRadius: '50%', background: v === 'R' ? '#e0577a' : v === 'Y' ? '#e8c84a' : '#11162a', cursor: playable ? 'pointer' : 'default' }}></div>`; }))}
    </div>`;
  }
  function ChessBoard({ game, play }) {
    const [sel, setSel] = useState(-1), [promo, setPromo] = useState(null);
    const b = game.board, myTurn = game.status === 'active' && game.turn === game.mySide;
    const mineColor = game.mySide === 'b' ? 'b' : 'w';
    const isMine = (p) => p && ((p === p.toUpperCase()) ? 'w' : 'b') === mineColor;
    const order = []; for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) order.push(csq(f, r));
    if (mineColor === 'b') order.reverse();
    function clickSq(s) {
      if (!myTurn) return;
      const p = b[s];
      if (sel < 0) { if (isMine(p)) setSel(s); return; }
      if (s === sel) { setSel(-1); return; }
      if (isMine(p)) { setSel(s); return; }
      const piece = b[sel];
      if ((piece === 'P' && cr(s) === 7) || (piece === 'p' && cr(s) === 0)) { setPromo({ from: sel, to: s }); return; }
      play(cName(sel) + cName(s)); setSel(-1);
    }
    return html`<div>
      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', width: '300px', maxWidth: '78vw', aspectRatio: '1', border: '1px solid var(--border,#333)', borderRadius: '8px', overflow: 'hidden', userSelect: 'none', margin: '.3rem auto 0' }}>
        ${order.map((s) => { const light = (cf(s) + cr(s)) % 2 === 1, p = b[s]; return html`<div key=${s} onClick=${() => clickSq(s)} style=${{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: s === sel ? '#caa84a' : light ? '#e9e4d6' : '#7d8aa0', fontSize: '1.65rem', lineHeight: 1, cursor: myTurn ? 'pointer' : 'default', color: p && p === p.toUpperCase() ? '#fff' : '#111', textShadow: p && p === p.toUpperCase() ? '0 1px 1px rgba(0,0,0,.5)' : 'none' }}>${p ? GLYPH[p] : ''}</div>`; })}
      </div>
      ${promo ? html`<div style=${{ textAlign: 'center', marginTop: '.4rem' }}>Promotion :
        ${['q', 'r', 'b', 'n'].map((pr) => html`<button key=${pr} onClick=${() => { play(cName(promo.from) + cName(promo.to) + pr); setPromo(null); setSel(-1); }} style=${{ fontSize: '1.5rem', padding: '.2rem .5rem', cursor: 'pointer' }}>${PROMO[pr]}</button>`)}
      </div>` : null}
    </div>`;
  }

  const GAMES = {
    ttt: { name: 'Morpion', icon: 'XO', decode: flatDecode, Board: TttBoard },
    c4: { name: 'Puissance 4', icon: '●', decode: flatDecode, Board: C4Board },
    chess: { name: 'Échecs', icon: '♟', decode: chessDecode, Board: ChessBoard },
  };

  // ════════════════════════ store ════════════════════════
  const store = { games: {}, open: false, active: null, challengeNick: '', subs: new Set(), myStats: null, boards: {}, topType: 'chess', topPending: null, showBoard: false };
  const statsCache = {}; // accountLower -> { [gameType]: { rank, points, wins, losses, draws } }
  function notify() { store.subs.forEach((f) => f()); }
  function useStore() { const [, set] = useState(0); useEffect(() => { const f = () => set((x) => x + 1); store.subs.add(f); return () => store.subs.delete(f); }, []); return store; }
  const myAccount = () => (orbit.state.get().account || '').toLowerCase();

  // ════════════════════════ transport: commands to GameServ ════════════════════════
  const cmd = (line) => orbit.irc.send('PRIVMSG GameServ :' + line);
  const challenge = (nick, type) => cmd('CHALLENGE ' + nick + ' ' + type);
  const accept = (id) => cmd('ACCEPT ' + id);
  const decline = (id) => cmd('DECLINE ' + id);
  const sendMove = (id, mv) => cmd('MOVE ' + id + ' ' + mv);
  const resign = (id) => cmd('RESIGN ' + id);
  const refreshStats = () => cmd('STATS');
  const fetchTop = (type) => cmd('TOP ' + type);

  // ════════════════════════ turn alerts ════════════════════════
  let savedTitle = null, toastEl = null, toastTimer = 0, audioCtx = null;
  function restoreTitle() { if (savedTitle !== null) { document.title = savedTitle; savedTitle = null; } }
  function flashTitle(m) { if (savedTitle === null) savedTitle = document.title; document.title = m; }
  function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.connect(g); g.connect(audioCtx.destination); o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(880, t + 0.12); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32); o.start(t); o.stop(t + 0.33); } catch (e) { /* no audio */ } }
  function hideToast() { if (toastEl) toastEl.style.opacity = '0'; }
  function showToast(msg, id) {
    if (!toastEl) { toastEl = document.createElement('div'); Object.assign(toastEl.style, { position: 'fixed', right: '14px', bottom: '120px', zIndex: '70', maxWidth: '260px', background: '#15151a', color: '#eee', border: '1px solid rgba(255,255,255,.14)', borderRadius: '12px', padding: '.6rem .8rem', font: '600 .85rem/1.3 system-ui,sans-serif', boxShadow: '0 16px 40px -16px rgba(0,0,0,.7)', cursor: 'pointer', transition: 'opacity .2s', opacity: '0' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.onclick = () => { store.open = true; store.active = id; store.showBoard = false; notify(); hideToast(); };
    toastEl.style.opacity = '1'; clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 6000);
  }
  function alertTurn(g, prev) {
    if (!g || g.status !== 'active' || g.turn !== g.mySide) return;
    if (prev && prev.status === 'active' && prev.turn === g.turn) return; // no change
    if (store.open && store.active === g.id && !store.showBoard && !document.hidden) return;
    showToast(GAMES[g.type].name + ' : à toi contre ' + g.opp, g.id);
    if (document.hidden) { flashTitle('À toi · ' + GAMES[g.type].name + ' · ' + g.opp); beep(); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) restoreTitle(); });
  window.addEventListener('focus', restoreTitle);

  // ════════════════════════ parse GameServ pushes ════════════════════════
  function parseKV(toks) { const o = {}; for (const t of toks) { const i = t.indexOf('='); if (i > 0) o[t.slice(0, i)] = t.slice(i + 1); } return o; }
  function onGS(text) {
    if (text.startsWith('GS# ')) {
      const toks = text.slice(4).split(' '), id = toks[0], kv = parseKV(toks.slice(1));
      const type = kv.g; if (!GAMES[type]) return;
      const prev = store.games[id];
      const g = { id, type, board: GAMES[type].decode(kv.s), turn: kv.t, mySide: kv.me, opp: kv.opp, status: kv.st, result: kv.r };
      store.games[id] = g;
      if (!store.active || store.active === id) { store.active = id; store.showBoard = false; }
      if (g.status === 'offer' && (!prev || prev.status !== 'offer')) showToast(g.opp + ' te défie · ' + GAMES[type].name, id);
      notify();
      alertTurn(g, prev);
    } else if (text.startsWith('GS$TOPSTART')) {
      const type = text.slice('GS$TOPSTART '.length).trim() || 'chess';
      store.topPending = []; store.boards[type] = []; notify();
    } else if (text.startsWith('GS$TOPROW ')) {
      const p = text.slice(10).split(' '); // type i account rank pts
      const type = p[0];
      (store.topPending = store.topPending || []).push({ rank: p[1], account: p[2], tier: p[3], points: +p[4] });
      store.boards[type] = store.topPending.slice(); notify();
    } else if (text.startsWith('GS$ ')) {
      const p = text.slice(4).split(' '), account = p[0], type = p[1], kv = parseKV(p.slice(2));
      const rec = { rank: kv.r, points: +kv.p, wins: +kv.w, losses: +kv.l, draws: +kv.d };
      const key = account.toLowerCase();
      (statsCache[key] = statsCache[key] || {})[type] = rec;
      if (key === myAccount()) store.myStats = statsCache[key];
      notify();
    }
  }
  // GameServ pushes machine-readable state in an invisible client-only tag
  // (+tchatou.fr/gs on a bodiless TAGMSG), so plain IRC clients never see it and
  // only get GameServ's human-readable NOTICE. We read the tag and drive the UI.
  orbit.on('raw', (msg) => {
    if (!msg || msg.command !== 'TAGMSG' || (msg.nick || '').toLowerCase() !== GS) return;
    const text = msg.tags && msg.tags['+tchatou.fr/gs'];
    if (text && /^GS[#$]/.test(text)) { try { onGS(text); } catch (e) { log('gs parse error', e); } }
  });
  // The web UI renders from the tag, so hide GameServ's human NOTICEs and our
  // own command echoes from the chat display.
  orbit.addMessageFilter((m) => {
    if ((m.nick || '').toLowerCase() === GS && m.command === 'NOTICE') return true;
    const t = m.text || '';
    if (m.command === 'PRIVMSG' && (m.target || '').toLowerCase() === GS && /^(CHALLENGE|ACCEPT|DECLINE|MOVE|RESIGN|STATS|TOP|GAMES)\b/i.test(t)) return true;
    return false;
  });
  // On (re)connect, ask GameServ for our rank.
  orbit.on('raw', (msg) => { if (msg && (msg.command === '376' || msg.command === '422')) setTimeout(refreshStats, 1500); });

  // ════════════════════════ UI ════════════════════════
  const RANK_BADGE = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Master: '💎' };

  function statusText(g) {
    if (g.status === 'offer') return g.opp + ' te défie';
    if (g.status === 'pending') return 'En attente de ' + g.opp + '…';
    if (g.status === 'over') return g.result === 'draw' ? 'Match nul.' : g.result === 'win' ? 'Tu gagnes !' : 'Tu perds.';
    return g.turn === g.mySide ? 'À toi' : 'Au tour de ' + g.opp;
  }

  function Panel() {
    const s = useStore();
    const games = Object.values(s.games);
    const invites = games.filter((g) => g.status === 'offer');
    const active = s.active ? s.games[s.active] : null;
    const showForm = !active || active.status === 'offer';
    const [nick, setNick] = useState(() => s.challengeNick || (() => { const a = orbit.state.active(); return a && a[0] !== '#' ? a : ''; })());
    useEffect(() => { if (s.challengeNick) { setNick(s.challengeNick); s.challengeNick = ''; } });
    useEffect(() => { refreshStats(); }, []);
    const ms = s.myStats;
    const myPlayed = ms ? Object.keys(GAMES).filter((t) => ms[t] && (ms[t].wins + ms[t].losses + ms[t].draws) > 0) : [];
    const btn = { border: '1px solid var(--border,#444)', background: 'transparent', color: 'inherit', borderRadius: '8px', padding: '.4rem .7rem', font: 'inherit', fontSize: '.85rem', cursor: 'pointer' };

    return html`<div style=${{ position: 'fixed', right: '14px', bottom: '74px', zIndex: 60, width: '344px', maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--bg2,#15151a)', color: 'var(--tx,#eee)', border: '1px solid var(--border,#333)', borderRadius: '14px', boxShadow: '0 24px 60px -20px rgba(0,0,0,.7)', padding: '.85rem' }}>
      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.6rem' }}>
        <strong style=${{ font: '700 .95rem/1 inherit' }}>Jeux</strong>
        <button onClick=${() => { s.open = false; notify(); }} style=${{ ...btn, padding: '.15rem .45rem' }}>✕</button>
      </div>

      ${myPlayed.length ? html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '.3rem', margin: '-.15rem 0 .55rem' }}>
        ${myPlayed.map((t) => { const r = ms[t]; return html`<div key=${t} style=${{ display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.78rem', padding: '.32rem .55rem', background: 'rgba(255,255,255,.05)', borderRadius: '8px' }}>
          <span style=${{ width: '1.1rem', textAlign: 'center' }}>${GAMES[t].icon}</span>
          <span style=${{ fontWeight: 700 }}>${RANK_BADGE[r.rank] || ''} ${r.rank}</span>
          <span style=${{ color: 'var(--tx-dim,#aaa)' }}>${r.points} pts</span>
          <span style=${{ marginLeft: 'auto', color: 'var(--tx-dim,#aaa)' }}>✓${r.wins} ✗${r.losses} =${r.draws}</span>
        </div>`; })}
      </div>` : null}

      ${invites.map((g) => html`<div key=${g.id} style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', background: 'rgba(255,255,255,.05)', borderRadius: '8px', padding: '.45rem .6rem', marginBottom: '.4rem' }}>
        <span style=${{ fontSize: '.84rem' }}><b>${g.opp}</b> te défie · ${GAMES[g.type].name}</span>
        <span style=${{ display: 'flex', gap: '.3rem' }}>
          <button onClick=${() => accept(g.id)} style=${{ ...btn, color: '#2ea043', borderColor: '#2ea043' }}>Accepter</button>
          <button onClick=${() => decline(g.id)} style=${btn}>Refuser</button>
        </span>
      </div>`)}

      ${games.length ? html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginBottom: '.5rem', alignItems: 'center' }}>
        ${games.map((g) => html`<button key=${g.id} onClick=${() => { s.active = g.id; s.showBoard = false; notify(); }} style=${{ ...btn, fontSize: '.76rem', padding: '.22rem .5rem', borderColor: s.active === g.id && !s.showBoard ? 'var(--ac,#5b8cff)' : undefined }}>${GAMES[g.type].icon} ${g.opp}${g.status === 'active' && g.turn === g.mySide ? ' •' : ''}</button>`)}
        <button onClick=${() => { s.active = null; notify(); }} title="Nouvelle partie" style=${{ ...btn, fontSize: '.76rem', padding: '.22rem .5rem' }}>＋</button>
      </div>` : null}

      ${!showForm ? (() => {
      const g = active, def = GAMES[g.type], over = g.status === 'over';
      return html`<div>
          <div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--tx-dim,#aaa)', margin: '.1rem .1rem .25rem' }}>
            <span>${def.icon} ${def.name} · vs <b>${g.opp}</b></span>
            <span>${statusText(g)}</span>
          </div>
          <${def.Board} game=${g} play=${(mv) => { sendMove(g.id, mv); restoreTitle(); hideToast(); }} key=${g.id + g.status} />
          ${over ? html`<div style=${{ textAlign: 'center', fontWeight: 700, fontSize: '.92rem', margin: '.45rem 0' }}>${statusText(g)}</div>` : null}
          <div style=${{ display: 'flex', gap: '.4rem', justifyContent: 'center', marginTop: '.5rem' }}>
            ${over ? html`<button onClick=${() => { s.active = null; s.challengeNick = g.opp; notify(); }} style=${btn}>Revanche</button>` : null}
            ${!over ? html`<button onClick=${() => resign(g.id)} style=${btn}>Abandonner</button>` : null}
          </div>
        </div>`;
    })() : html`<div>
        <div style=${{ display: 'flex', gap: '.4rem', marginBottom: '.55rem' }}>
          <button onClick=${() => { store.showBoard = false; notify(); }} style=${{ ...btn, flex: 1, fontSize: '.78rem', borderColor: !s.showBoard ? 'var(--ac,#5b8cff)' : undefined }}>Nouvelle partie</button>
          <button onClick=${() => { store.showBoard = true; fetchTop(store.topType); notify(); }} style=${{ ...btn, flex: 1, fontSize: '.78rem', borderColor: s.showBoard ? 'var(--ac,#5b8cff)' : undefined }}>🏆 Classement</button>
        </div>
        ${s.showBoard ? html`<div>
          <div style=${{ display: 'flex', gap: '.3rem', marginBottom: '.5rem' }}>
            ${Object.keys(GAMES).map((t) => html`<button key=${t} onClick=${() => { store.topType = t; fetchTop(t); notify(); }} style=${{ ...btn, flex: 1, fontSize: '.74rem', padding: '.25rem .3rem', borderColor: s.topType === t ? 'var(--ac,#5b8cff)' : undefined }}>${GAMES[t].icon} ${GAMES[t].name}</button>`)}
          </div>
          ${(() => { const board = s.boards[s.topType];
        return !board ? html`<div style=${{ fontSize: '.8rem', color: 'var(--tx-dim,#888)', padding: '.5rem 0' }}>Chargement…</div>`
          : board.length === 0 ? html`<div style=${{ fontSize: '.8rem', color: 'var(--tx-dim,#888)', padding: '.5rem 0' }}>Personne au classement. Gagne une partie !</div>`
            : board.map((row, i) => html`<div key=${row.account} style=${{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.82rem', padding: '.32rem .2rem', borderBottom: '1px solid var(--border,rgba(255,255,255,.06))' }}>
                <span style=${{ width: '1.3rem', textAlign: 'right', color: 'var(--tx-dim,#aaa)' }}>${i + 1}</span>
                <span>${RANK_BADGE[row.tier] || ''}</span>
                <b style=${{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${row.account}</b>
                <span style=${{ color: 'var(--tx-dim,#aaa)' }}>${row.points} pts</span>
              </div>`); })()}
        </div>` : html`<div>
          <div style=${{ fontSize: '.8rem', color: 'var(--tx-dim,#aaa)', marginBottom: '.4rem' }}>Défie un membre connecté (il lui faut un compte). GameServ arbitre la partie.</div>
          <input value=${nick} onInput=${(e) => setNick(e.target.value)} placeholder="Pseudo de l'adversaire" style=${{ width: '100%', boxSizing: 'border-box', padding: '.5rem .6rem', borderRadius: '8px', border: '1px solid var(--border,#444)', background: 'var(--bg,#0e0e12)', color: 'inherit', font: 'inherit', marginBottom: '.5rem' }} />
          <div style=${{ display: 'flex', gap: '.4rem' }}>
            ${Object.keys(GAMES).map((id) => html`<button key=${id} onClick=${() => nick.trim() && challenge(nick.trim(), id)} style=${{ ...btn, flex: 1, fontSize: '.8rem' }}>${GAMES[id].icon} ${GAMES[id].name}</button>`)}
          </div>
        </div>`}
      </div>`}
    </div>`;
  }

  function GamesButton() {
    const s = useStore();
    const games = Object.values(s.games);
    const alert = games.some((g) => g.status === 'offer') || games.some((g) => g.status === 'active' && g.turn === g.mySide);
    return html`<${orbit.Fragment}>
      <button title="Jeux" onClick=${() => { s.open = !s.open; notify(); }} style=${{ position: 'relative', display: 'flex', alignItems: 'center', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: '0 .4rem', alignSelf: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style=${{ display: 'block' }}>
          <line x1="6" x2="10" y1="11" y2="11" />
          <line x1="8" x2="8" y1="9" y2="13" />
          <line x1="15" x2="15.01" y1="12" y2="12" />
          <line x1="18" x2="18.01" y1="10" y2="10" />
          <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
        </svg>
        ${alert ? html`<span style=${{ position: 'absolute', top: '0', right: '2px', width: '7px', height: '7px', borderRadius: '50%', background: '#2ea043' }}></span>` : null}
      </button>
      ${s.open ? html`<${Panel} />` : null}
    </${orbit.Fragment}>`;
  }

  // Rank badge on a profile card (asks GameServ for that account's stats).
  function RankChip({ nick }) {
    useStore();
    const key = (nick || '').toLowerCase();
    useEffect(() => { refreshStatsFor(nick); }, [nick]);
    const all = statsCache[key];
    if (!all) return null;
    const played = Object.keys(GAMES)
      .map((t) => ({ t, ...all[t] }))
      .filter((r) => r.rank && (r.wins + r.losses + r.draws) > 0)
      .sort((a, b) => b.points - a.points);
    if (!played.length) return null;
    const best = played[0]; // their strongest game
    return html`<span title=${'Meilleur classement : ' + GAMES[best.t].name} style=${{ display: 'inline-flex', alignItems: 'center', gap: '.3rem', fontSize: '.8rem', fontWeight: 600, padding: '.3rem .6rem', borderRadius: '999px', background: 'rgba(255,255,255,.06)', border: '1px solid var(--border,#444)' }}>${GAMES[best.t].icon} ${RANK_BADGE[best.rank] || ''} ${best.rank} · ${best.points} pts</span>`;
  }
  const refreshStatsFor = (nick) => cmd('STATS ' + nick);

  orbit.addUi('topbar_item', () => orbit.h(GamesButton));
  orbit.addUserAction((u) => html`<${RankChip} nick=${u.nick} />`);
  orbit.addUserAction((u) => html`<button className="pm-chip" onClick=${() => { store.challengeNick = u.nick; store.active = null; store.showBoard = false; store.open = true; notify(); u.close(); }}>♟ Défier à un jeu</button>`);
});
