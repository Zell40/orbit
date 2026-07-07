/*
 * Orbit radio — sandboxed web-radio player, built on the plugin SDK (orbit.panel).
 * A "Radio" tab in the nav opens a themed player; its own <audio> plays the stream
 * and `storage` persists the station + volume. Needs `media-src https:` in the
 * sandbox CSP; stations are direct HTTPS streams.
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

  var css = document.createElement('style');
  css.textContent =
    '@keyframes rq{0%,100%{transform:scaleY(.28)}50%{transform:scaleY(1)}}' +
    '@keyframes rp{0%,100%{opacity:1}50%{opacity:.35}}' +
    '.rbar{width:3px;border-radius:2px;background:var(--accent,#3a7);transform-origin:bottom;animation:rq .9s ease-in-out infinite}';
  document.head.appendChild(css);

  var nowName, liveTxt, liveDot, bigPlay, eq, rows;

  var pan = orbit.panel({
    slot: 'nav_item', icon: radioSvg(), label: 'Radio', title: 'Radio', width: 264,
    render: function (body) {
      var hero = document.createElement('div');
      hero.style.cssText = 'display:flex;align-items:center;gap:11px;padding:2px 2px 12px;border-bottom:1px solid var(--border,#8884);margin-bottom:10px';
      bigPlay = document.createElement('button');
      bigPlay.type = 'button';
      bigPlay.style.cssText = 'flex:none;width:42px;height:42px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;font-size:17px;background:var(--accent,#3a7);color:var(--bg,#fff);box-shadow:0 6px 16px -6px var(--accent,#3a7)';
      bigPlay.onclick = toggle;
      var meta = document.createElement('div'); meta.style.cssText = 'min-width:0;flex:1';
      nowName = document.createElement('div'); nowName.style.cssText = 'font-weight:800;font-size:14px;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      var sub = document.createElement('div'); sub.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted,#999);margin-top:2px';
      liveDot = document.createElement('span'); liveDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:var(--accent,#3a7);animation:rp 1.3s ease-in-out infinite';
      eq = eqBars(4, 11);
      liveTxt = document.createElement('span');
      sub.appendChild(liveDot); sub.appendChild(eq); sub.appendChild(liveTxt);
      meta.appendChild(nowName); meta.appendChild(sub);
      hero.appendChild(bigPlay); hero.appendChild(meta);
      body.appendChild(hero);

      var vr = document.createElement('div'); vr.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 2px 10px';
      var spk = document.createElement('span'); spk.textContent = '🔊'; spk.style.cssText = 'font-size:13px;opacity:.8';
      var slider = orbit.el.slider({ value: vol, onInput: function (v) {
        vol = clampVol(v); audio.volume = vol; orbit.storage.set('volume', vol);
        spk.textContent = vol < 0.02 ? '🔇' : vol < 0.5 ? '🔉' : '🔊';
      } });
      vr.appendChild(spk); vr.appendChild(slider);
      body.appendChild(vr);

      var list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:1px;max-height:172px;overflow:auto;margin:0 -4px';
      rows = STATIONS.map(function (s, i) {
        var r = orbit.el.row(s.name, s.tag, function () { pick(i, true); });
        list.appendChild(r); return r;
      });
      body.appendChild(list);
    },
  });
  render();

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
  function render() {
    if (!nowName) return;
    var live = playing();
    bigPlay.textContent = live ? '⏸' : '▶';
    nowName.textContent = STATIONS[idx].name;
    liveTxt.textContent = live ? 'LIVE · ' + STATIONS[idx].tag : STATIONS[idx].tag;
    liveDot.style.display = live ? 'block' : 'none';
    eq.style.display = live ? 'inline-flex' : 'none';
    Array.prototype.forEach.call(eq.children, function (b) { b.style.animationPlayState = live ? 'running' : 'paused'; });
    rows.forEach(function (r, i) { r.className = 'obx-row' + (i === idx ? ' on' : ''); });
    pan.active(live);
  }
  audio.onplaying = render; audio.onpause = render; audio.onerror = render;

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

  log('radio ready (' + STATIONS.length + ' stations)');
});
