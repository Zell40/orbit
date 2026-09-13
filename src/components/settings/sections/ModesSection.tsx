import { useTranslation } from 'react-i18next';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../../PluginBoundary';
import { useActiveChat } from '@/core/networks';
import { getConfig } from '@/core/config';
import { canon } from '@/core/store/context';
import {
  USER_FLAG_GROUPS,
  advertisedUserModes,
  filterCatalog,
  parentalLockedLetters,
  umodeLockHintKey,
  umodeRowState,
  USER_FLAGS,
  type UmodeLockReason,
  type UserFlag,
} from '@/core/irc/mode-catalog';

function UmodeRow({
  flag, on, locked, reason, offline, onToggle,
}: {
  flag: UserFlag; on: boolean; locked: boolean; reason: UmodeLockReason;
  offline: boolean; onToggle: () => void;
}) {
  const { t } = useTranslation();
  const disabled = locked || offline;
  const hintKey = umodeLockHintKey(reason);
  return (
    <div className="srow">
      <span className="srow__ic srow__ic--mode" aria-hidden>+{flag.m}</span>
      <div className="srow__txt">
        <div className="srow__label">{t(`userFlags.${flag.key}.label`)}</div>
        <div className="srow__hint">
          {hintKey ? t(hintKey) : t(`userFlags.${flag.key}.desc`)}
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

function whoisLooksParental(
  nick: string,
  whois: Record<string, { nick: string; special?: string[] }>,
  group: string,
): boolean {
  const g = group.toLowerCase();
  if (!g || !nick) return false;
  const me = canon(nick);
  const entry = Object.values(whois).find((w) => canon(w.nick) === me);
  return !!(entry?.special || []).some((s) => s.toLowerCase().includes(g));
}

/** Hub for user-mode toggles + optional privacy plugins (callerid, etc.). */
export function ModesSection() {
  const { t } = useTranslation();
  const pluginUi = usePluginRegistry((s) => s.ui);
  const modeItems = pluginUi.filter((u) => u.slot === 'settings_mode');
  const umodes = useActiveChat((s) => s.umodes);
  const client = useActiveChat((s) => s.client);
  const nick = useActiveChat((s) => s.nick);
  const whois = useActiveChat((s) => s.whois);
  const parentalControls = useActiveChat((s) => s.parentalControls);

  const advertised = advertisedUserModes(client?.server.isupport ?? {}, client?.server.userModes);
  const skipG = modeItems.length > 0;
  const flags = filterCatalog(USER_FLAGS, advertised)
    .filter((f) => !f.hidden)
    .filter((f) => !(skipG && f.m === 'g'));
  const cfg = getConfig().callerid;
  const pack = cfg?.modes || '';
  const group = cfg?.group || '';
  const parental = !!(parentalControls || whoisLooksParental(nick, whois, group));
  const lockedPack = parentalLockedLetters(umodes, pack, parental);
  const offline = !client;

  const toggle = (m: string, turnOn: boolean) => {
    client?.setUserModes(`${turnOn ? '+' : '-'}${m}`);
  };

  const grouped = USER_FLAG_GROUPS
    .map((groupId) => ({ group: groupId, flags: flags.filter((f) => f.group === groupId) }))
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
            {grouped.map(({ group: gname, flags: rows }) => (
              <div key={gname}>
                <div className="scard__h">{t(`userFlags.groups.${gname}`)}</div>
                {rows.map((flag) => {
                  const row = umodeRowState(flag, umodes, lockedPack, parental);
                  return (
                    <UmodeRow
                      key={flag.m}
                      flag={flag}
                      on={row.on}
                      locked={row.locked}
                      reason={row.reason}
                      offline={offline}
                      onToggle={() => toggle(flag.m, !row.on)}
                    />
                  );
                })}
                {gname === 'messages' && modeItems.map((item) => (
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
