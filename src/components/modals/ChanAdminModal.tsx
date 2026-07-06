import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '../../core/networks';
import { Modal } from './Modal';

// Stable keys → labels/descriptions are resolved via i18n (chanFlags.*).
const CHAN_FLAGS: { m: string; key: string }[] = [
  { m: 'i', key: 'invite' },
  { m: 'm', key: 'moderated' },
  { m: 'n', key: 'noExternal' },
  { m: 't', key: 'topicLock' },
  { m: 's', key: 'secret' },
];

export function ChanAdminModal() {
  const { t } = useTranslation();
  const setModal = useActiveChat((s) => s.setModal);
  const buffer = useActiveChat((s) => s.buffers[s.active]);
  const banlist = useActiveChat((s) => s.banlists[s.active] || []);
  const loadBanList = useActiveChat((s) => s.loadBanList);
  const setChannelMode = useActiveChat((s) => s.setChannelMode);
  const removeBan = useActiveChat((s) => s.removeBan);
  const modTopic = useActiveChat((s) => s.modTopic);
  const client = useActiveChat((s) => s.client);
  const chan = buffer?.name || '';
  const [newban, setNewban] = useState('');
  const [topic, setTopicVal] = useState(buffer?.topic || '');
  useEffect(() => { if (chan) loadBanList(chan); }, [chan, loadBanList]);
  if (!buffer || !buffer.isChannel) return null;
  const modes = buffer.modes || '';
  const addBan = () => {
    const v = newban.trim(); if (!v) return;
    client?.ban(chan, v.includes('@') || v.includes('!') ? v : `${v}!*@*`);
    setNewban(''); setTimeout(() => loadBanList(chan), 500);
  };
  return (
    <Modal title={t('modals.chanadmin.manage', { chan })} wide onClose={() => setModal('')}>
      <div className="ca-sec">
        <h4 className="ca-h">{t('modals.chanadmin.subject')}</h4>
        <div className="modal__actions">
          <input className="modal__input" value={topic} placeholder={t('modals.chanadmin.topic')} onChange={(e) => setTopicVal(e.target.value)} />
          <button className="upbtn upbtn--primary" onClick={() => modTopic(topic)}>{t('modals.chanadmin.setTopic')}</button>
        </div>
      </div>
      <div className="ca-sec">
        <h4 className="ca-h">{t('modals.chanadmin.settings')}</h4>
        {CHAN_FLAGS.map((f) => {
          const on = modes.includes(f.m);
          return (
            <label key={f.m} className="ca-flag">
              <input type="checkbox" checked={on} onChange={() => setChannelMode(chan, f.m, !on)} />
              <span className="ca-flag__txt"><b>{t(`chanFlags.${f.key}.label`)}</b><span className="ca-flag__desc">{t(`chanFlags.${f.key}.desc`)}</span></span>
            </label>
          );
        })}
      </div>
      <div className="ca-sec">
        <h4 className="ca-h">{t('modals.chanadmin.bans', { n: banlist.length })}</h4>
        <div className="modal__actions">
          <input className="modal__input" value={newban} placeholder={t('modals.chanadmin.maskPlaceholder')}
            onChange={(e) => setNewban(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBan()} />
          <button className="upbtn upbtn--primary" onClick={addBan}>{t('modals.chanadmin.ban')}</button>
        </div>
        <ul className="ca-bans">
          {banlist.length === 0 && <li className="ca-bans__empty">{t('modals.chanadmin.noBans')}</li>}
          {banlist.map((b) => (
            <li key={b.mask} className="ca-ban">
              <span className="ca-ban__mask">{b.mask}</span>
              {b.by && <span className="ca-ban__by">{t('modals.chanadmin.by', { by: b.by })}</span>}
              <button className="friend__act friend__act--rm" title={t('modals.chanadmin.unban')}
                onClick={() => { removeBan(chan, b.mask); setTimeout(() => loadBanList(chan), 500); }}>✕</button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
