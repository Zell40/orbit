import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIrc, avatarBg } from '@/lib/format';
import { useActiveChat } from '@/core/networks';
import { Modal } from './Modal';

export function ExploreModal() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const client = useActiveChat((s) => s.client);
  const setActive = useActiveChat((s) => s.setActive);
  const channels = useActiveChat((s) => s.channels);
  const loading = useActiveChat((s) => s.listLoading);
  const refresh = useActiveChat((s) => s.refreshChannels);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'pop' | 'az'>('pop');

  useEffect(() => { refresh(); }, [refresh]);

  const needle = q.trim().toLowerCase();
  const filtered = channels.filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.topic.toLowerCase().includes(needle));
  const rows = [...filtered].sort((a, b) => (sort === 'az' ? a.name.localeCompare(b.name) : b.users - a.users));
  const maxUsers = rows.reduce((m, c) => Math.max(m, c.users), 1);
  const totalUsers = channels.reduce((s, c) => s + c.users, 0);
  // The typed query names a channel that doesn't exist yet → offer to create it.
  const wanted = needle.startsWith('#') || needle.startsWith('&') ? needle : '#' + needle;
  const canCreate = !!needle && !channels.some((c) => c.name.toLowerCase() === wanted);

  function join(name: string) {
    const n = name.trim();
    if (!n) return;
    const chan = n.startsWith('#') || n.startsWith('&') ? n : '#' + n;
    client?.join(chan); setActive(chan); setModal('');
  }

  return (
    <Modal title={t('modals.join.title')} onClose={() => setModal('')} wide>
      <div className="explore">
        <div className="explore-bar">
          <div className="explore-search">
            <span className="explore-search__icon">🔍</span>
            <input name="channel-search" type="search" autoComplete="off" placeholder={t('modals.join.search')} value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) join(q); }} autoFocus />
            {q && <button className="explore-search__clear" onClick={() => setQ('')} aria-label={t('topbar.closeSearch')}>✕</button>}
          </div>
          <button className={`explore-refresh ${loading ? 'is-spin' : ''}`} onClick={refresh}
            title={t('modals.join.refresh', { defaultValue: 'Actualiser' })} aria-label={t('modals.join.refresh', { defaultValue: 'Actualiser' })}>⟳</button>
        </div>

        <div className="explore-meta">
          <span className="explore-stat">{channels.length}&nbsp;{t('modals.join.rooms', { defaultValue: 'salons' })}</span>
          <span className="explore-stat"><span className="dot" />{totalUsers}&nbsp;{t('modals.join.online', { defaultValue: 'en ligne' })}</span>
          <div className="explore-sort">
            <button className={sort === 'pop' ? 'is-on' : ''} onClick={() => setSort('pop')}>{t('modals.join.sortPop', { defaultValue: 'Populaires' })}</button>
            <button className={sort === 'az' ? 'is-on' : ''} onClick={() => setSort('az')}>A–Z</button>
          </div>
        </div>

        <div className="explore-list">
          {loading && rows.length === 0 && Array.from({ length: 6 }).map((_, i) => <div key={i} className="explore-skel" />)}
          {!loading && rows.length === 0 && !canCreate && (
            <div className="explore-empty">{needle ? t('modals.join.emptyFound') : t('modals.join.emptyNone')}</div>
          )}
          {rows.map((c, i) => (
            <button key={c.name} className="explore-row" onClick={() => join(c.name)}>
              <span className="explore-row__av" style={{ background: avatarBg(c.name) }}>#</span>
              <div className="explore-row__main">
                <div className="explore-row__name">
                  {c.name}
                  {sort === 'pop' && i === 0 && c.users > 1 && <span className="explore-row__hot" title={t('modals.join.sortPop', { defaultValue: 'Populaires' })}>🔥</span>}
                </div>
                {c.topic
                  ? <div className="explore-row__topic">{formatIrc(c.topic, false)}</div>
                  : <div className="explore-row__topic explore-row__topic--muted">{t('modals.join.noTopic', { defaultValue: 'Pas de sujet' })}</div>}
                <div className="explore-row__bar"><span style={{ width: `${Math.max(6, Math.round((c.users / maxUsers) * 100))}%` }} /></div>
              </div>
              <span className="explore-row__count"><span className="dot" />{c.users}</span>
              <span className="explore-row__join">{t('modals.join.joinBtn')}</span>
            </button>
          ))}
        </div>

        {canCreate && !loading && (
          <button className="explore-create" onClick={() => join(q)}>
            {t('modals.join.createRow', { defaultValue: 'Créer et rejoindre' })}&nbsp;<b>{wanted}</b>
          </button>
        )}
      </div>
    </Modal>
  );
}
