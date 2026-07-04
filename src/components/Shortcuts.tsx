import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '../core/networks';


const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');
const MOD = isMac ? '⌘' : 'Ctrl';

// Keyboard-shortcuts reference sheet (opened with ?). Rows pair literal key caps
// with an i18n description. Keeps power users — and the switcher — discoverable.
export function Shortcuts() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const close = () => setModal('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: { keys: string[]; desc: string }[] = [
    { keys: [MOD, 'K'], desc: t('shortcuts.switcher') },
    { keys: ['Alt', '↑'], desc: t('shortcuts.prev') },
    { keys: ['Alt', '↓'], desc: t('shortcuts.next') },
    { keys: ['Shift', 'Esc'], desc: t('shortcuts.markRead') },
    { keys: ['?'], desc: t('shortcuts.help') },
    { keys: ['Esc'], desc: t('shortcuts.close') },
    { keys: ['Enter'], desc: t('shortcuts.send') },
    { keys: ['Shift', 'Enter'], desc: t('shortcuts.newline') },
    { keys: ['Tab'], desc: t('shortcuts.complete') },
    { keys: ['↑', '↓'], desc: t('shortcuts.history') },
  ];

  return (
    <div className="ksheet-scrim" onClick={close}>
      <div className="ksheet" role="dialog" aria-label={t('shortcuts.title')} onClick={(e) => e.stopPropagation()}>
        <div className="ksheet__head">
          <h3>{t('shortcuts.title')}</h3>
          <button className="ksheet__x" onClick={close} aria-label={t('modals.closeButton')}>✕</button>
        </div>
        <ul className="ksheet__list">
          {rows.map((r, i) => (
            <li key={i} className="ksheet__row">
              <span className="ksheet__desc">{r.desc}</span>
              <span className="ksheet__keys">
                {r.keys.map((k, j) => <kbd key={j} className="ksheet__kbd">{k}</kbd>)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
