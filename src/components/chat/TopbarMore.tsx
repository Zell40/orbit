import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../Icon';
import { PluginBoundary } from '../PluginBoundary';
import type { PluginUi } from '@/modules/registry';
import { useActiveChat } from '@/core/networks';

// Mobile overflow ("⋮") for the topbar's one-shot channel actions. A phone header
// can't hold every button, so search / manage / leave collapse in here; the notify
// and pin buttons stay inline because their glyph carries state (mute, pin count).
// Topbar plugins (e.g. Games) also live here on mobile — their launcher moves in
// while the plugin's panel stays anchored at the app root (the 'overlay' slot).
export function TopbarMore({ bname, isChannel, amOp, plugins, onSearch }:
  { bname: string; isChannel: boolean; amOp: boolean; plugins: PluginUi[]; onSearch: () => void }) {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const closeBuffer = useActiveChat((s) => s.closeBuffer);
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
          {plugins.map((u) => (
            <div key={u.id} className="nmenu__plug" onClick={() => setOpen(false)}>
              <PluginBoundary render={u.render} label="topbar_item" />
            </div>
          ))}
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
