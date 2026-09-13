import { useTranslation } from 'react-i18next';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../../PluginBoundary';
import { useActiveChat } from '@/core/networks';
import { getConfig } from '@/core/config';
import {
  USER_FLAG_GROUPS,
  advertisedUserModes,
  filterCatalog,
  parentalLockedLetters,
  USER_FLAGS,
  type UserFlag,
} from '@/core/irc/mode-catalog';

function UmodeRow({
  flag, on, locked, offline, onToggle,
}: {
  flag: UserFlag; on: boolean; locked: boolean; offline: boolean; onToggle: () => void;
}) {
  const { t } = useTranslation();
  const disabled = locked || offline;
  return (
    <div className="srow">
      <span className="srow__ic srow__ic--mode" aria-hidden>+{flag.m}</span>
      <div className="srow__txt">
        <div className="srow__label">{t(`userFlags.${flag.key}.label`)}</div>
        <div className="srow__hint">
          {locked
            ? t('settings.modes.locked')
            : t(`userFlags.${flag.key}.desc`)}
        </div>
      </div>
      <button
        type="button"
        className={`switch${on ? ' is-on' : ''}${disabled ? ' is-locked' : ''}`}
        role="switch"
        aria-checked={on}
        aria-disabled={disabled}
        aria-label={t(`userFlags.${flag.key}.label`)}
        title={locked ? t('settings.modes.lockedTitle') : undefined}
        onClick={() => { if (!disabled) onToggle(); }}
      >
        <span className="switch__dot" aria-hidden />
      </button>
    </div>
  );
}

/** Hub for user-mode toggles + optional privacy plugins (callerid, etc.). */
export function ModesSection() {
  const { t } = useTranslation();
  const pluginUi = usePluginRegistry((s) => s.ui);
  const modeItems = pluginUi.filter((u) => u.slot === 'settings_mode');
  const umodes = useActiveChat((s) => s.umodes);
  const client = useActiveChat((s) => s.client);

  const advertised = advertisedUserModes(client?.server.isupport ?? {}, client?.server.userModes);
  const skipG = modeItems.length > 0;
  const flags = filterCatalog(USER_FLAGS, advertised).filter((f) => !(skipG && f.m === 'g'));
  const pack = getConfig().callerid?.modes || '';
  const locked = parentalLockedLetters(umodes, pack);
  const offline = !client;
  const um = umodes.replace(/^\+/, '');

  const toggle = (m: string, on: boolean) => {
    client?.setUserModes(`${on ? '+' : '-'}${m}`);
  };

  const grouped = USER_FLAG_GROUPS
    .map((group) => ({ group, flags: flags.filter((f) => f.group === group) }))
    .filter((g) => g.flags.length > 0);

  const empty = grouped.length === 0 && modeItems.length === 0;

  return (
    <div className="scard">
      <div className="scard__body">
        <div className="sfield">
          <div className="sfield__intro">{t('settings.modes.intro')}</div>
        </div>
        {empty ? (
          <p className="srow__hint" style={{ margin: '0.5rem 0 0' }}>{t('settings.modes.empty')}</p>
        ) : (
          <>
            {grouped.map(({ group, flags: rows }) => (
              <div key={group}>
                <div className="scard__h">{t(`userFlags.groups.${group}`)}</div>
                {rows.map((flag) => (
                  <UmodeRow
                    key={flag.m}
                    flag={flag}
                    on={um.includes(flag.m)}
                    locked={locked.has(flag.m)}
                    offline={offline}
                    onToggle={() => toggle(flag.m, !um.includes(flag.m))}
                  />
                ))}
                {group === 'messages' && modeItems.map((item) => (
                  <PluginBoundary key={item.id} render={item.render} label={`settings_mode:${item.plugin}`} />
                ))}
              </div>
            ))}
            {grouped.every((g) => g.group !== 'messages') && modeItems.map((item) => (
              <PluginBoundary key={item.id} render={item.render} label={`settings_mode:${item.plugin}`} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
