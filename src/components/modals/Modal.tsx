import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// Shared modal shell: backdrop, centered card, title bar + close, Escape-to-close.
// The specific dialogs (Join/Explore/Friends/…) render their body as children.
export function Modal({ title, onClose, children, wide, stacked }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; stacked?: boolean }) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const card = cardRef.current;
    const tabbables = () => card
      ? [...card.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.hasAttribute('disabled'))
      : [];
    // Prefer the first field, not the header ✕ — otherwise each parent re-render
    // (new onClose identity) stole focus back to the close button while typing.
    const field = card?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select, [autofocus]');
    const firstContent = tabbables().find((el) => !el.classList.contains('modal__x'));
    (field || firstContent || tabbables()[0] || card)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab') return;
      const f = tabbables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); returnTo?.focus?.(); };
  }, []);
  return (
    <div className={`modal-backdrop${stacked ? ' modal-backdrop--stack' : ''}`} onClick={() => onCloseRef.current()}>
      <div ref={cardRef} className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="modal__x" onClick={() => onCloseRef.current()} aria-label={t('modals.closeButton')}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
