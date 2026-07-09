import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '../../core/networks';
import { formatIrc } from '../../lib/format';
import { buildModeContext } from '../../core/irc/modes';
import { Modal } from './Modal';

// Curated channel flags (no-parameter, type-D). Only the ones the server advertises
// in ISUPPORT CHANMODES are shown, so a network only ever sees the modes it supports.
// Labels/descriptions resolve via i18n (chanFlags.*).
const CHAN_FLAGS: { m: string; key: string }[] = [
  { m: 'i', key: 'invite' },
  { m: 'm', key: 'moderated' },
  { m: 'n', key: 'noExternal' },
  { m: 't', key: 'topicLock' },
  { m: 's', key: 'secret' },
  { m: 'p', key: 'private' },
  { m: 'c', key: 'blockColor' },
  { m: 'C', key: 'noCtcp' },
  { m: 'S', key: 'stripColor' },
  { m: 'R', key: 'regOnly' },
  { m: 'M', key: 'regModerated' },
  { m: 'O', key: 'operOnly' },
  { m: 'z', key: 'tlsOnly' },
  { m: 'N', key: 'noNickChange' },
  { m: 'K', key: 'noKnock' },
  { m: 'P', key: 'permanent' },
];
const BASE_FLAGS = 'imntsp'; // fallback when the server didn't advertise CHANMODES

