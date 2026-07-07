/*
 * Orbit radio — a SANDBOXED web-radio player with a themed footer control.
 *
 * A "Radio" tab sits in the bottom nav next to Home/Rooms/Friends; clicking it opens
 * a floating player card (now-playing station, animated equalizer, play/pause, volume,
 * station list). Uses the `nav_item` UI slot.
 * It runs in an opaque-origin iframe: it plays the stream with its OWN <audio> (so
 * the play click keeps its user gesture) and remembers your station + volume via the
 * granted `storage` capability. No page / store / IRC access.
 *
 *   { "url": "/app/plugins/third/orbit-radio.js", "sandbox": true, "permissions": ["storage"] }
 *
 * Needs the sandbox CSP to allow `media-src https:` (see docs/SANDBOX.md). Stations
 * must be direct HTTPS streams (no .pls/.m3u playlists).
 */
Orbit.plugin('orbit-radio', function (orbit, log) {
  var STATIONS = [
    { name: 'FIP', tag: 'Éclectique · France', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3' },
    { name: 'FIP Rock', tag: 'Rock', url: 'https://icecast.radiofrance.fr/fiprock-midfi.mp3' },
    { name: 'FIP Groove', tag: 'Funk · Soul', url: 'https://icecast.radiofrance.fr/fipgroove-midfi.mp3' },
    { name: 'Groove Salad', tag: 'Ambient · Downtempo', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
    { name: 'Lush', tag: 'Mellow vocals', url: 'https://ice1.somafm.com/lush-128-mp3' },
    { name: 'Indie Pop Rocks', tag: 'Indie', url: 'https://ice1.somafm.com/indiepop-128-mp3' },
    { name: 'Drone Zone', tag: 'Deep ambient', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  ];
  function clampVol(v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6; }

  var audio = new Audio();
  audio.preload = 'none';
  var vol = clampVol(orbit.storage.get('volume', 0.6));
  audio.volume = vol;
  var idx = orbit.storage.get('station', 0);
  if (typeof idx !== 'number' || idx < 0 || idx >= STATIONS.length) idx = 0;

  orbit.ui('nav_item', function (root) {
    var css = document.createElement('style');
    css.textContent =
      '@keyframes obr-eq{0%,100%{transform:scaleY(.28)}50%{transform:scaleY(1)}}' +
      '@keyframes obr-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}' +
      '@keyframes obr-in{from{opacity:0;transform:translateY(10px) scale(.97)}to{opacity:1;transform:none}}' +
      '.obr-bar{width:3px;border-radius:2px;background:var(--accent,#3a7);transform-origin:bottom;animation:obr-eq .9s ease-in-out infinite}' +
      '.obr-st{display:flex;flex-direction:column;gap:1px;padding:.4rem .5rem;border:0;border-radius:10px;background:transparent;color:var(--ink,inherit);font:inherit;text-align:left;cursor:pointer;width:100%;transition:background .12s}' +
      '.obr-st:hover{background:rgba(128,128,128,.13)}' +
      '.obr-st.on{background:transparent;box-shadow:inset 3px 0 0 var(--accent,#3a7)}' +
      '.obr-st.on .obr-nm{color:var(--accent,#3a7)}' +
      '.obr-nm{font-weight:700;font-size:12.5px}.obr-tg{font-size:10.5px;color:var(--muted,#888)}' +
      'input[type=range].obr-vol{-webkit-appearance:none;appearance:none;height:4px;border-radius:3px;flex:1;cursor:pointer;background:var(--border,#8886);accent-color:var(--accent,#3a7)}';
    root.appendChild(css);

    root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;' +
      'font:600 12px system-ui,-apple-system,sans-serif;color:var(--ink,inherit)';

    // ── floating player card (above the trigger; hidden until opened) ──────────
    var card = document.createElement('div');
    card.style.cssText = 'display:none;width:264px;box-sizing:border-box;padding:12px;border-radius:16px;' +
      'background:var(--bg,#0d0d0f);border:1px solid var(--border,#8884);' +
      'box-shadow:0 20px 50px -12px rgba(0,0,0,.7),0 3px 10px -3px rgba(0,0,0,.5);animation:obr-in .18s ease both';

    var head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:.4rem;margin-bottom:10px';
    var htitle = document.createElement('div');
    htitle.textContent = 'Radio'; htitle.style.cssText = 'font-weight:800;font-size:13px;letter-spacing:.02em;flex:1';
    var hwave = eqBars(4, 11); hwave.style.marginRight = '2px';
    var close = iconBtn('✕'); close.style.width = '24px'; close.style.height = '24px'; close.title = 'Close';
    close.onclick = function () { setOpen(false); };
    head.appendChild(hwave); head.appendChild(htitle); head.appendChild(close);

    // now-playing hero
    var hero = document.createElement('div');
    hero.style.cssText = 'display:flex;align-items:center;gap:11px;padding:4px 2px 12px;' +
      'border-bottom:1px solid var(--border,#8884);margin-bottom:10px';
    var bigPlay = document.createElement('button');
    bigPlay.type = 'button';
    bigPlay.style.cssText = 'flex:none;width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;' +
      'display:grid;place-items:center;font-size:17px;background:var(--accent,#3a7);color:var(--bg,#fff);' +
      'box-shadow:0 6px 16px -6px var(--accent,#3a7);transition:transform .1s';
    bigPlay.onmousedown = function () { bigPlay.style.transform = 'scale(.92)'; };
    bigPlay.onmouseup = bigPlay.onmouseleave = function () { bigPlay.style.transform = 'none'; };
    bigPlay.onclick = toggle;
    var heroMeta = document.createElement('div'); heroMeta.style.cssText = 'min-width:0;flex:1';
    var nowName = document.createElement('div'); nowName.style.cssText = 'font-weight:800;font-size:14px;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    var nowSub = document.createElement('div'); nowSub.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted,#999);margin-top:2px';
    var liveDot = document.createElement('span'); liveDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:var(--accent,#3a7);animation:obr-pulse 1.3s ease-in-out infinite';
    var liveTxt = document.createElement('span');
    nowSub.appendChild(liveDot); nowSub.appendChild(liveTxt);
    heroMeta.appendChild(nowName); heroMeta.appendChild(nowSub);
    hero.appendChild(bigPlay); hero.appendChild(heroMeta);

    // volume
    var volRow = document.createElement('div');
    volRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 2px 10px';
    var spk = document.createElement('span'); spk.textContent = '🔊'; spk.style.cssText = 'font-size:13px;opacity:.8';
    var range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '1'; range.step = '0.01'; range.value = String(vol);
    range.className = 'obr-vol'; range.title = 'Volume';
    range.oninput = function () { vol = clampVol(range.value); audio.volume = vol; orbit.storage.set('volume', vol); spk.textContent = vol < .02 ? '🔇' : vol < .5 ? '🔉' : '🔊'; };
    volRow.appendChild(spk); volRow.appendChild(range);

    // station list
    var list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:1px;max-height:172px;overflow:auto;margin:0 -4px';
    var rows = STATIONS.map(function (s, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'obr-st';
      var nm = document.createElement('span'); nm.className = 'obr-nm'; nm.textContent = s.name;
      var tg = document.createElement('span'); tg.className = 'obr-tg'; tg.textContent = s.tag;
      b.appendChild(nm); b.appendChild(tg);
      b.onclick = function () { pick(i, true); };
      list.appendChild(b);
      return b;
    });

    card.appendChild(head); card.appendChild(hero); card.appendChild(volRow); card.appendChild(list);

    // ── nav trigger — styled like the Home/Rooms/Friends tabs (icon over label) ──
    var trig = document.createElement('button');
    trig.type = 'button';
    trig.title = 'Radio';
    trig.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
      'min-width:54px;height:52px;padding:6px 8px;cursor:pointer;border:0;border-radius:12px;' +
      'background:transparent;color:var(--muted,#999);font:inherit;transition:color .12s,background .12s';
    var icRow = document.createElement('span');
    icRow.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;height:21px';
    var ic = radioSvg();
    var teq = eqBars(3, 15); teq.style.display = 'none';
    icRow.appendChild(ic); icRow.appendChild(teq);
    var label = document.createElement('span');
    label.style.cssText = 'font-size:.68rem;font-weight:600;letter-spacing:.01em;line-height:1;max-width:6rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    label.textContent = 'Radio';
    trig.appendChild(icRow); trig.appendChild(label);
    trig.onmouseenter = function () { if (!open) trig.style.background = 'var(--bg,rgba(127,127,127,.12))'; };
    trig.onmouseleave = function () { if (!open) trig.style.background = 'transparent'; };
    trig.onclick = function () { setOpen(!open); };

    root.appendChild(card);
    root.appendChild(trig);

    // ── state ─────────────────────────────────────────────────────────────────
    var open = false;
    function playing() { return !audio.paused && !audio.error; }

    function pick(i, autoplay) {
      idx = i; orbit.storage.set('station', idx);
      if (playing() || autoplay) { audio.src = STATIONS[idx].url; audio.play().catch(function (e) { log('play blocked: ' + e); render(); }); }
      render();
    }
    function toggle() {
      if (playing()) { audio.pause(); return; }
      audio.src = STATIONS[idx].url; audio.play().catch(function (e) { log('play blocked: ' + e); render(); });
    }
    function setOpen(v) {
      open = v;
      card.style.display = v ? 'block' : 'none';
      trig.style.background = 'transparent';
      render();
    }
    function eqRun(on) {
      [hwave, teq].forEach(function (g) {
        Array.prototype.forEach.call(g.children, function (b) { b.style.animationPlayState = on ? 'running' : 'paused'; });
      });
    }
    function render() {
      var live = playing();
      bigPlay.textContent = live ? '⏸' : '▶';
      nowName.textContent = STATIONS[idx].name;
      liveTxt.textContent = live ? 'LIVE · ' + STATIONS[idx].tag : STATIONS[idx].tag;
      liveDot.style.display = live ? 'block' : 'none';
      teq.style.display = live ? 'inline-flex' : 'none';
      ic.style.display = live ? 'none' : 'inline-flex';
      // Keep the label fixed ("Radio") so the tab never changes width — the frame is
      // centered on a fixed-width nav slot, so a variable label would shift the card.
      trig.style.color = (open || live) ? 'var(--accent,#3a7)' : 'var(--muted,#999)';
      rows.forEach(function (b, i) { b.classList.toggle('on', i === idx); });
      eqRun(live);
    }
    audio.onplaying = render; audio.onpause = render; audio.onerror = render;
    render();
  });

  // ── little builders ──────────────────────────────────────────────────────────
  function eqBars(n, h) {
    var g = document.createElement('span');
    g.style.cssText = 'display:inline-flex;align-items:flex-end;gap:2px;height:' + h + 'px';
    for (var i = 0; i < n; i++) {
      var b = document.createElement('span'); b.className = 'obr-bar';
      b.style.height = h + 'px'; b.style.animationDelay = (i * 0.16) + 's'; b.style.animationPlayState = 'paused';
      g.appendChild(b);
    }
    return g;
  }
  function iconBtn(txt) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
    b.style.cssText = 'flex:none;border:0;background:transparent;color:var(--muted,#999);cursor:pointer;' +
      'border-radius:8px;font-size:13px;display:grid;place-items:center';
    b.onmouseenter = function () { b.style.color = 'var(--ink,inherit)'; };
    b.onmouseleave = function () { b.style.color = 'var(--muted,#999)'; };
    return b;
  }
  function radioSvg() {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '21'); s.setAttribute('height', '21'); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.style.cssText = 'display:inline-flex';
    s.innerHTML = '<circle cx="12" cy="12" r="2"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>' +
      '<path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
    return s;
  }

  log('radio ready (' + STATIONS.length + ' stations)');
});
