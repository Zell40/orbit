// Guest bootstrap for a sandboxed Orbit plugin — the code that runs INSIDE the
// opaque-origin iframe. Counterpart to ../host.ts. It has no access to the app's
// DOM, cookies, localStorage or store; its only link is the MessagePort handed over
// in the `init` message, and every privileged action is an RPC the host validates
// against the plugin's permissions.
//
// This is core, typed source. A Vite plugin transpiles it to a self-contained
// script inlined into plugin-sandbox.html (it must be standalone — the opaque origin
// can't load app chunks), so it imports ONLY types from the shared protocol.
import type { RpcMethod, StateSnapshot, HostToGuest } from '../protocol';

(function () {
  let port: MessagePort;
  let hostName = ''; // the host-side plugin id (e.g. "sbx:orbit-radio.js") — the id used in the 'orbit:panel' bus event
  let snap: StateSnapshot = { active: '', nick: '', account: '', buffers: [], network: '', isupport: {}, caps: [] };
  let store: Record<string, unknown> = {};
  const listeners: Record<string, ((...a: unknown[]) => void)[]> = {}; // event name -> [fn]
  let hookN = 0;                                       // unique id source for command/shortcut hooks
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let rpcId = 0;

  // Is this background colour a dark one? Rough luminance on a #rgb/#rrggbb or
  // rgb(...) string; anything unparseable counts as light.
  function isDark(c: string): boolean {
    if (!c) return false;
    const m = String(c).trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    let r: number, g: number, b: number;
    if (m) {
      let h = m[1]; if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    } else {
      const n = String(c).match(/(\d+)\D+(\d+)\D+(\d+)/); if (!n) return false;
      r = +n[1]; g = +n[2]; b = +n[3];
    }
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
  }

  // Mirror the app theme vars onto our root; color-scheme on <body> (not root) so
  // native controls match without the root painting an opaque canvas.
  function applyTheme(vars: Record<string, string> | undefined): void {
    if (!vars) return;
    for (const k in vars) { try { document.documentElement.style.setProperty(k, vars[k]); } catch { /* bad var */ } }
    if (vars['--bg']) document.body.style.colorScheme = isDark(vars['--bg']) ? 'dark' : 'light';
  }

  function rpc(method: RpcMethod, ...args: unknown[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++rpcId;
      pending.set(id, { resolve, reject });
      port.postMessage({ type: 'rpc', id, method, args });
    });
  }
  function emit(name: string, ...a: unknown[]): void {
    (listeners[name] || []).forEach((fn) => { try { fn(...a); } catch { /* plugin threw */ } });
  }

  // The constrained API a sandboxed plugin sees. Same shape spirit as the in-page
  // Orbit, but privileged bits go through the host and reads come from the snapshot.
  function makeApi(name: string) {
    // Low-level: fill this iframe's DOM, claim a UI slot, and keep the host-owned
    // frame sized to the content. Everything else (panel/el) is built on top.
    function ui(slot: string, build: (root: HTMLElement) => void): void {
      const outer = document.createElement('div');
      outer.style.cssText = 'display:inline-block';
      const inner = document.createElement('div');
      outer.appendChild(inner);
      document.body.appendChild(outer);
      try { build(inner); } catch (e) { rpc('log', 'ui build threw: ' + e); }
      rpc('ui.claim', slot);
      const report = () => {
        const r = outer.getBoundingClientRect();
        rpc('ui.resize', Math.ceil(r.width), Math.ceil(r.height));
      };
      report();
      if (window.ResizeObserver) new ResizeObserver(report).observe(outer);
    }

    // ---- SDK ---------------------------------------------------------------
    // Themed atoms + a bar panel that hides every rough edge of the sandbox:
    // theming, the async frame-resize lag, upward growth and no half-drawn flash.
    let sdkStyled = false;
    function sdkCss(): void {
      if (sdkStyled) return; sdkStyled = true;
      const s = document.createElement('style');
      s.textContent =
        '@keyframes obx-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
        '.obx-trig{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:52px;padding:6px 4px;cursor:pointer;border:0;border-radius:12px;background:transparent;color:var(--muted,#999);font:inherit;transition:color .12s,background .12s}' +
        '.obx-trig:hover{color:var(--ink,inherit);background:var(--bg,transparent)}' +
        '.obx-trig.on{color:var(--accent,#3a7)}' +
        '.obx-trig i{display:inline-flex;align-items:center;justify-content:center;font-size:1.2rem;line-height:1;font-style:normal}' +
        '.obx-trig b{font-size:.68rem;font-weight:600;letter-spacing:.01em;line-height:1;white-space:nowrap}' +
        '.obx-card{box-sizing:border-box;padding:12px;border-radius:16px;background:var(--bg,#0d0d0f);border:1px solid var(--border,#8884);box-shadow:0 20px 50px -12px rgba(0,0,0,.6),0 3px 10px -3px rgba(0,0,0,.4);animation:obx-in .18s ease both}' +
        '.obx-hd{display:flex;align-items:center;gap:.4rem;margin-bottom:10px;font-weight:800;font-size:13px}' +
        '.obx-hd b{flex:1}' +
        '.obx-x{border:0;background:transparent;color:var(--muted,#999);cursor:pointer;font-size:14px;line-height:1;border-radius:8px;width:24px;height:24px}' +
        '.obx-x:hover{color:var(--ink,inherit)}' +
        '.obx-btn{border:0;border-radius:10px;background:var(--accent,#3a7);color:var(--bg,#fff);font:inherit;font-weight:700;padding:8px 12px;cursor:pointer}' +
        '.obx-row{display:flex;flex-direction:column;gap:1px;padding:.4rem .5rem;border:0;border-radius:10px;background:transparent;color:var(--ink,inherit);font:inherit;text-align:left;cursor:pointer;width:100%;transition:background .12s}' +
        '.obx-row:hover{background:rgba(128,128,128,.13)}' +
        '.obx-row.on{box-shadow:inset 3px 0 0 var(--accent,#3a7)}' +
        '.obx-row span{font-weight:700;font-size:12.5px}.obx-row small{font-size:10.5px;color:var(--muted,#888)}' +
        'input[type=range].obx-range{-webkit-appearance:none;appearance:none;height:4px;border-radius:3px;width:100%;cursor:pointer;background:var(--border,#8886);accent-color:var(--accent,#3a7)}';
      document.head.appendChild(s);
    }
    function setIcon(elm: HTMLElement, icon: unknown): void {
      if (icon == null) return;
      if ((icon as Node).nodeType) elm.appendChild(icon as Node);
      else if (typeof icon === 'string' && icon.charAt(0) === '<') elm.innerHTML = icon;
      else elm.textContent = String(icon);
    }
    const el = {
      button(label: string, onClick?: () => void): HTMLButtonElement {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'obx-btn'; b.textContent = label;
        if (onClick) b.onclick = onClick; return b;
      },
      row(title: string, sub?: string, onClick?: () => void): HTMLButtonElement {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'obx-row';
        const t = document.createElement('span'); t.textContent = title; b.appendChild(t);
        if (sub) { const s = document.createElement('small'); s.textContent = sub; b.appendChild(s); }
        if (onClick) b.onclick = onClick; return b;
      },
      slider(o?: { min?: number; max?: number; step?: number; value?: number; onInput?: (v: number, el: HTMLInputElement) => void }): HTMLInputElement {
        o = o || {}; const r = document.createElement('input'); r.type = 'range'; r.className = 'obx-range';
        r.min = String(o.min != null ? o.min : 0); r.max = String(o.max != null ? o.max : 1); r.step = String(o.step != null ? o.step : 0.01);
        r.value = String(o.value != null ? o.value : 0.5);
        const onInput = o.onInput; if (onInput) r.oninput = () => onInput(Number(r.value), r);
        return r;
      },
    };

    // A bar trigger that opens a floating themed panel above it. Owns the whole frame
    // dance: on open the panel is measured but kept hidden until the frame has grown to
    // fit it, then revealed — so it never flashes half-drawn by the composer, never grows
    // the wrong way, and always matches the theme. Returns a controller.
    function panel(opts: {
      slot?: string; width?: number; title?: string; label?: string; icon?: unknown;
      render?: (body: HTMLElement, ctrl: PanelCtrl) => void; onToggle?: (open: boolean) => void;
    }): PanelCtrl {
      opts = opts || {}; sdkCss();
      const width = opts.width || 280;
      let open = false, hot = false;
      let pendingGrow: (() => void) | null = null;
      let card: HTMLElement, body: HTMLElement, trig: HTMLElement;
      function clearPending() { if (pendingGrow) { window.removeEventListener('resize', pendingGrow); pendingGrow = null; } }
      function paint() { if (trig) trig.className = 'obx-trig' + ((open || hot) ? ' on' : ''); }
      function setOpen(v: boolean) {
        open = v; clearPending(); paint();
        if (v) {
          rpc('panel.opened'); // announce → other panels close
          card.style.visibility = 'hidden'; card.style.display = 'block';
          pendingGrow = () => {
            if (window.innerHeight < card.offsetHeight) return;
            clearPending();
            card.style.visibility = 'visible';
            card.style.animation = 'none'; void card.offsetWidth; card.style.animation = 'obx-in .18s ease both';
          };
          window.addEventListener('resize', pendingGrow);
          requestAnimationFrame(pendingGrow);
        } else { card.style.display = 'none'; card.style.visibility = ''; }
        if (opts.onToggle) try { opts.onToggle(v); } catch { /* plugin threw */ }
      }
      const ctrl: PanelCtrl = {
        open: () => setOpen(true), close: () => setOpen(false),
        toggle: () => setOpen(!open), isOpen: () => open,
        active: (on: boolean) => { hot = !!on; paint(); }, body: () => body,
      };
      // Mutual exclusion: close when a DIFFERENT panel announces it opened. Compare
      // against the host-side id (what panel.opened emits), not our declared name.
      (listeners['orbit:panel'] = listeners['orbit:panel'] || []).push((id: unknown) => { if (id !== hostName && open) setOpen(false); });
      ui(opts.slot || 'nav_item', (root) => {
        // Centre the trigger over the slot: without this the fit-content trigger
        // left-aligns under the wider card when open and slides onto the next tab.
        root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px';
        card = document.createElement('div'); card.className = 'obx-card';
        card.style.width = width + 'px'; card.style.display = 'none';
        if (opts.title != null) {
          const hd = document.createElement('div'); hd.className = 'obx-hd';
          const tb = document.createElement('b'); tb.textContent = opts.title;
          const x = document.createElement('button'); x.className = 'obx-x'; x.type = 'button'; x.textContent = '✕'; x.title = 'Close';
          x.onclick = () => setOpen(false);
          hd.appendChild(tb); hd.appendChild(x); card.appendChild(hd);
        }
        body = document.createElement('div'); card.appendChild(body);
        trig = document.createElement('button'); (trig as HTMLButtonElement).type = 'button'; trig.className = 'obx-trig'; trig.title = opts.label || '';
        const i = document.createElement('i'); setIcon(i, opts.icon); trig.appendChild(i);
        if (opts.label) { const lb = document.createElement('b'); lb.textContent = opts.label; trig.appendChild(lb); }
        trig.onclick = () => setOpen(!open);
        root.appendChild(card); root.appendChild(trig);
        if (opts.render) try { opts.render(body, ctrl); } catch (e) { rpc('log', 'panel render threw: ' + e); }
        paint();
      });
      return ctrl;
    }

    return {
      name,
      sandboxed: true,
      log: (...args: unknown[]) => rpc('log', ...args),
      on(ev: string, fn: (...a: unknown[]) => void) {
        (listeners[ev] = listeners[ev] || []).push(fn);
        return () => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); };
      },
      irc: {
        say: (t: string) => rpc('irc.say', t),
        msg: (to: string, t: string) => rpc('irc.msg', to, t),
        send: (l: string) => rpc('irc.send', l),
        join: (c: string) => rpc('irc.join', c),
        part: (c: string) => rpc('irc.part', c),
        list: () => rpc('irc.list'),
      },
      notify: (title: string, body: string) => rpc('notify', title, body),
      // Hand a small { t, p } pageview payload to the host, which posts it to the
      // configured analytics endpoint (needs the 'analytics' grant). No return value.
      track: (data: unknown) => rpc('analytics.track', data),
      // Register a slash command: typing "/name a b" calls run(["a","b"], "a b").
      // Returns an unregister fn. Built-in commands win over a plugin's.
      command(nameStr: string, run: (...a: unknown[]) => void, help?: string) {
        const id = 'cmd:' + (++hookN);
        (listeners[id] = listeners[id] || []).push(run);
        rpc('command.register', String(nameStr), id, help != null ? String(help) : undefined);
        return () => { delete listeners[id]; rpc('command.dispose', id); };
      },
      // Register a keyboard shortcut, e.g. "mod+j" or "alt+shift+r" — a modifier is
      // REQUIRED (bare keys are refused). run() fires when it's pressed in the chat view.
      shortcut(combo: string, run: (...a: unknown[]) => void) {
        const id = 'key:' + (++hookN);
        (listeners[id] = listeners[id] || []).push(run);
        rpc('shortcut.register', String(combo), id);
        return () => { delete listeners[id]; rpc('shortcut.dispose', id); };
      },
      state: {
        active: () => snap.active,
        nick: () => snap.nick,
        account: () => snap.account,
        buffers: () => snap.buffers.slice(),
      },
      // Read-only server / capability info, from the snapshot (no RPC, no grant).
      server: {
        network: () => snap.network || '',
        isupport: () => ({ ...snap.isupport }),
        hasCap: (cap: string) => (snap.caps || []).some((c) => c.name === cap && c.enabled),
        caps: () => (snap.caps || []).map((c) => ({ name: c.name, available: c.available, enabled: c.enabled })),
      },
      storage: {
        get: (k: string, fallback?: unknown) => (k in store ? store[k] : fallback),
        set: (k: string, v: unknown) => { store[k] = v; return rpc('storage.set', k, v); },
      },
      ui,        // low-level slot
      panel,     // high-level bar panel (handles theming + the resize dance)
      el,        // themed atoms: button / row / slider
    };
  }

  // The global the plugin source registers against: Orbit.plugin('name', fn).
  let registered = false;
  (window as unknown as { Orbit: OrbitGlobal }).Orbit = {
    sandboxed: true,
    plugin(name: string, fn: (orbit: ReturnType<typeof makeApi>, log: (...a: unknown[]) => void) => void) {
      if (registered) return; registered = true;
      const api = makeApi(name);
      try { fn(api, api.log); } catch (e) { rpc('log', 'plugin threw during init: ' + e); }
    },
  };

  window.addEventListener('message', (e: MessageEvent) => {
    const m = e.data;
    if (!m || !m.type) return;
    if (m.type === 'init' && e.ports && e.ports[0]) {
      // The init message carries the plugin source that gets eval'd below, so accept
      // it only from the host frame, and only once (no port swap).
      if (e.source !== window.parent || port) return;
      port = e.ports[0];
      snap = m.snapshot || snap;
      store = m.storage || {};
      hostName = m.name || hostName;
      applyTheme(m.theme);
      port.onmessage = (ev: MessageEvent) => {
        const d = ev.data as HostToGuest;
        if (!d) return;
        if (d.type === 'rpc:reply') {
          const p = pending.get(d.id); if (!p) return; pending.delete(d.id);
          if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result);
        } else if (d.type === 'event') {
          emit(d.name, ...(d.args || []));
        } else if (d.type === 'snapshot') {
          snap = d.snapshot || snap;
        } else if (d.type === 'theme') {
          applyTheme(d.theme);
        }
      };
      // Run the plugin now that the bridge is live. new Function keeps it out of this
      // bootstrap's scope; it only reaches the app through window.Orbit.
      try { new Function(m.source).call(window); }
      catch (err) { rpc('log', 'plugin source failed: ' + err); }
    }
  });

  interface PanelCtrl {
    open: () => void; close: () => void; toggle: () => void; isOpen: () => boolean;
    active: (on: boolean) => void; body: () => HTMLElement;
  }
  interface OrbitGlobal {
    sandboxed: boolean;
    plugin: (name: string, fn: (orbit: ReturnType<typeof makeApi>, log: (...a: unknown[]) => void) => void) => void;
  }
})();
