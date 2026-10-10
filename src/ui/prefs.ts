// User preferences (General settings) — persisted per IRC identity in localStorage.
import { getConfig } from '../core/config';
import { getActiveOwner, idLsRead, idLsWrite } from '../lib/identity-storage';

export interface Prefs {
  sound: boolean;        // play a blip on mention / private message
  hideJoinQuit: boolean; // hide join/part/quit lines in busy channels (live + history display)
  /** Skip MODE lines when replaying CHATHISTORY (live MODE still shows). */
  hideModes: boolean;
  /** Skip TOPIC lines in CHATHISTORY replay (live topic changes still show). */
  hideTopicEvents: boolean;
  /** Skip NICK / CHGHOST lines in CHATHISTORY replay (live still show). */
  hideNickEvents: boolean;
  /** Skip KICK lines in CHATHISTORY replay (live kicks still show). */
  hideKicks: boolean;
  /** Re-fetch CHATHISTORY LATEST on reconnect even when the buffer already has messages. */
  historyOnReconnect: boolean;
  compact: boolean;      // denser message rows
  clock24: boolean;      // 24h timestamps (else 12h am/pm)
  textScale: number;     // UI text size multiplier (1 = default; 0.9 / 1.1 / 1.25)
  linkPreviews: boolean; // show OpenGraph link-preview cards (off = never fetch)
  hoverActions: boolean; // quick react/reply/pin toolbar on message hover (off = classic)
  confirmClose: boolean; // warn (beforeunload) before closing/reloading the tab while connected
  monoMessages: boolean; // render message text in a fixed-width font so ASCII art/tables line up
  /** Modern chat bubbles (default on). Off = classic flat lines. */
  bubbleMessages: boolean;
  /** Topic author as nick!user@host. Off (default) = nick only. */
  topicSetterFull: boolean;
  /** Show the Status (server console) buffer in the room list. Off by default. */
  showStatus: boolean;
  /** Unused: off-channel NOTICEs now always land in the current window. Kept so old localStorage still parses. */
  noticeInbox: boolean;
  /** DM read receipts (Orbit ↔ Orbit TAGMSG). Off = don't send, don't show "read". */
  readReceipts: boolean;
  /** Hours to keep a shared image/voice file (clamped to filehost.retentionChoices). */
  uploadTtlHours: number;
  /** JOIN a channel automatically when someone INVITEs you. */
  joinOnInvite: boolean;
  /** Plain-language channel Modes tab: no mode letters, only the common flags. */
  simpleModes: boolean;
  /** Show channel modes (+nt etc.) next to the room name in the top bar. Off by default. */
  showChannelModes: boolean;
  /** Show parameterized extras next to channel modes (+f ~4:10, +E 5:60…). Off by default; requires showChannelModes. */
  showExtendedModes: boolean;
}

const KEY = 'orbit-prefs';

// Defaults come from config.json (so a deployment can preset compact/sound/etc.).
function defaults(): Prefs {
  const d = getConfig().defaults;
  return {
    sound: d.sound, hideJoinQuit: d.hideJoinQuit, hideModes: false,
    hideTopicEvents: true, hideNickEvents: true, hideKicks: true, historyOnReconnect: false,
    compact: d.compact, clock24: d.clock24,
    textScale: 1, linkPreviews: true, hoverActions: true, confirmClose: false, monoMessages: false,
    bubbleMessages: true, topicSetterFull: false, showStatus: false, noticeInbox: false,
    readReceipts: true, joinOnInvite: false, simpleModes: true,
    showChannelModes: false, showExtendedModes: false,
    uploadTtlHours: getConfig().filehost?.retentionHours ?? 24,
  };
}

function normalizePrefs(p: Prefs): Prefs {
  // Extended mode parameters only make sense when the modes line is shown.
  if (!p.showChannelModes && p.showExtendedModes) return { ...p, showExtendedModes: false };
  return p;
}

export function getPrefs(): Prefs {
  const d = defaults();
  try {
    // Per-account when identified; device-wide only before login (no owner).
    const raw = idLsRead(KEY);
    if (raw) return normalizePrefs({ ...d, ...JSON.parse(raw) });
    // Guest / pre-login: allow reading the historical unscoped key once for UX,
    // but never copy it into another account's bucket.
    if (!getActiveOwner()) {
      const legacy = localStorage.getItem(KEY) ?? localStorage.getItem('tchatou-prefs');
      if (legacy) return normalizePrefs({ ...d, ...JSON.parse(legacy) });
    }
  } catch { /* ignore */ }
  return d;
}

export function savePrefs(p: Prefs): void {
  idLsWrite(KEY, JSON.stringify(p));
}

// Density + text size are global layout concerns → reflect them on <html> (CSS
// targets density; the root font-size scales rem-based sizing across the app).
export function applyPrefs(p: Prefs): void {
  document.documentElement.dataset.density = p.compact ? 'compact' : 'comfortable';
  document.documentElement.dataset.actions = p.hoverActions ? 'on' : 'off';
  document.documentElement.dataset.mono = p.monoMessages ? 'on' : 'off';
  document.documentElement.dataset.bubbles = p.bubbleMessages ? 'on' : 'off';
  const scale = Math.min(1.4, Math.max(0.8, p.textScale || 1));
  document.documentElement.style.fontSize = Math.round(scale * 100) + '%';
}

// apply immediately on import so the layout is correct before first paint
applyPrefs(getPrefs());
