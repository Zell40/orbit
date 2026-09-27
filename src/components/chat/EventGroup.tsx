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

type Side = 'join' | 'leave';

export const EventGroup = memo(function EventGroup({ events }: { events: ChatMessage[] }) {
  const { t } = useTranslation();

  // Keep join and leave as separate bubbles, in the order they actually arrived.
  // A fixed JOIN-then-PART layout put a rejoin above the part that preceded it.
  const sections: { side: Side; nicks: string[]; ts: number }[] = [];
  for (const e of events) {
    const side: Side = e.kind === 'join' ? 'join' : 'leave';
    const last = sections[sections.length - 1];
    if (!last || last.side !== side) {
      sections.push({ side, nicks: [e.from], ts: e.ts });
    } else {
      if (!last.nicks.includes(e.from)) last.nicks.push(e.from);
      last.ts = e.ts;
    }
  }
  if (!sections.length) return null;

  return (
    <div className="eventgroup-wrap">
      {sections.map((sec, i) => (
        <div key={`${sec.side}-${i}`} className={`eventgroup eventgroup--${sec.side === 'join' ? 'join' : 'part'}`}>
          <span className="eventgroup__tag">{sec.side === 'join' ? 'JOIN' : 'PART'}</span>
          <span className="eventgroup__time">{fmtTime(sec.ts)}</span>
          <span className="eventgroup__body">
            <Nicks nicks={sec.nicks} />{' '}
            <span className="eventgroup__verb">
              {sec.side === 'join' ? t('events.joined', { count: sec.nicks.length }) : t('events.left', { count: sec.nicks.length })}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
});
