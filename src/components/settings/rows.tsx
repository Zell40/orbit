import { useActiveChat } from '@/core/networks';

// One preference toggle row: icon · label/hint · switch. Shared by the
// Appearance and Notifications sections.
export function ToggleRow({ icon, label, hint, prefKey }: { icon: string; label: string; hint?: string; prefKey: 'sound' | 'hideJoinQuit' | 'compact' | 'linkPreviews' | 'hoverActions' | 'confirmClose' | 'monoMessages' | 'bubbleMessages' | 'topicSetterFull' | 'showStatus' }) {
  const value = useActiveChat((s) => s.prefs[prefKey]);
  const setPref = useActiveChat((s) => s.setPref);
  return (
    <div className="srow">
      <span className="srow__ic" aria-hidden>{icon}</span>
      <div className="srow__txt">
        <div className="srow__label">{label}</div>
        {hint && <div className="srow__hint">{hint}</div>}
      </div>
      <button className={`switch ${value ? 'is-on' : ''}`} role="switch" aria-checked={value}
        aria-label={label} onClick={() => setPref(prefKey, !value)}><span className="switch__dot" /></button>
    </div>
  );
}
