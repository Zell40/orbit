import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { avatarBg } from '../lib/format';
import { buildSwitcherResults, type SwitcherItem } from '../lib/switcher';
import { useActiveChat } from '../core/networks';
import { sidebarBufferOrder } from '../core/store/sidebar-order';
import { Icon } from './Icon';

// Command-palette-style quick switcher (Ctrl/⌘-K): fuzzy-jump to any open
// channel/DM, any person in your channels, or join a channel by name.
export function QuickSwitcher() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const setActive = useActiveChat((s) => s.setActive);
  const openQuery = useActiveChat((s) => s.openQuery);
  const client = useActiveChat((s) => s.client);
  // Stable-ref selects (a new-array selector would loop under zustand v5).
  const order = useActiveChat((s) => s.order);
  const sidebarOrder = useActiveChat((s) => s.sidebarOrder);
  const buffers = useActiveChat((s) => s.buffers);
  const friends = useActiveChat((s) => s.friends);
  const nick = useActiveChat((s) => s.nick);
  const arranged = useMemo(() => sidebarBufferOrder(order, sidebarOrder), [order, sidebarOrder]);

  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const close = () => setModal('');

  const results = useMemo(
    () => buildSwitcherResults(q, { order: arranged, buffers, friends, nick }),
    [q, arranged, buffers, friends, nick],
  );
  const cur = Math.min(sel, Math.max(0, results.length - 1));

  // Keep the highlighted row in view as you arrow through.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.is-sel')?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  function activate(it?: SwitcherItem) {
    if (!it) return;
    if (it.kind === 'person') openQuery(it.target);
    else if (it.kind === 'join') { client?.join(it.target); setActive(it.target); }
    else setActive(it.target);
    close();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); activate(results[cur]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  return (
    <div className="qswitch-scrim" onClick={close}>
      <div className="qswitch" role="dialog" aria-label={t('switcher.title')} onClick={(e) => e.stopPropagation()}>
        <div className="qswitch__bar">
          <span className="qswitch__ic" aria-hidden><Icon name="search" size={15} /></span>
          <input className="qswitch__input" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey} placeholder={t('switcher.placeholder')} aria-label={t('switcher.placeholder')} />
        </div>
        <ul className="qswitch__list" ref={listRef}>
          {results.map((it, i) => (
            <li key={it.id} className={`qswitch__item ${i === cur ? 'is-sel' : ''}`}
              onMouseEnter={() => setSel(i)} onClick={() => activate(it)}>
              {it.kind === 'channel'
                ? <span className="qswitch__av qswitch__av--chan" style={{ background: avatarBg(it.target) }}>#</span>
                : it.kind === 'join'
                  ? <span className="qswitch__av qswitch__av--join" aria-hidden>＋</span>
                  : <span className="qswitch__av" style={{ background: avatarBg(it.target) }}>{it.label[0]?.toUpperCase()}</span>}
              <span className="qswitch__name">{it.kind === 'join' ? t('switcher.join', { chan: it.target }) : it.label}</span>
              <span className="qswitch__kind">{t(`switcher.kind_${it.kind}`)}</span>
            </li>
          ))}
          {results.length === 0 && <li className="qswitch__empty">{t('switcher.empty')}</li>}
        </ul>
        <div className="qswitch__foot">{t('switcher.hint')}</div>
      </div>
    </div>
  );
}
