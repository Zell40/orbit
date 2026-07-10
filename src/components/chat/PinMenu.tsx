import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { nickColor } from '@/lib/format';
import { stripFormatting } from '@/core/store/text';
import type { Pin } from '@/core/store/persistence';
import { useActiveChat } from '@/core/networks';

const EMPTY: Pin[] = [];

// Scroll a pinned line back into view and flash it. Rows carry data-mid={id}.
function jumpTo(id: string) {
  const el = document.querySelector(`[data-mid="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('is-flash');
  setTimeout(() => el.classList.remove('is-flash'), 1200);
}

// Pinned-messages popover, anchored to the topbar pin button. Hidden when the
// active channel has nothing pinned.
export function PinMenu() {
  const { t } = useTranslation();
  const active = useActiveChat((s) => s.active);
  const pins = useActiveChat((s) => s.pins[s.active]) ?? EMPTY;
  const unpin = useActiveChat((s) => s.unpin);
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

  if (!pins.length) return null;

  return (
    <div className="nmenu" ref={ref}>
      <button className="topbar__search" aria-haspopup="menu" aria-expanded={open}
        title={t('pins.title')} aria-label={t('pins.aria', { count: pins.length })}
        onClick={() => setOpen((o) => !o)}>📌<span className="nmenu__badge">{pins.length}</span></button>
      {open && (
        <div className="nmenu__pop nmenu__pop--pins" role="menu" aria-label={t('pins.title')}>
          <div className="nmenu__head">{t('pins.title')}</div>
          {pins.map((p) => (
            <div key={p.id} className="pinrow" role="menuitem">
              <button className="pinrow__go" title={t('pins.jump')} onClick={() => { jumpTo(p.id); setOpen(false); }}>
                <span className="pinrow__from" style={{ color: nickColor(p.from) }}>{p.from}</span>
                <span className="pinrow__txt">{stripFormatting(p.text).slice(0, 140)}</span>
              </button>
              <button className="pinrow__x" title={t('pins.unpin')} aria-label={t('pins.unpin')}
                onClick={() => unpin(active, p.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
