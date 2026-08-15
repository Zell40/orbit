import { memo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/core/irc/types';
import { fmtTime, nickColor } from '@/lib/format';

// A run of consecutive join/part/quit lines folded into compact notice-style
// bubbles (JOIN / PART tags), so a busy channel doesn't drown in noise and
// room art never washes out the nicks.
const MAX = 14; // nicks shown per section before it collapses to "+N"

function Nicks({ nicks }: { nicks: string[] }) {
  const shown = nicks.slice(0, MAX);
  const extra = nicks.length - shown.length;
  return (
    <>
      {shown.map((n, i) => (
        <Fragment key={n}>
          <span className="eventgroup__nick" style={{ color: nickColor(n) }}>{n}</span>
          {i < shown.length - 1 ? ', ' : ''}
        </Fragment>
      ))}
      {extra > 0 && <span className="eventgroup__more" title={nicks.join(', ')}> +{extra}</span>}
    </>
  );
}

export const EventGroup = memo(function EventGroup({ events }: { events: ChatMessage[] }) {
  const { t } = useTranslation();

  // Net the run: unique joins and leaves, and anyone who both joined and left
  // within the same run is churn — drop them from both sides.
  const joined = new Set<string>();
  const left = new Set<string>();
  for (const e of events) {
    if (e.kind === 'join') joined.add(e.from);
    else left.add(e.from); // part / quit
  }
  for (const n of [...joined]) {
    if (left.has(n)) { joined.delete(n); left.delete(n); }
  }
  const jn = [...joined];
  const lv = [...left];
  if (!jn.length && !lv.length) return null;

  const ts = events[events.length - 1].ts;
  return (
    <div className="eventgroup-wrap">
      {jn.length > 0 && (
        <div className="eventgroup eventgroup--join">
          <span className="eventgroup__tag">JOIN</span>
          <span className="eventgroup__time">{fmtTime(ts)}</span>
          <span className="eventgroup__body">
            <Nicks nicks={jn} />{' '}
            <span className="eventgroup__verb">{t('events.joined', { count: jn.length })}</span>
          </span>
        </div>
      )}
      {lv.length > 0 && (
        <div className="eventgroup eventgroup--part">
          <span className="eventgroup__tag">PART</span>
          <span className="eventgroup__time">{fmtTime(ts)}</span>
          <span className="eventgroup__body">
            <Nicks nicks={lv} />{' '}
            <span className="eventgroup__verb">{t('events.left', { count: lv.length })}</span>
          </span>
        </div>
      )}
    </div>
  );
});
