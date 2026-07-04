import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { ConnectScreen } from './components/ConnectScreen';
import { Chat } from './components/Chat';
import { refreshPush } from './services/push';
import { getConfig } from './core/config';
import { usePluginRegistry, matchShortcut } from './modules/registry';
import { useActiveChat, activeStore } from './core/networks';

// Shown while a site handoff connects, so visitors who already chose a pseudo
// never see the join form. A failure clears autoConnecting and falls back to it.
function ConnectingSplash() {
  const { t } = useTranslation();
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash__spin" aria-hidden="true" />
      <p className="splash__txt">{t('connect.connecting')}</p>
    </div>
  );
}

export default function App() {
  const status = useActiveChat((s) => s.status);
  // Once we've registered once, keep the chat UI mounted through reconnects
  // (auto-reconnect restores the session) instead of bouncing to the connect screen.
  const everRegistered = useActiveChat((s) => s.everRegistered);
  const autoConnecting = useActiveChat((s) => s.autoConnecting);
  const unread = useActiveChat((s) =>
    Object.values(s.buffers).reduce((acc, b) => acc + b.unread, 0));

  useEffect(() => {
    // Title follows the configured brand name (config.branding.name) — the single
    // source of truth. Don't hardcode it here or in index.html.
    const name = getConfig().branding.name;
    document.title = unread > 0 ? `(${unread}) ${name}` : name;
  }, [unread]);

  // Re-assert the Web Push subscription on every (re)connect so it survives
  // server-side expiry and reconnects (cheap no-op if push isn't enabled).
  useEffect(() => {
    if (status !== 'registered') return;
    const client = activeStore().getState().client;
    if (client && getConfig().features.push) void refreshPush(client);
  }, [status]);

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
      if (!target) return;
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
      {status === 'registered' || everRegistered
        ? <Chat />
        : autoConnecting ? <ConnectingSplash /> : <ConnectScreen />}
    </>
  );
}
