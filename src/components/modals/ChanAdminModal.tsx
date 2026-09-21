import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useActiveChat } from '@/core/networks';
import { formatIrc } from '@/lib/format';
import { buildModeContext } from '@/core/irc/modes';
import {
  CHAN_PARAMS,
  SIMPLE_CHAN_GROUPS,
  advertisedChanFlags,
  filterCatalog,
  plainDesc,
  simpleChanFlags,
  type ChanFlag,
} from '@/core/irc/mode-catalog';
import { setterMask, ago } from '@/lib/topic';
import {
  availableExtbans, matchExtban, extbanValueHint, ensureMatchingExtban, ensureActingExtban,
  buildExtbanMask, nickMask, NICK_PICK, NICK_MASK_SHAPES, type ExtBan, type NickMaskShape,
} from '@/lib/extbans';
import { getConfig } from '@/core/config';
import type { Member } from '@/core/irc/types';
import { Modal } from './Modal';

function LockTag({ kind }: { kind: 'services' | 'overview' }) {
  const { t } = useTranslation();
  const hint = kind === 'overview' ? t('modals.chanadmin.lockedOnOverview') : t('modals.chanadmin.lockedByServices');
  return (
    <span className="ca-flag__lock" aria-label={hint}>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      </svg>
    </span>
  );
}

function LockTipBubble({ text, x, y }: { text: string; x: number; y: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: x, top: y, visibility: 'hidden' });
  const [below, setBelow] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    const pad = 10;
    const gap = 8;
    const left = Math.min(Math.max(x, pad + w / 2), window.innerWidth - pad - w / 2);
    const caret = Math.min(Math.max(((x - left) / w) * 100 + 50, 12), 88);
    setBelow(y - h - gap < pad);
    setStyle({ left, top: y, visibility: 'visible', ['--caret' as string]: `${caret}%` });
  }, [x, y, text]);
  return createPortal(
    <div ref={ref} className={`ca-locktip${below ? ' is-below' : ''}`} style={style} role="status">{text}</div>,
    document.body,
  );
}

function ChannelParamRow({
  letter, i18nKey, hint, cur, typeB, locked, onLockedClick, onApply, onClear,
}: {
  letter: string; i18nKey: string; hint: string; cur: string; typeB: boolean; locked?: boolean;
  onLockedClick?: (e: { clientX: number; clientY: number }) => void;
  onApply: (value: string) => void; onClear: (echo: string) => void;
}) {
  const { t } = useTranslation();
  const [val, setVal] = useState(cur);
  const [prev, setPrev] = useState(cur);
  if (cur !== prev) { setPrev(cur); setVal(cur); }
  const on = !!cur;
  const lockHint = locked ? t('modals.chanadmin.lockedByServices') : '';
  return (
    <div className={`ca-prow${on ? ' is-on' : ''}${locked ? ' is-ro' : ''}`}>
      <label className="ca-prow__l" title={t(`chanParams.${i18nKey}.desc`)}
        onClick={locked ? (e) => { e.preventDefault(); onLockedClick?.(e); } : undefined}>
        <code className="ca-flag__m">+{letter}</code>
        <span className="ca-prow__name">{t(`chanParams.${i18nKey}.label`)}</span>
        {locked ? <LockTag kind="services" /> : null}
      </label>
      <div className="ca-prow__act">
        <input className="ca-prow__in" value={val} placeholder={hint} disabled={locked}
          aria-label={t(`chanParams.${i18nKey}.label`)}
          title={lockHint || undefined}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !locked) { const v = val.trim(); if (v) onApply(v); } }} />
        <button type="button" className="ca-prow__go" disabled={locked}
          title={lockHint || undefined}
          onClick={(e) => { if (locked) { onLockedClick?.(e); return; } const v = val.trim(); if (v) onApply(v); }}>
          {t('modals.chanadmin.apply')}
        </button>
        <button type="button" className="ca-prow__x" disabled={locked || !on}
          title={t('modals.chanadmin.clear')}
          onClick={(e) => { if (locked) { onLockedClick?.(e); return; } if (on) onClear(typeB ? (cur || val || '*') : ''); }}>
          {t('modals.chanadmin.clear')}
        </button>
      </div>
    </div>
  );
}

