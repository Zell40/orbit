import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { applyAppUpdate, fetchUpdateNotes, onAppUpdate, type UpdateNote } from '../ui/appUpdate';

const LATEST_NOTES = 5;

function formatNoteDate(iso: string | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'fr-FR');
}

export function AppUpdateBanner() {
  const { t, i18n } = useTranslation();
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<UpdateNote[] | null>(null);
  const [notesBusy, setNotesBusy] = useState(false);

  useEffect(() => onAppUpdate(() => setShow(true)), []);

  useEffect(() => {
    if (!show || !open || notes !== null) return;
    let cancelled = false;
    setNotesBusy(true);
    void fetchUpdateNotes().then((list) => {
      if (!cancelled) { setNotes(list); setNotesBusy(false); }
    });
    return () => { cancelled = true; };
  }, [show, open, notes]);

  if (!show) return null;

  const lang = (i18n.language || 'fr').slice(0, 2).toLowerCase();
  const noteLines = [...(notes || [])]
    .reverse()
    .map((n: UpdateNote) => ({
      text: lang === 'en' ? (n.en || n.fr || '') : (n.fr || n.en || ''),
      iso: n.date || '',
      date: formatNoteDate(n.date, lang),
    }))
    .filter((n) => n.text)
    .slice(0, LATEST_NOTES);

  return (
    <div className={`appupd${open ? ' appupd--open' : ''}`} role="dialog" aria-labelledby="appupd-title">
      <div className="appupd__main">
        <span className="appupd__ic" aria-hidden="true">
          <Icon name="refresh" size={22} />
        </span>
        <div className="appupd__copy">
          <p id="appupd-title" className="appupd__title">{t('banners.appUpdateTitle')}</p>
          <p className="appupd__body">{t('banners.appUpdateBody')}</p>
        </div>
      </div>

      {open && (
        <div className="appupd__more">
          <p className="appupd__more-h">
            <Icon name="info" size={15} />
            {t('banners.appUpdateWhatsNew')}
          </p>
          {notesBusy && <p className="appupd__more-empty">{t('banners.appUpdateNotesLoading')}</p>}
          {!notesBusy && noteLines.length === 0 && (
            <p className="appupd__more-empty">{t('banners.appUpdateNotesEmpty')}</p>
          )}
          {!notesBusy && noteLines.length > 0 && (
            <ul className="appupd__list">
              {noteLines.map((line) => (
                <li key={`${line.iso}-${line.text}`}>
                  <span className="appupd__check" aria-hidden="true"><Icon name="check" size={14} /></span>
                  {line.date && <time className="appupd__date" dateTime={line.iso}>{line.date}</time>}
                  <span>{line.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="appupd__acts">
        <button
          type="button"
          className="appupd__morebtn"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name="info" size={15} />
          {open ? t('banners.appUpdateSeeLess') : t('banners.appUpdateSeeMore')}
        </button>
        <button type="button" className="appupd__go" onClick={() => applyAppUpdate()}>
          <Icon name="refresh" size={15} />
          {t('banners.appUpdateReload')}
        </button>
      </div>
    </div>
  );
}