function ago(ms: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = ms - Date.now(); // negative in the past
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536e6], ['month', 2592e6], ['day', 864e5], ['hour', 36e5], ['minute', 6e4],
  ];
  for (const [u, d] of units) if (abs >= d) return rtf.format(Math.round(diff / d), u);
  return rtf.format(Math.round(diff / 1000), 'second');
}
function fmtDate(sec: number, locale: string): string {
  return new Date(sec * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

type Tab = 'overview' | 'modes' | 'bans';

export function ChanAdminModal() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'fr';
  const setModal = useActiveChat((s) => s.setModal);
  const buffer = useActiveChat((s) => s.buffers[s.active]);
  const banlist = useActiveChat((s) => s.banlists[s.active] || []);
  const loadBanList = useActiveChat((s) => s.loadBanList);
  const setChannelMode = useActiveChat((s) => s.setChannelMode);
  const setChannelModeParam = useActiveChat((s) => s.setChannelModeParam);
  const removeBan = useActiveChat((s) => s.removeBan);
  const modTopic = useActiveChat((s) => s.modTopic);
  const client = useActiveChat((s) => s.client);
  const chan = buffer?.name || '';
  const modeParams = buffer?.modeParams;
  const curKey = modeParams?.k || '';
  const curLimit = modeParams?.l || '';

  const [tab, setTab] = useState<Tab>('overview');
  const [newban, setNewban] = useState('');
  const [topic, setTopicVal] = useState(buffer?.topic || '');
  const [editingTopic, setEditingTopic] = useState(false);
  const [keyVal, setKeyVal] = useState(curKey);
  const [limitVal, setLimitVal] = useState(curLimit);

  useEffect(() => { if (chan) loadBanList(chan); }, [chan, loadBanList]);
  // Re-sync the param inputs when the live modes change under us (someone else sets +k/+l).
  useEffect(() => { setKeyVal(curKey); }, [curKey]);
  useEffect(() => { setLimitVal(curLimit); }, [curLimit]);

  if (!buffer || !buffer.isChannel) return null;
  const modes = buffer.modes || '';

  const ctx = buildModeContext(client?.server.isupport ?? {}, client?.server.prefixModeToChar ?? {});
  const flags = CHAN_FLAGS.filter((f) => (ctx.typeD.size ? ctx.typeD.has(f.m) : BASE_FLAGS.includes(f.m)));

  const members = Object.values(buffer.members || {});
  const opCount = members.filter((m) => /[~&@%]/.test(m.prefixes || m.prefix || '')).length;

  const addBan = () => {
    const v = newban.trim(); if (!v) return;
    client?.ban(chan, v.includes('@') || v.includes('!') ? v : `${v}!*@*`);
    setNewban(''); setTimeout(() => loadBanList(chan), 500);
  };
  const applyKey = () => { const v = keyVal.trim(); if (v) setChannelModeParam(chan, 'k', true, v); };
  const clearKey = () => { setChannelModeParam(chan, 'k', false, curKey || '*'); setKeyVal(''); };
  const applyLimit = () => { const n = parseInt(limitVal, 10); if (n > 0) setChannelModeParam(chan, 'l', true, String(n)); };
  const clearLimit = () => { setChannelModeParam(chan, 'l', false); setLimitVal(''); };

  const tabBtn = (id: Tab, label: string, count?: number) => (
    <button type="button" role="tab" aria-selected={tab === id}
      className={`ca-tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
      {label}{count ? <span className="ca-tab__n">{count}</span> : null}
    </button>
  );

  return (
    <Modal title={t('modals.chanadmin.manage', { chan })} wide onClose={() => setModal('')}>
      <div className="ca-tabs" role="tablist">
        {tabBtn('overview', t('modals.chanadmin.tabOverview'))}
        {tabBtn('modes', t('modals.chanadmin.tabModes'))}
        {tabBtn('bans', t('modals.chanadmin.tabBans'), banlist.length)}
      </div>

      {tab === 'overview' && (
        <div className="ca-pane">
          <div className="ca-stats">
            <div className="ca-stat"><b className="ca-stat__n">{members.length}</b><span className="ca-stat__l">{t('modals.chanadmin.members')}</span></div>
            <div className="ca-stat"><b className="ca-stat__n">{opCount}</b><span className="ca-stat__l">{t('modals.chanadmin.ops')}</span></div>
            {buffer.createdAt ? (
              <div className="ca-stat ca-stat--wide"><b className="ca-stat__n">{fmtDate(buffer.createdAt, locale)}</b><span className="ca-stat__l">{t('modals.chanadmin.created')}</span></div>
            ) : null}
          </div>

          <div className="ca-sec">
            <h4 className="ca-h">{t('modals.chanadmin.subject')}</h4>
            {editingTopic ? (
              <div className="modal__actions">
                {/* Editing works on the RAW topic (colour/format codes intact) so
                    setting it back never silently strips the colours. */}
                <input className="modal__input" autoFocus value={topic} placeholder={t('modals.chanadmin.topic')}
                  onChange={(e) => setTopicVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { modTopic(topic); setEditingTopic(false); } }} />
                <button className="upbtn upbtn--primary" onClick={() => { modTopic(topic); setEditingTopic(false); }}>{t('modals.chanadmin.setTopic')}</button>
              </div>
            ) : (
              <>
                <button className="ca-topic" onClick={() => { setTopicVal(buffer?.topic || ''); setEditingTopic(true); }} title={t('modals.chanadmin.editTopic')}>
                  <span className="ca-topic__txt">
                    {buffer?.topic ? formatIrc(buffer.topic, false, false) : <span className="ca-topic__empty">{t('modals.chanadmin.noTopicYet')}</span>}
                  </span>
                  <span className="ca-topic__pen" aria-hidden="true">✎</span>
                </button>
                {buffer.topicBy ? (
                  <div className="ca-topicby">
                    {t('modals.chanadmin.topicBy', { who: buffer.topicBy })}
                    {buffer.topicAt ? <span className="ca-topicby__when"> · {ago(buffer.topicAt, locale)}</span> : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="ca-sec">
            <h4 className="ca-h">{t('modals.chanadmin.access')}</h4>
            <div className="ca-param">
              <label className="ca-param__l">{t('modals.chanadmin.key')}</label>
              <input className="modal__input" value={keyVal} placeholder={t('modals.chanadmin.keyPlaceholder')}
                onChange={(e) => setKeyVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyKey()} />
              <button className="upbtn upbtn--primary" onClick={applyKey}>{t('modals.chanadmin.apply')}</button>
              {modes.includes('k') ? <button className="upbtn" onClick={clearKey}>{t('modals.chanadmin.clear')}</button> : null}
            </div>
            <div className="ca-param">
              <label className="ca-param__l">{t('modals.chanadmin.limit')}</label>
              <input className="modal__input" type="number" min={1} value={limitVal} placeholder={t('modals.chanadmin.limitPlaceholder')}
                onChange={(e) => setLimitVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyLimit()} />
              <button className="upbtn upbtn--primary" onClick={applyLimit}>{t('modals.chanadmin.apply')}</button>
              {modes.includes('l') ? <button className="upbtn" onClick={clearLimit}>{t('modals.chanadmin.clear')}</button> : null}
            </div>
          </div>
        </div>
      )}

      {tab === 'modes' && (
        <div className="ca-pane">
          <div className="ca-flags">
            {flags.map((f) => {
              const on = modes.includes(f.m);
              return (
                <label key={f.m} className={`ca-flag${on ? ' is-on' : ''}`} title={t(`chanFlags.${f.key}.desc`)}>
                  <input type="checkbox" checked={on} onChange={() => setChannelMode(chan, f.m, !on)} />
                  <span className="ca-flag__txt">
                    <b>{t(`chanFlags.${f.key}.label`)}</b>
                    <span className="ca-flag__desc">{t(`chanFlags.${f.key}.desc`)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'bans' && (
        <div className="ca-pane">
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
      )}
    </Modal>
  );
}