function FlagGrid({ flags, modes, mlock, chan, setChannelMode, onLockedClick, onLockTip, plain }: {
  flags: ChanFlag[]; modes: string; mlock?: string; chan: string;
  setChannelMode: (chan: string, letter: string, on: boolean) => void;
  onLockedClick?: (f: ChanFlag) => void;
  onLockTip: (letter: string, lock: 'services' | 'overview' | 'list', pt: { clientX: number; clientY: number }) => void;
  /** Simplified panel: drop the mode letter and spell the effect out instead. */
  plain?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={`ca-flags${plain ? ' ca-flags--plain' : ''}`}>
      {flags.map((f) => {
        const on = modes.includes(f.m);
        const mlocked = !!(mlock && mlock.includes(f.m));
        const ro = !!f.readonly || mlocked;
        const lock = f.lock || (mlocked ? 'services' : (ro ? 'services' : undefined));
        const jump = ro && !!onLockedClick && (f.m === 'k' || f.m === 'g');
        const lockHint = lock === 'overview'
          ? t('modals.chanadmin.lockedOnOverview')
          : lock === 'list'
            ? t('modals.chanadmin.lockedOnFilters')
            : lock === 'services'
              ? t('modals.chanadmin.lockedByServices')
              : '';
        const title = plain
          ? `${t(`chanFlags.${f.key}.label`)}${lockHint ? ` · ${lockHint}` : ''}`
          : `+${f.m} · ${t(`chanFlags.${f.key}.label`)} — ${t(`chanFlags.${f.key}.desc`)}${lockHint ? ` · ${lockHint}` : ''}`;
        return (
          <label key={f.m} className={`ca-flag${on ? ' is-on' : ''}${ro ? ' is-ro' : ''}${jump ? ' is-jump' : ''}`}
            title={title}
            onClick={ro ? (e) => {
              e.preventDefault();
              if (jump) onLockedClick?.(f);
              else if (lock) onLockTip(f.m, lock, e);
            } : undefined}>
            <input type="checkbox" checked={on} disabled={ro}
              onChange={() => { if (!ro) setChannelMode(chan, f.m, !on); }} />
            {plain ? (
              <span className="ca-flag__txt">
                <span className="ca-flag__label">{t(`chanFlags.${f.key}.label`)}</span>
                <span className="ca-flag__desc">{plainDesc(t(`chanFlags.${f.key}.desc`))}</span>
              </span>
            ) : (
              <>
                <code className="ca-flag__m">+{f.m}</code>
                <span className="ca-flag__label">{t(`chanFlags.${f.key}.label`)}</span>
              </>
            )}
            {ro && lock && lock !== 'list' ? <LockTag kind={lock} /> : null}
          </label>
        );
      })}
    </div>
  );
}

function fmtDate(sec: number, locale: string): string {
  return new Date(sec * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

type Tab = 'overview' | 'modes' | 'bans' | 'invex' | 'filters';

// A compact combobox for the extban type: a button + an overlay menu (grouped into
// restrictions / match-by, filterable). Opening it doesn't push the value input, so
// picking a type and typing the mask stay on one row — no scrolling.
function ExtbanSelect({ exts, value, onChange, maskOption, nickOption, matchLabel }: {
  exts: ExtBan[]; value: string; onChange: (name: string) => void;
  maskOption?: boolean;
  /** Offer "by nick" — a member picker that resolves to a plain hostmask. */
  nickOption?: boolean;
  matchLabel?: string;
}) {
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
  const nickLabel = t('modals.chanadmin.byNick');
  const label = (e: ExtBan) => t(`extbans.${e.name}`, e.name);
  const hit = (e: ExtBan) => !f || label(e).toLowerCase().includes(f) || e.name.includes(f);
  const pick = (name: string) => { onChange(name); setOpen(false); setFilter(''); };
  const opt = (name: string, text: string) => (
    <button key={name} type="button" role="option" aria-selected={name === value}
      className={`ca-extsel__opt${name === value ? ' is-on' : ''}`} onClick={() => pick(name)}>{text}</button>
  );
  const group = (acting: boolean, head: string) => {
    const list = exts.filter((e) => e.acting === acting && hit(e));
    // "By nick" belongs with the other ways of designating someone, and leads
    // them: it is the one an operator reaches for most.
    const nick = !acting && nickOption && (!f || nickLabel.toLowerCase().includes(f));
    if (!list.length && !nick) return null;
    return (
      <>
        <div className="ca-extsel__grp">{head}</div>
        {nick && opt(NICK_PICK, nickLabel)}
        {list.map((e) => opt(e.name, label(e)))}
      </>
    );
  };
  return (
    <div className="ca-extsel" ref={ref}>
      <button type="button" className="ca-extsel__btn" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <span>{cur ? label(cur)
          : value === NICK_PICK ? nickLabel
            : (maskOption ? t('modals.chanadmin.plainMask') : '—')}</span>
        <span className="ca-extsel__chev" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="ca-extsel__menu" role="listbox">
          <input className="ca-extsel__search modal__input" autoFocus value={filter} placeholder={t('modals.chanadmin.filter')}
            onChange={(e) => setFilter(e.target.value)} />
          {maskOption && (!f || t('modals.chanadmin.plainMask').toLowerCase().includes(f)) && (
            <button type="button" role="option" aria-selected={value === ''}
              className={`ca-extsel__opt${value === '' ? ' is-on' : ''}`} onClick={() => pick('')}>{t('modals.chanadmin.plainMask')}</button>
          )}
          {group(true, t('modals.chanadmin.extRestrict'))}
          {group(false, matchLabel || t('modals.chanadmin.extMatch'))}
        </div>
      )}
    </div>
  );
}

