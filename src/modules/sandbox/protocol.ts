// Wire protocol + capability model for sandboxed plugins.
//
// A sandboxed plugin runs in an opaque-origin iframe (sandbox="allow-scripts",
// no allow-same-origin) and can touch the app ONLY by sending these messages
// over a MessageChannel. The host validates every inbound RPC against the
// plugin's declared `permissions` before doing anything — so an untrusted or
// buggy plugin cannot read the SASL password, cookies, or the store, and cannot
// act as the user unless the operator granted the matching permission.
//
// This module is pure (no DOM, no store) so the capability gate is unit-testable
// on its own — the part that must never regress.

/** Permissions an operator can grant a sandboxed plugin in config.json. */
// 'irc-raw' is deliberately separate from 'irc': the structured verbs (say/msg/
// join/part/list) are far less dangerous than raw wire access (irc.send can issue
// ANY command as the user — MODE, KICK, QUIT, …), so an operator must grant it on
// purpose rather than getting it bundled with 'irc'.
export const PERMISSIONS = ['irc', 'irc-raw', 'notify', 'storage'] as const;
export type Permission = (typeof PERMISSIONS)[number];

// An explicit, self-documenting way to declare that a plugin wants ZERO
// permissions: `"permissions": ["none"]`. Clearer than an empty `[]` (which reads
// like an oversight), and it is fail-closed — `'none'` wins over anything else in
// the list, so a stray grant next to it is dropped rather than silently honoured.
export const NO_PERMISSIONS = 'none';

/** RPC methods the guest may call, mapped to the permission each one needs.
 *  `null` = always allowed (contained to the plugin's own iframe / read-only). */
export const RPC_CAPABILITY: Record<string, Permission | null> = {
  'irc.say': 'irc',
  'irc.msg': 'irc',
  'irc.send': 'irc-raw',
  'irc.join': 'irc',
  'irc.part': 'irc',
  'irc.list': 'irc',
  'notify': 'notify',
  'storage.set': 'storage',
  // UI stays inside the plugin's own sandboxed iframe, so it needs no grant.
  'ui.claim': null,
  'ui.resize': null,
  // Registering a /command or a shortcut is benign — it only wires a user-driven
  // trigger; whatever the plugin then DOES still goes through the gated verbs above.
  'command.register': null,
  'command.dispose': null,
  'shortcut.register': null,
  'shortcut.dispose': null,
  'log': null,
};

/** Every RPC method name — the guest types its calls against this, so a method that
 *  isn't wired on the host can't be called (no host/guest string drift). */
export type RpcMethod = keyof typeof RPC_CAPABILITY;

/** Is `method` a known RPC, and is it permitted for a plugin holding `permissions`? */
export function isGranted(permissions: readonly string[], method: string): boolean {
  if (!(method in RPC_CAPABILITY)) return false; // unknown method: refuse by default
  const need = RPC_CAPABILITY[method];
  return need === null || permissions.includes(need);
}

/** Keep only the recognised permission strings from operator config. The explicit
 *  `'none'` token declares zero permissions and wins over anything else in the list
 *  (fail-closed), so `["none"]` can never accidentally hide a real grant. */
export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
  if (input.includes(NO_PERMISSIONS)) return [];
  return PERMISSIONS.filter((p) => input.includes(p));
}

// ── message shapes (host <-> guest over the MessageChannel) ──────────────────
// host -> guest
export interface InitMsg {
  type: 'init';
  name: string;
  permissions: Permission[];
  source: string;             // the plugin's JS, fetched host-side (same trust as app)
  snapshot: StateSnapshot;    // cached so guest state reads stay synchronous
  storage: Record<string, unknown>;
  theme: Record<string, string>; // app CSS vars, so sandboxed UI matches the theme
}
export interface EventMsg { type: 'event'; name: string; args: unknown[]; }
export interface SnapshotMsg { type: 'snapshot'; snapshot: StateSnapshot; }
export interface ThemeMsg { type: 'theme'; theme: Record<string, string>; }
export interface RpcReplyMsg { type: 'rpc:reply'; id: number; result?: unknown; error?: string; }

// App CSS variables mirrored into the sandbox so plugins can `var(--accent)` etc.
export const THEME_VARS = ['--bg', '--ink', '--accent', '--muted', '--border', '--accent-soft'] as const;

// guest -> host
export interface RpcMsg { type: 'rpc'; id: number; method: string; args: unknown[]; }

export interface StateSnapshot {
  active: string; nick: string; account: string; buffers: string[];
  // Read-only server / capability info (client.server + client.ircv3), pushed in the
  // snapshot so a sandboxed plugin can gate cap-dependent behaviour synchronously —
  // never a raw command that 421s a lean server. (No numeric map: the sandbox gets
  // no 'raw' events, so there are no numeric replies to name.)
  network: string;
  isupport: Record<string, string>;
  caps: { name: string; available: boolean; enabled: boolean }[];
}

export type HostToGuest = InitMsg | EventMsg | SnapshotMsg | ThemeMsg | RpcReplyMsg;
export type GuestToHost = RpcMsg;

/** App events forwarded into the sandbox. A deny-list-free allow-list: the guest
 *  only ever sees these, never raw internals. */
export const FORWARDED_EVENTS = ['connected', 'message', 'buffer.active', 'status'] as const;
