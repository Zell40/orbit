// Browser notifications, a subtle sound blip, and permission handling.
import { pushEnabledPref } from './push';
import { getConfig } from '../core/config';

let ac: AudioContext | null = null;

export function initNotify(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch { /* ignore */ }
}

export function desktopNotify(title: string, body: string): void {
  try {
    // When Web Push is enabled the service worker owns OS notifications (it fires
    // even when the tab is backgrounded/closed) — skip here to avoid duplicates.
    if (pushEnabledPref()) return;
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification(title, { body, icon: getConfig().branding.icon || '/app/favicon.svg', silent: true });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 6000);
    }
  } catch { /* ignore */ }
}

// For plugins: fire a notification with the brand icon, asking permission once.
// Unlike desktopNotify it fires even while the tab is focused (the plugin decides).
export function pluginNotify(title: string, body?: string): void {
  try {
    if (!('Notification' in window)) return;
    const show = () => {
      const n = new Notification(title, { body: body || '', icon: getConfig().branding.icon || '/app/favicon.svg', silent: true });
      n.onclick = () => { window.focus(); n.close(); };
      setTimeout(() => n.close(), 6000);
    };
    if (Notification.permission === 'granted') show();
    else if (Notification.permission === 'default') void Notification.requestPermission().then((p) => { if (p === 'granted') show(); });
  } catch { /* ignore */ }
}

export function blip(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac = ac || new Ctx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = 'sine'; o.frequency.value = 680;
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.10, ac.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.28);
    o.start();
    o.stop(ac.currentTime + 0.3);
  } catch { /* ignore */ }
}