/**
 * A ban-mask field's state. Operators think in nicks, not in `*!*@cloak.fr`, so
 * the mask can be produced by picking a member — and the picked member is kept
 * so the shape chips (`*!*@host`, `pseudo!*@*`, …) can rewrite it. Typing by
 * hand drops the member: the text is then no longer "that person in shape X"
 * and there would be nothing to rewrite from.
 */
interface MaskField {
  text: string;
  pick: Member | null;
  shape: NickMaskShape;
  set: (v: string) => void;
  choose: (m: Member) => void;
  reshape: (s: NickMaskShape) => void;
  clear: () => void;
}

function useMaskField(): MaskField {
  const [text, setText] = useState('');
  const [pick, setPick] = useState<Member | null>(null);
  const [shape, setShape] = useState<NickMaskShape>('host');
  return {
    text,
    pick,
    shape,
    set: (v) => { setText(v); setPick(null); },
    // The picker greys out what it cannot build, so these guards only catch a
    // host that vanished between render and click — never widen instead.
    choose: (m) => { const v = nickMask(m, shape); if (!v) return; setPick(m); setText(v); },
    reshape: (s) => {
      if (!pick) { setShape(s); return; }
      const v = nickMask(pick, s);
      if (v) { setShape(s); setText(v); }
    },
    clear: () => { setText(''); setPick(null); },
  };
}

