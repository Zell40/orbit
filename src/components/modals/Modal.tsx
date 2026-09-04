import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Shared modal shell: backdrop, centered card, title bar + close, Escape-to-close.
// The specific dialogs (Join/Explore/Friends/…) render their body as children.
export function Modal({ title, onClose, children, wide, stacked }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; stacked?: boolean }) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null; // what was focused before we opened
    const card = cardRef.current;
    const tabbables = () => card
      ? [...card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'))
      : [];
    (tabbables()[0] || card)?.focus(); // move focus into the dialog
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the dialog — wrap at both ends.
      const f = tabbables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); returnTo?.focus?.(); }; // give focus back on close
  }, [onClose]);
  return (
    <div className={`modal-backdrop${stacked ? ' modal-backdrop--stack' : ''}`} onClick={onClose}>
      <div ref={cardRef} className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="modal__x" onClick={onClose} aria-label={t('modals.closeButton')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
