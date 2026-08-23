import { useEffect, useRef, useState } from 'react';
import { useChat } from '../core/store';
import {
  BOOT_MAX_MS, BOOT_MIN_MS,
  bootPhase, bootProgress, getExpectedBootChannels, readSidebarChannelLabels,
  roomFrac, roomsListed, roomsReady,
  type BootPhase,
} from '../lib/boot-ready';
import { pluginLoadStats, whenPluginsLoaded } from '../modules/loader';
import { bus } from '../modules/bus';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function twoFrames(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

function roomsOnScreen(expected: string[]): boolean {
  return roomsReady(useChat.getState().buffers, expected)
    && roomsListed(expected, readSidebarChannelLabels());
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

  const failed = status === 'error' || status === 'closed' || status === 'sasl-failed';
  const inApp = status === 'registered' || everRegistered;
  const connecting = status === 'connecting' || autoConnecting;
  const showSplash = !revealed && !failed && (connecting || inApp);

  useEffect(() => {
    if (status === 'connecting' || autoConnecting) connectStarted.current = Date.now();
  }, [status, autoConnecting]);

  useEffect(() => {
    if (!showSplash || revealed) return;
    let stop = false;
    const tick = () => {
      if (stop) return;
      const st = useChat.getState();
      const stats = pluginLoadStats();
      const pluginFrac = stats.total ? stats.settled / stats.total : 1;
      const expected = getExpectedBootChannels();
      const rf = roomFrac(st.buffers, expected);
      const listed = roomsListed(expected, readSidebarChannelLabels());
      const roomsDone = roomsReady(st.buffers, expected) && listed;
      setProgress((cur) => Math.max(cur, bootProgress({
        status: st.status,
        pluginFrac,
        roomFrac: roomsDone ? 1 : rf * 0.85,
        connectingForMs: Date.now() - connectStarted.current,
      })));
      setPhase(bootPhase({
        status: st.status,
        pluginsDone: pluginFrac >= 1,
        roomsDone,
      }));
    };
    tick();
    const iv = window.setInterval(tick, 80);
    return () => { stop = true; clearInterval(iv); };
  }, [showSplash, revealed, status, buffers]);

  useEffect(() => {
    if (revealed || failed || status !== 'registered') return;
    let stop = false;
    const t0 = Date.now();
    const expected = getExpectedBootChannels();

    void (async () => {
      await whenPluginsLoaded();
      if (stop) return;

      const until = t0 + (viaBouncer ? BOOT_MIN_MS + 400 : BOOT_MAX_MS);
      while (!stop && Date.now() < until) {
        if (viaBouncer || roomsOnScreen(expected)) break;
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
