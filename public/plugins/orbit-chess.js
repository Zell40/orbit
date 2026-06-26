/*
 * Orbit chess plugin — play a game of chess over IRCv3 client-only message tags.
 *
 * Moves travel as TAGMSG carrying the client-only tag `+tchatou.fr/chess`, which
 * the server relays but never interprets, so a game is invisible to non-chess
 * clients and adds zero channel spam. Both clients run the same move generator
 * (perft-verified) and validate every move, so there is no trusted referee.
 *
 * Wire verbs (tag value): offer:w|b  accept  decline  move:<uci>  resign
 *                         draw  draw-accept  sync-req  sync:<fen>  rematch:w|b
 *
 * Load via config.json:  "plugins": ["/app/plugins/orbit-chess.js"]
 */
Orbit.plugin('orbit-chess', (orbit, log) => {
  const TAG = '+tchatou.fr/chess';
  const { useState, useEffect } = orbit.React;
  const html = orbit.html;

  // ── engine ────────────────────────────────────────────────────────────────
  // Squares 0..63, a1=0, h1=7, a8=56, h8=63. file=s&7, rank=s>>3. White moves rank+.
  const fileOf = (s) => s & 7, rankOf = (s) => s >> 3, sq = (f, r) => r * 8 + f;
  const colorOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
  const isOwn = (p, c) => p && colorOf(p) === c;
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const BDIR = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const RDIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function initialState() {
    const b = new Array(64).fill('');
    const back = 'RNBQKBNR';
    for (let f = 0; f < 8; f++) { b[sq(f, 0)] = back[f]; b[sq(f, 1)] = 'P'; b[sq(f, 6)] = 'p'; b[sq(f, 7)] = back[f].toLowerCase(); }
    return { board: b, turn: 'w', castling: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, full: 1 };
  }

  function isAttacked(board, target, by) {
    const tf = fileOf(target), tr = rankOf(target);
    const pr = by === 'w' ? tr - 1 : tr + 1;
    for (const df of [-1, 1]) { const f = tf + df; if (f >= 0 && f < 8 && pr >= 0 && pr < 8) { const p = board[sq(f, pr)]; if (p && colorOf(p) === by && p.toUpperCase() === 'P') return true; } }
    for (const [df, dr] of KNIGHT) { const f = tf + df, r = tr + dr; if (f >= 0 && f < 8 && r >= 0 && r < 8) { const p = board[sq(f, r)]; if (p && colorOf(p) === by && p.toUpperCase() === 'N') return true; } }
    for (const [df, dr] of KING) { const f = tf + df, r = tr + dr; if (f >= 0 && f < 8 && r >= 0 && r < 8) { const p = board[sq(f, r)]; if (p && colorOf(p) === by && p.toUpperCase() === 'K') return true; } }
    for (const [df, dr] of BDIR) { let f = tf + df, r = tr + dr; while (f >= 0 && f < 8 && r >= 0 && r < 8) { const p = board[sq(f, r)]; if (p) { if (colorOf(p) === by && (p.toUpperCase() === 'B' || p.toUpperCase() === 'Q')) return true; break; } f += df; r += dr; } }
    for (const [df, dr] of RDIR) { let f = tf + df, r = tr + dr; while (f >= 0 && f < 8 && r >= 0 && r < 8) { const p = board[sq(f, r)]; if (p) { if (colorOf(p) === by && (p.toUpperCase() === 'R' || p.toUpperCase() === 'Q')) return true; break; } f += df; r += dr; } }
    return false;
  }
  const kingSq = (board, c) => board.indexOf(c === 'w' ? 'K' : 'k');
  const inCheck = (st, c) => isAttacked(st.board, kingSq(st.board, c), c === 'w' ? 'b' : 'w');

  function addPawn(moves, from, to, promo, flags) {
    if (promo) { for (const pr of ['q', 'r', 'b', 'n']) moves.push(Object.assign({ from, to, promo: pr }, flags)); }
    else moves.push(Object.assign({ from, to }, flags));
  }
  function pseudoMoves(state) {
    const { board, turn, ep, castling } = state, c = turn, dir = c === 'w' ? 1 : -1;
    const startRank = c === 'w' ? 1 : 6, promoRank = c === 'w' ? 7 : 0, moves = [];
    for (let s = 0; s < 64; s++) {
      const p = board[s]; if (!p || colorOf(p) !== c) continue;
      const f = fileOf(s), r = rankOf(s), t = p.toUpperCase();
      if (t === 'P') {
        const r1 = r + dir;
        if (r1 >= 0 && r1 < 8 && !board[sq(f, r1)]) {
          addPawn(moves, s, sq(f, r1), r1 === promoRank, {});
          if (r === startRank && !board[sq(f, r + 2 * dir)]) moves.push({ from: s, to: sq(f, r + 2 * dir), double: true });
        }
        for (const df of [-1, 1]) {
          const cf = f + df, cr = r + dir; if (cf < 0 || cf > 7 || cr < 0 || cr > 7) continue;
          const to = sq(cf, cr), tp = board[to];
          if (tp && colorOf(tp) !== c) addPawn(moves, s, to, cr === promoRank, { capture: true });
          else if (to === ep) moves.push({ from: s, to, ep: true });
        }
      } else if (t === 'N') {
        for (const [df, dr] of KNIGHT) { const cf = f + df, cr = r + dr; if (cf < 0 || cf > 7 || cr < 0 || cr > 7) continue; const to = sq(cf, cr); if (!isOwn(board[to], c)) moves.push({ from: s, to }); }
      } else if (t === 'K') {
        for (const [df, dr] of KING) { const cf = f + df, cr = r + dr; if (cf < 0 || cf > 7 || cr < 0 || cr > 7) continue; const to = sq(cf, cr); if (!isOwn(board[to], c)) moves.push({ from: s, to }); }
        const enemy = c === 'w' ? 'b' : 'w', rank = c === 'w' ? 0 : 7, kFrom = sq(4, rank);
        if (s === kFrom && !isAttacked(board, kFrom, enemy)) {
          const Kr = c === 'w' ? castling.K : castling.k, Qr = c === 'w' ? castling.Q : castling.q;
          if (Kr && !board[sq(5, rank)] && !board[sq(6, rank)] && board[sq(7, rank)] === (c === 'w' ? 'R' : 'r')
            && !isAttacked(board, sq(5, rank), enemy) && !isAttacked(board, sq(6, rank), enemy)) moves.push({ from: kFrom, to: sq(6, rank), castle: 'K' });
          if (Qr && !board[sq(3, rank)] && !board[sq(2, rank)] && !board[sq(1, rank)] && board[sq(0, rank)] === (c === 'w' ? 'R' : 'r')
            && !isAttacked(board, sq(3, rank), enemy) && !isAttacked(board, sq(2, rank), enemy)) moves.push({ from: kFrom, to: sq(2, rank), castle: 'Q' });
        }
      } else {
        const dirs = t === 'B' ? BDIR : t === 'R' ? RDIR : BDIR.concat(RDIR);
        for (const [df, dr] of dirs) { let cf = f + df, cr = r + dr; while (cf >= 0 && cf < 8 && cr >= 0 && cr < 8) { const to = sq(cf, cr), tp = board[to]; if (tp) { if (colorOf(tp) !== c) moves.push({ from: s, to }); break; } moves.push({ from: s, to }); cf += df; cr += dr; } }
      }
    }
    return moves;
  }
  function makeMove(state, m) {
    const board = state.board.slice(), c = state.turn, dir = c === 'w' ? 1 : -1;
    const castling = Object.assign({}, state.castling), piece = board[m.from];
    board[m.from] = '';
    if (m.ep) board[sq(fileOf(m.to), rankOf(m.from))] = '';
    if (m.promo) board[m.to] = c === 'w' ? m.promo.toUpperCase() : m.promo; else board[m.to] = piece;
    if (m.castle) { const rk = c === 'w' ? 0 : 7; if (m.castle === 'K') { board[sq(7, rk)] = ''; board[sq(5, rk)] = c === 'w' ? 'R' : 'r'; } else { board[sq(0, rk)] = ''; board[sq(3, rk)] = c === 'w' ? 'R' : 'r'; } }
    if (piece.toUpperCase() === 'K') { if (c === 'w') { castling.K = castling.Q = false; } else { castling.k = castling.q = false; } }
    if (piece === 'R') { if (m.from === sq(0, 0)) castling.Q = false; if (m.from === sq(7, 0)) castling.K = false; }
    if (piece === 'r') { if (m.from === sq(0, 7)) castling.q = false; if (m.from === sq(7, 7)) castling.k = false; }
    if (m.to === sq(0, 0)) castling.Q = false; if (m.to === sq(7, 0)) castling.K = false;
    if (m.to === sq(0, 7)) castling.q = false; if (m.to === sq(7, 7)) castling.k = false;
    const ep = m.double ? sq(fileOf(m.from), rankOf(m.from) + dir) : -1;
    return { board, turn: c === 'w' ? 'b' : 'w', castling, ep, half: 0, full: state.full + (c === 'b' ? 1 : 0) };
  }
  function legalMoves(state) {
    const c = state.turn, out = [];
    for (const m of pseudoMoves(state)) { const ns = makeMove(state, m); if (!isAttacked(ns.board, kingSq(ns.board, c), c === 'w' ? 'b' : 'w')) out.push(m); }
    return out;
  }
  function gameOver(state) {
    if (legalMoves(state).length) return null;
    return inCheck(state, state.turn) ? { type: 'checkmate', winner: state.turn === 'w' ? 'b' : 'w' } : { type: 'stalemate' };
  }

  // ── notation + FEN ──────────────────────────────────────────────────────────
  const sqName = (s) => String.fromCharCode(97 + fileOf(s)) + (rankOf(s) + 1);
  const nameSq = (n) => sq(n.charCodeAt(0) - 97, +n[1] - 1);
  const moveToUci = (m) => sqName(m.from) + sqName(m.to) + (m.promo || '');
  function uciToMove(state, uci) {
    const from = nameSq(uci.slice(0, 2)), to = nameSq(uci.slice(2, 4)), promo = uci[4];
    return legalMoves(state).find((m) => m.from === from && m.to === to && (m.promo || '') === (promo || '')) || null;
  }
  function toFEN(state) {
    let rows = [];
    for (let r = 7; r >= 0; r--) { let row = '', e = 0; for (let f = 0; f < 8; f++) { const p = state.board[sq(f, r)]; if (p) { if (e) { row += e; e = 0; } row += p; } else e++; } if (e) row += e; rows.push(row); }
    const cr = (state.castling.K ? 'K' : '') + (state.castling.Q ? 'Q' : '') + (state.castling.k ? 'k' : '') + (state.castling.q ? 'q' : '');
    return `${rows.join('/')} ${state.turn} ${cr || '-'} ${state.ep < 0 ? '-' : sqName(state.ep)} 0 ${state.full}`;
  }
  function fromFEN(fen) {
    const [bd, turn, cast, ep] = fen.split(' '), board = new Array(64).fill(''), ranks = bd.split('/');
    for (let i = 0; i < 8; i++) { const r = 7 - i; let f = 0; for (const ch of ranks[i]) { if (/[1-8]/.test(ch)) f += +ch; else { board[sq(f, r)] = ch; f++; } } }
    return { board, turn, castling: { K: cast.includes('K'), Q: cast.includes('Q'), k: cast.includes('k'), q: cast.includes('q') }, ep: ep && ep !== '-' ? nameSq(ep) : -1, half: 0, full: 1 };
  }

  // ── transport ───────────────────────────────────────────────────────────────
  const esc = (v) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\:').replace(/ /g, '\\s').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  const send = (to, value) => orbit.irc.send(`@${TAG}=${esc(value)} TAGMSG ${to}`);

  // ── store ─────────────────────────────────────────────────────────────────
  // games keyed by lowercased opponent nick. One game per opponent.
  const store = { games: {}, open: false, active: null, subs: new Set() };
  const key = (n) => n.toLowerCase();
  function persist() {
    const out = {};
    for (const k in store.games) { const g = store.games[k]; if (g.status === 'active' || g.status === 'over') out[k] = { opp: g.opp, myColor: g.myColor, state: g.state, status: g.status, result: g.result, last: g.last }; }
    orbit.storage.set('games', out);
  }
  function notify() { persist(); store.subs.forEach((f) => f()); }
  function useStore() {
    const [, set] = useState(0);
    useEffect(() => { const f = () => set((x) => x + 1); store.subs.add(f); return () => store.subs.delete(f); }, []);
    return store;
  }
  function getGame(opp) { return store.games[key(opp)]; }
  function setGame(opp, g) { store.games[key(opp)] = g; if (!store.active) store.active = key(opp); }

  // ── turn alerts: toast + tab-title flash + soft chime when it becomes your turn
  // and you are not already watching that board. ──────────────────────────────
  let savedTitle = null, toastEl = null, toastTimer = 0, audioCtx = null;
  function restoreTitle() { if (savedTitle !== null) { document.title = savedTitle; savedTitle = null; } }
  function flashTitle(msg) { if (savedTitle === null) savedTitle = document.title; document.title = msg; }
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.connect(g); g.connect(audioCtx.destination);
      o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(880, t + 0.12);
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.start(t); o.stop(t + 0.33);
    } catch (e) { /* no audio */ }
  }
  function hideToast() { if (toastEl) toastEl.style.opacity = '0'; }
  function showToast(msg, opp) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      Object.assign(toastEl.style, { position: 'fixed', right: '14px', bottom: '120px', zIndex: '70', maxWidth: '260px',
        background: '#15151a', color: '#eee', border: '1px solid rgba(255,255,255,.14)', borderRadius: '12px', padding: '.6rem .8rem',
        font: '600 .85rem/1.3 system-ui,sans-serif', boxShadow: '0 16px 40px -16px rgba(0,0,0,.7)', cursor: 'pointer', transition: 'opacity .2s', opacity: '0' });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.onclick = () => { store.open = true; if (opp) store.active = key(opp); notify(); hideToast(); };
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 6000);
  }
  function alertTurn(g) {
    if (!g || g.status !== 'active' || g.state.turn !== g.myColor) return;
    if (store.open && key(store.active) === key(g.opp) && !document.hidden) return; // already watching this board
    showToast('♟ À toi contre ' + g.opp, g.opp);
    if (document.hidden) { flashTitle('♟ À toi · ' + g.opp); beep(); }
  }
  function challengeFromWhois(nick) {
    const g = getGame(nick);
    if (g && g.status !== 'over') { store.active = key(nick); store.open = true; notify(); }
    else offer(nick, 'r');
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) restoreTitle(); });
  window.addEventListener('focus', restoreTitle);

  // ── actions (UI + incoming) ─────────────────────────────────────────────────
  function offer(opp, color) {
    const my = color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    setGame(opp, { opp, myColor: my, state: initialState(), status: 'pending-out', result: null, last: null, draw: null });
    store.active = key(opp); store.open = true;
    send(opp, 'offer:' + (my === 'w' ? 'b' : 'w')); // tell them THEIR color
    notify();
  }
  function accept(opp) {
    const g = getGame(opp); if (!g || g.status !== 'pending-in') return;
    g.status = 'active'; g.state = initialState(); store.active = key(opp);
    send(opp, 'accept'); notify();
  }
  function decline(opp) { const g = getGame(opp); if (g && g.status === 'pending-in') { delete store.games[key(opp)]; send(opp, 'decline'); notify(); } }
  function resign(opp) { const g = getGame(opp); if (!g || g.status !== 'active') return; g.status = 'over'; g.result = { type: 'resign', winner: g.myColor === 'w' ? 'b' : 'w' }; send(opp, 'resign'); notify(); }
  function offerDraw(opp) { const g = getGame(opp); if (g && g.status === 'active') { g.draw = 'me'; send(opp, 'draw'); notify(); } }
  function acceptDraw(opp) { const g = getGame(opp); if (g && g.status === 'active' && g.draw === 'them') { g.status = 'over'; g.result = { type: 'draw' }; g.draw = null; send(opp, 'draw-accept'); notify(); } }
  function rematch(opp) {
    const g = getGame(opp); if (!g) return;
    const my = g.myColor === 'w' ? 'b' : 'w'; // swap colors
    g.myColor = my; g.state = initialState(); g.status = 'pending-out'; g.result = null; g.last = null; g.draw = null;
    send(opp, 'rematch:' + (my === 'w' ? 'b' : 'w')); notify();
  }
  // play MY move (already validated legal by the UI)
  function playMyMove(opp, move) {
    const g = getGame(opp); if (!g || g.status !== 'active' || g.state.turn !== g.myColor) return;
    g.state = makeMove(g.state, move); g.last = { from: move.from, to: move.to };
    send(opp, 'move:' + moveToUci(move));
    g.result = gameOver(g.state); if (g.result) g.status = 'over';
    restoreTitle(); hideToast();
    notify();
  }

  // ── incoming tags ─────────────────────────────────────────────────────────
  function onTag(from, value) {
    const ci = value.indexOf(':'), verb = ci < 0 ? value : value.slice(0, ci), arg = ci < 0 ? '' : value.slice(ci + 1);
    const g = getGame(from);
    if (verb === 'offer') {
      const myColor = arg === 'w' || arg === 'b' ? arg : 'b';
      setGame(from, { opp: from, myColor, state: initialState(), status: 'pending-in', result: null, last: null, draw: null });
      store.open = true; notify();
    } else if (verb === 'accept') {
      if (g && g.status === 'pending-out') { g.status = 'active'; g.state = initialState(); store.active = key(from); notify(); alertTurn(g); }
    } else if (verb === 'decline') {
      if (g && g.status === 'pending-out') { delete store.games[key(from)]; notify(); }
    } else if (verb === 'move') {
      if (!g || g.status !== 'active' || g.state.turn === g.myColor) { if (g) send(from, 'sync-req'); return; }
      const mv = uciToMove(g.state, arg);
      if (!mv) { send(from, 'sync-req'); return; }
      g.state = makeMove(g.state, mv); g.last = { from: mv.from, to: mv.to };
      g.result = gameOver(g.state); if (g.result) g.status = 'over';
      notify(); if (g.status === 'active') alertTurn(g);
    } else if (verb === 'resign') {
      if (g && g.status === 'active') { g.status = 'over'; g.result = { type: 'resign', winner: g.myColor }; notify(); }
    } else if (verb === 'draw') {
      if (g && g.status === 'active') { g.draw = 'them'; notify(); }
    } else if (verb === 'draw-accept') {
      if (g && g.status === 'active' && g.draw === 'me') { g.status = 'over'; g.result = { type: 'draw' }; g.draw = null; notify(); }
    } else if (verb === 'rematch') {
      const myColor = arg === 'w' || arg === 'b' ? arg : 'b';
      if (g) { g.myColor = myColor; g.state = initialState(); g.status = 'pending-in'; g.result = null; g.last = null; g.draw = null; store.open = true; notify(); }
    } else if (verb === 'sync-req') {
      if (g && (g.status === 'active' || g.status === 'over')) send(from, 'sync:' + toFEN(g.state));
    } else if (verb === 'sync') {
      if (g) { g.state = fromFEN(arg); g.result = gameOver(g.state); g.status = g.result ? 'over' : 'active'; notify(); if (g.status === 'active') alertTurn(g); }
    }
  }

  orbit.on('raw', (msg) => {
    if (!msg || msg.command !== 'TAGMSG' || !msg.nick) return;
    // echo-message reflects our own sent tags back to us — never treat them as the opponent's.
    if (msg.nick.toLowerCase() === (orbit.state.nick() || '').toLowerCase()) return;
    const v = msg.tags && msg.tags[TAG];
    if (v) try { onTag(msg.nick, v); } catch (e) { log('tag error', e); }
  });

  // restore games saved across reloads
  const saved = orbit.storage.get('games');
  if (saved && typeof saved === 'object') for (const k in saved) { const s = saved[k]; store.games[k] = { opp: s.opp, myColor: s.myColor, state: s.state, status: s.status, result: s.result, last: s.last, draw: null }; if (!store.active) store.active = k; }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const PROMO = { q: '♛', r: '♜', b: '♝', n: '♞' };

  function Board({ game }) {
    const [sel, setSel] = useState(-1);
    const [promo, setPromo] = useState(null); // {from,to}
    const st = game.state;
    const myTurn = game.status === 'active' && st.turn === game.myColor;
    const targets = sel >= 0 ? legalMoves(st).filter((m) => m.from === sel) : [];
    const order = [];
    if (game.myColor === 'w') { for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) order.push(sq(f, r)); }
    else { for (let r = 0; r < 8; r++) for (let f = 7; f >= 0; f--) order.push(sq(f, r)); }
    const checkSq = inCheck(st, st.turn) ? kingSq(st.board, st.turn) : -1;

    function click(s) {
      if (promo || !myTurn) return;
      const hit = targets.filter((m) => m.to === s);
      if (hit.length) {
        if (hit[0].promo) { setPromo({ from: sel, to: s }); return; }
        playMyMove(game.opp, hit[0]); setSel(-1); return;
      }
      setSel(isOwn(st.board[s], game.myColor) ? s : -1);
    }
    function pick(p) { playMyMove(game.opp, { from: promo.from, to: promo.to, promo: p, capture: !!st.board[promo.to] }); setPromo(null); setSel(-1); }

    return html`<div>
      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', width: '320px', maxWidth: '78vw', aspectRatio: '1', border: '1px solid var(--border,#333)', borderRadius: '8px', overflow: 'hidden', userSelect: 'none' }}>
        ${order.map((s) => {
      const light = (fileOf(s) + rankOf(s)) % 2 === 1;
      const isSel = s === sel, isTarget = targets.some((m) => m.to === s);
      const isLast = game.last && (s === game.last.from || s === game.last.to);
      const bg = isSel ? '#caa84a' : isLast ? (light ? '#cdd26a' : '#aab04a') : s === checkSq ? '#d05a5a' : light ? '#e9e4d6' : '#7d8aa0';
      return html`<div key=${s} onClick=${() => click(s)} style=${{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg, fontSize: '1.7rem', lineHeight: 1, cursor: myTurn ? 'pointer' : 'default', color: st.board[s] && colorOf(st.board[s]) === 'w' ? '#fff' : '#111', textShadow: st.board[s] && colorOf(st.board[s]) === 'w' ? '0 1px 1px rgba(0,0,0,.5)' : 'none' }}>
            ${st.board[s] ? GLYPH[st.board[s]] : ''}
            ${isTarget && !st.board[s] ? html`<span style=${{ position: 'absolute', width: '26%', height: '26%', borderRadius: '50%', background: 'rgba(0,0,0,.32)' }}></span>` : null}
            ${isTarget && st.board[s] ? html`<span style=${{ position: 'absolute', inset: '6%', border: '3px solid rgba(0,0,0,.32)', borderRadius: '50%' }}></span>` : null}
          </div>`;
    })}
      </div>
      ${promo ? html`<div style=${{ display: 'flex', gap: '.4rem', justifyContent: 'center', marginTop: '.5rem' }}>
        ${['q', 'r', 'b', 'n'].map((p) => html`<button key=${p} onClick=${() => pick(p)} style=${{ fontSize: '1.5rem', padding: '.2rem .5rem', cursor: 'pointer' }}>${PROMO[p]}</button>`)}
      </div>` : null}
    </div>`;
  }

  function captured(state, color) {
    const full = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
    const have = {}; for (const p of state.board) if (p && colorOf(p) === color) { const u = p.toUpperCase(); have[u] = (have[u] || 0) + 1; }
    let out = '';
    for (const t of ['Q', 'R', 'B', 'N', 'P']) { const n = (full[t] || 0) - (have[t] || 0); for (let i = 0; i < n; i++) out += GLYPH[color === 'w' ? t : t.toLowerCase()]; }
    return out;
  }

  function Panel() {
    const s = useStore();
    const games = Object.values(s.games).filter((g) => g.opp.toLowerCase() !== (orbit.state.nick() || '').toLowerCase());
    const invites = games.filter((g) => g.status === 'pending-in');
    const active = s.active ? s.games[s.active] : null;
    const [nick, setNick] = useState(() => { const a = orbit.state.active(); return a && a[0] !== '#' ? a : ''; });
    const btn = { border: '1px solid var(--border,#444)', background: 'transparent', color: 'inherit', borderRadius: '8px', padding: '.4rem .7rem', font: 'inherit', fontSize: '.85rem', cursor: 'pointer' };

    return html`<div style=${{ position: 'fixed', right: '14px', bottom: '74px', zIndex: 60, width: '356px', maxWidth: '92vw', background: 'var(--bg2,#15151a)', color: 'var(--tx,#eee)', border: '1px solid var(--border,#333)', borderRadius: '14px', boxShadow: '0 24px 60px -20px rgba(0,0,0,.7)', padding: '.85rem' }}>
      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.6rem' }}>
        <strong style=${{ font: '700 .95rem/1 inherit' }}>♟ Échecs</strong>
        <button onClick=${() => { s.open = false; notify(); }} style=${{ ...btn, padding: '.15rem .45rem' }}>✕</button>
      </div>

      ${invites.map((g) => html`<div key=${g.opp} style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', background: 'rgba(255,255,255,.05)', borderRadius: '8px', padding: '.45rem .6rem', marginBottom: '.4rem' }}>
        <span style=${{ fontSize: '.85rem' }}><b>${g.opp}</b> te défie (tu joues ${g.myColor === 'w' ? 'Blancs' : 'Noirs'})</span>
        <span style=${{ display: 'flex', gap: '.3rem' }}>
          <button onClick=${() => accept(g.opp)} style=${{ ...btn, color: '#2ea043', borderColor: '#2ea043' }}>Accepter</button>
          <button onClick=${() => decline(g.opp)} style=${btn}>Refuser</button>
        </span>
      </div>`)}

      ${games.length > 1 ? html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginBottom: '.5rem' }}>
        ${games.map((g) => html`<button key=${g.opp} onClick=${() => { s.active = key(g.opp); notify(); }} style=${{ ...btn, fontSize: '.78rem', padding: '.25rem .5rem', borderColor: s.active === key(g.opp) ? 'var(--ac,#5b8cff)' : undefined }}>${g.opp}${g.status === 'active' && g.state.turn === g.myColor ? ' •' : ''}</button>`)}
      </div>` : null}

      ${active && active.status !== 'pending-in' ? (() => {
      const g = active, over = g.status === 'over', myTurn = g.status === 'active' && g.state.turn === g.myColor;
      const result = !over ? '' : g.result.type === 'checkmate' ? (g.result.winner === g.myColor ? 'Échec et mat, tu gagnes !' : 'Échec et mat, tu perds.')
        : g.result.type === 'stalemate' ? 'Pat, partie nulle.' : g.result.type === 'draw' ? 'Partie nulle.'
          : g.result.winner === g.myColor ? `${g.opp} abandonne, tu gagnes !` : 'Tu as abandonné.';
      return html`<div>
          <div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--tx-dim,#aaa)', margin: '.1rem .1rem .35rem' }}>
            <span>vs <b>${g.opp}</b></span>
            <span>${over ? 'Terminé' : myTurn ? 'À toi' : `Au tour de ${g.opp}`}${!over && inCheck(g.state, g.state.turn) ? ' · échec' : ''}</span>
          </div>
          <div style=${{ fontSize: '1.1rem', minHeight: '1.3rem', textAlign: 'center', letterSpacing: '1px' }}>${captured(g.state, g.myColor === 'w' ? 'b' : 'w')}</div>
          <${Board} game=${g} key=${g.opp + g.status} />
          <div style=${{ fontSize: '1.1rem', minHeight: '1.3rem', textAlign: 'center', letterSpacing: '1px' }}>${captured(g.state, g.myColor)}</div>
          ${result ? html`<div style=${{ textAlign: 'center', fontWeight: 700, fontSize: '.9rem', margin: '.4rem 0' }}>${result}</div>` : null}
          <div style=${{ display: 'flex', gap: '.4rem', justifyContent: 'center', marginTop: '.5rem' }}>
            ${over ? html`<button onClick=${() => rematch(g.opp)} style=${btn}>Revanche</button>` : null}
            ${!over && g.draw === 'them' ? html`<button onClick=${() => acceptDraw(g.opp)} style=${{ ...btn, borderColor: '#2ea043', color: '#2ea043' }}>Accepter nulle</button>` : null}
            ${!over && g.draw !== 'them' ? html`<button onClick=${() => offerDraw(g.opp)} style=${btn} disabled=${g.draw === 'me'}>${g.draw === 'me' ? 'Nulle proposée' : 'Proposer nulle'}</button>` : null}
            ${!over ? html`<button onClick=${() => resign(g.opp)} style=${btn}>Abandonner</button>` : null}
            ${!over ? html`<button onClick=${() => send(g.opp, 'sync-req')} title="Resynchroniser" style=${btn}>⟳</button>` : null}
          </div>
        </div>`;
    })() : html`<div>
        <div style=${{ fontSize: '.8rem', color: 'var(--tx-dim,#aaa)', marginBottom: '.4rem' }}>Défie un autre membre. Il lui faut aussi le plugin échecs.</div>
        <input value=${nick} onInput=${(e) => setNick(e.target.value)} placeholder="Pseudo de l'adversaire" style=${{ width: '100%', boxSizing: 'border-box', padding: '.5rem .6rem', borderRadius: '8px', border: '1px solid var(--border,#444)', background: 'var(--bg,#0e0e12)', color: 'inherit', font: 'inherit', marginBottom: '.5rem' }} />
        <div style=${{ display: 'flex', gap: '.4rem' }}>
          <button onClick=${() => nick.trim() && offer(nick.trim(), 'w')} style=${{ ...btn, flex: 1 }}>Défier (Blancs)</button>
          <button onClick=${() => nick.trim() && offer(nick.trim(), 'b')} style=${{ ...btn, flex: 1 }}>Défier (Noirs)</button>
        </div>
      </div>`}
    </div>`;
  }

  function ChessButton() {
    const s = useStore();
    const games = Object.values(s.games).filter((g) => g.opp.toLowerCase() !== (orbit.state.nick() || '').toLowerCase());
    const alert = games.some((g) => g.status === 'pending-in') || games.some((g) => g.status === 'active' && g.state.turn === g.myColor);
    return html`<${orbit.Fragment}>
      <button title="Échecs (sur message-tags)" onClick=${() => { s.open = !s.open; notify(); }}
        style=${{ position: 'relative', background: 'transparent', border: 0, color: 'inherit', font: 'inherit', fontSize: '1.05rem', cursor: 'pointer', padding: '0 .4rem', alignSelf: 'center', opacity: 0.85 }}>
        ♟${alert ? html`<span style=${{ position: 'absolute', top: '2px', right: '0', width: '7px', height: '7px', borderRadius: '50%', background: '#2ea043' }}></span>` : null}
      </button>
      ${s.open ? html`<${Panel} />` : null}
    </${orbit.Fragment}>`;
  }

  orbit.addUi('topbar_item', () => orbit.h(ChessButton));
  // an incoming offer also surfaces as an inline message action, so you can accept from the chat
  orbit.addMessageAction((m) => {
    const g = getGame(m.nick);
    if (!g || g.status !== 'pending-in') return null;
    return html`<button title="Accepter la partie d'échecs" onClick=${() => accept(m.nick)} style=${{ color: '#2ea043' }}>♟✓</button>`;
  });
  // a "challenge to chess" button on each user's profile/whois card. Labelled to
  // set it apart from the ranked GameServ challenge (orbit-games): this one is the
  // instant, no-account peer-to-peer game that powers the shareable duel links.
  orbit.addUserAction((u) => html`<button className="pm-chip" onClick=${() => { challengeFromWhois(u.nick); u.close(); }}>♟ Échecs rapides (sans compte)</button>`);

  // ── duel link ───────────────────────────────────────────────────────────────
  // A shared link like /app/?channel=%23accueil&duel=chess&vs=<nick> drops a
  // visitor straight into a game: once they connect, we auto-challenge <nick>
  // (who generated the link and is waiting). No account, no referee — pure P2P.
  (function () {
    let fired = false;
    function tryDuel() {
      if (fired) return;
      const p = new URLSearchParams(window.location.search);
      if ((p.get('duel') || '').toLowerCase() !== 'chess') return;
      const vs = (p.get('vs') || '').trim(), me = (orbit.state.nick() || '').trim();
      if (!vs || vs.toLowerCase() === me.toLowerCase()) return;
      fired = true;
      setTimeout(() => offer(vs, 'r'), 1200); // let channel membership settle first
    }
    orbit.on('raw', (msg) => { if (msg && (msg.command === '376' || msg.command === '422')) tryDuel(); });
  })();

  log('chess ready');
});
