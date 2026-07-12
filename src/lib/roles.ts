// Channel access-mode prefix → role label key + colour class. Shared by the
// member list (role grouping/headers) and the in-message op marker so the two
// never drift apart.
export const ROLES: Record<string, { key: string; cls: string }> = {
  '~': { key: 'owner', cls: 'owner' },
  '&': { key: 'admin', cls: 'admin' },
  '!': { key: 'proprietors', cls: 'owner' },
  '@': { key: 'op', cls: 'op' },
  '%': { key: 'halfop', cls: 'halfop' },
  '+': { key: 'voice', cls: 'voice' },
  '': { key: 'member', cls: 'member' },
};

// An unknown/custom prefix still reads as a privileged role rather than nothing.
export const roleForPrefix = (prefix: string) => ROLES[prefix] ?? { key: 'privileged', cls: 'op' };
