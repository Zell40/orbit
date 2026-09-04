/*
 * Orbit radio — sandboxed web-radio player (orbit.panel).
 * Built-in French stations + user webradios (HTTPS only). Custom streams play
 * at once for this browser and are offered to HelpServ (EcoutE) for review.
 *
 * Security: user URLs are never eval'd / innerHTML'd / navigated to. They only
 * become <audio src> after an https:// + public-host check. The sandbox CSP
 * still blocks fetch/XHR (connect-src none); media-src https: is required.
 */
Orbit.plugin('orbit-radio', function (orbit, log) {
  var REVIEW_NICK = 'EcoutE';
  var MAX_CUSTOM = 8;
  var BUILTIN = [
    { id: 'inter', name: 'France Inter', tag: 'Généraliste', url: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3', color: '#e2001a', abbr: 'FI' },
    { id: 'info', name: 'France Info', tag: 'Info', url: 'https://icecast.radiofrance.fr/franceinfo-midfi.mp3', color: '#0066cc', abbr: 'IN' },
    { id: 'culture', name: 'France Culture', tag: 'Culture', url: 'https://icecast.radiofrance.fr/franceculture-midfi.mp3', color: '#6b2d5b', abbr: 'FC' },
    { id: 'musique', name: 'France Musique', tag: 'Classique', url: 'https://icecast.radiofrance.fr/francemusique-midfi.mp3', color: '#8b1a4a', abbr: 'FM' },
    { id: 'fip', name: 'FIP', tag: 'Éclectique', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3', color: '#e10600', abbr: 'FIP' },
    { id: 'fiprock', name: 'FIP Rock', tag: 'Rock', url: 'https://icecast.radiofrance.fr/fiprock-midfi.mp3', color: '#c41e3a', abbr: 'RK' },
    { id: 'fipgroove', name: 'FIP Groove', tag: 'Funk · Soul', url: 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3', color: '#d4a017', abbr: 'GR' },
    { id: 'mouv', name: 'Mouv\'', tag: 'Hip-hop · Electro', url: 'https://icecast.radiofrance.fr/mouv-midfi.mp3', color: '#111111', abbr: 'MV' },
    { id: 'rtl', name: 'RTL', tag: 'Généraliste', url: 'https://streaming.radio.rtl.fr/rtl-1-44-128', color: '#0055a4', abbr: 'RTL' },
    { id: 'rtl2', name: 'RTL2', tag: 'Pop-rock', url: 'https://streaming.radio.rtl.fr/rtl2-1-44-128', color: '#e30613', abbr: 'R2' },
    { id: 'fun', name: 'Fun Radio', tag: 'Dance · Hits', url: 'https://streaming.radio.funradio.fr/fun-1-44-128', color: '#ff6600', abbr: 'FUN' },
    { id: 'europe1', name: 'Europe 1', tag: 'Généraliste', url: 'https://europe1.lmn.fm/europe1.mp3', color: '#003087', abbr: 'E1' },
    { id: 'europe2', name: 'Europe 2', tag: 'Pop · Rock', url: 'https://europe2.lmn.fm/europe2.mp3', color: '#e2007a', abbr: 'E2' },
    { id: 'rmc', name: 'RMC', tag: 'Info · Sport', url: 'https://audio.bfmtv.com/rmcradio_128.mp3', color: '#c4a000', abbr: 'RMC' },
    { id: 'nrj', name: 'NRJ', tag: 'Hits', url: 'https://scdn.nrjaudio.fm/adwz1/fr/30001/mp3_128.mp3?origine=orbit', color: '#e30613', abbr: 'NRJ' },
    { id: 'cherie', name: 'Chérie FM', tag: 'Love songs', url: 'https://scdn.nrjaudio.fm/adwz1/fr/30201/mp3_128.mp3?origine=orbit', color: '#e91e8c', abbr: 'CH' },
    { id: 'rire', name: 'Rire & Chansons', tag: 'Humour', url: 'https://scdn.nrjaudio.fm/adwz1/fr/30401/mp3_128.mp3?origine=orbit', color: '#f4a261', abbr: 'R&C' },
    { id: 'nostalgie', name: 'Nostalgie', tag: 'Années 60–90', url: 'https://scdn.nrjaudio.fm/adwz1/fr/30601/mp3_128.mp3?origine=orbit', color: '#1a365d', abbr: 'NO' },
    { id: 'skyrock', name: 'Skyrock', tag: 'Rap · Urban', url: 'https://icecast.skyrock.net/s/natio_mp3_128k', color: '#111111', abbr: 'SKY' },
    { id: 'rfm', name: 'RFM', tag: 'Pop', url: 'https://stream.rfm.fr/rfm.mp3', color: '#e6007e', abbr: 'RFM' },
    { id: 'nova', name: 'Radio Nova', tag: 'Éclectique', url: 'https://novazz.ice.infomaniak.ch/novazz-128.mp3', color: '#ff5400', abbr: 'NV' },
    { id: 'ouifm', name: 'Oui FM', tag: 'Rock', url: 'https://ouifm.ice.infomaniak.ch/ouifm-high.mp3', color: '#00a651', abbr: 'OUI' },
  ];

  function clampVol(v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6; }
  function loadCustom() {
    var raw = orbit.storage.get('custom', []);
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < MAX_CUSTOM; i++) {
      var s = raw[i];
      if (!s || !s.id || !sanitizeName(s.name)) continue;
      var check = parseSafeStream(s.url);
      if (check.err) continue;
      out.push({
        id: String(s.id).slice(0, 40),
        name: sanitizeName(s.name),
        tag: 'Ma webradio',
        url: check.url,
        custom: true,
        color: s.color || colorFrom(String(s.name)),
        abbr: s.abbr || initials(String(s.name)),
      });
    }
    return out;
  }
  function stations() { return BUILTIN.concat(custom); }
  function findIndex(id) {
    var all = stations();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return i;
    return 0;
  }

  var custom = loadCustom();
  var lastReviewAt = 0;
  var audio = new Audio();
  audio.preload = 'none';
  var vol = clampVol(orbit.storage.get('volume', 0.6));
  audio.volume = vol;
  var idx = findIndex(orbit.storage.get('stationId', null));
  if (typeof orbit.storage.get('stationId', null) !== 'string') {
    var legacy = orbit.storage.get('station', 0);
    if (typeof legacy === 'number' && legacy >= 0 && legacy < BUILTIN.length) idx = legacy;
  }

  var css = document.createElement('style');
  css.textContent =
    '@keyframes rq{0%,100%{transform:scaleY(.28)}50%{transform:scaleY(1)}}' +
    '@keyframes rp{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.rbar{width:3px;border-radius:2px;background:var(--accent,#3a7);transform-origin:bottom;animation:rq .9s ease-in-out infinite}' +
    '.rlogo{flex:none;width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:#fff;font-size:8px;font-weight:800;letter-spacing:.02em;line-height:1;text-align:center}' +
    '.rrow{display:flex;align-items:center;gap:8px;padding:.35rem .45rem;border:0;border-radius:10px;background:transparent;color:var(--ink,inherit);font:inherit;text-align:left;cursor:pointer;width:100%}' +
    '.rrow:hover{background:rgba(128,128,128,.13)}' +
    '.rrow.on{box-shadow:inset 3px 0 0 var(--accent,#3a7);background:rgba(128,128,128,.08)}' +
    '.rrow__txt{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}' +
    '.rrow__txt b{font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.rrow__txt small{font-size:10.5px;color:var(--muted,#888)}' +
    '.rrow__x{flex:none;border:0;background:transparent;color:var(--muted,#888);cursor:pointer;font-size:14px;width:22px;height:22px;border-radius:6px}' +
    '.rrow__x:hover{color:var(--ink,inherit);background:rgba(128,128,128,.15)}' +
    '.radd{margin-top:8px;padding-top:8px;border-top:1px solid var(--border,#8884)}' +
    '.radd input{box-sizing:border-box;width:100%;margin:0 0 6px;padding:7px 8px;border:1px solid var(--border,#8886);border-radius:8px;background:var(--bg,#fff);color:var(--ink,inherit);font:inherit;font-size:12px}' +
    '.radd__err{color:#c0392b;font-size:11px;font-weight:650;margin:0 0 6px;display:none}' +
    '.radd__hint{font-size:10.5px;color:var(--muted,#888);margin:6px 0 0;line-height:1.35}';
  document.head.appendChild(css);

  var nowName, nowLogo, liveTxt, liveDot, bigPlay, eq, listEl, addErr;

  var pan = orbit.panel({
    slot: 'nav_item', icon: radioSvg(), label: 'Radio', title: 'Radio', width: 280,
    render: function (body) {
      var hero = document.createElement('div');
      hero.style.cssText = 'display:flex;align-items:center;gap:11px;padding:2px 2px 12px;border-bottom:1px solid var(--border,#8884);margin-bottom:10px';
      bigPlay = document.createElement('button');
      bigPlay.type = 'button';
      bigPlay.style.cssText = 'flex:none;width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;font-size:17px;background:var(--accent,#3a7);color:var(--bg,#fff);box-shadow:0 6px 16px -6px var(--accent,#3a7)';
      bigPlay.onclick = toggle;
      nowLogo = document.createElement('div');
      nowLogo.className = 'rlogo';
      var meta = document.createElement('div'); meta.style.cssText = 'min-width:0;flex:1';
      nowName = document.createElement('div'); nowName.style.cssText = 'font-weight:800;font-size:14px;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      var sub = document.createElement('div'); sub.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted,#999);margin-top:2px';
      liveDot = document.createElement('span'); liveDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:var(--accent,#3a7);animation:rp 1.3s ease-in-out infinite';
      eq = eqBars(4, 11);
      liveTxt = document.createElement('span');
      sub.appendChild(liveDot); sub.appendChild(eq); sub.appendChild(liveTxt);
      meta.appendChild(nowName); meta.appendChild(sub);
      hero.appendChild(bigPlay); hero.appendChild(nowLogo); hero.appendChild(meta);
      body.appendChild(hero);

      var vr = document.createElement('div'); vr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 2px 10px';
      var spk = document.createElement('span'); spk.textContent = '🔊'; spk.style.cssText = 'font-size:13px;opacity:.8';
      var slider = orbit.el.slider({ value: vol, onInput: function (v) {
        vol = clampVol(v); audio.volume = vol; orbit.storage.set('volume', vol);
        spk.textContent = vol < 0.02 ? '🔇' : vol < 0.5 ? '🔉' : '🔊';
      } });
      vr.appendChild(spk); vr.appendChild(slider);
      body.appendChild(vr);

      listEl = document.createElement('div');
      listEl.style.cssText = 'display:flex;flex-direction:column;gap:1px;max-height:196px;overflow:auto;margin:0 -4px';
      body.appendChild(listEl);

      var add = document.createElement('div');
      add.className = 'radd';
      var nameIn = document.createElement('input');
      nameIn.type = 'text'; nameIn.maxLength = 40; nameIn.placeholder = 'Nom de la radio';
      nameIn.autocomplete = 'off';
      var urlIn = document.createElement('input');
      urlIn.type = 'url'; urlIn.maxLength = 400; urlIn.placeholder = 'https://…/stream.mp3';
      urlIn.autocomplete = 'off';
      addErr = document.createElement('div'); addErr.className = 'radd__err';
      var addBtn = orbit.el.button('Ajouter ma webradio', function () {
        addCustom(nameIn.value, urlIn.value, function (ok) {
          if (ok) { nameIn.value = ''; urlIn.value = ''; }
        });
      });
      addBtn.style.width = '100%'; addBtn.style.fontSize = '12.5px';
      var hint = document.createElement('p');
      hint.className = 'radd__hint';
      hint.textContent = 'Flux HTTPS uniquement. Lecture immédiate ici ; le nom et le lien sont proposés à EcoutE pour vérification.';
      add.appendChild(nameIn); add.appendChild(urlIn); add.appendChild(addErr);
      add.appendChild(addBtn); add.appendChild(hint);
      body.appendChild(add);
      rebuildList();
    },
  });
  render();

  function playing() { return !audio.paused && !audio.error; }
  function current() { return stations()[idx] || BUILTIN[0]; }
  function pick(i, autoplay) {
    var all = stations();
    if (i < 0 || i >= all.length) return;
    idx = i;
    orbit.storage.set('stationId', all[idx].id);
    if (playing() || autoplay) {
      audio.src = all[idx].url;
      audio.play().catch(function (e) { log('play blocked: ' + e); render(); });
    }
    render();
  }
  function toggle() {
    if (playing()) { audio.pause(); return; }
    audio.src = current().url;
    audio.play().catch(function (e) { log('play blocked: ' + e); render(); });
  }
  function paintLogo(el, st) {
    el.textContent = st.abbr || initials(st.name);
    el.style.background = st.color || colorFrom(st.name);
  }
  function render() {
    if (!nowName) return;
    var st = current();
    var live = playing();
    bigPlay.textContent = live ? '⏸' : '▶';
    nowName.textContent = st.name;
    paintLogo(nowLogo, st);
    liveTxt.textContent = live ? 'LIVE · ' + st.tag : st.tag;
    liveDot.style.display = live ? 'block' : 'none';
    eq.style.display = live ? 'inline-flex' : 'none';
    Array.prototype.forEach.call(eq.children, function (b) { b.style.animationPlayState = live ? 'running' : 'paused'; });
    if (listEl) {
      Array.prototype.forEach.call(listEl.children, function (r, i) {
        r.className = 'rrow' + (i === idx ? ' on' : '');
      });
    }
    pan.active(live);
  }
  function rebuildList() {
    if (!listEl) return;
    listEl.textContent = '';
    stations().forEach(function (s, i) {
      var r = document.createElement('button');
      r.type = 'button'; r.className = 'rrow' + (i === idx ? ' on' : '');
      var logo = document.createElement('div'); logo.className = 'rlogo'; paintLogo(logo, s);
      var txt = document.createElement('div'); txt.className = 'rrow__txt';
      var t = document.createElement('b'); t.textContent = s.name;
      var sub = document.createElement('small'); sub.textContent = s.custom ? 'Ma webradio' : s.tag;
      txt.appendChild(t); txt.appendChild(sub);
      r.appendChild(logo); r.appendChild(txt);
      r.onclick = function () { pick(i, true); };
      if (s.custom) {
        var x = document.createElement('button');
        x.type = 'button'; x.className = 'rrow__x'; x.textContent = '×'; x.title = 'Retirer';
        x.onclick = function (e) { e.stopPropagation(); removeCustom(s.id); };
        r.appendChild(x);
      }
      listEl.appendChild(r);
    });
  }
  audio.onplaying = render; audio.onpause = render; audio.onerror = render;

  function showAddErr(msg) {
    if (!addErr) return;
    addErr.textContent = msg || '';
    addErr.style.display = msg ? 'block' : 'none';
  }
  function addCustom(name, url, done) {
    showAddErr('');
    var cleanName = sanitizeName(name);
    if (!cleanName) { showAddErr('Indique un nom (2 à 40 caractères).'); done(false); return; }
    var check = parseSafeStream(url);
    if (check.err) { showAddErr(check.err); done(false); return; }
    if (custom.length >= MAX_CUSTOM) { showAddErr('Maximum ' + MAX_CUSTOM + ' webradios perso.'); done(false); return; }
    var dup = stations().some(function (s) { return s.url === check.url; });
    if (dup) { showAddErr('Cette radio est déjà dans la liste.'); done(false); return; }
    var st = {
      id: 'c-' + Date.now().toString(36),
      name: cleanName,
      tag: 'Ma webradio',
      url: check.url,
      custom: true,
      color: colorFrom(cleanName),
      abbr: initials(cleanName),
    };
    custom.push(st);
    orbit.storage.set('custom', custom);
    rebuildList();
    pick(stations().length - 1, true);
    offerReview(st);
    done(true);
  }
  function removeCustom(id) {
    var was = current().id === id;
    custom = custom.filter(function (s) { return s.id !== id; });
    orbit.storage.set('custom', custom);
    if (was) idx = 0;
    rebuildList();
    pick(idx, false);
  }
  function offerReview(st) {
    var now = Date.now();
    if (now - lastReviewAt < 20000) { log('review skipped: cooldown'); return; }
    lastReviewAt = now;
    var nick = String(orbit.state.nick() || '?').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 32);
    var line = ('Webradio Orbit à vérifier — « ' + st.name + ' » — ' + st.url + ' (proposé par ' + nick + ')')
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .slice(0, 350);
    var p = orbit.irc.msg(REVIEW_NICK, line);
    if (p && typeof p.catch === 'function') p.catch(function (e) { log('review msg skipped: ' + e); });
  }

  /* ---- URL / name guards (user input never becomes HTML or a navigation) ---- */
  function sanitizeName(raw) {
    var s = String(raw || '').replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 40) return '';
    return s;
  }
  function isPrivateIPv4(a, b) {
    if (a === 0 || a === 10 || a === 127) return true;
    if (a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  function isPublicHost(host) {
    host = String(host || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (!host || host.indexOf(':') >= 0) return false;
    if (host === 'localhost' || host.indexOf('localhost.') === 0) return false;
    if (/\.local$|\.internal$|\.localhost$|\.home$|\.lan$|\.onion$/.test(host)) return false;
    var v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
      var o = [+v4[1], +v4[2], +v4[3], +v4[4]];
      if (o.some(function (n) { return n > 255; })) return false;
      return !isPrivateIPv4(o[0], o[1]);
    }
    return /^(?=.{4,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(host)
      && /\.[a-z]{2,}$/i.test(host);
  }
  function parseSafeStream(raw) {
    var s = String(raw || '').trim();
    if (!s || s.length > 400) return { err: 'URL trop longue ou vide.' };
    if (/[\s<>"'\\]/.test(s)) return { err: 'Caractères interdits dans l’URL.' };
    var u;
    try { u = new URL(s); } catch (e) { return { err: 'URL invalide.' }; }
    if (u.protocol !== 'https:') return { err: 'Le flux doit commencer par https://' };
    if (u.username || u.password) return { err: 'Pas d’identifiant dans l’URL.' };
    if (u.hash) return { err: 'Pas d’ancre (#) dans l’URL.' };
    if (!isPublicHost(u.hostname)) return { err: 'Hôte non autorisé.' };
    var host = u.hostname;
    if (u.port && u.port !== '443') host += ':' + u.port;
    return { url: 'https://' + host + u.pathname + u.search };
  }
  function initials(name) {
    var p = String(name).trim().split(/\s+/);
    if (p.length >= 2) return (p[0].charAt(0) + p[1].charAt(0)).toUpperCase();
    return String(name).replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || '?';
  }
  function colorFrom(name) {
    var h = 0, i, pal = ['#3b5bdb', '#0b7285', '#2b8a3e', '#e67700', '#c92a2a', '#5f3dc4', '#087f5b'];
    for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return pal[h % pal.length];
  }
  function eqBars(n, h) {
    var g = document.createElement('span');
    g.style.cssText = 'display:inline-flex;align-items:flex-end;gap:2px;height:' + h + 'px';
    for (var i = 0; i < n; i++) {
      var b = document.createElement('span'); b.className = 'rbar';
      b.style.height = h + 'px'; b.style.animationDelay = (i * 0.16) + 's'; b.style.animationPlayState = 'paused';
      g.appendChild(b);
    }
    return g;
  }
  function radioSvg() {
    return '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
      '<circle cx="12" cy="12" r="2"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>' +
      '<path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  }

  log('radio ready (' + BUILTIN.length + ' FR + custom)');
});
