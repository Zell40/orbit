// Screen Wake Lock — keeps the phone from sleeping *while Orbit is in front*.
// A backgrounded tab/PWA is frozen by the OS; this cannot keep the WebSocket
// alive then. It does stop the screen-timeout freeze that drops IRC on phones
// left on the chat screen.

let wanted = false;
let lock: WakeLockSentinel | null = null;
let hooked = false;

function canLock(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

async function sync(): Promise<void> {
  if (!canLock()) return;
  const show = wanted && typeof document !== 'undefined' && !document.hidden;
  if (!show) {
    if (lock) {
      try { await lock.release(); } catch { /* already released */ }
      lock = null;
    }
    return;
  }
  if (lock) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
      if (wanted && typeof document !== 'undefined' && !document.hidden) void sync();
    });
  } catch {
    // Denied until a user gesture, or the OS refused — next visibility/tap retries.
  }
}

function hook(): void {
  if (hooked || typeof document === 'undefined') return;
  hooked = true;
  document.addEventListener('visibilitychange', () => { void sync(); });
  document.addEventListener('pointerdown', () => { void sync(); }, { passive: true });
}

/** Hold the screen on while connected and visible. No-op on desktop / unsupported. */
export function setStayAwake(on: boolean): void {
  wanted = on;
  hook();
  void sync();
}
