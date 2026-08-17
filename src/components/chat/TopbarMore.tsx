import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { useActiveChat } from '@/core/networks';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';

// Mobile overflow ("⋮") for the topbar's one-shot channel actions. A phone header
// can't hold every button, so search / manage / leave collapse in here; the notify
// and pin buttons stay inline because their glyph carries state (mute, pin count).
// Plugins may add `topbar_more_item` rows (e.g. conference on mobile).
export function TopbarMore({ bname, isChannel, amOp, onSearch }:
  { bname: string; isChannel: boolean; amOp: boolean; onSearch: () => void }) {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const closeBuffer = useActiveChat((s) => s.closeBuffer);
  const openUser = useActiveChat((s) => s.openUser);
  // Select the stable `ui` array — never `.filter()` inside the selector (new
  // array every read → zustand Object.is → infinite re-render / React #185).
  const pluginUi = usePluginRegistry((s) => s.ui);
  const morePlugins = pluginUi.filter((u) => u.slot === 'topbar_more_item');
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
          {morePlugins.map((u) => (
            <div key={u.id} role="none" onClick={() => setOpen(false)}>
              <PluginBoundary render={u.render} label="topbar_more_item" />
            </div>
          ))}
          {!isChannel && (
            <button className="nmenu__item" role="menuitem" onClick={() => run(() => openUser(bname))}>
              <span className="nmenu__ic" aria-hidden><Icon name="user" size={18} /></span>
              <span className="nmenu__txt"><b>{t('topbar.userInfo', { nick: bname })}</b></span>
            </button>
          )}
          {isChannel && amOp && (
            <button className="nmenu__item" role="menuitem" onClick={() => run(() => setModal('chanadmin'))}>
              <span className="nmenu__ic" aria-hidden><Icon name="sliders" size={18} /></span>
              <span className="nmenu__txt"><b>{t('topbar.manage')}</b></span>
            </button>
          )}
          <button className="nmenu__item nmenu__item--danger" role="menuitem" onClick={() => run(() => closeBuffer(bname))}>
            <span className="nmenu__ic" aria-hidden><Icon name="logout" size={18} /></span>
            <span className="nmenu__txt"><b>{isChannel ? t('sidebar.leaveRoom') : t('sidebar.closeConversation')}</b></span>
          </button>
        </div>
      )}
    </div>
  );
}
