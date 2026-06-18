// Native Cloudflare Turnstile widget — renders the anti-bot challenge directly
// in the app (no iframe to the Django page). Loads the CF script once, renders
// the widget explicitly, and hands the resulting token back to the caller.
import { useEffect, useRef } from 'react';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loader: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => { loader = null; reject(new Error('turnstile-script')); };
    document.head.appendChild(s);
  });
  return loader;
}

export function Turnstile({ sitekey, onVerify, onError, theme = 'auto' }: {
  sitekey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  theme?: 'auto' | 'light' | 'dark';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  // keep latest callbacks without re-rendering the widget
  const cb = useRef({ onVerify, onError });
  cb.current = { onVerify, onError };

  useEffect(() => {
    let dead = false;
    loadTurnstile().then(() => {
      if (dead || !ref.current || !window.turnstile) return;
      id.current = window.turnstile.render(ref.current, {
        sitekey,
        theme,
        language: 'fr',
        callback: (t: string) => cb.current.onVerify(t),
        'error-callback': () => cb.current.onError?.(),
        'expired-callback': () => window.turnstile?.reset(id.current ?? undefined),
      });
    }).catch(() => cb.current.onError?.());
    return () => {
      dead = true;
      if (id.current && window.turnstile) {
        try { window.turnstile.remove(id.current); } catch { /* ignore */ }
      }
    };
  }, [sitekey, theme]);

  return <div className="turnstile-widget" ref={ref} />;
}
