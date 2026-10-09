import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resetGardianStatsGate,
  shouldHideGardianStatsNotice,
  isGardianStatsHeader,
} from './gardian-stats';

describe('gardian-stats gate', () => {
  beforeEach(() => {
    resetGardianStatsGate();
    vi.useRealTimers();
  });

  it('recognises the FR header', () => {
    expect(isGardianStatsHeader('******** Rapport statistiques Services ********')).toBe(true);
  });

  it('shows the first dump then hides a later dump after the sticky window', () => {
    vi.useFakeTimers();
    expect(shouldHideGardianStatsNotice('Gardian', '******** Rapport statistiques Services ********')).toBe(false);
    expect(shouldHideGardianStatsNotice('Gardian', 'Durée de fonctionnement : 3 minutes')).toBe(false);
    expect(shouldHideGardianStatsNotice('Gardian', 'Utilisateurs actuels : 44 (18 opérateurs)')).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(shouldHideGardianStatsNotice('Gardian', '******** Rapport statistiques Services ********')).toBe(true);
    expect(shouldHideGardianStatsNotice('Gardian', 'Durée de fonctionnement : 2 secondes')).toBe(true);
    vi.useRealTimers();
  });

  it('ignores unrelated Gardian notices', () => {
    expect(shouldHideGardianStatsNotice('Gardian', 'Bienvenue sur le réseau.')).toBe(false);
  });
});
