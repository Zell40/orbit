// Real avatars for registered accounts — resolved by account name from Django.
// Requests are BATCHED: a member list joining a busy channel may need hundreds
// of avatars at once, so instead of one HTTP request per account we coalesce
// every lookup within a short window into a single POST /accounts/api/avatars/.
// Results (incl. "no avatar" = null) are cached per account for the session.
import { useEffect, useState } from 'react';

const cache = new Map<string, string | null>();          // account(lower) -> url | null
const waiters = new Map<string, ((u: string | null) => void)[]>();
const queue = new Set<string>();                          // accounts awaiting the next batch
// Accounts whose URL came from the live WordPress profile. The batch endpoint
// caches for minutes, so a just-updated photo must not be overwritten by it.
const pinned = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

function resolveKey(key: string, url: string | null) {
  if (pinned.has(key)) {
    const kept = cache.get(key) ?? null;
    const ws = waiters.get(key);
    waiters.delete(key);
    ws?.forEach((fn) => fn(kept));
    return;
  }
  cache.set(key, url);
  const ws = waiters.get(key);
  waiters.delete(key);
  ws?.forEach((fn) => fn(url));
}

/** Publish a WordPress avatar so the member list, the footer and PMs follow it. */
export function rememberAvatar(account: string, url: string | null): void {
  const key = account.trim().toLowerCase();
  if (!key) return;
  pinned.add(key);
  const prev = cache.has(key) ? (cache.get(key) ?? null) : undefined;
  cache.set(key, url);
  queue.delete(key);
  const ws = waiters.get(key);
  if (ws) {
    waiters.delete(key);
    ws.forEach((fn) => fn(url));
  }
  if (prev !== url) emit();
}

function flush() {
  timer = null;
  const batch = [...queue].slice(0, 200); // server caps at 200 too
  batch.forEach((k) => queue.delete(k));
  if (!batch.length) return;

  fetch('/accounts/api/avatars/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accounts: batch }),
  })
    .then((r) => (r.ok ? r.json() : { avatars: {} }))
    .then((d: { avatars?: Record<string, string | null> }) => {
      const map = d.avatars ?? {};
      for (const key of batch) resolveKey(key, map[key] ?? null);
    })
    .catch(() => { for (const key of batch) resolveKey(key, null); });

  if (queue.size) schedule(); // anything queued beyond the 200 cap
}

function schedule() { if (timer == null) timer = setTimeout(flush, 40); }

export function fetchAvatar(account: string): Promise<string | null> {
  const key = account.toLowerCase();
  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
  return new Promise((resolve) => {
    const ws = waiters.get(key);
    if (ws) ws.push(resolve);
    else waiters.set(key, [resolve]);
    queue.add(key);
    schedule();
  });
}

// React hook: returns the avatar URL for an account (or null while loading / none).
export function useAvatarUrl(account?: string | null): string | null {
  const seed = () => (account ? cache.get(account.toLowerCase()) ?? null : null);
  const [url, setUrl] = useState<string | null>(seed);
  // Account switched: reset to its cached value (or null) during render — no
  // effect setState, so no cascading re-render.
  const [prev, setPrev] = useState(account);
  if (account !== prev) { setPrev(account); setUrl(seed()); }
  useEffect(() => {
    if (!account) return;
    let dead = false;
    const key = account.toLowerCase();
    const pull = () => { if (!dead) setUrl(cache.get(key) ?? null); };
    listeners.add(pull);
    fetchAvatar(account).then((u) => { if (!dead) setUrl(u); });
    return () => { dead = true; listeners.delete(pull); };
  }, [account]);
  return url;
}
