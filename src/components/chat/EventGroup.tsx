import { memo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '@/core/irc/types';
import { fmtTime, nickColor } from '@/lib/format';

// A run of consecutive join/part/quit/online lines folded into compact notice-style
// bubbles (JOIN / PART / QUIT / CONNEXION tags), so a busy channel doesn't drown
// in noise and room art never washes out the nicks.
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

type Side = 'join' | 'part' | 'quit' | 'online';

function sideOf(kind: string): Side {
  if (kind === 'join') return 'join';
  if (kind === 'online') return 'online';
  if (kind === 'quit') return 'quit';
  return 'part';
}

const TAG: Record<Side, string> = {
  join: 'JOIN',
  part: 'PART',
  quit: 'QUIT',
  online: 'CONNEXION',
};

const CLASS: Record<Side, string> = {
  join: 'join',
  online: 'join',
  part: 'part',
  quit: 'part',
};

export const EventGroup = memo(function EventGroup({ events }: { events: ChatMessage[] }) {
  const { t } = useTranslation();

  // Keep join / leave / reconnect as separate bubbles, in arrival order.
  // A fixed JOIN-then-PART layout put a rejoin above the part that preceded it.
  const sections: { side: Side; nicks: string[]; ts: number }[] = [];
  for (const e of events) {
    const side = sideOf(e.kind);
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
        <div key={`${sec.side}-${i}`} className={`eventgroup eventgroup--${CLASS[sec.side]}`}>
          <span className="eventgroup__tag">{TAG[sec.side]}</span>
          <span className="eventgroup__time">{fmtTime(sec.ts)}</span>
          <span className="eventgroup__body">
            <Nicks nicks={sec.nicks} />{' '}
            <span className="eventgroup__verb">
              {sec.side === 'join' && t('events.joined', { count: sec.nicks.length })}
              {sec.side === 'online' && t('events.connected', { count: sec.nicks.length })}
              {sec.side === 'part' && t('events.left', { count: sec.nicks.length })}
              {sec.side === 'quit' && t('events.quit', { count: sec.nicks.length })}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
});
