/*
 * Orbit invite plugin — share a room, or challenge a friend, from inside the chat.
 *
 * Two shareable links, generated for the channel you're in:
 *   • Room invite  → https://<host>/i/<salon>/?de=<you>     (lands on the invite page)
 *   • Chess duel   → https://<host>/app/?channel=#<salon>&duel=chess&vs=<you>
 *                     (the friend connects and is auto-challenged by orbit-chess)
 *
 * Uses the Web Share sheet on mobile, clipboard elsewhere. No account needed.
 */
Orbit.plugin('invite', (orbit, log) => {
  const { useState } = orbit.React;
  const html = orbit.html;
  const store = { open: false, subs: new Set() };
  const notify = () => store.subs.forEach((f) => f());
  function useStore() { const [, set] = useState(0); orbit.React.useEffect(() => { const f = () => set((x) => x + 1); store.subs.add(f); return () => store.subs.delete(f); }, []); return store; }

  const origin = () => window.location.origin;
  function activeChannel() { const a = orbit.state.active(); return a && a[0] === '#' ? a : '#accueil'; }
  const salonKey = () => activeChannel().replace(/^#+/, '');
  const me = () => (orbit.state.nick() || '').trim();

  function roomLink() {
    return `${origin()}/i/${encodeURIComponent(salonKey())}/?de=${encodeURIComponent(me())}`;
  }
  function duelLink() {
    return `${origin()}/app/?channel=${encodeURIComponent(activeChannel())}&duel=chess&vs=${encodeURIComponent(me())}`;
  }

  async function share(url, title, onDone) {
    try {
      if (navigator.share) { await navigator.share({ title, text: title, url }); onDone('shared'); return; }
    } catch (e) { /* user cancelled the share sheet — fall through to copy */ }
    try { await navigator.clipboard.writeText(url); onDone('copied'); }
    catch (e) { onDone('manual'); log('clipboard blocked', e); }
  }

  function Panel() {
    const s = useStore();
    const [state, setState] = useState({ which: '', how: '', url: '' });
    const chan = activeChannel();
    const btn = { display: 'block', width: '100%', textAlign: 'left', border: '1px solid var(--border,#444)', background: 'transparent', color: 'inherit', borderRadius: '10px', padding: '.6rem .7rem', font: 'inherit', fontSize: '.86rem', cursor: 'pointer', marginBottom: '.5rem' };
    const sub = { display: 'block', fontSize: '.74rem', color: 'var(--tx-dim,#9aa)', marginTop: '.15rem' };

    function go(which) {
      const url = which === 'duel' ? duelLink() : roomLink();
      const title = which === 'duel' ? `Défi aux échecs sur Tchatou` : `Rejoins-moi sur ${chan} · Tchatou`;
      share(url, title, (how) => setState({ which, how, url }));
    }

    return html`<div style=${{ position: 'fixed', right: '14px', bottom: '74px', zIndex: 60, width: '320px', maxWidth: '92vw', background: 'var(--bg2,#15151a)', color: 'var(--tx,#eee)', border: '1px solid var(--border,#333)', borderRadius: '14px', boxShadow: '0 24px 60px -20px rgba(0,0,0,.7)', padding: '.85rem' }}>
      <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.6rem' }}>
        <strong style=${{ font: '700 .95rem/1 inherit' }}>Inviter</strong>
        <button onClick=${() => { s.open = false; notify(); }} style=${{ ...btn, width: 'auto', marginBottom: 0, padding: '.15rem .45rem' }}>✕</button>
      </div>
      <button onClick=${() => go('room')} style=${btn}>
        🔗 Inviter des amis dans <b>${chan}</b>
        <span style=${sub}>Un lien à partager (WhatsApp, Discord…). Aucun compte requis.</span>
      </button>
      <button onClick=${() => go('duel')} style=${btn}>
        ♟ Défier un ami aux échecs
        <span style=${sub}>Il clique, il joue contre toi — sans inscription.</span>
      </button>
      ${state.how ? html`<div style=${{ marginTop: '.2rem' }}>
        <div style=${{ fontSize: '.78rem', color: '#2ea043', marginBottom: '.3rem' }}>${state.how === 'shared' ? 'Lien partagé ✓' : state.how === 'copied' ? 'Lien copié ✓ — colle-le où tu veux' : 'Copie ce lien :'}</div>
        <input readOnly value=${state.url} onClick=${(e) => e.target.select()} style=${{ width: '100%', boxSizing: 'border-box', padding: '.45rem .55rem', borderRadius: '8px', border: '1px solid var(--border,#444)', background: 'var(--bg,#0e0e12)', color: 'inherit', font: '.76rem/1.3 monospace' }} />
      </div>` : null}
    </div>`;
  }

  function InviteButton() {
    const s = useStore();
    return html`<${orbit.Fragment}>
      <button title="Inviter des amis" onClick=${() => { s.open = !s.open; notify(); }} style=${{ display: 'flex', alignItems: 'center', background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', padding: '0 .4rem', alignSelf: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style=${{ display: 'block' }}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" x2="19" y1="8" y2="14" />
          <line x1="22" x2="16" y1="11" y2="11" />
        </svg>
      </button>
      ${s.open ? html`<${Panel} />` : null}
    </${orbit.Fragment}>`;
  }

  orbit.addUi('topbar_item', () => orbit.h(InviteButton));
  log('invite ready');
});
