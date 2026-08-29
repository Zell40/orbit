import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { SERVER, isNoticeBuffer } from '@/core/store';
import { MIRC_PALETTE } from '@/lib/format';
import { serialize, ircToHtml, caretIndex, selectRange, caretAtEdge, caretToEnd } from '@/lib/editor';
import { getConfig } from '@/core/config';
import { usePluginRegistry } from '@/modules/registry';
import { PluginBoundary } from '../PluginBoundary';
import { useActiveChat, activeStore } from '@/core/networks';
import { EMOJIS, EMOJI_NAMES, SLASH_COMMANDS } from './composer/constants';
import { TypingIndicator } from './composer/TypingIndicator';
import { ReplyBar } from './composer/ReplyBar';
import { useVoiceRecorder } from './composer/useVoiceRecorder';
import { completeToken, type CompletionKind } from './composer/complete';
import { createSentHistory } from './composer/history';
import { ImageSendPreview } from './composer/ImageSendPreview';
import { resolveUploadTtlHours } from '@/core/store/upload';

type AcState = { start: number; cands: string[]; idx: number; kind: CompletionKind };

function acLabel(pick: string, kind: CompletionKind): string {
  if (kind === 'emoji') return pick;
  return pick.replace(/\s+$/, '');
}

// ── Rich composer plumbing ───────────────────────────────────────────────────
// The composer is a contentEditable so the user sees real bold/italic/colour as
// they type (never the control codes). We only convert to/from IRC formatting
// codes at the edges: serialize() on send, ircToHtml() when restoring a draft.

