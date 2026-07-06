import { useTranslation } from 'react-i18next';
import { CAP_INFO } from '../../../core/irc/cap-info';
import { useActiveChat } from '../../../core/networks';

const CAP_KEYS = Object.keys(CAP_INFO);

// IRCv3 capabilities panel — shows every cap Orbit negotiates and whether the
// connected server actually supports it (live, from the client's CAP state).
export function CapabilitiesSection() {
  const { t } = useTranslation();
  const client = useActiveChat((s) => s.client);
  const status = useActiveChat((s) => s.status);
  const connected = status === 'registered' && !!client;
  const caps = client ? client.ircv3.listCaps() : CAP_KEYS.map((name) => ({ name, available: false, enabled: false }));
  const active = caps.filter((c) => c.enabled).length;

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield"><div className="sfield__intro">{t('caps.intro')}</div></div>
        <div className="caps-count">{t('caps.status.enabled')} · <b>{active}</b> / {caps.length}</div>
        <ul className="caps-list">
          {caps.map((c) => {
            const info = CAP_INFO[c.name];
            const state = !connected ? 'offline' : c.enabled ? 'enabled' : c.available ? 'available' : 'unavailable';
            const desc = info ? t(`caps.desc.${info.key}`) : '';
            return (
              <li key={c.name} className={`caprow caprow--${state}`} title={desc ? `${c.name} — ${desc}` : c.name}>
                <span className="caprow__ic" aria-hidden>{info?.icon ?? '🔌'}</span>
                <div className="caprow__txt">
                  <code className="caprow__name">{c.name}</code>
                  {desc && <span className="caprow__desc">{desc}</span>}
                </div>
                <span className={`capbadge capbadge--${state}`}>{t(`caps.status.${state}`)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
