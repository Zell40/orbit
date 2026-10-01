import { useEffect, useState } from 'react';

/** True only on a real phone-sized screen. A wide desktop — even an installed
 *  PWA — keeps the literary two-column welcome. */
export function isPhoneUi(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || nav.standalone === true;
  const narrow = window.matchMedia('(max-width: 720px)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(hover: none)').matches;
  return narrow && (coarse || standalone);
}

export function usePhoneUi(): boolean {
  const [on, setOn] = useState(isPhoneUi);
  useEffect(() => {
    const q = [
      window.matchMedia('(max-width: 720px)'),
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(hover: none)'),
      window.matchMedia('(display-mode: standalone)'),
    ];
    const sync = () => setOn(isPhoneUi());
    for (const m of q) m.addEventListener('change', sync);
    return () => { for (const m of q) m.removeEventListener('change', sync); };
  }, []);
  return on;
}
