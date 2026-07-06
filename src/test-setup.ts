// Minimal browser-global shims for the node test environment.
//
// A few modules read `localStorage` and the browser language at IMPORT time
// (i18n's language detection, the store's persisted prefs), so any test that
// transitively imports them — e.g. a store sub-handler — needs these present.
// This provides only what module-load code touches; tests that need a real DOM
// should opt into a DOM environment instead.
class MemStorage {
  private m = new Map<string, string>();
  get length(): number { return this.m.size; }
  key(i: number): string | null { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k: string): string | null { return this.m.get(k) ?? null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  clear(): void { this.m.clear(); }
}

const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.localStorage === 'undefined') g.localStorage = new MemStorage();
if (typeof g.navigator === 'undefined') g.navigator = { language: 'en', languages: ['en'] };

// i18n sets `document.documentElement.lang` at import time; a few store modules
// read documentElement.style/classList when they load. A no-op document is enough
// to import them under node (real DOM assertions need a DOM environment instead).
if (typeof g.document === 'undefined') {
  const noop = () => {};
  const el = {
    lang: '', dataset: {} as Record<string, string>,
    style: { setProperty: noop, removeProperty: noop, getPropertyValue: () => '' },
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop, appendChild: noop, removeChild: noop,
  };
  g.document = {
    documentElement: el, body: el, head: el,
    addEventListener: noop, removeEventListener: noop,
    createElement: () => ({ ...el, style: { ...el.style } }),
    getElementById: () => null, querySelector: () => null,
  };
}
