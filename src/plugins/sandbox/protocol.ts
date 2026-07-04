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
export const PERMISSIONS = ['irc', 'notify', 'storage'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** RPC methods the guest may call, mapped to the permission each one needs.
 *  `null` = always allowed (contained to the plugin's own iframe / read-only). */
export const RPC_CAPABILITY: Record<string, Permission | null> = {
  'irc.say': 'irc',
  'irc.msg': 'irc',
  'irc.send': 'irc',
  'irc.join': 'irc',
  'irc.part': 'irc',
  'irc.list': 'irc',
  'notify': 'notify',
  'storage.set': 'storage',
  // UI stays inside the plugin's own sandboxed iframe, so it needs no grant.
  'ui.claim': null,
  'ui.resize': null,
  'log': null,
};

/** Is `method` a known RPC, and is it permitted for a plugin holding `permissions`? */
export function isGranted(permissions: readonly string[], method: string): boolean {
  if (!(method in RPC_CAPABILITY)) return false; // unknown method: refuse by default
  const need = RPC_CAPABILITY[method];
  return need === null || permissions.includes(need);
}

/** Keep only the recognised permission strings from operator config. */
export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return [];
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
}
export interface EventMsg { type: 'event'; name: string; args: unknown[]; }
export interface SnapshotMsg { type: 'snapshot'; snapshot: StateSnapshot; }
export interface RpcReplyMsg { type: 'rpc:reply'; id: number; result?: unknown; error?: string; }

// guest -> host
export interface RpcMsg { type: 'rpc'; id: number; method: string; args: unknown[]; }

export interface StateSnapshot { active: string; nick: string; account: string; buffers: string[]; }

export type HostToGuest = InitMsg | EventMsg | SnapshotMsg | RpcReplyMsg;
export type GuestToHost = RpcMsg;

/** App events forwarded into the sandbox. A deny-list-free allow-list: the guest
 *  only ever sees these, never raw internals. */
export const FORWARDED_EVENTS = ['connected', 'disconnected', 'message', 'active-change'] as const;
