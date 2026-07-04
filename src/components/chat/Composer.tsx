import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChat, SERVER } from '../../store';
import { nickColor, MIRC_PALETTE } from '../../lib/format';
import { serialize, ircToHtml, caretIndex, selectRange, caretAtEdge, caretToEnd } from '../../lib/editor';
import { getConfig } from '../../config';
import { usePluginRegistry } from '../../plugins/registry';
import { PluginBoundary } from '../PluginBoundary';
function TypingIndicator() {
  const { t } = useTranslation();
  const buffer = useChat((s) => s.buffers[s.active]);
  if (!buffer) return null;
  const now = Date.now();
  const who = Object.entries(buffer.typing).filter(([, exp]) => exp > now).map(([n]) => n);
  if (!who.length) return <div className="typing" />;
  const label = who.length === 1
    ? t('composer.typingOne', { nick: who[0] })
    : who.length === 2
      ? t('composer.typingTwo', { a: who[0], b: who[1] })
      : t('composer.typingMany', { n: who.length });
  return (
    <div className="typing">
      <span className="typing__dots"><i /><i /><i /></span>{label}…
    </div>
  );
}

const EMOJIS = ['😀','😂','🤣','😊','😍','😘','😎','🤩','🥳','😏','😢','😭','😡','🤔','😴','🙄','👍','👎','👏','🙌','🙏','💪','👋','✌️','🤝','❤️','🔥','✨','🎉','🌹','☕','🍺','🍷','🎶','💯','😅','😜','🤗','😇','👀'];

