import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { escapeHtml } from '../lib/escape';
import { useTranslation } from 'react-i18next';

import { getConfig } from '../core/config';
import { useActiveChat } from '../core/networks';
import { passkeySupported } from '../core/irc/webauthn';

function param(name: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

// Ambient chatter for the live-room preview (decorative — aria-hidden). Warm, French,
// no impersonation of real users; it conveys "the room is alive" before you join.
type Line = { who: string; hue: number; text: string; react?: string };
// Names/colours/reactions stay in code; the message text is localised
// (connect.ambient.N) so the preview speaks the visitor's language.
const POOL_META: { who: string; hue: number; react?: string }[] = [
  { who: 'Marina', hue: 8 },
  { who: 'Lucas', hue: 205 },
  { who: 'Inès', hue: 322, react: '❤️' },
  { who: 'Théo', hue: 150 },
  { who: 'Jade', hue: 265 },
  { who: 'Naël', hue: 32 },
  { who: 'Sofia', hue: 188, react: '😂' },
  { who: 'Hugo', hue: 96 },
  { who: 'Léa', hue: 340 },
  { who: 'Adam', hue: 228 },
  { who: 'Camille', hue: 50 },
  { who: 'Yanis', hue: 170 },
  { who: 'Manon', hue: 300 },
  { who: 'Eliott', hue: 120 },
];

function avaStyle(hue: number): CSSProperties {
  return { background: `linear-gradient(140deg, hsl(${hue},58%,55%), hsl(${(hue + 38) % 360},56%,45%))` };
}

// Isolated so the streaming interval never re-renders the join form.
function LiveFeed({ chan }: { chan: string }) {
  const { t } = useTranslation();
  const line = (i: number): Line => {
    const n = i % POOL_META.length;
    return { ...POOL_META[n], text: t(`connect.ambient.${n}`) };
  };
  const [msgs, setMsgs] = useState<(Line & { id: number })[]>(
    () => [0, 1, 2, 3].map((i) => ({ ...line(i), id: i })),
  );
  const [typing, setTyping] = useState('');
  const idx = useRef(4);

  useEffect(() => {
    let alive = true;
    let toMsg = 0;
    let toNext = 0;
    const step = () => {
      const next = line(idx.current);
      setTyping(next.who);
      toMsg = window.setTimeout(() => {
        if (!alive) return;
        setTyping('');
        setMsgs((m) => [...m.slice(-6), { ...next, id: idx.current }]);
        idx.current += 1;
        toNext = window.setTimeout(step, 1500 + Math.random() * 900);
      }, 850);
    };
    const start = window.setTimeout(step, 1200);
    return () => { alive = false; clearTimeout(start); clearTimeout(toMsg); clearTimeout(toNext); };
  }, []);

  return (
    <aside className="cfeed" aria-hidden="true">
      <div className="cfeed__head">
        <span className="cfeed__tag">{chan}</span>
        <span className="cfeed__count"><i />{t('connect.live')}</span>
      </div>
      <div className="cfeed__stream">
        {msgs.map((m) => (
          <div className="cmsg" key={m.id}>
            <span className="cmsg__ava" style={avaStyle(m.hue)}>{m.who[0]}</span>
            <div className="cmsg__body">
              <div className="cmsg__who" style={{ color: `hsl(${m.hue},55%,70%)` }}>{m.who}</div>
              <span className="cmsg__bubble">{m.text}</span>
              {m.react && <span className="cmsg__react">{m.react}</span>}
            </div>
          </div>
        ))}
        <div className="ctyping">
          {typing
            ? <><span>{t('connect.typing', { who: typing })}</span><span className="ctyping__dots"><i /><i /><i /></span></>
            : <span className="ctyping__dots"><i /><i /><i /></span>}
        </div>
      </div>
    </aside>
  );
}

// Aide / FAQ — a polished in-app help overlay reachable from the welcome. `focus`
// pre-opens one entry (e.g. "register" or "forgot" from the welcome links). The
// Q&A text lives in the `faq.*` locale keys; answers carry trusted inline markup.
const FAQ_IDS = ['register', 'forgot', 'free', 'noaccount', 'taken', 'privacy', 'mobile', 'what'];
function FaqOverlay({ focus, onClose }: { focus: string; onClose: () => void }) {
  const { t } = useTranslation();
  const cfg = getConfig();
  const site = cfg.branding.url.replace(/^https?:\/\//, '');
  const [open, setOpen] = useState(focus);
  const vars = { name: escapeHtml(cfg.branding.name), site: escapeHtml(site), url: escapeHtml(cfg.branding.url), project: escapeHtml(cfg.branding.projectUrl) };
  return (
    <div className="cfaq-scrim" onClick={onClose}>
      <div className="cfaq" role="dialog" aria-label={t('faq.aria')} onClick={(e) => e.stopPropagation()}>
        <div className="cfaq__head">
          <span className="ic"><img src={cfg.branding.icon} alt="" width={18} height={18} style={{ borderRadius: 4 }} /></span>
          <h2>{t('faq.title')}</h2>
          <button className="cfaq__close" onClick={onClose} aria-label={t('faq.close')}>✕</button>
        </div>
        <div className="cfaq__body">
          {(cfg.features.register ? FAQ_IDS : FAQ_IDS.filter((id) => id !== 'register' && id !== 'forgot')).map((id) => (
            <div className={`cfaq__item ${open === id ? 'is-open' : ''}`} key={id}>
              <button className="cfaq__q" onClick={() => setOpen(open === id ? '' : id)}>
                {t(`faq.${id}.q`, vars)}<span className="chev">›</span>
              </button>
              <div className="cfaq__a" dangerouslySetInnerHTML={{ __html: t(`faq.${id}.a`, vars) }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ConnectScreen() {
  const { t } = useTranslation();
  const cfg = getConfig();
  const [faq, setFaq] = useState<string | null>(null);
  const connect = useActiveChat((s) => s.connect);
  const status = useActiveChat((s) => s.status);
  const [nick, setNick] = useState(param('nick', ''));
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  // The channel(s) to join — a comma-separated list, e.g. "#rencontre,#taverne"
  // (the first is the active/primary one). Prefilled from the URL ?channel= param
  // or config, but editable on the form so the user picks where they land.
  const [chanField, setChanField] = useState(param('channel', cfg.startup.channels.join(',')));
  const parseChannels = (raw: string) =>
    raw.split(',').map((c) => c.trim()).filter(Boolean)
      .map((c) => (c.startsWith('#') || c.startsWith('&') ? c : `#${c}`));
  const chan = parseChannels(chanField)[0] || cfg.startup.channels[0];
  const suggestions = cfg.startup.suggestions?.length ? cfg.startup.suggestions : cfg.startup.channels;

  // Optional "meet-people" lobby: sex/age/city ride in the realname (shown in
  // WHOIS and on join), and the intent picks which room you land in. The whole
  // block only shows when the deployment configures startup.intents.
  const intents = cfg.startup.intents;
  const [sex, setSex] = useState(param('sex', ''));
  const [age, setAge] = useState(param('age', ''));
  const [city, setCity] = useState(param('city', ''));
  const [intent, setIntent] = useState('');
  const intentChans = (i: 'chat' | 'love' | 'play') =>
    (intents?.[i]?.length ? intents[i]! : cfg.startup.channels);
  function pickIntent(i: 'chat' | 'love' | 'play') {
    setIntent(i);
    setChanField(intentChans(i).join(','));
  }
  function realname(): string | undefined {
    const parts: string[] = [];
    if (sex === 'f') parts.push(t('connect.sexF'));
    else if (sex === 'h') parts.push(t('connect.sexH'));
    if (age.trim()) parts.push(t('connect.ageYears', { age: age.trim() }));
    if (city.trim()) parts.push(city.trim());
    return parts.join(' · ') || undefined;
  }

  const connecting = status === 'connecting';
  const ready = nick.trim().length >= 2;
  const errors: Record<string, string> = {
    error: t('connect.error_error'),
    closed: t('connect.error_closed'),
    'sasl-failed': t('connect.error_sasl'),
  };

  // Passkey sign-in is offered only when the deployment enables it AND the browser
  // supports WebAuthn; the server must also advertise SASL WEBAUTHN (checked live at
  // CAP time — if it doesn't, the connection just proceeds unauthenticated).
  const canPasskey = cfg.features.passkeySasl && passkeySupported();

  function go(passkey = false) {
    if (!ready) return;
    const channels = parseChannels(chanField);
    if (!channels.length) channels.push(...cfg.startup.channels);
    connect({
      url: cfg.server.url,
      nick: nick.trim(),
      realname: realname(),
      password: passkey ? undefined : (password || undefined),
      passkey: passkey || undefined,
      channels,
    });
  }

  return (
    <div className="connect">
      <section className="cjoin">
        <div className="cjoin__brand">
          <span className="cjoin__mark"><img src={cfg.branding.icon} alt="" /></span>
          <span className="cjoin__name"><span className="at">@</span>{cfg.branding.name}</span>
          <span className="cjoin__dot"><i />{t('connect.live')}</span>
        </div>

        <h1 className="cjoin__title">
          {cfg.branding.tagline || t('connect.tagline')}<br />
          <em>{cfg.branding.taglineEm || t('connect.taglineEm')}</em>
        </h1>
        <p className="cjoin__sub">{cfg.branding.subtitle || t('connect.subtitle')}</p>

        <form onSubmit={(e) => { e.preventDefault(); go(); }}>
          <div className="cjoin__composer">
            <span className="cjoin__ava">{nick.trim() ? nick.trim()[0].toUpperCase() : '?'}</span>
            <input
              className="cjoin__input"
              name="nick"
              value={nick}
              maxLength={30}
              autoFocus
              autoComplete="off"
              placeholder={t('connect.pseudoPlaceholder')}
              aria-label={t('connect.nickAria')}
              onChange={(e) => setNick(e.target.value)}
            />
            <button type="submit" className="cjoin__send" disabled={connecting || !ready} aria-label={t('connect.enter')}>
              {connecting ? <span className="cjoin__sendspin" /> : <span className="arr">➔</span>}
            </button>
          </div>
          <p className="cjoin__hint">{t('connect.nickHint')}</p>

          {intents && (
            <>
              <div className="cjoin__me">
                <div className="cjoin__seg" role="group" aria-label={t('connect.sexAria')}>
                  <button type="button" className={sex === 'f' ? 'is-on' : ''} aria-pressed={sex === 'f'}
                    onClick={() => setSex(sex === 'f' ? '' : 'f')}>{t('connect.sexF')}</button>
                  <button type="button" className={sex === 'h' ? 'is-on' : ''} aria-pressed={sex === 'h'}
                    onClick={() => setSex(sex === 'h' ? '' : 'h')}>{t('connect.sexH')}</button>
                </div>
                <input className="cjoin__mini" type="number" min={13} max={99} inputMode="numeric" value={age}
                  placeholder={t('connect.agePlaceholder')} aria-label={t('connect.ageAria')}
                  onChange={(e) => setAge(e.target.value)} />
                <input className="cjoin__mini cjoin__mini--city" value={city} autoComplete="off" maxLength={24}
                  placeholder={t('connect.cityPlaceholder')} aria-label={t('connect.cityAria')}
                  onChange={(e) => setCity(e.target.value)} />
              </div>

              <fieldset className="cjoin__envie">
                <legend className="cjoin__envie-lab">{t('connect.wantLabel')}</legend>
                <div className="cjoin__intents">
                  <button type="button" className={intent === 'chat' ? 'is-on' : ''} aria-pressed={intent === 'chat'}
                    onClick={() => pickIntent('chat')}>💬 {t('connect.wantChat')}</button>
                  <button type="button" className={intent === 'love' ? 'is-on' : ''} aria-pressed={intent === 'love'}
                    onClick={() => pickIntent('love')}>💞 {t('connect.wantLove')}</button>
                  <button type="button" className={intent === 'play' ? 'is-on' : ''} aria-pressed={intent === 'play'}
                    onClick={() => pickIntent('play')}>🎮 {t('connect.wantPlay')}</button>
                </div>
              </fieldset>
            </>
          )}

          <div className="cjoin__row">
            <label className="cjoin__chan">{t('connect.joinHint')}
              <input className="cjoin__chan-in" value={chanField} spellCheck={false} autoComplete="off"
                list="cjoin-chans" aria-label={t('connect.channelAria')} onChange={(e) => setChanField(e.target.value)} />
              <datalist id="cjoin-chans">
                {suggestions.map((c) => <option key={c} value={c} />)}
              </datalist>
            </label>
            <button type="button" className="cjoin__pw-t" onClick={() => setShowPw((v) => !v)}>
              {showPw ? t('connect.hidePassword') : t('connect.registered')}
            </button>
          </div>

          {showPw && (
            <input
              className="cjoin__pw"
              type="password"
              name="password"
              value={password}
              placeholder={t('connect.passwordPlaceholder')}
              aria-label={t('connect.passwordLabel')}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          )}

          {canPasskey && (
            <button type="button" className="cjoin__passkey" disabled={connecting || !ready}
              onClick={() => go(true)} title={t('connect.passkeyHint')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="8" cy="10" r="4" /><path d="M10.85 12.15 19 20.5" /><path d="m18 18-2-2" /><path d="m20 16-2-2" />
              </svg>
              {t('connect.passkeyButton')}
            </button>
          )}

          {errors[status] && <div className="cjoin__err">⚠ {errors[status]}</div>}
        </form>

        <div className="cjoin__links">
          {cfg.features.register && (
            <>
              <button type="button" className="primary" onClick={() => setFaq('register')}>{t('connect.createButton')}</button>
              <span className="d">·</span>
              <button type="button" onClick={() => setFaq('forgot')}>{t('connect.forgotButton')}</button>
              <span className="d">·</span>
            </>
          )}
          <button type="button" onClick={() => setFaq('')}>{t('connect.helpButton')}</button>
        </div>

        <div className="cjoin__trust">
          <span>🔒 {t('connect.encrypted')}</span>
          <span className="sep">·</span>
          <span>{t('connect.noData')}</span>
          <span className="sep">·</span>
          <span>IRCv3</span>
        </div>
      </section>

      <LiveFeed chan={chan} />

      {faq !== null && <FaqOverlay focus={faq} onClose={() => setFaq(null)} />}
    </div>
  );
}
