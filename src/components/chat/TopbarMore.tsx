import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { isBouncerServiceNick } from '@/core/store';
import { useActiveChat } from '@/core/networks';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { advertisedUserModes } from '@/core/irc/mode-catalog';

// Mobile overflow ("⋮") for the topbar's one-shot channel actions. A phone header
// can't hold every button, so search / manage / leave / +D collapse in here; the
// notify and pin buttons stay inline because their glyph carries state.
// Plugins may add `topbar_more_item` rows (e.g. conference on mobile).
export function TopbarMore({ bname, isChannel, isNotices, amOp, showManage, showInfo, onSearch }:
  { bname: string; isChannel: boolean; isNotices?: boolean; amOp: boolean; showManage?: boolean; showInfo?: boolean; onSearch: () => void }) {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const closeBuffer = useActiveChat((s) => s.closeBuffer);
  const openUser = useActiveChat((s) => s.openUser);
  const client = useActiveChat((s) => s.client);
  const umodes = useActiveChat((s) => s.umodes);
  const um = umodes.replace(/^\+/, '');
  const privDeaf = um.includes('D');
  const advertised = advertisedUserModes(client?.server.isupport ?? {}, client?.server.userModes);
  const showPrivDeaf = !advertised.size || advertised.has('D');
  // Select the stable `ui` array — never `.filter()` inside the selector (new
  // array every read → zustand Object.is → infinite re-render / React #185).
  const pluginUi = usePluginRegistry((s) => s.ui);
  const morePlugins = pluginUi.filter((u) => u.slot === 'topbar_more_item');
  const manageBadges = pluginUi.filter((u) => u.slot === 'chanadmin_badge');
  const afterManageNames = new Set(['orbit-chanserv']);
  const moreAfterManage = morePlugins.filter((u) => afterManageNames.has(u.plugin));
  const moreRest = morePlugins.filter((u) => !afterManageNames.has(u.plugin));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const run = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <div className="nmenu topbar__more" ref={ref}>
      <button className="topbar__search" aria-haspopup="menu" aria-expanded={open}
        title={t('topbar.more')} aria-label={t('topbar.more')} onClick={() => setOpen((o) => !o)}>
        <Icon name="more" size={20} />
      </button>
      {open && (
        <div className="nmenu__pop" role="menu" aria-label={t('topbar.more')}>
          <button className="nmenu__item" role="menuitem" onClick={() => run(onSearch)}>
            <span className="nmenu__ic" aria-hidden><Icon name="search" size={18} /></span>
            <span className="nmenu__txt"><b>{t('topbar.search')}</b></span>
          </button>
          {showPrivDeaf && (
            <button
              className={`nmenu__item${privDeaf ? ' is-on' : ''}`}
              role="menuitemcheckbox"
              aria-checked={privDeaf}
              title={privDeaf ? t('topbar.deafPrivTip') : t('topbar.deafPrivEnableTip')}
              onClick={() => run(() => client?.setUserModes(privDeaf ? '-D' : '+D'))}
            >
              <span className="nmenu__ic" aria-hidden><Icon name="deafPriv" size={18} /></span>
              <span className="nmenu__txt"><b>{t('topbar.deafPrivShort')}</b></span>
              {privDeaf ? <span className="nmenu__check" aria-hidden>✓</span> : null}
            </button>
          )}
          {moreRest.map((u) => (
            <div key={u.id} role="none" onClick={() => setOpen(false)}>
              <PluginBoundary render={u.render} label="topbar_more_item" />
            </div>
          ))}
          {!isChannel && !isNotices && !isBouncerServiceNick(bname) && (
            <button className="nmenu__item" role="menuitem" onClick={() => run(() => openUser(bname))}>
              <span className="nmenu__ic" aria-hidden><Icon name="user" size={18} /></span>
              <span className="nmenu__txt"><b>{t('topbar.userInfo', { nick: bname })}</b></span>
            </button>
          )}
          {isChannel && (showManage ?? amOp) && (
            <button className="nmenu__item" role="menuitem" onClick={() => run(() => setModal('chanadmin'))}>
              <span className="nmenu__ic nmenu__ic--badge" aria-hidden>
                <Icon name="sliders" size={18} />
                {manageBadges.map((u) => <PluginBoundary key={u.id} render={u.render} label="chanadmin_badge" />)}
              </span>
              <span className="nmenu__txt"><b>{t('topbar.manage')}</b></span>
            </button>
          )}
          {isChannel && (showInfo ?? !amOp) && (
            <button className="nmenu__item" role="menuitem" onClick={() => run(() => setModal('chaninfo'))}>
              <span className="nmenu__ic" aria-hidden><Icon name="info" size={18} /></span>
              <span className="nmenu__txt"><b>{t('topbar.channelInfo')}</b></span>
            </button>
          )}
          {moreAfterManage.map((u) => (
            <div key={u.id} role="none" onClick={() => setOpen(false)}>
              <PluginBoundary render={u.render} label="topbar_more_item" />
            </div>
          ))}
          <button className="nmenu__item nmenu__item--danger" role="menuitem" onClick={() => run(() => closeBuffer(bname))}>
            <span className="nmenu__ic" aria-hidden><Icon name="logout" size={18} /></span>
            <span className="nmenu__txt"><b>{isChannel ? t('sidebar.leaveRoom') : t('sidebar.closeConversation')}</b></span>
          </button>
        </div>
      )}
    </div>
  );
}
