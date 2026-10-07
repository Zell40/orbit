// Browser storage scoped by IRC identity (NickServ account, else nick).
// Prevents prefs / lists / plugin data from leaking between accounts on one device.

let activeOwner = '';
type OwnerListener = (prev: string, next: string) => void;
const ownerListeners = new Set<OwnerListener>();

/** Fold for storage keys (IRC-ish lowercase). */
export function foldIdent(s: string): string {
  return String(s || '').trim().toLowerCase();
}

/** Prefer account, else nick. Empty when neither is known yet. */
export function resolveOwner(account?: string, nick?: string): string {
  return foldIdent(account || '') || foldIdent(nick || '') || '';
}

export function getActiveOwner(): string {
  return activeOwner;
}

/** Notify when the active storage owner changes (account switch / login / logout). */
export function onOwnerChange(fn: OwnerListener): () => void {
  ownerListeners.add(fn);
  return () => { ownerListeners.delete(fn); };
}

function emitOwnerChange(prev: string, next: string): void {
  if (prev === next) return;
  ownerListeners.forEach((fn) => {
    try { fn(prev, next); } catch { /* ignore */ }
  });
}

/** Set the owner used by idLs* / plugin storage. Returns the new owner. */
export function setActiveOwner(account?: string, nick?: string): string {
  const prev = activeOwner;
  activeOwner = resolveOwner(account, nick);
  emitOwnerChange(prev, activeOwner);
  return activeOwner;
}

export function clearActiveOwner(): void {
  const prev = activeOwner;
  activeOwner = '';
  emitOwnerChange(prev, '');
}

/** `orbit-prefs@zell` — unscoped `base` when no owner (pre-login). */
export function idKey(base: string, owner = activeOwner): string {
  return owner ? `${base}@${owner}` : base;
}

export function idLsRead(base: string, owner = activeOwner): string | null {
  try {
    return localStorage.getItem(idKey(base, owner));
  } catch {
    return null;
  }
}

export function idLsWrite(base: string, value: string, owner = activeOwner): void {
  try {
    localStorage.setItem(idKey(base, owner), value);
  } catch { /* private mode / quota */ }
}

export function idLsRemove(base: string, owner = activeOwner): void {
  try {
    localStorage.removeItem(idKey(base, owner));
  } catch { /* ignore */ }
}

/**
 * Read identity-scoped value. If missing and `legacyBase` is set, try the
 * unscoped legacy key once — but only copy into the scoped slot when
 * `migrateLegacy` is true (callers that want a one-shot move).
 */
export function idLsReadMigrating(
  base: string,
  legacyUnscoped?: string,
  migrateLegacy = false,
  owner = activeOwner,
): string | null {
  const scoped = idLsRead(base, owner);
  if (scoped != null) return scoped;
  if (!owner || !legacyUnscoped) return null;
  try {
    const legacy = localStorage.getItem(legacyUnscoped);
    if (legacy == null) return null;
    if (migrateLegacy) {
      idLsWrite(base, legacy, owner);
      try { localStorage.removeItem(legacyUnscoped); } catch { /* ignore */ }
    }
    return migrateLegacy ? legacy : null;
  } catch {
    return null;
  }
}
