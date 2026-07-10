import type { ReactNode } from 'react';

// Shared stroke-icon set. One family for the whole app: 24×24, currentColor, the
// same 1.9 stroke and round caps/joins as the composer glyphs, so an icon inherits
// its button's colour and reads consistently in every theme. Add a path, use <Icon>.
const PATHS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 9.5 12 2.5l9 7v11a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 20.5z" />
      <path d="M9.2 21.3V13h5.6v8.3" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9.3" />
      <path d="M16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9z" />
    </>
  ),
  users: (
    <>
      <path d="M16 20.5v-1.8a4 4 0 0 0-4-4H6.2a4 4 0 0 0-4 4v1.8" />
      <circle cx="9.1" cy="7.3" r="3.8" />
      <path d="M21.8 20.5v-1.8a4 4 0 0 0-3-3.86" />
      <path d="M16.4 3.7a4 4 0 0 1 0 7.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