// :name: → emoji, for tab-completion in the composer.
const EMOJI_NAMES: Record<string, string> = {
  sourire: '😀', rire: '😂', mdr: '🤣', joie: '😊', amour: '😍', bisou: '😘',
  cool: '😎', etoiles: '🤩', fete: '🥳', malin: '😏', triste: '😢', pleure: '😭',
  colere: '😡', reflechir: '🤔', dodo: '😴', clindoeil: '😜', calin: '🤗', ange: '😇',
  yeux: '👀', pouce: '👍', nul: '👎', bravo: '👏', mains: '🙌', merci: '🙏',
  muscle: '💪', salut: '👋', victoire: '✌️', accord: '🤝', coeur: '❤️', feu: '🔥',
  brille: '✨', tada: '🎉', rose: '🌹', cafe: '☕', biere: '🍺', vin: '🍷',
  musique: '🎶', cent: '💯', heart: '❤️', fire: '🔥', smile: '😀', laugh: '😂',
  ok: '👌', wave: '👋', party: '🥳', think: '🤔', wink: '😉', sun: '☀️', star: '⭐',
};
// Slash commands offered by tab-completion (with a leading '/').
const SLASH_COMMANDS = ['me', 'msg', 'join', 'part', 'nick', 'whois', 'topic', 'kick', 'ban', 'op', 'deop', 'voice', 'ignore', 'unignore', 'list', 'roll', 'flip', 'clear', 'help'];

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
  const active = useChat((s) => s.active);
  const send = useChat((s) => s.sendInput);
  const notifyTyping = useChat((s) => s.notifyTyping);
  const uploadImage = useChat((s) => s.uploadImage);
  const uploadAudio = useChat((s) => s.uploadAudio);
  const setDraft = useChat((s) => s.setDraft);

  const [picker, setPicker] = useState(false);
  const [colors, setColors] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [fmt, setFmt] = useState({ b: false, i: false, u: false });
  const fgRef = useRef('');                 // active text colour, kept sticky across sends
  const ed = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Voice recording
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recStream = useRef<MediaStream | null>(null);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recCancel = useRef(false);
  const recExt = useRef('webm');
  const cyc = useRef<{ start: number; len: number; cands: string[]; idx: number } | null>(null);
  const prevActive = useRef(active);
  // mIRC-style sent-message history (global to the session). idx -1 = live draft.
  const history = useRef<string[]>([]);
  const histIdx = useRef(-1);
  const histStash = useRef('');
  const isConsole = active === SERVER;

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

  // Reflect editor contents into the empty flag (placeholder + send button) and ping typing.
  function changed() {
    const root = ed.current; if (!root) return;
    const has = !!(root.textContent && root.textContent.trim());
    setEmpty(!has);
    if (has && !isConsole) notifyTyping();
    histIdx.current = -1; // typing exits history-recall mode
    syncFmt();
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
    root.innerHTML = ircToHtml(useChat.getState().drafts[active] ?? '');
    setEmpty(!(root.textContent || '').trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching salons: stash the unsent text under the old one, restore the new one's.
  useEffect(() => {
    if (prevActive.current === active) return;
    const root = ed.current; if (!root) return;
    setDraft(prevActive.current, serialize(root));
    root.innerHTML = ircToHtml(useChat.getState().drafts[active] ?? '');
    setEmpty(!(root.textContent || '').trim());
    cyc.current = null;
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
    const root = ed.current; if (!root) return;
    const out = serialize(root);
    if (!out.trim()) return;
    send(out);
    // Record in the recall history (skip consecutive duplicates), cap at 100.
    if (history.current[history.current.length - 1] !== out) history.current.push(out);
    if (history.current.length > 100) history.current.shift();
    histIdx.current = -1;
    histStash.current = '';
    root.innerHTML = '';
    setEmpty(true);
    setDraft(active, '');
    cyc.current = null;
    reapplySticky();   // keep bold/italic/colour active for the next line
  }

  // Replace the editor contents with an IRC-formatted string + caret to end.
  function setEditorText(irc: string) {
    const root = ed.current; if (!root) return;
    root.innerHTML = ircToHtml(irc);
    setEmpty(!(root.textContent || '').trim());
    caretToEnd(root);
  }

  // ↑ recall older sent messages; ↓ walk back toward the live draft.
  function historyPrev() {
    const root = ed.current; if (!root || !history.current.length) return;
    if (histIdx.current === -1) histStash.current = serialize(root); // stash the in-progress draft
    if (histIdx.current < history.current.length - 1) histIdx.current++;
    setEditorText(history.current[history.current.length - 1 - histIdx.current]);
  }
  function historyNext() {
    const root = ed.current; if (!root || histIdx.current === -1) return;
    histIdx.current--;
    setEditorText(histIdx.current === -1 ? histStash.current : history.current[history.current.length - 1 - histIdx.current]);
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

  // Tab-completion over the editor's plain text: nicks, /commands, :emoji:.
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
      return;
    }

    const before = text.slice(0, pos);
    const token = (before.match(/(\S*)$/)?.[1]) ?? '';
    if (!token) return;
    const start = pos - token.length;
    let cands: string[];

    if (token.startsWith(':') && token.length > 1) {
      const q = token.slice(1).toLowerCase();
      cands = Object.keys(EMOJI_NAMES).filter((n) => n.startsWith(q)).map((n) => EMOJI_NAMES[n]);
    } else if (token.startsWith('/') && start === 0) {
      const q = token.slice(1).toLowerCase();
      const pluginCmds = usePluginRegistry.getState().commands.map((c) => c.name);
      cands = [...SLASH_COMMANDS, ...pluginCmds].filter((c2) => c2.startsWith(q)).map((c2) => '/' + c2 + ' ');
    } else {
      const members = Object.keys(useChat.getState().buffers[active]?.members ?? {});
      const q = token.toLowerCase();
      const tail = start === 0 ? ': ' : ' ';
      cands = members.filter((n) => n.toLowerCase().startsWith(q)).sort((a, b) => a.localeCompare(b))
        .map((n) => n + tail);
    }
    if (!cands.length) return;
    selectRange(root, start, pos);
    document.execCommand('insertText', false, cands[0]);
    cyc.current = { start, len: cands[0].length, cands, idx: 0 };
  }

  const canUpload = getConfig().features.imageUpload;
  function uploadFrom(files: FileList | null | undefined): boolean {
    if (!files || isConsole || !canUpload) return false;
    const img = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (img) { uploadImage(img); return true; }
    return false;
  }

  // ── voice recording (MediaRecorder → opus/webm → uploadAudio) ───────────────
  const canRecord = canUpload && !isConsole && typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  function bestAudioMime(): string {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
    for (const m of cands) if (MediaRecorder.isTypeSupported?.(m)) return m;
    return '';
  }
  function teardownRec() {
    recStream.current?.getTracks().forEach((tr) => tr.stop());
    recStream.current = null;
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
  }
  async function startRec() {
    if (recording || !canRecord) return;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { useChat.getState().pushSystem?.(active, `⚠ ${t('composer.micDenied')}`); return; }
    const mime = bestAudioMime();
    recExt.current = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recRef.current = mr; recStream.current = stream; recChunks.current = []; recCancel.current = false;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.current.push(e.data); };
    mr.onstop = () => {
      const cancelled = recCancel.current;
      teardownRec(); setRecording(false); setRecSecs(0);
      const blob = new Blob(recChunks.current, { type: mime || 'audio/webm' });
      recChunks.current = [];
      if (!cancelled && blob.size > 0) uploadAudio(blob, recExt.current);
    };
    mr.start();
    setRecording(true); setRecSecs(0);
    recTimer.current = setInterval(() => setRecSecs((s) => {
      if (s + 1 >= 300) { stopRec(); return 300; } // 5-minute hard cap
      return s + 1;
    }), 1000);
  }
  function stopRec() { if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop(); }
  function cancelRec() { recCancel.current = true; stopRec(); }
  // Make sure the mic is released if the composer unmounts mid-recording.
  useEffect(() => () => { recCancel.current = true; try { recRef.current?.stop(); } catch { /* ignore */ } teardownRec(); }, []);

  const placeholder = isConsole
    ? t('composer.consolePlaceholder')
    : t('composer.placeholder', { chan: active || '…' });

  return (
    <div className={`composer ${isConsole ? 'composer--console' : ''}`}>
      <TypingIndicator />
      <ReplyBar />
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ''; }} />
      <div className={`composer__box ${isConsole ? 'composer__box--console' : ''} ${dragOver ? 'is-drop' : ''}`}
        onDragOver={(e) => { if (!isConsole) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { setDragOver(false); if (uploadFrom(e.dataTransfer.files)) e.preventDefault(); }}>
        {recording && (
          <div className="composer__rec">
            <span className="composer__rec-dot" aria-hidden="true" />
            <span className="composer__rec-time">{Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}</span>
            <span className="composer__rec-label">{t('composer.recording')}</span>
            <button className="composer__rec-btn composer__rec-cancel" onClick={cancelRec} aria-label={t('composer.cancel')} title={t('composer.cancel')}>✕</button>
            <button className="composer__rec-btn composer__rec-send" onClick={stopRec} aria-label={t('composer.send')} title={t('composer.send')}>➤</button>
          </div>
        )}
        {canUpload && !isConsole && (
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
          className={`composer__rich ${isConsole ? 'composer__rich--console' : ''} ${empty ? 'is-empty' : ''}`}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          spellCheck={!isConsole}
          data-ph={dragOver ? t('composer.dropImage') : placeholder}
          onInput={changed}
          onPaste={(e) => {
            if (uploadFrom(e.clipboardData?.files)) { e.preventDefault(); return; }
            const t = e.clipboardData?.getData('text/plain');
            if (t != null) { e.preventDefault(); document.execCommand('insertText', false, t); changed(); }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !isConsole) { e.preventDefault(); tabComplete(); return; }
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
        {!isConsole && (
          <div className="composer__fmt">
            <button className={`composer__fmtbtn ${fmt.b ? 'is-on' : ''}`} title={t('composer.bold')} aria-label={t('composer.bold')} aria-pressed={fmt.b}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><b>G</b></button>
            <button className={`composer__fmtbtn ${fmt.i ? 'is-on' : ''}`} title={t('composer.italic')} aria-label={t('composer.italic')} aria-pressed={fmt.i}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><i>I</i></button>
            <button className={`composer__fmtbtn ${fmt.u ? 'is-on' : ''}`} title={t('composer.underline')} aria-label={t('composer.underline')} aria-pressed={fmt.u}
              onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><u>S</u></button>
            <button className={`composer__fmtbtn composer__fmtbtn--color ${colors ? 'is-on' : ''}`} title={t('composer.colorBtn')} aria-label={t('composer.colorBtn')}
              onMouseDown={(e) => e.preventDefault()} onClick={() => setColors((c) => !c)}>🎨</button>
          </div>
        )}
        {!isConsole && pluginButtons.map((b) => <PluginBoundary key={b.id} render={b.render} label="composer_button" />)}
        {!isConsole && <button className={`composer__emoji ${picker ? 'is-on' : ''}`} title={t('composer.emoji')} aria-label={t('composer.emoji')} onClick={() => setPicker((p) => !p)}>😊</button>}
        <button className="composer__send" disabled={empty} onClick={submit} aria-label={t('composer.send')}>{isConsole ? '⏎' : '➤'}</button>
      </div>
    </div>
  );
}

function ReplyBar() {
  const { t } = useTranslation();
  const reply = useChat((s) => s.replyTarget);
  const clear = useChat((s) => s.clearReply);
  if (!reply) return null;
  return (
    <div className="replybar">
      <span className="replybar__icon">↩</span>
      <span className="replybar__txt">
        {t('composer.replyTo')} <b style={{ color: nickColor(reply.from) }}>{reply.from}</b> — {reply.text}
      </span>
      <button className="replybar__x" onClick={clear} aria-label={t('composer.cancelReply')}>✕</button>
    </div>
  );
}

