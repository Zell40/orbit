import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadTtlChoices, resolveUploadTtlHours } from '@/core/store/upload';

export function ImageSendPreview({
  file,
  ttlHours,
  onTtl,
  onSend,
  onCancel,
}: {
  file: File;
  ttlHours: number;
  onTtl: (hours: number) => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const preview = useMemo(() => URL.createObjectURL(file), [file]);
  const choices = uploadTtlChoices();
  const selected = resolveUploadTtlHours(ttlHours);

  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="imgttl">
      <img className="imgttl__img" src={preview} alt="" />
      <div className="imgttl__bar">
        <span className="imgttl__lbl">{t('composer.uploadTtl')}</span>
        <div className="imgttl__chips" role="group" aria-label={t('composer.uploadTtl')}>
          {choices.map((h) => (
            <button key={h} type="button"
              className={`imgttl__chip ${h === selected ? 'is-on' : ''}`}
              aria-pressed={h === selected}
              onClick={() => onTtl(h)}>
              {h % 24 === 0 && h >= 24 ? t('composer.uploadTtlDays', { n: h / 24 }) : t('composer.uploadTtlHours', { n: h })}
            </button>
          ))}
        </div>
        <button type="button" className="imgttl__x" onClick={onCancel} aria-label={t('composer.cancel')} title={t('composer.cancel')}>✕</button>
        <button type="button" className="imgttl__send" onClick={onSend} aria-label={t('composer.send')} title={t('composer.send')}>➤</button>
      </div>
    </div>
  );
}

