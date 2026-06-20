import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat } from '../../store';

const LEVELS = ['all', 'mentions', 'mute'] as const;

// Per-channel notification level picker (All / Mentions / Mute) — a small
// accessible popover anchored to the topbar bell.
export function NotifyMenu() {
  const { t } = useTranslation();
  const active = useChat((s) => s.active);
  const level = useChat((s) => s.notifyLevel[s.active] || 'mentions');
  const setNotifyLevel = useChat((s) => s.setNotifyLevel);
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

  return (
    <div className="nmenu" ref={ref}>
      <button className="topbar__search" aria-haspopup="menu" aria-expanded={open}
        title={t('notify.title')} aria-label={t('notify.aria', { level: t(`notify.${level}`) })}
        onClick={() => setOpen((o) => !o)}>{level === 'mute' ? '🔕' : '🔔'}</button>
      {open && (
        <div className="nmenu__pop" role="menu" aria-label={t('notify.title')}>
          <div className="nmenu__head">{t('notify.title')}</div>
          {LEVELS.map((lv) => (
            <button key={lv} role="menuitemradio" aria-checked={level === lv}
              className={`nmenu__item ${level === lv ? 'is-on' : ''}`}
              onClick={() => { setNotifyLevel(active, lv); setOpen(false); }}>
              <span className="nmenu__ic" aria-hidden>{lv === 'mute' ? '🔕' : '🔔'}</span>
              <span className="nmenu__txt"><b>{t(`notify.${lv}`)}</b><span>{t(`notify.${lv}Desc`)}</span></span>
              {level === lv && <span className="nmenu__check" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
