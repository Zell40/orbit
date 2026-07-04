// Plugin subsystem entry point. Publishes the Orbit global, starts the
// state→bus bridge, then loads operator-listed plugins. Called once from main,
// after the store exists and config is resolved.
import { Orbit, type OrbitGlobal } from './api';
import { startBridge } from './bridge';
import { loadPlugins } from './loader';

declare global {
  interface Window { Orbit: OrbitGlobal }
}

export function initPlugins(): void {
  window.Orbit = Orbit;
  startBridge();
  loadPlugins();
}

export { Orbit };
