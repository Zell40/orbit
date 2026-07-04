// First-party features that ship WITH the app and run SANDBOXED (isolated,
// capability-gated) — no config.json entry required. The app mounts them itself at
// boot, so the sandbox is a core capability of Orbit, not just a plugin loader.
//
// Sources are bundled as raw strings (compiled into the app) and evaluated inside
// the opaque-origin guest, so a bundled feature still can't reach the page/session.
import diceSource from './features/dice.js?raw';
import { mountSandboxed } from './host';

const BUILTINS = [
  { name: 'dice', source: diceSource, permissions: ['irc', 'storage'] },
];

export function mountBuiltins(): void {
  for (const b of BUILTINS) mountSandboxed(b);
}
