import { useEffect } from 'react';
import { useChat } from './store';
import { ConnectScreen } from './components/ConnectScreen';
import { Chat } from './components/Chat';
import { refreshPush } from './push';

export default function App() {
  const status = useChat((s) => s.status);
  // Once we've registered once, keep the chat UI mounted through reconnects
  // (auto-reconnect restores the session) instead of bouncing to the connect screen.
  const everRegistered = useChat((s) => s.everRegistered);
  const unread = useChat((s) =>
    Object.values(s.buffers).reduce((acc, b) => acc + b.unread, 0));

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Tchatou · Tchat` : 'Tchatou · Tchat';
  }, [unread]);

  // Re-assert the Web Push subscription on every (re)connect so it survives
  // server-side expiry and reconnects (cheap no-op if push isn't enabled).
  useEffect(() => {
    if (status !== 'registered') return;
    const client = useChat.getState().client;
    if (client) void refreshPush(client);
  }, [status]);

  // A click on a push notification asks the SW to open the relevant buffer.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (ev: MessageEvent) => {
      const target = ev.data?.type === 'open-buffer' ? ev.data.target : null;
      if (!target) return;
      const st = useChat.getState();
      if (/^[#&]/.test(target)) st.setActive(target);
      else st.openQuery(target);
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  return (
    <>
      <div className="aurora" />
      {status === 'registered' || everRegistered ? <Chat /> : <ConnectScreen />}
    </>
  );
}