export function Composer() {
  const { t } = useTranslation();
  // Select the stable array ref (zustand v5 would loop on a new array each render);
  // filter in the body.
  const pluginUi = usePluginRegistry((s) => s.ui);
  const pluginButtons = pluginUi.filter((u) => u.slot === 'composer_button');
  const active = useActiveChat((s) => s.active);
  const send = useActiveChat((s) => s.sendInput);
  const notifyTyping = useActiveChat((s) => s.notifyTyping);
  const uploadImage = useActiveChat((s) => s.uploadImage);
  const uploadAudio = useActiveChat((s) => s.uploadAudio);
  const setDraft = useActiveChat((s) => s.setDraft);
  const setPref = useActiveChat((s) => s.setPref);
  const uploadTtlHours = useActiveChat((s) => s.prefs.uploadTtlHours);

  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [picker, setPicker] = useState(false);
  const [colors, setColors] = useState(false);
  const [fmtMenu, setFmtMenu] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [empty, setEmpty] = useState(true);   // truly empty → show the placeholder hint
  const [blank, setBlank] = useState(true);   // whitespace-only → keep the send button disabled
  const [fmt, setFmt] = useState({ b: false, i: false, u: false });
  const [ac, setAc] = useState<AcState | null>(null);
  const fgRef = useRef('');                 // active text colour, kept sticky across sends
  const ed = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cyc = useRef<{ start: number; len: number; cands: string[]; idx: number } | null>(null);
  const listed = useRef(false);             // one-time LIST kicked off for channel completion
  const prevActive = useRef(active);
  // mIRC-style sent-message recall (global to the session). Lives in a ref so it
  // survives re-renders; idx bookkeeping is unit-tested in composer/history.ts.
  const history = useRef(createSentHistory()).current;
  const isConsole = active === SERVER;
  const isNotices = isNoticeBuffer(active);
  const readOnlyLog = isConsole || isNotices;
  const narrow = useSyncExternalStore(
    (cb) => { const m = matchMedia('(max-width: 880px)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => matchMedia('(max-width: 880px)').matches,
  );

  const canUpload = getConfig().features.imageUpload;
  const ttlHours = resolveUploadTtlHours(uploadTtlHours);
  const { recording, recSecs, canRecord, startRec, stopRec, cancelRec } = useVoiceRecorder({
    enabled: canUpload && !readOnlyLog, active, onRecorded: uploadAudio,
  });

  // Light up the toolbar to match the formatting at the caret (like Slack/iMessage).
  function syncFmt() {
    if (!ed.current || document.activeElement !== ed.current) return;
    try {
      setFmt({
        b: document.queryCommandState('bold'),
        i: document.queryCommandState('italic'),
        u: document.queryCommandState('underline'),
      });
    } catch { /* queryCommandState unsupported — leave as-is */ }
  }

  // Reflect the editor into the two flags. The hint hides as soon as there's ANY
  // content (like a normal input) so a lone space no longer leaves it under the
  // caret; the send button stays disabled until there's non-whitespace to send.
  function reflect() {
    const root = ed.current; if (!root) return;
    const text = root.textContent || '';
    setEmpty(!text);
    setBlank(!text.trim());
  }

  function completeCtx() {
    const st = activeStore().getState();
    const members = Array.from(new Set([
      ...Object.keys(st.buffers[active]?.members ?? {}),
      ...st.order.filter((n) => st.buffers[n] && !st.buffers[n].isChannel && n !== SERVER && !isNoticeBuffer(n)),
    ]));
    const channels = Array.from(new Set([
      ...st.order.filter((n) => st.buffers[n]?.isChannel),
      ...st.channels.map((c) => c.name),
      ...(getConfig().startup.suggestions ?? []),
    ]));
    const pluginCmds = usePluginRegistry.getState().commands.map((cmd) => cmd.name);
    return { members, channels, pluginCmds, slashCommands: SLASH_COMMANDS, emojiNames: EMOJI_NAMES };
  }

  function refreshAc() {
    const root = ed.current; if (!root) { setAc(null); return; }
    const text = root.textContent || '';
    const pos = caretIndex(root);
    const res = completeToken(text, pos, completeCtx());
    if (!res) { setAc(null); return; }
    if (res.kind === 'channel' && !listed.current) {
      const st = activeStore().getState();
      if (!st.channels.length) { listed.current = true; st.refreshChannels(); }
    }
    setAc((prev) => {
      const same = prev
        && prev.start === res.start
        && prev.kind === res.kind
        && prev.cands.length === res.candidates.length
        && prev.cands.every((c, i) => c === res.candidates[i]);
      if (same && prev) return prev;
      return { start: res.start, cands: res.candidates, idx: 0, kind: res.kind };
    });
  }

  function changed() {
    const root = ed.current; if (!root) return;
    reflect();
    if ((root.textContent || '').trim() && !readOnlyLog) notifyTyping();
    history.reset(); // typing exits history-recall mode
    syncFmt();
    refreshAc();
  }

  // Keep the toolbar in sync as the caret/selection moves around the editor.
  useEffect(() => {
    const onSel = () => { if (ed.current && document.activeElement === ed.current) syncFmt(); };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  // Load the saved draft for a salon into the editor (rich), once on mount.
  useEffect(() => {
    const root = ed.current; if (!root) return;
    root.innerHTML = ircToHtml(activeStore().getState().drafts[active] ?? '');
    reflect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching salons: stash the unsent text under the old one, restore the new one's.
  useEffect(() => {
    if (prevActive.current === active) return;
    const root = ed.current; if (!root) return;
    setDraft(prevActive.current, serialize(root));
    root.innerHTML = ircToHtml(activeStore().getState().drafts[active] ?? '');
    reflect();
    cyc.current = null;
    setAc(null);
    setPendingImage(null);
    setFmtMenu(false);
    prevActive.current = active;
  }, [active, setDraft]);

  // Re-assert the active formatting onto the (empty) editor so it stays "held down"
  // for the next message — wiping innerHTML clears the browser's pending-style state.
  function reapplySticky() {
    const root = ed.current; if (!root) return;
    root.focus();
    if (fmt.b && !document.queryCommandState('bold')) document.execCommand('bold');
    if (fmt.i && !document.queryCommandState('italic')) document.execCommand('italic');
    if (fmt.u && !document.queryCommandState('underline')) document.execCommand('underline');
    if (fgRef.current) { document.execCommand('styleWithCSS', false, 'true'); document.execCommand('foreColor', false, fgRef.current); }
  }

  function submit() {
    if (pendingImage) {
      const f = pendingImage;
      setPendingImage(null);
      void uploadImage(f);
      return;
    }
    const root = ed.current; if (!root) return;
    const out = serialize(root);
    if (!out.trim()) return;
    send(out);
    history.record(out);
    root.innerHTML = '';
    setEmpty(true); setBlank(true);
    setDraft(active, '');
    cyc.current = null;
    setAc(null);
    reapplySticky();   // keep bold/italic/colour active for the next line
  }

  // Replace the editor contents with an IRC-formatted string + caret to end.
  function setEditorText(irc: string) {
    const root = ed.current; if (!root) return;
    root.innerHTML = ircToHtml(irc);
    reflect();
    caretToEnd(root);
  }

  // ↑ recall older sent messages; ↓ walk back toward the live draft.
  function historyPrev() {
    const root = ed.current; if (!root) return;
    const tx = history.recallPrev(serialize(root));
    if (tx !== null) setEditorText(tx);
  }
  function historyNext() {
    const root = ed.current; if (!root) return;
    const tx = history.recallNext();
    if (tx !== null) setEditorText(tx);
  }

  function insert(emoji: string) {
    ed.current?.focus();
    document.execCommand('insertText', false, emoji);
    setPicker(false);
    changed();
  }

  // Apply a style command to the current selection / typing position.
  function exec(cmd: string) {
    ed.current?.focus();
    document.execCommand(cmd);
    syncFmt();
    changed();
  }
  function applyColor(index: number) {
    ed.current?.focus();
    fgRef.current = MIRC_PALETTE[index];
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, fgRef.current);
    setColors(false);
    changed();
  }
  function clearFmt() {
    ed.current?.focus();
    fgRef.current = '';
    setFmt({ b: false, i: false, u: false });
    document.execCommand('removeFormat');
    setColors(false);
    changed();
  }

  // Tab-completion over the editor's plain text: nicks, /commands, :emoji:. The
  // candidate logic is pure (composer/complete.ts, unit-tested); here we own the
  // cycle-through-matches state, the suggestion popup, and the DOM insertion.
  function applyCompletion(cands: string[], start: number, idx: number) {
    const root = ed.current; if (!root) return;
    const pick = cands[idx];
    const pos = caretIndex(root);
    selectRange(root, start, pos);
    document.execCommand('insertText', false, pick);
    cyc.current = { start, len: pick.length, cands, idx };
    setAc(null);
    reflect();
  }

  function tabComplete() {
    const root = ed.current; if (!root) return;
    const text = root.textContent || '';
    const pos = caretIndex(root);

    const c = cyc.current;
    if (c && pos === c.start + c.len) {
      c.idx = (c.idx + 1) % c.cands.length;
      const pick = c.cands[c.idx];
      selectRange(root, c.start, c.start + c.len);
      document.execCommand('insertText', false, pick);
      c.len = pick.length;
      setAc(null);
      reflect();
      return;
    }

    if (ac && ac.cands.length) {
      applyCompletion(ac.cands, ac.start, ac.idx);
      return;
    }

    const res = completeToken(text, pos, completeCtx());
    if (!res) return;
    if (res.kind === 'channel' && !listed.current) {
      const st = activeStore().getState();
      if (!st.channels.length) { listed.current = true; st.refreshChannels(); }
    }
    applyCompletion(res.candidates, res.start, 0);
  }

  function acceptAc(idx: number) {
    if (!ac) return;
    applyCompletion(ac.cands, ac.start, idx);
  }

  function uploadFrom(dt: DataTransfer | null | undefined): boolean {
    if (!dt || readOnlyLog || !canUpload) return false;
    // A pasted/copied image (screenshot, "copy image") usually arrives in items
    // via getAsFile(), NOT in .files — so check both, else paste silently no-ops.
    let img: File | null = Array.from(dt.files || []).find((f) => f.type.startsWith('image/')) ?? null;
    if (!img) for (const it of Array.from(dt.items || [])) {
      if (it.kind === 'file' && it.type.startsWith('image/')) { img = it.getAsFile(); if (img) break; }
    }
    if (img) { setPendingImage(img); return true; }
    return false;
  }

  const placeholder = isNotices
    ? t('composer.noticesPlaceholder')
    : isConsole
    ? t('composer.consolePlaceholder')
    : narrow
      ? t('composer.placeholderShort')
      : t('composer.placeholder', { chan: active || '…' });

  return (
    <div className={`composer ${readOnlyLog ? 'composer--console' : ''}`}>
      <TypingIndicator />
      <ReplyBar />
      {pendingImage && (
        <ImageSendPreview
          file={pendingImage}
          ttlHours={ttlHours}
          onTtl={(h) => setPref('uploadTtlHours', h)}
          onSend={submit}
          onCancel={() => setPendingImage(null)}
        />
      )}
      {picker && (
        <>
          <div className="emoji-backdrop" onClick={() => setPicker(false)} />
          <div className="emoji-pop">
            {EMOJIS.map((e) => <button key={e} onClick={() => insert(e)}>{e}</button>)}
          </div>
        </>
      )}
      {colors && (
        <>
          <div className="emoji-backdrop" onClick={() => setColors(false)} />
          <div className="color-pop" onMouseDown={(e) => e.preventDefault()}>
            {MIRC_PALETTE.slice(0, 16).map((hex, i) => (
              <button key={i} title={t('composer.color', { i })} style={{ background: hex }}
                onClick={() => applyColor(i)} />
            ))}
            <button className="color-pop__reset" title={t('composer.clearFormat')}
              onClick={clearFmt}>⌫</button>
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingImage(f); e.target.value = ''; }} />
      <div className={`composer__box ${readOnlyLog ? 'composer__box--console' : ''} ${dragOver ? 'is-drop' : ''}`}
        onDragOver={(e) => { if (!readOnlyLog) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); if (uploadFrom(e.dataTransfer)) e.preventDefault(); }}>
        {ac && ac.cands.length > 0 && (
          <div className="composer__ac" role="listbox" aria-label={t('composer.autocomplete')}>
            <div className="composer__ac-hint">{t('composer.autocompleteHint')}</div>
            <ul className="composer__ac-list">
              {ac.cands.slice(0, 12).map((cand, i) => (
                <li key={`${ac.kind}-${cand}-${i}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === ac.idx}
                    className={`composer__ac-item ${i === ac.idx ? 'is-on' : ''} composer__ac-item--${ac.kind}`}
                    onMouseDown={(e) => { e.preventDefault(); acceptAc(i); }}
                  >
                    <span className="composer__ac-main">{acLabel(cand, ac.kind)}</span>
                    {ac.kind === 'slash' && <span className="composer__ac-tag">{t('composer.autocompleteCmd')}</span>}
                    {ac.kind === 'channel' && <span className="composer__ac-tag">#</span>}
                    {ac.kind === 'nick' && <span className="composer__ac-tag">@</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {recording && (
          <div className="composer__rec">
            <span className="composer__rec-dot" aria-hidden="true" />
            <span className="composer__rec-time">{Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}</span>
            <span className="composer__rec-label">{t('composer.recording')}</span>
            <button className="composer__rec-btn composer__rec-cancel" onClick={cancelRec} aria-label={t('composer.cancel')} title={t('composer.cancel')}>✕</button>
            <button className="composer__rec-btn composer__rec-send" onClick={stopRec} aria-label={t('composer.send')} title={t('composer.send')}>➤</button>
          </div>
        )}
        {canUpload && !readOnlyLog && (
          <button className="composer__add" title={t('composer.sendImage')} aria-label={t('composer.sendImage')} onClick={() => fileRef.current?.click()}>
            <svg className="composer__icon" viewBox="0 0 24 24" width="20" height="20" fill="none"
              stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <circle cx="8.5" cy="8.5" r="1.6" />
              <path d="M21 15.5 16 10.5 5.5 21" />
            </svg>
          </button>
        )}
        {canRecord && (
          <button className="composer__add composer__mic" title={t('composer.recordVoice')} aria-label={t('composer.recordVoice')} onClick={startRec}>
            <svg className="composer__icon" viewBox="0 0 24 24" width="20" height="20" fill="none"
              stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <line x1="12" y1="18" x2="12" y2="22" />
            </svg>
          </button>
        )}
        <div
          ref={ed}
          className={`composer__rich ${readOnlyLog ? 'composer__rich--console' : ''} ${empty ? 'is-empty' : ''}`}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          spellCheck={!readOnlyLog}
          data-ph={dragOver ? t('composer.dropImage') : placeholder}
          onInput={changed}
          onPaste={(e) => {
            if (uploadFrom(e.clipboardData)) { e.preventDefault(); return; }
            const t = e.clipboardData?.getData('text/plain');
            if (t != null) { e.preventDefault(); document.execCommand('insertText', false, t); changed(); }
          }}
          onKeyDown={(e) => {
            if (ac && ac.cands.length) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const dir = e.key === 'ArrowDown' ? 1 : -1;
                const max = Math.min(ac.cands.length, 12);
                setAc((a) => a && ({ ...a, idx: (a.idx + dir + max) % max }));
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setAc(null);
                cyc.current = null;
                return;
              }
            }
            if (e.key === 'Tab') { e.preventDefault(); tabComplete(); return; }
            if (e.key !== 'Tab') cyc.current = null;
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
            if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); changed(); return; }
            // mIRC-style recall: ↑ at the first line goes back through sent
            // messages, ↓ at the last line walks forward to the live draft.
            // Alt+↑/↓ is reserved for switching conversations (handled globally).
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) {
              const root = ed.current; if (!root) return;
              const edge = caretAtEdge(root);
              if (e.key === 'ArrowUp' && edge.top) { e.preventDefault(); historyPrev(); }
              else if (e.key === 'ArrowDown' && edge.bottom) { e.preventDefault(); historyNext(); }
            }
          }}
        />
        {!readOnlyLog && (() => {
          const fmtBtns = (
            <>
              <button className={`composer__fmtbtn ${fmt.b ? 'is-on' : ''}`} title={t('composer.bold')} aria-label={t('composer.bold')} aria-pressed={fmt.b}
                onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><b>G</b></button>
              <button className={`composer__fmtbtn ${fmt.i ? 'is-on' : ''}`} title={t('composer.italic')} aria-label={t('composer.italic')} aria-pressed={fmt.i}
                onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><i>I</i></button>
              <button className={`composer__fmtbtn ${fmt.u ? 'is-on' : ''}`} title={t('composer.underline')} aria-label={t('composer.underline')} aria-pressed={fmt.u}
                onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><u>S</u></button>
              <button className={`composer__fmtbtn composer__fmtbtn--color ${colors ? 'is-on' : ''}`} title={t('composer.colorBtn')} aria-label={t('composer.colorBtn')}
                onMouseDown={(e) => e.preventDefault()} onClick={() => setColors((c) => !c)}>🎨</button>
            </>
          );
          const fmtOn = fmt.b || fmt.i || fmt.u || colors || fmtMenu;
          if (narrow) {
            return (
              <>
                <button type="button" className={`composer__fmt-toggle ${fmtOn ? 'is-on' : ''}`}
                  title={t('composer.format')} aria-label={t('composer.format')} aria-expanded={fmtMenu}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setFmtMenu((v) => !v); setColors(false); }}>
                  <b>A</b>
                </button>
                {fmtMenu && (
                  <>
                    <div className="emoji-backdrop" onClick={() => { setFmtMenu(false); setColors(false); }} />
                    <div className="composer__fmt composer__fmt--pop">{fmtBtns}</div>
                  </>
                )}
              </>
            );
          }
          return <div className="composer__fmt">{fmtBtns}</div>;
        })()}
        {!readOnlyLog && pluginButtons.map((b) => <PluginBoundary key={b.id} render={b.render} label="composer_button" />)}
        {!readOnlyLog && <button className={`composer__emoji ${picker ? 'is-on' : ''}`} title={t('composer.emoji')} aria-label={t('composer.emoji')} onClick={() => setPicker((p) => !p)}>😊</button>}
        <button className="composer__send" disabled={blank && !pendingImage} onClick={submit} aria-label={t('composer.send')} title={t('composer.send')}>
          {readOnlyLog ? '⏎' : <><span className="composer__send-txt">{t('composer.sendLong')}</span>➤</>}
        </button>
      </div>
    </div>
  );
}
