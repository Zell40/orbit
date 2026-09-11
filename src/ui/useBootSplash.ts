import { useEffect, useRef, useState } from 'react';
import { useChat } from '../core/store';
import { getConfig } from '../core/config';
import {
  BOOT_CHROME_MS, BOOT_IDENTITY_MS, BOOT_MAX_MS, BOOT_MIN_MS,
  bootPhase, bootProgress, displayReady, getExpectedBootChannels,
  identityReady, pluginsRegistered, priorityPluginIds,
  readSidebarChannelLabels, roomFrac, roomsListed, roomsReady,
  selfInPrimaryRoom, shellPainted,
  type BootPhase,
} from '../lib/boot-ready';
import { pluginLoadStats, whenPluginsLoaded } from '../modules/loader';
import { registeredPluginIds } from '../modules/api';
import { bus } from '../modules/bus';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function twoFrames(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

function pluginUrls(): string[] {
  return (getConfig().plugins ?? []).map((e) => typeof e === 'string' ? e : e.url);
}

function bootSlice(registeredAt: number, expectAccount: boolean) {
  const st = useChat.getState();
  const stats = pluginLoadStats();
  const pluginFrac = stats.total ? stats.settled / stats.total : 1;
  const expected = getExpectedBootChannels();
  const rf = roomFrac(st.buffers, expected);
  const listed = roomsListed(expected, readSidebarChannelLabels());
  const roomsDone = roomsReady(st.buffers, expected) && listed;
  const elapsed = registeredAt ? Date.now() - registeredAt : 0;
  const pluginsOk = pluginsRegistered(priorityPluginIds(pluginUrls()), registeredPluginIds())
    || elapsed >= BOOT_CHROME_MS;
  const identityOk = identityReady(expectAccount, st.account) || elapsed >= BOOT_IDENTITY_MS;
  const selfOk = selfInPrimaryRoom(st.buffers, expected, st.nick) || elapsed >= BOOT_IDENTITY_MS;
  const displayDone = displayReady({
    topbar: shellPainted(),
    pluginsOk,
    identityOk,
    selfInRoom: selfOk,
  });
  return { st, pluginFrac, rf, roomsDone, displayDone };
}

export function useBootSplash() {
  const status = useChat((s) => s.status);
  const everRegistered = useChat((s) => s.everRegistered);
  const autoConnecting = useChat((s) => s.autoConnecting);
  const viaBouncer = useChat((s) => s.viaBouncer);
  const buffers = useChat((s) => s.buffers);

  const [revealed, setRevealed] = useState(false);
  const [fading, setFading] = useState(false);
  const [progress, setProgress] = useState(8);
  const [phase, setPhase] = useState<BootPhase>('connecting');
  const connectStarted = useRef<number>(Date.now());
  const registeredAt = useRef(0);

  const failed = status === 'error' || status === 'closed' || status === 'sasl-failed';
  const inApp = status === 'registered' || everRegistered;
  const connecting = status === 'connecting' || autoConnecting;
  const showSplash = !revealed && !failed && (connecting || inApp);

  useEffect(() => {
    if (status === 'connecting' || autoConnecting) connectStarted.current = Date.now();
    if (status === 'registered' && !registeredAt.current) registeredAt.current = Date.now();
  }, [status, autoConnecting]);

  useEffect(() => {
    if (!showSplash || revealed) return;
    let stop = false;
    const expectAccount = viaBouncer || !!useChat.getState().account;
    const tick = () => {
      if (stop) return;
      const slice = bootSlice(registeredAt.current, expectAccount);
      setProgress((cur) => Math.max(cur, bootProgress({
        status: slice.st.status,
        pluginFrac: slice.pluginFrac,
        roomFrac: slice.roomsDone ? 1 : slice.rf * 0.85,
        displayFrac: slice.displayDone ? 1 : (slice.roomsDone ? 0.35 : 0),
        connectingForMs: Date.now() - connectStarted.current,
      })));
      setPhase(bootPhase({
        status: slice.st.status,
        pluginsDone: slice.pluginFrac >= 1,
        roomsDone: slice.roomsDone,
        displayDone: slice.displayDone,
      }));
    };
    tick();
    const iv = window.setInterval(tick, 80);
    return () => { stop = true; clearInterval(iv); };
  }, [showSplash, revealed, status, buffers, viaBouncer]);

  useEffect(() => {
    if (revealed || failed || status !== 'registered') return;
    let stop = false;
    const t0 = Date.now();
    if (!registeredAt.current) registeredAt.current = t0;
    const expectAccount = viaBouncer || !!useChat.getState().account;

    void (async () => {
      await whenPluginsLoaded();
      if (stop) return;

      const until = t0 + BOOT_MAX_MS;
      while (!stop && Date.now() < until) {
        const slice = bootSlice(registeredAt.current, expectAccount);
        if (slice.roomsDone && slice.displayDone) break;
        await sleep(50);
      }
      if (stop) return;

      await twoFrames();
      const pad = BOOT_MIN_MS - (Date.now() - t0);
      if (pad > 0) await sleep(pad);
      if (stop) return;

      setProgress(100);
      setPhase('almost');
      setFading(true);
      await sleep(280);
      if (!stop) {
        setRevealed(true);
        bus.emit('boot:ready');
      }
    })();

    return () => { stop = true; };
  }, [status, revealed, failed, viaBouncer]);

  return { showSplash, fading, progress, phase, inApp };
}
