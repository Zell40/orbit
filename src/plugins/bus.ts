// Tiny application event bus shared by the plugin API (Orbit.on/once/off/emit).
// Handlers are isolated — one throwing never breaks the others or the app.
type Fn = (...args: unknown[]) => void;
const listeners = new Map<string, Set<Fn>>();

export const bus = {
  on(event: string, fn: Fn): () => void {
    let set = listeners.get(event);
    if (!set) { set = new Set(); listeners.set(event, set); }
    set.add(fn);
    return () => bus.off(event, fn);
  },
  once(event: string, fn: Fn): () => void {
    const wrap: Fn = (...a) => { bus.off(event, wrap); fn(...a); };
    return bus.on(event, wrap);
  },
  off(event: string, fn: Fn): void {
    listeners.get(event)?.delete(fn);
  },
  emit(event: string, ...args: unknown[]): void {
    listeners.get(event)?.forEach((fn) => {
      try { fn(...args); } catch (e) { console.error(`[plugins] handler for "${event}" threw`, e); }
    });
  },
};
