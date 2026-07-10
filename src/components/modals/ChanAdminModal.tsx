import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '../../core/networks';
import { formatIrc } from '../../lib/format';
import { buildModeContext } from '../../core/irc/modes';
import { setterMask, ago } from '../../lib/topic';
import { availableExtbans, matchExtban, type ExtBan } from '../../lib/extbans';
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

function fmtDate(sec: number, locale: string): string {
  return new Date(sec * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

type Tab = 'overview' | 'modes' | 'bans' | 'extbans';

// A compact combobox for the extban type: a button + an overlay menu (grouped into
// restrictions / match-by, filterable). Opening it doesn't push the value input, so
// picking a type and typing the mask stay on one row — no scrolling.
function ExtbanSelect({ exts, value, onChange }: { exts: ExtBan[]; value: string; onChange: (name: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const cur = exts.find((e) => e.name === value);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const f = filter.trim().toLowerCase();
  const label = (e: ExtBan) => t(`extbans.${e.name}`, e.name);
  const hit = (e: ExtBan) => !f || label(e).toLowerCase().includes(f) || e.name.includes(f);
  const pick = (name: string) => { onChange(name); setOpen(false); setFilter(''); };
  const group = (acting: boolean, head: string) => {
    const list = exts.filter((e) => e.acting === acting && hit(e));
    if (!list.length) return null;
    return (
      <>
        <div className="ca-extsel__grp">{head}</div>
        {list.map((e) => (
          <button key={e.letter} type="button" role="option" aria-selected={e.name === value}
            className={`ca-extsel__opt${e.name === value ? ' is-on' : ''}`} onClick={() => pick(e.name)}>{label(e)}</button>
        ))}
      </>
    );
  };
  return (
    <div className="ca-extsel" ref={ref}>
      <button type="button" className="ca-extsel__btn" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <span>{cur ? label(cur) : '—'}</span>
        <span className="ca-extsel__chev" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="ca-extsel__menu" role="listbox">
          <input className="ca-extsel__search modal__input" autoFocus value={filter} placeholder={t('modals.chanadmin.filter')}
            onChange={(e) => setFilter(e.target.value)} />
          {group(true, t('modals.chanadmin.extRestrict'))}
          {group(false, t('modals.chanadmin.extMatch'))}
        </div>
      )}
    </div>
  );
}

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
  const [ebType, setEbType] = useState('');
  const [ebVal, setEbVal] = useState('');
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
  // Extended bans the server advertises (core + reputation/securitygroups modules).
  const exts = availableExtbans(client?.server.isupport ?? {});
  const ebSel = ebType || exts[0]?.name || '';
  const curExt = exts.find((e) => e.name === ebSel);
  // Keep the two lists apart: plain nick!user@host bans on the right, typed extbans
  // in their own tab.
  const plainBans = banlist.filter((b) => !matchExtban(b.mask));
  const extbanList = banlist.filter((b) => matchExtban(b.mask));
  const addExtban = () => {
    const v = ebVal.trim(); if (!v || !curExt) return;
    client?.ban(chan, `${curExt.name}:${v}`);
    setEbVal(''); setTimeout(() => loadBanList(chan), 500);
  };
  const applyKey = () => { const v = keyVal.trim(); if (v) setChannelModeParam(chan, 'k', true, v); };
  const clearKey = () => { setChannelModeParam(chan, 'k', false, curKey || '*'); setKeyVal(''); };
  const applyLimit = () => { const n = parseInt(limitVal, 10); if (n > 0) setChannelModeParam(chan, 'l', true, String(n)); };
  const clearLimit = () => { setChannelModeParam(chan, 'l', false); setLimitVal(''); };

  const tabBtn = (id: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === id}
      className={`ca-tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <Modal title={t('modals.chanadmin.manage', { chan })} wide onClose={() => setModal('')}>
      <div className="ca-layout">
        <div className="ca-sec ca-topicrow">
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
                  <span className="ca-topicby__by">
                    {t('modals.chanadmin.topicBy')}{' '}
                    <span className="ca-topicby__who">{setterMask(buffer.topicBy, buffer.members || {})}</span>
                  </span>
                  {buffer.topicAt ? <span className="ca-topicby__when"> · {ago(buffer.topicAt, locale)}</span> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="ca-main">
          <div className="ca-tabs" role="tablist">
            {tabBtn('overview', t('modals.chanadmin.tabOverview'))}
            {tabBtn('modes', t('modals.chanadmin.tabModes'))}
            {tabBtn('bans', t('modals.chanadmin.bans', { n: plainBans.length }))}
            {exts.length > 0 && tabBtn('extbans', t('modals.chanadmin.extbans'))}
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
                <label key={f.m} className={`ca-flag${on ? ' is-on' : ''}`}
                  title={`+${f.m} · ${t(`chanFlags.${f.key}.label`)} — ${t(`chanFlags.${f.key}.desc`)}`}>
                  <input type="checkbox" checked={on} onChange={() => setChannelMode(chan, f.m, !on)} />
                  <code className="ca-flag__m">+{f.m}</code>
                  <span className="ca-flag__label">{t(`chanFlags.${f.key}.label`)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'extbans' && (
        <div className="ca-pane">
          <div className="ca-param ca-extban-add">
            <ExtbanSelect exts={exts} value={ebSel} onChange={setEbType} />
            <input className="modal__input" value={ebVal} placeholder={curExt?.hint}
              aria-label={t('modals.chanadmin.extbanType')}
              onChange={(e) => setEbVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExtban()} />
            <button className="upbtn upbtn--primary" onClick={addExtban}>{t('modals.chanadmin.ban')}</button>
          </div>
          {/* Show the full command for the picked type. */}
          {curExt && (
            <div className="ca-extexample">
              {t('modals.chanadmin.example')} <code>+b {curExt.name}:{curExt.hint}</code>
            </div>
          )}
          <ul className="ca-bans">
            {extbanList.length === 0 && <li className="ca-bans__empty">{t('modals.chanadmin.noExtbans')}</li>}
            {extbanList.map((b) => {
              const eb = matchExtban(b.mask)!;
              return (
                <li key={b.mask} className="ca-ban">
                  <span className="ca-ban__type" title={eb.name}>{t(`extbans.${eb.name}`, eb.name)}</span>
                  <span className="ca-ban__mask">{b.mask.slice(b.mask.indexOf(':') + 1)}</span>
                  {b.by && <span className="ca-ban__by">{t('modals.chanadmin.by', { by: b.by })}</span>}
                  <button className="friend__act friend__act--rm" title={t('modals.chanadmin.unban')}
                    onClick={() => { removeBan(chan, b.mask); setTimeout(() => loadBanList(chan), 500); }}>✕</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === 'bans' && (
        <div className="ca-pane">
          <div className="ca-param ca-extban-add">
            <input className="modal__input" value={newban} placeholder={t('modals.chanadmin.maskPlaceholder')}
              onChange={(e) => setNewban(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addBan()} />
            <button className="upbtn upbtn--primary" onClick={addBan}>{t('modals.chanadmin.ban')}</button>
          </div>
          <ul className="ca-bans">
            {plainBans.length === 0 && <li className="ca-bans__empty">{t('modals.chanadmin.noBans')}</li>}
            {plainBans.map((b) => (
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

        </div>
      </div>
    </Modal>
  );
}
