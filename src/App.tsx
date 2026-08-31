import { useEffect } from 'react';

import { ConnectScreen } from './components/ConnectScreen';
import { Chat } from './components/Chat';
import { BootSplash } from './components/BootSplash';
import { AppUpdateBanner } from './components/AppUpdateBanner';
import { useBootSplash } from './ui/useBootSplash';
import { refreshPush } from './platform/push';
import { getConfig } from './core/config';
import { usePluginRegistry, matchShortcut } from './modules/registry';
import { activeStore, useAllNetworksUnread, useNetworks } from './core/networks';
import { useChat } from './core/store';
import { getPrefs } from './ui/prefs';
import { saveResume } from './core/resume';
import { shouldSkipClosePrompt, armLeaveWithoutPrompt } from './core/direct-reconnect';
import { consumeSiteBouncerAttempt, bouncerAuthFailHref } from './core/bouncer';

export default function App() {
  // The connect-screen-vs-chat decision follows the PRIMARY network: once your
  // first connection is up you're "in the app", and adding another network (which
  // starts out connecting) must not bounce you back to the full-page join form.
  const status = useChat((s) => s.status);
  const account = useChat((s) => s.account);
  const boot = useBootSplash();
  const everRegistered = useChat((s) => s.everRegistered);
  const viaBouncer = useChat((s) => s.viaBouncer);
  // Tab title reflects unread across ALL connected networks, not just the active one.
  const unread = useAllNetworksUnread();

  useEffect(() => {
    // Title follows the configured brand name (config.branding.name) — the single
    // source of truth. Don't hardcode it here or in index.html.
    const name = getConfig().branding.name;
    document.title = unread > 0 ? `(${unread}) ${name}` : name;
  }, [unread]);

  // Site → ZNC handoff failed (user/password, case-sensitive): back to MonIdentité.
  useEffect(() => {
    if (everRegistered || !viaBouncer) return;
    if (status !== 'error' && status !== 'closed') return;
    const login = (getConfig().branding.loginUrl || '').trim();
    if (!login) return;
    const attempt = consumeSiteBouncerAttempt();
    if (!attempt) return;
    armLeaveWithoutPrompt();
    location.assign(bouncerAuthFailHref(login, {
      nick: useChat.getState().nick,
      zncUser: attempt.zncUser,
    }));
  }, [status, everRegistered, viaBouncer]);

  // Guard against an accidental tab close/reload while a session is (or has been)
  // live — the browser shows its native "Leave site?" prompt so you don't lose the
  // connection by mistake. The listener stays mounted and decides at fire-time, so
  // it never nags on the connect screen; opt out via the "confirmClose" preference.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (shouldSkipClosePrompt()) return;
      if (!getPrefs().confirmClose) return;
      const live = useNetworks.getState().networks.some((n) => {
        const s = n.store.getState();
        return s.status === 'registered' || s.everRegistered;
      });
      if (!live) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Persist NON-secret session context (nick, account label, open channels, GECOS)
  // while registered, so reopening the tab can resume it (see core/resume + main.tsx).
  // Recomputes only when that signature actually changes, not on every message.
  const resumeSig = useChat((s) => {
    if (!getConfig().features.sessionResume || s.status !== 'registered') return '';
    const channels = s.order.filter((n) => s.buffers[n]?.isChannel && s.buffers[n]?.joined);
    let realname = '';
    for (const name of s.order) {
      const rn = s.buffers[name]?.members[s.nick]?.realname;
      if (rn && /\d/.test(rn) && rn.includes('-')) { realname = rn; break; }
    }
    return JSON.stringify({
      nick: s.nick, account: s.account || '', channels, realname,
      url: s.connectUrl || getConfig().server.url,
      bouncer: s.viaBouncer,
    });
  });
  useEffect(() => {
    if (!resumeSig) return;
    saveResume(JSON.parse(resumeSig) as { nick: string; account: string; channels: string[]; realname?: string; url: string; bouncer?: boolean });
  }, [resumeSig]);

  // Re-assert the Web Push subscription on every (re)connect so it survives
  // server-side expiry and reconnects (cheap no-op if push isn't enabled).
  useEffect(() => {
    if (status !== 'registered' || !account) return;
    const client = useChat.getState().client;
    if (client && getConfig().features.push) void refreshPush(client, account);
  }, [status, account]);

  // Global keyboard shortcuts (chat view only). See the Shortcuts help sheet (?).
  useEffect(() => {
    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      const st = activeStore().getState();
      if (st.status !== 'registered' && !st.everRegistered) return; // chat view only
      // Ctrl/⌘-K — quick switcher
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); st.setModal(st.modal === 'switcher' ? '' : 'switcher'); return;
      }
      // Alt+↑ / Alt+↓ — previous / next conversation
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const order = st.order;
        if (order.length) {
          e.preventDefault();
          const i = Math.max(0, order.indexOf(st.active));
          const n = order.length;
          st.setActive(order[e.key === 'ArrowUp' ? (i - 1 + n) % n : (i + 1) % n]);
        }
        return;
      }
      // Shift+Esc — mark all conversations read
      if (e.key === 'Escape' && e.shiftKey) { e.preventDefault(); st.markAllRead(); return; }
      // ? — keyboard shortcuts help (ignored while typing)
      if (e.key === '?' && !isTyping()) {
        e.preventDefault(); st.setModal(st.modal === 'shortcuts' ? '' : 'shortcuts'); return;
      }
      // Plugin-registered shortcuts (the built-ins above take priority).
      for (const sc of usePluginRegistry.getState().shortcuts) {
        if (matchShortcut(e, sc.combo)) { e.preventDefault(); try { sc.run(e); } catch { /* plugin threw */ } return; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A click on a push notification asks the SW to open the relevant buffer.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (ev: MessageEvent) => {
      const target = ev.data?.type === 'open-buffer' ? ev.data.target : null;
      if (typeof target !== 'string' || !target) return; // only act on a well-formed buffer name
      const st = activeStore().getState();
      if (/^[#&]/.test(target)) st.setActive(target);
      else st.openQuery(target);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  return (
    <>
      <div className="aurora" />
      {boot.inApp ? <Chat /> : <ConnectScreen />}
      {boot.showSplash && (
        <BootSplash progress={boot.progress} phase={boot.phase} fading={boot.fading} />
      )}
      <AppUpdateBanner />
    </>
  );
}
