// First-party features that ship WITH the app and run SANDBOXED (isolated,
// capability-gated) — no config.json entry required. The app mounts them itself at
// boot, so the sandbox is a core capability of Orbit, not just a plugin loader.
//
// Sources are bundled as raw strings (compiled into the app) and evaluated inside
// the opaque-origin guest, so a bundled feature still can't reach the page/session.
import diceSource from './features/dice.js?raw';
import pulseSource from './features/pulse.js?raw';
import analyticsSource from './features/analytics.js?raw';
import { mountSandboxed } from './host';
import { getConfig } from '@/core/config';

// The registry of built-in feature modules. To add one, see features/README.md.
const BUILTINS = [
  { name: 'dice', source: diceSource, permissions: ['irc', 'storage'] },
  { name: 'pulse', source: pulseSource, permissions: [] },
];

// Mount only the built-ins an operator opted into via config.json `builtins: [...]`.
export function mountBuiltins(): void {
  const enabled = getConfig().builtins ?? [];
  for (const b of BUILTINS) if (enabled.includes(b.name)) mountSandboxed(b);
  // Analytics is driven by its own config block — an endpoint is required anyway —
  // so enabling it is a single knob: set analytics.endpoint.
  if (getConfig().analytics?.endpoint)
    mountSandboxed({ name: 'analytics', source: analyticsSource, permissions: ['analytics'] });
}
