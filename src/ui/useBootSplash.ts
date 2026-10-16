import { useEffect, useRef, useState } from 'react';
import { useChat } from '../core/store';
import { getConfig } from '../core/config';
import {
  BOOT_MAX_MS, BOOT_MIN_MS,
  bootPhase, bootProgress, displayReady, getExpectedBootChannels,
  homeChromeReady, pluginReadyFrac, pluginsRegistered, priorityPluginIds,
  roomFrac, roomsReady, shellPainted,
  type BootPhase,
} from '../lib/boot-ready';
import { pluginLoadStats } from '../modules/loader';
import { registeredPluginIds } from '../modules/api';
import { bus } from '../modules/bus';

export type BootDetail = {
  pluginOk: number;
  pluginTotal: number;
  roomOk: number;
  roomTotal: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function twoFrames(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

function pluginUrls(): string[] {
  return (getConfig().plugins ?? []).map((e) => typeof e === 'string' ? e : e.url);
}

function bootSlice() {
  const st = useChat.getState();
  const stats = pluginLoadStats();
  const needed = priorityPluginIds(pluginUrls());
  const have = registeredPluginIds();
  const loadFrac = stats.total ? stats.settled / stats.total : 1;
  const factoryFrac = pluginReadyFrac(needed, have);
  const pluginFrac = 0.45 * loadFrac + 0.55 * factoryFrac;
  const expected = getExpectedBootChannels();
  const rf = roomFrac(st.buffers, expected);
  const roomsDone = roomsReady(st.buffers, expected);
  const pluginsOk = pluginsRegistered(needed, have);
  const topbar = shellPainted();
  const chromeOk = homeChromeReady(st.buffers, expected);
  const displayDone = displayReady({ topbar, pluginsOk, homeChrome: chromeOk });
  const ready = st.status === 'registered' && roomsDone && displayDone;
  const roomTotal = expected.length || 1;
  const roomOk = expected.length
    ? Math.round(rf * expected.length)
    : (roomsDone ? 1 : 0);
  const pluginOk = needed.filter((id) => have.includes(id)).length;
  return {
    st, pluginFrac, rf, roomsDone, displayDone, pluginsOk, ready,
    detail: {
      pluginOk,
      pluginTotal: needed.length,
      roomOk,
      roomTotal,
    } satisfies BootDetail,
  };
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
  const [detail, setDetail] = useState<BootDetail>({
    pluginOk: 0, pluginTotal: 0, roomOk: 0, roomTotal: 0,
  });
  const registeredAt = useRef(0);

  const failed = status === 'error' || status === 'closed' || status === 'sasl-failed';
  const inApp = status === 'registered' || everRegistered;
  const connecting = status === 'connecting' || autoConnecting;
  const showSplash = !revealed && !failed && (connecting || inApp);

  useEffect(() => {
    if (status === 'registered' && !registeredAt.current) registeredAt.current = Date.now();
  }, [status]);

  useEffect(() => {
    if (!showSplash || revealed) return;
    let stop = false;
    const tick = () => {
      if (stop) return;
      const slice = bootSlice();
      setDetail(slice.detail);
      setProgress((cur) => Math.max(cur, bootProgress({
        status: slice.st.status,
        pluginFrac: slice.pluginFrac,
        roomFrac: slice.roomsDone ? 1 : slice.rf,
        displayFrac: slice.displayDone ? 1 : (slice.st.status === 'registered' && shellPainted() ? 0.5 : 0),
        ready: slice.ready,
      })));
      setPhase(bootPhase({
        status: slice.st.status,
        pluginsDone: slice.pluginsOk,
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

    void (async () => {
      const until = t0 + BOOT_MAX_MS;
      while (!stop && Date.now() < until) {
        const slice = bootSlice();
        if (slice.ready) break;
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
  }, [status, revealed, failed]);

  return { showSplash, fading, progress, phase, inApp, detail };
}
