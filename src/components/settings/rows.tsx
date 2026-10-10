import { useActiveChat } from '@/core/networks';
import type { Prefs } from '@/ui/prefs';

type BoolPref = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs];

// One preference toggle row: icon · label/hint · switch. Shared by the
// Appearance and Notifications sections.
export function ToggleRow({ icon, label, hint, prefKey, disabled }: {
  icon: string; label: string; hint?: string; prefKey: BoolPref; disabled?: boolean;
}) {
  const value = useActiveChat((s) => s.prefs[prefKey]);
  const setPref = useActiveChat((s) => s.setPref);
  return (
    <div className={`srow${disabled ? ' is-disabled' : ''}`}>
      <span className="srow__ic" aria-hidden>{icon}</span>
      <div className="srow__txt">
        <div className="srow__label">{label}</div>
        {hint && <div className="srow__hint">{hint}</div>}
      </div>
      <button className={`switch ${value ? 'is-on' : ''}`} role="switch" aria-checked={value}
        aria-label={label} disabled={disabled} aria-disabled={disabled || undefined}
        onClick={() => { if (!disabled) setPref(prefKey, !value); }}><span className="switch__dot" /></button>
    </div>
  );
}
