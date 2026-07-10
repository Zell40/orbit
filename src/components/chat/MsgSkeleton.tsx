// Placeholder message rows shown while a channel is still fetching its first
// lines (connect → join → chathistory). The bars are real (faint) text — not
// empty divs — so the largest one paints immediately as the LCP instead of the
// view waiting ~2s for the first message to arrive over the wire.
const BLOCK = '█'.repeat(80);
const WIDTHS = [72, 46, 84, 58, 39, 76, 52, 67, 43, 61];

export function MsgSkeleton() {
  return (
    <div className="skel" aria-hidden="true">
      {WIDTHS.map((w, i) => (
        <div className="skel__row" key={i}>
          <div className="skel__av" />
          <div className="skel__body">
            <span className="skel__bar skel__bar--nick">{BLOCK}</span>
            <span className="skel__bar" style={{ maxWidth: `${w}%` }}>{BLOCK}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
