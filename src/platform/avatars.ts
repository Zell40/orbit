// Real avatars for registered accounts — resolved by account name from Django.
// Requests are BATCHED: a member list joining a busy channel may need hundreds
// of avatars at once, so instead of one HTTP request per account we coalesce
// every lookup within a short window into a single POST /accounts/api/avatars/.
// Results (incl. "no avatar" = null) are cached per account for the session.
import { useEffect, useState } from 'react';

const cache = new Map<string, string | null>();          // account(lower) -> url | null
const waiters = new Map<string, ((u: string | null) => void)[]>();
const queue = new Set<string>();                          // accounts awaiting the next batch
let timer: ReturnType<typeof setTimeout> | null = null;

function resolveKey(key: string, url: string | null) {
  cache.set(key, url);
  const ws = waiters.get(key);
  waiters.delete(key);
  ws?.forEach((fn) => fn(url));
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

function fetchAvatar(account: string): Promise<string | null> {
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
  const [url, setUrl] = useState<string | null>(
    account ? cache.get(account.toLowerCase()) ?? null : null,
  );
  useEffect(() => {
    if (!account) { setUrl(null); return; }
    let dead = false;
    fetchAvatar(account).then((u) => { if (!dead) setUrl(u); });
    return () => { dead = true; };
  }, [account]);
  return url;
}
