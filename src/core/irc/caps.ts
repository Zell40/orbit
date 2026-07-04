// IRCv3 capabilities Orbit requests when the server advertises them.
export const WANTED_CAPS = [
  'multi-prefix', 'away-notify', 'account-notify', 'extended-join', 'chghost',
  'account-tag', 'server-time', 'echo-message', 'batch', 'labeled-response',
  'message-tags', 'sasl', 'invite-notify', 'setname', 'userhost-in-names',
  'draft/chathistory', 'draft/event-playback',
  'draft/message-redaction', 'draft/read-marker', 'draft/multiline',
  'draft/metadata-2', 'standard-replies', 'draft/account-registration',
  'draft/pre-away', 'draft/webpush',
];
