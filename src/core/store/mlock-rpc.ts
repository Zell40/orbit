import { parseMlockNotice } from '../irc/mode-catalog';

const CS_RPC = '/app/plugins/third/orbit-chanserv/chanserv-rpc.php';

/** Read ChanServ INFO via Anope JSON-RPC (same path as orbit-chanserv). No IRC PM. */
export async function fetchChannelMlock(account: string, nick: string, channel: string): Promise<string> {
  if (!account || !channel) return '';
  const ctrl = new AbortController();
  const to = window.setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(CS_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ account, channel, action: 'probe', nick }),
      signal: ctrl.signal,
    });
    const data = await r.json() as { ok?: boolean; info?: unknown };
    if (!data?.ok || data.info == null) return '';
    const blob = String(data.info);
    const direct = parseMlockNotice(blob);
    if (direct?.mlock) return direct.mlock;
    for (const line of blob.split(/\n/)) {
      const hit = parseMlockNotice(line);
      if (hit?.mlock) return hit.mlock;
    }
    return '';
  } catch {
    return '';
  } finally {
    window.clearTimeout(to);
  }
}
