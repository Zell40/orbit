import { getConfig } from '../config';

// CTCP queries we answer (per the CTCP spec). ACTION is a message, not a query.
// VERSION/SOURCE read branding from the runtime config (resolved before connect).
export const CTCP_REPLIES: Record<string, (arg: string) => string> = {
  VERSION: () => `${getConfig().branding.name} Web (${getConfig().branding.url})`,
  SOURCE: () => getConfig().branding.url,
  PING: (arg) => arg, // echo the token back
  TIME: () => new Date().toISOString(),
  CLIENTINFO: () => 'ACTION CLIENTINFO PING SOURCE TIME VERSION',
};
