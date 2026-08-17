// localStorage / sessionStorage helpers — prefer orbit-* keys, migrate once
// from legacy tchatou-* so existing prefs survive the rebrand.

export function lsRead(key: string, legacy?: string): string | null {
  try {
    const cur = localStorage.getItem(key);
    if (cur != null) return cur;
    if (!legacy) return null;
    const old = localStorage.getItem(legacy);
    if (old == null) return null;
    localStorage.setItem(key, old);
    return old;
  } catch {
    return null;
  }
}

export function lsWrite(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode / quota */ }
}

export function ssRead(key: string, legacy?: string): string | null {
  try {
    const cur = sessionStorage.getItem(key);
    if (cur != null) return cur;
    if (!legacy) return null;
    return sessionStorage.getItem(legacy);
  } catch {
    return null;
  }
}

export function ssRemove(...keys: string[]): void {
  try {
    for (const k of keys) sessionStorage.removeItem(k);
  } catch { /* ignore */ }
}
