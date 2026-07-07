/*
 * Orbit radio — a small SANDBOXED web-radio player docked in the footer.
 *
 * Runs in an opaque-origin iframe reachable only through the capability bridge. It
 * plays the stream with its OWN <audio> element, so the play click keeps its user
 * gesture (reliable autoplay), and remembers your station + volume via the granted
 * `storage` capability. It never touches the page, the store or IRC.
 *
 *   { "url": "/app/plugins/third/orbit-radio.js", "sandbox": true, "permissions": ["storage"] }
 *
 * Streaming needs the sandbox document's CSP to allow `media-src https:` (see
 * docs/SANDBOX.md). Stations must be direct HTTPS streams (no .pls/.m3u playlists).
 */
Orbit.plugin('orbit-radio', function (orbit, log) {
  var STATIONS = [
    { name: 'FIP', url: 'https://icecast.radiofrance.fr/fip-midfi.mp3' },
    { name: 'FIP Rock', url: 'https://icecast.radiofrance.fr/fiprock-midfi.mp3' },
    { name: 'Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3' },
    { name: 'Lush', url: 'https://ice1.somafm.com/lush-128-mp3' },
    { name: 'Indie Pop', url: 'https://ice1.somafm.com/indiepop-128-mp3' },
    { name: 'Drone Zone', url: 'https://ice1.somafm.com/dronezone-128-mp3' },
  ];

  function clampVol(v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.6; }

  var audio = new Audio();
  audio.preload = 'none';
  var vol = clampVol(orbit.storage.get('volume', 0.6));
  audio.volume = vol;
  var idx = orbit.storage.get('station', 0);
  if (typeof idx !== 'number' || idx < 0 || idx >= STATIONS.length) idx = 0;

  var pill = 'font:600 13px system-ui,sans-serif;cursor:pointer;line-height:1;padding:.28rem .5rem;' +
    'border-radius:8px;border:1px solid var(--border,#8884);background:var(--accent-soft,rgba(127,127,127,.14));color:var(--ink,inherit)';

  orbit.ui('footer_item', function (root) {
    root.style.cssText = 'display:flex;gap:.35rem;align-items:center;font:600 12px system-ui,sans-serif;color:var(--ink,inherit)';

    var mark = document.createElement('span');
    mark.textContent = '📻'; mark.style.cssText = 'opacity:.85';

    var play = document.createElement('button');
    play.type = 'button'; play.style.cssText = pill;
    play.onmouseenter = function () { play.style.background = 'var(--accent,#3a7)'; play.style.color = 'var(--bg,#fff)'; };
    play.onmouseleave = function () { play.style.background = 'var(--accent-soft,rgba(127,127,127,.14))'; play.style.color = 'var(--ink,inherit)'; };

    var sel = document.createElement('select');
    sel.title = 'Station';
    sel.style.cssText = 'font:inherit;cursor:pointer;max-width:8rem;padding:.25rem .3rem;border-radius:8px;' +
      'border:1px solid var(--border,#8884);background:var(--accent-soft,rgba(127,127,127,.14));color:var(--ink,inherit)';
    STATIONS.forEach(function (s, i) {
      var o = document.createElement('option'); o.value = String(i); o.textContent = s.name; sel.appendChild(o);
    });
    sel.value = String(idx);

    var range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '1'; range.step = '0.01'; range.value = String(vol);
    range.title = 'Volume';
    range.style.cssText = 'width:64px;accent-color:var(--accent,#3a7);cursor:pointer';

    function render() {
      var live = !audio.paused && !audio.error;
      play.textContent = live ? '⏸' : '▶';
      play.title = live ? 'Pause' : 'Play ' + STATIONS[idx].name;
    }

    play.onclick = function () {
      if (!audio.paused) { audio.pause(); return; }
      audio.src = STATIONS[idx].url;
      audio.play().catch(function (e) { log('play blocked: ' + e); render(); });
    };
    sel.onchange = function () {
      idx = Number(sel.value) || 0;
      orbit.storage.set('station', idx);
      if (!audio.paused) { audio.src = STATIONS[idx].url; audio.play().catch(function () {}); }
      render();
    };
    range.oninput = function () { vol = clampVol(range.value); audio.volume = vol; orbit.storage.set('volume', vol); };
    audio.onplaying = render; audio.onpause = render; audio.onerror = render;

    root.appendChild(mark);
    root.appendChild(play);
    root.appendChild(sel);
    root.appendChild(range);
    render();
  });

  log('radio ready (' + STATIONS.length + ' stations)');
});
