import { useEffect, useRef, useState } from 'react';
import { pluginListed } from '../core/config';
import { useChat } from '../core/store';
import {
  BOOT_IMAGES_MS, BOOT_MAX_MS, BOOT_MIN_MS,
  bootPhase, bootProgress, getExpectedBootChannels, roomFrac, roomsReady,
  type BootPhase,
} from '../lib/boot-ready';
import { pluginLoadStats, whenPluginsLoaded } from '../modules/loader';
import { bus } from '../modules/bus';

function imagesAlreadyReady(): boolean {
  try { return !!(window as unknown as { __orbitRoomImagesReady?: boolean }).__orbitRoomImagesReady; }
  catch { return false; }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function twoFrames(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

export function useBootSplash() {
  const status = useChat((s) => s.status);
  const everRegistered = useChat((s) => s.everRegistered);
  const autoConnecting = useChat((s) => s.autoConnecting);
  const buffers = useChat((s) => s.buffers);

  const [revealed, setRevealed] = useState(false);
  const [fading, setFading] = useState(false);
  const [progress, setProgress] = useState(8);
  const [phase, setPhase] = useState<BootPhase>('connecting');
  const connectStarted = useRef<number>(Date.now());
  const waitImages = pluginListed('orbit-room-gallery');

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
      const imgs = !waitImages || imagesAlreadyReady();
      const p = bootProgress({
        status: st.status,
        pluginFrac,
        roomFrac: rf,
        imagesReady: imgs,
        waitImages,
        connectingForMs: Date.now() - connectStarted.current,
      });
      setProgress((cur) => Math.max(cur, p));
      setPhase(bootPhase({
        status: st.status,
        pluginsDone: pluginFrac >= 1,
        roomsDone: roomsReady(st.buffers, expected),
        imagesReady: imgs,
        waitImages,
      }));
    };
    tick();
    const iv = window.setInterval(tick, 80);
    return () => { stop = true; clearInterval(iv); };
  }, [showSplash, revealed, waitImages, status, buffers]);

  useEffect(() => {
    if (revealed || failed || status !== 'registered') return;
    let stop = false;
    const t0 = Date.now();
    const expected = getExpectedBootChannels();

    void (async () => {
      await whenPluginsLoaded();
      if (stop) return;

      const until = t0 + BOOT_MAX_MS;
      while (!stop && Date.now() < until) {
        if (roomsReady(useChat.getState().buffers, expected)) break;
        await sleep(50);
      }
      // Bouncer / empty JOIN list: first channel often arrives before the rest.
      if (!expected.length && roomsReady(useChat.getState().buffers, expected)) {
        const quiet = Math.min(450, until - Date.now());
        if (quiet > 0) await sleep(quiet);
      }
      if (stop) return;

      if (waitImages && !imagesAlreadyReady()) {
        await new Promise<void>((resolve) => {
          const left = Math.max(0, Math.min(BOOT_IMAGES_MS, until - Date.now()));
          if (!left) { resolve(); return; }
          let unsub = () => {};
          const t = window.setTimeout(() => { unsub(); resolve(); }, left);
          unsub = bus.once('room-images-ready', () => { clearTimeout(t); resolve(); });
        });
      }
      if (stop) return;

      await twoFrames();
      const pad = BOOT_MIN_MS - (Date.now() - t0);
      if (pad > 0) await sleep(pad);
      if (stop) return;

      setProgress(100);
      setFading(true);
      await sleep(280);
      if (!stop) setRevealed(true);
    })();

    return () => { stop = true; };
  }, [status, revealed, failed, waitImages]);

  return { showSplash, fading, progress, phase, inApp };
}