/** Mask input with a member-autocomplete dropdown. */
function MaskInput({ field, members, placeholder, ariaLabel, onSubmit }: {
  field: MaskField; members: Member[]; placeholder: string; ariaLabel: string; onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  // Once a member is picked the text is a mask, not a search term — filtering on
  // it would leave the list showing only that one person.
  const q = field.pick ? '' : field.text.trim().toLowerCase();
  const hits = members
    .filter((m) => !q || m.nick.toLowerCase().includes(q))
    .sort((a, b) => a.nick.localeCompare(b.nick))
    .slice(0, 50);
  return (
    <div className="ca-maskf" ref={ref}>
      <input className="modal__input" value={field.text} placeholder={placeholder} aria-label={ariaLabel}
        autoComplete="off" role="combobox" aria-expanded={open} aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => { field.set(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          // Escape closes the list first; the modal's own handler would otherwise
          // shut the whole panel on the first press.
          if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
          if (e.key === 'Enter') { setOpen(false); onSubmit(); }
        }} />
      {open && hits.length > 0 && (
        <div className="ca-extsel__menu ca-maskf__menu" role="listbox">
          {hits.map((m) => {
            // Until WHO answers we don't know the host, and the mask for the
            // current shape would have to widen to `*!*@*` — the whole channel.
            // Offer the member greyed out rather than a mask that bans everyone.
            const mask = nickMask(m, field.shape);
            return (
              <button key={m.nick} type="button" role="option" disabled={!mask}
                aria-selected={field.pick?.nick === m.nick}
                title={mask || t('modals.chanadmin.hostUnknownHint')}
                className={`ca-extsel__opt ca-maskf__opt${field.pick?.nick === m.nick ? ' is-on' : ''}`}
                onClick={() => { field.choose(m); setOpen(false); }}>
                <span className="ca-maskf__nick">{m.prefix}{m.nick}</span>
                <span className="ca-maskf__host">{m.host ? `@${m.host}` : t('modals.chanadmin.hostUnknown')}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Shape chips — only meaningful once a member has been picked. */
function MaskShapes({ field }: { field: MaskField }) {
  const { t } = useTranslation();
  if (!field.pick) return null;
  return (
    <div className="ca-shapes" role="group" aria-label={t('modals.chanadmin.maskShape')}>
      <span className="ca-shapes__l">{t('modals.chanadmin.maskShape')}</span>
      {NICK_MASK_SHAPES.map((s) => {
        const mask = nickMask(field.pick!, s);
        return (
          <button key={s} type="button" disabled={!mask}
            className={`ca-shape${field.shape === s ? ' is-on' : ''}`}
            title={mask || t('modals.chanadmin.hostUnknownHint')} onClick={() => field.reshape(s)}>
            {t(`modals.chanadmin.shape.${s}`)}
          </button>
        );
      })}
    </div>
  );
}

export function ChanAdminModal() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'fr';
  const setModal = useActiveChat((s) => s.setModal);
  const buffer = useActiveChat((s) => s.buffers[s.active]);
  const topicFull = useActiveChat((s) => s.prefs.topicSetterFull);
  const banlist = useActiveChat((s) => s.banlists[s.active] || []);
  const exceptlist = useActiveChat((s) => s.exceptlists[s.active] || []);
  const invexlist = useActiveChat((s) => s.invexlists[s.active] || []);
  const filterlist = useActiveChat((s) => s.filterlists[s.active] || []);
  const loadBanList = useActiveChat((s) => s.loadBanList);
  const loadChannelMlock = useActiveChat((s) => s.loadChannelMlock);
  const setChannelMode = useActiveChat((s) => s.setChannelMode);
  const setChannelModeParam = useActiveChat((s) => s.setChannelModeParam);
  const removeBan = useActiveChat((s) => s.removeBan);
  const modTopic = useActiveChat((s) => s.modTopic);
  const client = useActiveChat((s) => s.client);
  const simpleModes = useActiveChat((s) => s.prefs.simpleModes);
  const chan = buffer?.name || '';
  const modeParams = buffer?.modeParams;
  const mlock = buffer?.mlock || '';
  const curKey = modeParams?.k || '';
  const curLimit = modeParams?.l || '';

  // Deployment moderation policy: on channels it covers (EntreNous' official
  // `.chat` ones), a ban redirects to a second-chance channel rather than
  // refusing outright — so the redirect flow leads the list and the destination
  // is already filled in. The panel itself is op-only (Topbar gates it).
  const mod = getConfig().moderation;
  const redirectPolicy = !!mod?.redirectChannel
    && (!mod.redirectSuffix || chan.toLowerCase().endsWith(mod.redirectSuffix.toLowerCase()));
  const policyDest = redirectPolicy ? mod!.redirectChannel! : '';

  const [tab, setTab] = useState<Tab>('overview');
  // The ban tab's two methods. A deployment that routes bans to a second-chance
  // channel wants that one in front, which is the whole point of the policy.
  const [banMethod, setBanMethod] = useState<'mask' | 'ext'>(redirectPolicy ? 'ext' : 'mask');
  const [moreModes, setMoreModes] = useState(false);
  const banField = useMaskField();
  const ebField = useMaskField();
  const [newfilter, setNewfilter] = useState('');
  const [ebType, setEbType] = useState('');
  const [ebDest, setEbDest] = useState(policyDest);
  const [ebInvert, setEbInvert] = useState(false);
  const [ebMode, setEbMode] = useState<'b' | 'e'>('b');
  const [ebNest, setEbNest] = useState(''); // acting extban's nested matching extban (stacking)
  const [ixType, setIxType] = useState<string | null>(null); // null = first matching type; '' = hostmask
  const [ixVal, setIxVal] = useState('');
  const [topic, setTopicVal] = useState(buffer?.topic || '');
  const [editingTopic, setEditingTopic] = useState(false);
  const [keyVal, setKeyVal] = useState(curKey);
  const [limitVal, setLimitVal] = useState(curLimit);
  const [lockTip, setLockTip] = useState<{ letter: string; text: string; x: number; y: number } | null>(null);
  const showLockTip = (letter: string, kind: 'services' | 'overview' | 'list', pt: { clientX: number; clientY: number }) => {
    const text = kind === 'overview'
      ? t('modals.chanadmin.lockedOnOverview')
      : kind === 'list'
        ? t('modals.chanadmin.lockedOnFilters')
        : (mlock
          ? t('numerics.742', { mode: letter, mlock })
          : t('modals.chanadmin.lockedByServices'));
    setLockTip({ letter, text, x: pt.clientX, y: pt.clientY });
  };

  useEffect(() => {
    if (!chan) return;
    loadBanList(chan);
    loadChannelMlock(chan);
  }, [chan, loadBanList, loadChannelMlock]);
  useEffect(() => {
    if (!lockTip) return;
    const id = window.setTimeout(() => setLockTip(null), 5000);
    return () => window.clearTimeout(id);
  }, [lockTip]);
  // Re-sync the param inputs when the live modes change under us (someone else sets
  // +k/+l) — derive during render, no effect setState.
  const [prevKey, setPrevKey] = useState(curKey);
  const [prevLimit, setPrevLimit] = useState(curLimit);
  const [prevDest, setPrevDest] = useState(policyDest);
  if (curKey !== prevKey) { setPrevKey(curKey); setKeyVal(curKey); }
  if (curLimit !== prevLimit) { setPrevLimit(curLimit); setLimitVal(curLimit); }
  // Switching to a channel the policy covers (or stops covering) re-applies the
  // default destination.
  if (policyDest !== prevDest) { setPrevDest(policyDest); setEbDest(policyDest); }

  if (!buffer || !buffer.isChannel) return null;
  const modes = buffer.modes || '';

  const ctx = buildModeContext(client?.server.isupport ?? {}, client?.server.prefixModeToChar ?? {});
  const flags = advertisedChanFlags(ctx.typeD, ctx.typeB, ctx.typeA);
  const paramModes = filterCatalog(CHAN_PARAMS, new Set([...ctx.typeB, ...ctx.typeC]));
  const extraFlags = flags.filter((f) => f.group === 'extra');
  const extraShown = extraFlags.filter((f) => moreModes || modes.includes(f.m) || f.lock === 'list' || (f.m === 'g' && filterlist.length > 0));
  const paramsShown = paramModes.filter((p) => moreModes || !!(modeParams?.[p.m]));
  const canShowMore = extraFlags.some((f) => f.lock !== 'list' && !modes.includes(f.m))
    || paramModes.some((p) => !modeParams?.[p.m]);
  const moreBtn = canShowMore ? (
    <button type="button" className="ca-modes__more" onClick={() => setMoreModes((v) => !v)}>
      {moreModes ? t('messages.seeLess') : t('messages.seeMore')}
    </button>
  ) : null;

  const members = Object.values(buffer.members || {});
  const opCount = members.filter((m) => /[~&@%]/.test(m.prefixes || m.prefix || '')).length;

  const addBan = () => {
    const v = banField.text.trim(); if (!v) return;
    client?.ban(chan, v.includes('@') || v.includes('!') ? v : `${v}!*@*`);
    banField.clear(); setTimeout(() => loadBanList(chan), 500);
  };
  // Extended bans the server advertises (core + reputation/securitygroups modules).
  const allExts = ensureActingExtban(availableExtbans(client?.server.isupport ?? {}), 'redirect');
  // sort() is stable, so this only lifts redirect and leaves the rest in
  // catalogue order.
  const exts = redirectPolicy
    ? [...allExts].sort((a, b) => Number(b.name === 'redirect') - Number(a.name === 'redirect'))
    : allExts;
  const matchingExts = exts.filter((e) => !e.acting);
  const invexExts = ensureMatchingExtban(matchingExts, 'class');
  const hasInvex = ctx.typeA.has('I');
  const hasChanfilter = ctx.typeA.has('g');
  const flagModes = filterlist.length > 0 && !modes.includes('g') ? `${modes}g` : modes;
  // +b ban, +e exempt — +I lives in its own tab (it is not a ban).
  const ebModes = (['b', 'e'] as const).filter((m) => m === 'b' || ctx.typeA.has(m));
  // The simplified panel never shows the +b/+e switch: an exception only makes
  // sense once you reason in mode letters. It always bans.
  const ebModeSel = simpleModes ? 'b' : (ebModes.includes(ebMode) ? ebMode : 'b');
  const ebSel = ebType || exts[0]?.name || '';
  const curExt = exts.find((e) => e.name === ebSel);
  // NICK_PICK is not an extban: it feeds the member picker, whose output is a
  // plain hostmask, so there is no nested type to stack.
  const pickingNick = !!curExt?.acting && ebNest === NICK_PICK;
  const nestExt = curExt?.acting && ebNest && !pickingNick
    ? matchingExts.find((e) => e.name === ebNest)
    : undefined;
  const valueType = curExt?.acting ? nestExt : curExt;
  const stackMask = (v: string) => (curExt
    ? buildExtbanMask({ ext: curExt, value: v, nest: nestExt, invert: ebInvert && !!nestExt, target: ebDest })
    : v);
  const plainMask = (v: string) => (v.includes('@') || v.includes('!') || v.includes(':') ? v : `${v}!*@*`);
  const modeVerb: Record<string, string> = { b: 'modals.chanadmin.ban', e: 'modals.chanadmin.exempt' };
  const ixSel = ixType === '' ? '' : (ixType ?? invexExts[0]?.name ?? '');
  const ixExt = invexExts.find((e) => e.name === ixSel);
  const ixHint = ixExt ? extbanValueHint(ixExt, true) : t('modals.chanadmin.invexPlaceholder');
  // Everything the ban tab lists: plain +b masks, typed +b extbans and the +e
  // exceptions that lift them. (+I invite exceptions are not bans and keep
  // their own tab.)
  const banRows = [
    ...banlist.map((b) => ({ mode: 'b' as const, mask: b.mask, by: b.by })),
    ...exceptlist.map((b) => ({ mode: 'e' as const, mask: b.mask, by: b.by })),
  ];
  const removeExt = (mode: 'b' | 'e' | 'I', mask: string) => {
    if (mode === 'b') removeBan(chan, mask); else setChannelModeParam(chan, mode, false, mask);
    setTimeout(() => loadBanList(chan), 500);
  };
  const addExtban = () => {
    const v = ebField.text.trim(); if (!v || !curExt) return;
    if (curExt.needsTarget && !ebDest.trim()) return;
    const mask = stackMask(v);
    if (ebModeSel === 'b') client?.ban(chan, mask);
    else setChannelModeParam(chan, ebModeSel, true, mask);
    ebField.clear(); setTimeout(() => loadBanList(chan), 500);
  };
  const addInvex = () => {
    const v = ixVal.trim(); if (!v) return;
    const mask = ixExt ? `${ixExt.name}:${v}` : plainMask(v);
    setChannelModeParam(chan, 'I', true, mask);
    setIxVal(''); setTimeout(() => loadBanList(chan), 500);
  };
  const addFilter = () => {
    const v = newfilter.trim().replace(/\s+/g, '*');
    if (!v) return;
    setChannelModeParam(chan, 'g', true, v);
    setNewfilter('');
    setTimeout(() => loadBanList(chan), 500);
  };
  const removeFilter = (mask: string) => {
    setChannelModeParam(chan, 'g', false, mask);
    setTimeout(() => loadBanList(chan), 500);
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
    <>
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
                    <span className="ca-topicby__who">{
                      topicFull
                        ? setterMask(buffer.topicBy, buffer.members || {})
                        : buffer.topicBy.split('!')[0]
                    }</span>
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
            {/* "Modes", "bans étendus" and "invex" are the vocabulary of the
                mode letters the simplified panel exists to hide. */}
            {tabBtn('modes', t(simpleModes ? 'modals.chanadmin.simple.tabModes' : 'modals.chanadmin.tabModes'))}
            {tabBtn('bans', t('modals.chanadmin.bans', { n: banRows.length }))}
            {hasInvex && tabBtn('invex', t(simpleModes ? 'modals.chanadmin.simple.tabInvex' : 'modals.chanadmin.invexTab', { n: invexlist.length }))}
            {hasChanfilter && tabBtn('filters', t(simpleModes ? 'modals.chanadmin.simple.tabFilters' : 'modals.chanadmin.filtersTab', { n: filterlist.length }))}
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

      {tab === 'modes' && simpleModes && (
        <div className="ca-pane ca-pane--simple">
          {SIMPLE_CHAN_GROUPS.map(({ group, letters }) => {
            const groupFlags = simpleChanFlags(flags, letters);
            if (!groupFlags.length) return null;
            return (
              <div key={group} className="ca-simple__grp">
                <h4 className="ca-h">{t(`modals.chanadmin.simple.${group}`)}</h4>
                <FlagGrid plain flags={groupFlags} modes={flagModes} mlock={mlock} chan={chan}
                  setChannelMode={setChannelMode} onLockTip={showLockTip} />
              </div>
            );
          })}
          {/* Without this the advanced flags look gone rather than hidden. */}
          <p className="ca-simple__hint">{t('modals.chanadmin.simple.hint')}</p>
        </div>
      )}

      {tab === 'modes' && !simpleModes && (
        <div className="ca-pane ca-pane--modes">
          <div className="ca-modes__flags">
            {flags.some((f) => f.group === 'classic') && (
              <>
                <h4 className="ca-h">{t('modals.chanadmin.classicModes')}</h4>
                <FlagGrid
                  flags={flags.filter((f) => f.group === 'classic')}
                  modes={flagModes} mlock={mlock} chan={chan} setChannelMode={setChannelMode}
                  onLockTip={showLockTip}
                  onLockedClick={(f) => { if (f.m === 'k') setTab('overview'); if (f.m === 'g') setTab('filters'); }}
                />
              </>
            )}
            {extraShown.length > 0 && (
              <>
                <h4 className="ca-h ca-h--next">{t('modals.chanadmin.extraModes')}</h4>
                <FlagGrid flags={extraShown} modes={flagModes} mlock={mlock} chan={chan} setChannelMode={setChannelMode}
                  onLockTip={showLockTip}
                  onLockedClick={(f) => { if (f.m === 'k') setTab('overview'); if (f.m === 'g') setTab('filters'); }} />
              </>
            )}
            {paramsShown.length === 0 && moreBtn}
          </div>
          {paramsShown.length > 0 && (
            <div className="ca-modes__params">
              <h4 className="ca-h">{t('modals.chanadmin.paramModes')}</h4>
              <div className="ca-prows">
                {paramsShown.map((p) => (
                  <ChannelParamRow
                    key={p.m}
                    letter={p.m}
                    i18nKey={p.key}
                    hint={p.hint}
                    cur={modeParams?.[p.m] || ''}
                    typeB={ctx.typeB.has(p.m)}
                    locked={mlock.includes(p.m)}
                    onLockedClick={(e) => showLockTip(p.m, 'services', e)}
                    onApply={(value) => setChannelModeParam(chan, p.m, true, value)}
                    onClear={(echo) => setChannelModeParam(chan, p.m, false, echo)}
                  />
                ))}
              </div>
              {moreBtn}
            </div>
          )}
        </div>
      )}

      {tab === 'invex' && hasInvex && (
        <div className="ca-pane">
          <p className="ca-extexample">{t('modals.chanadmin.invexHint')}</p>
          <div className="ca-param ca-extban-add">
            <ExtbanSelect
              exts={invexExts}
              value={ixSel}
              onChange={setIxType}
              maskOption
              matchLabel={t('modals.chanadmin.extMatchInvex')}
            />
            <input className="modal__input" value={ixVal} placeholder={ixHint}
              aria-label={t('modals.chanadmin.invexType')}
              onChange={(e) => setIxVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addInvex()} />
            <button className="upbtn upbtn--primary" onClick={addInvex}>{t('modals.chanadmin.allow')}</button>
          </div>
          {ixExt?.name === 'securitygroup' && (getConfig().securityGroups?.length ?? 0) > 0 && (
            <div className="ca-extgroups">
              {getConfig().securityGroups!.map((g) => (
                <button key={g} type="button" className="ca-extgroup" onClick={() => setIxVal(g)}>{g}</button>
              ))}
            </div>
          )}
          {!simpleModes && (
            <div className="ca-extexample">
              {t('modals.chanadmin.example')} <code>+I {ixExt ? `${ixExt.name}:${ixVal.trim() || ixHint}` : plainMask(ixVal.trim() || t('modals.chanadmin.invexPlaceholder'))}</code>
            </div>
          )}
          <ul className="ca-bans">
            {invexlist.length === 0 && <li className="ca-bans__empty">{t('modals.chanadmin.noInvex')}</li>}
            {invexlist.map((e) => {
              const eb = matchExtban(e.mask);
              return (
                <li key={'I' + e.mask} className="ca-ban">
                  <span className={`ca-ban__mode ca-ban__mode--I${simpleModes ? ' ca-ban__mode--word' : ''}`}>
                    {simpleModes ? t('modals.chanadmin.simple.allowed') : '+I'}
                  </span>
                  {eb && <span className="ca-ban__type" title={eb.name}>{t(`extbans.${eb.name}`, eb.name)}</span>}
                  <span className="ca-ban__mask">{eb ? e.mask.slice(e.mask.indexOf(':') + 1) : e.mask}</span>
                  {e.by && <span className="ca-ban__by">{t('modals.chanadmin.by', { by: e.by })}</span>}
                  <button className="friend__act friend__act--rm" title={t('modals.chanadmin.removeInvex')}
                    onClick={() => removeExt('I', e.mask)}>✕</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {tab === 'filters' && (
        <div className="ca-pane">
          <p className="ca-extexample">{t('modals.chanadmin.filterHint')}</p>
          <div className="ca-param ca-extban-add">
            <input className="modal__input" value={newfilter} placeholder={t('modals.chanadmin.filterPlaceholder')}
              aria-label={t('modals.chanadmin.filterPlaceholder')}
              onChange={(e) => setNewfilter(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFilter()} />
            <button className="upbtn upbtn--primary" onClick={addFilter}>{t('modals.chanadmin.addFilter')}</button>
          </div>
          {!simpleModes && (
            <div className="ca-extexample">
              {t('modals.chanadmin.example')} <code>+g {newfilter.trim().replace(/\s+/g, '*') || 'gros*mot'}</code>
            </div>
          )}
          <ul className="ca-bans">
            {filterlist.length === 0 && <li className="ca-bans__empty">{t('modals.chanadmin.noFilters')}</li>}
            {filterlist.map((e) => (
              <li key={'g' + e.mask} className="ca-ban">
                <span className={`ca-ban__mode${simpleModes ? ' ca-ban__mode--word' : ''}`}>
                  {simpleModes ? t('modals.chanadmin.simple.filtered') : '+g'}
                </span>
                <span className="ca-ban__mask">{e.mask}</span>
                {e.by && <span className="ca-ban__by">{t('modals.chanadmin.by', { by: e.by })}</span>}
                <button className="friend__act friend__act--rm" title={t('modals.chanadmin.removeFilter')}
                  onClick={() => removeFilter(e.mask)}>✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'bans' && (
        <div className="ca-pane">
          {/* One tab, two ways of banning the same person: a plain mask, or a
              typed extban that restricts instead of shutting the door. They
              used to be two tabs, which read as two unrelated features. */}
          {exts.length > 0 && (
            <div className="ca-method" role="group" aria-label={t('modals.chanadmin.banMethod')}>
              <button type="button" className={banMethod === 'mask' ? 'is-on' : ''} aria-pressed={banMethod === 'mask'}
                onClick={() => setBanMethod('mask')}>{t(simpleModes ? 'modals.chanadmin.simple.methodMask' : 'modals.chanadmin.methodMask')}</button>
              <button type="button" className={banMethod === 'ext' ? 'is-on' : ''} aria-pressed={banMethod === 'ext'}
                onClick={() => setBanMethod('ext')}>{t('modals.chanadmin.methodExt')}</button>
            </div>
          )}

          {banMethod === 'mask' || exts.length === 0 ? (
            <>
              <div className="ca-param ca-extban-add">
                {/* "*!*@masque" is exactly the notation the simplified panel drops;
                    there, the field reads as what it now mostly is — a member list. */}
                <MaskInput field={banField} members={members} onSubmit={addBan}
                  placeholder={t(simpleModes ? 'modals.chanadmin.nickPlaceholder' : 'modals.chanadmin.maskPlaceholder')}
                  ariaLabel={t(simpleModes ? 'modals.chanadmin.nickPlaceholder' : 'modals.chanadmin.maskPlaceholder')} />
                <button className="upbtn upbtn--primary" onClick={addBan}>{t('modals.chanadmin.ban')}</button>
              </div>
              <MaskShapes field={banField} />
            </>
          ) : (
            <>
              {simpleModes && <p className="ca-extexample">{t('modals.chanadmin.simple.extbansHint')}</p>}
              <div className="ca-param ca-extban-add">
                {!simpleModes && (
                  <div className="ca-extmode">
                    {ebModes.map((m) => (
                      <button key={m} type="button" className={ebModeSel === m ? 'is-on' : ''}
                        title={t(modeVerb[m])} onClick={() => setEbMode(m)}>+{m}</button>
                    ))}
                  </div>
                )}
                <ExtbanSelect exts={exts} value={ebSel} onChange={setEbType} />
                {curExt?.needsTarget && (
                  <input className="modal__input ca-extdest" value={ebDest} placeholder={t('modals.chanadmin.redirectDestPlaceholder')}
                    aria-label={t('modals.chanadmin.redirectDestPlaceholder')}
                    onChange={(e) => setEbDest(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExtban()} />
                )}
                {curExt?.acting && <ExtbanSelect exts={matchingExts} value={ebNest} onChange={(name) => { setEbNest(name); if (!name || name === NICK_PICK) setEbInvert(false); }} maskOption nickOption />}
                {curExt?.acting && nestExt && !simpleModes && (
                  <button type="button" className={`ca-extinv${ebInvert ? ' is-on' : ''}`}
                    title={t('modals.chanadmin.invertMatch')} aria-pressed={ebInvert}
                    onClick={() => setEbInvert((v) => !v)}>!</button>
                )}
                {pickingNick ? (
                  <MaskInput field={ebField} members={members} onSubmit={addExtban}
                    placeholder={t('modals.chanadmin.nickPlaceholder')}
                    ariaLabel={t('modals.chanadmin.byNick')} />
                ) : (
                  <input className="modal__input" value={ebField.text} placeholder={valueType?.hint ?? curExt?.hint}
                    aria-label={t('modals.chanadmin.extbanType')}
                    onChange={(e) => ebField.set(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addExtban()} />
                )}
                <button className="upbtn upbtn--primary" onClick={addExtban}>{t(modeVerb[ebModeSel])}</button>
              </div>
              {pickingNick && <MaskShapes field={ebField} />}
              {curExt?.needsTarget && (
                // The full hint ends on how to word the matching +e exception —
                // useful, and meaningless without the mode letters.
                <p className="ca-extexample">{t(simpleModes ? 'modals.chanadmin.simple.redirectHint' : 'modals.chanadmin.redirectHint')}</p>
              )}
              {valueType?.name === 'securitygroup' && (getConfig().securityGroups?.length ?? 0) > 0 && (
                <div className="ca-extgroups">
                  {getConfig().securityGroups!.map((g) => (
                    <button key={g} type="button" className="ca-extgroup" onClick={() => ebField.set(g)}>{g}</button>
                  ))}
                </div>
              )}
              {/* The example is the raw `+b redirect:#x:*!*@y` the panel is meant to
                  spare a non-expert; it stays for whoever reads mode letters. */}
              {curExt && !simpleModes && (
                <div className="ca-extexample">
                  {t('modals.chanadmin.example')} <code>+{ebModeSel} {buildExtbanMask({
                    ext: curExt,
                    value: ebField.text.trim() || valueType?.hint || curExt.hint,
                    nest: nestExt,
                    invert: ebInvert && !!nestExt,
                    target: ebDest.trim() || (curExt.needsTarget ? t('modals.chanadmin.redirectDestPlaceholder') : ''),
                  })}</code>
                </div>
              )}
            </>
          )}

          {/* Both methods write to the same channel lists, so they read back as
              one list — hiding the extbans behind their own tab made a ban look
              gone when it had only been set the other way. */}
          <ul className="ca-bans">
            {banRows.length === 0 && <li className="ca-bans__empty">{t('modals.chanadmin.noBans')}</li>}
            {banRows.map((e) => {
              const eb = matchExtban(e.mask);
              return (
                <li key={e.mode + e.mask} className="ca-ban">
                  <span className={`ca-ban__mode ca-ban__mode--${e.mode}${simpleModes ? ' ca-ban__mode--word' : ''}`}>
                    {simpleModes ? t(`modals.chanadmin.simple.${e.mode === 'b' ? 'banned' : 'exempted'}`) : `+${e.mode}`}
                  </span>
                  {eb && <span className="ca-ban__type" title={eb.name}>{t(`extbans.${eb.name}`, eb.name)}</span>}
                  <span className="ca-ban__mask">{eb ? e.mask.slice(e.mask.indexOf(':') + 1) : e.mask}</span>
                  {e.by && <span className="ca-ban__by">{t('modals.chanadmin.by', { by: e.by })}</span>}
                  <button className="friend__act friend__act--rm" title={t('modals.chanadmin.unban')}
                    onClick={() => removeExt(e.mode, e.mask)}>✕</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

        </div>
      </div>
    </Modal>
    {lockTip ? <LockTipBubble text={lockTip.text} x={lockTip.x} y={lockTip.y} /> : null}
    </>
  );
}
