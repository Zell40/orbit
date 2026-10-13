// IRCv3 capabilities Orbit requests when the server advertises them.
export const WANTED_CAPS = [
  'multi-prefix', 'away-notify', 'account-notify', 'extended-join', 'chghost',
  'account-tag', 'server-time', 'echo-message', 'batch', 'labeled-response',
  'message-tags', 'sasl', 'invite-notify', 'setname', 'userhost-in-names',
  'draft/chathistory', 'draft/event-playback',
  'draft/message-redaction', 'draft/read-marker', 'draft/multiline',
  'draft/metadata-2', 'standard-replies', 'draft/account-registration',
  'draft/pre-away', 'draft/webpush',
  'entrenous/mphistory',
];

/** ircv3_mphistory is loaded: the CAP was ACKed, or 005 advertises MPHISTORY. */
export function mphistoryModuleLoaded(client: {
  ircv3: { hasCap: (name: string) => boolean };
  server: { isupport: Record<string, string> };
} | null | undefined): boolean {
  if (!client) return false;
  if (client.ircv3.hasCap('entrenous/mphistory')) return true;
  return Object.prototype.hasOwnProperty.call(client.server.isupport, 'MPHISTORY');
}
