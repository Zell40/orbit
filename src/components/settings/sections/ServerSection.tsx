import { useTranslation } from 'react-i18next';
import { getConfig } from '@/core/config';
import { useActiveChat } from '@/core/networks';

// Server / IRCd facts, pulled live from the registration numerics + ISUPPORT.
export function ServerSection() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const status = useActiveChat((s) => s.status);
  const connected = status === 'registered' && !!client;

  const dash = '—';
  let host = '', secure = false;
  try { const u = new URL(getConfig().server.url); host = u.host; secure = u.protocol === 'wss:'; } catch { /* bad url */ }
  const software = client && (client.server.serverName || client.server.serverVersion)
    ? [client.server.serverName, client.server.serverVersion].filter(Boolean).join(' · ') : dash;
  const roles = client ? client.server.prefixModes.split('').join(' ') : dash;
  // CHANLIMIT is "#:100" / "#&:50" — surface the join cap as a plain number.
  const maxChans = (() => {
    const m = (client?.server.isupport?.['CHANLIMIT'] || '').match(/(\d+)/);
    return m ? m[1] : dash;
  })();
  const srv: { label: string; value: string }[] = [
    { label: t('caps.server.network'), value: (connected && client?.server.network) || dash },
    { label: t('caps.server.software'), value: connected ? software : dash },
    { label: t('caps.server.connection'), value: host ? (secure ? `🔒 ${t('caps.server.secure')} · ${host}` : host) : dash },
    { label: t('caps.server.users'), value: connected && client && client.server.users > 0 ? client.server.users.toLocaleString() : dash },
    { label: t('caps.server.casemapping'), value: (connected && client?.server.casemapping) || dash },
    { label: t('caps.server.channelTypes'), value: (connected && client?.server.chantypes) || dash },
    { label: t('caps.server.roles'), value: connected ? roles : dash },
    { label: t('caps.server.maxChannels'), value: connected ? maxChans : dash },
    { label: t('caps.server.limits'), value: connected && client
      ? t('caps.server.limitsValue', { nick: client.server.nicklen, chan: client.server.channellen, topic: client.server.topiclen }) : dash },
  ];

  // Everything the server advertised in ISUPPORT (005), for the curious.
  const raw = connected && client
    ? Object.entries(client.server.isupport).sort((a, b) => a[0].localeCompare(b[0])) : [];

  return (
    <div className="scard">
      <div className="scard__body">
        <dl className="srv-info">
          {srv.map((r) => (
            <div className="srv-row" key={r.label}>
              <dt className="srv-row__k">{r.label}</dt>
              <dd className="srv-row__v">{r.value}</dd>
            </div>
          ))}
        </dl>
        {raw.length > 0 && (
          <details className="srv-adv">
            <summary>{t('caps.server.advanced')} · {raw.length}</summary>
            <div className="srv-adv__grid">
              {raw.map(([k, v]) => (
                <code className="srv-tok" key={k}>{k}{v ? <span className="srv-tok__v">={v}</span> : null}</code>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
