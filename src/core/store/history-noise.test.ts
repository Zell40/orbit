import { describe, it, expect } from 'vitest';
import { skipHistoryCommand, skipHistoryModeLine } from './history-noise';

const hideAll = {
  hideKicks: true,
  hideNickEvents: true,
  hideTopicEvents: true,
  hideModes: true,
};

const showAll = {
  hideKicks: false,
  hideNickEvents: false,
  hideTopicEvents: false,
  hideModes: false,
};

describe('skipHistoryCommand', () => {
  it('always drops JOIN/PART/QUIT', () => {
    for (const cmd of ['JOIN', 'PART', 'QUIT']) {
      expect(skipHistoryCommand(cmd, showAll)).toBe(true);
      expect(skipHistoryCommand(cmd, hideAll)).toBe(true);
    }
  });

  it('drops TOPIC/NICK/CHGHOST/KICK only when the matching hide pref is on', () => {
    expect(skipHistoryCommand('TOPIC', hideAll)).toBe(true);
    expect(skipHistoryCommand('TOPIC', showAll)).toBe(false);
    expect(skipHistoryCommand('NICK', hideAll)).toBe(true);
    expect(skipHistoryCommand('NICK', showAll)).toBe(false);
    expect(skipHistoryCommand('CHGHOST', hideAll)).toBe(true);
    expect(skipHistoryCommand('CHGHOST', showAll)).toBe(false);
    expect(skipHistoryCommand('KICK', hideAll)).toBe(true);
    expect(skipHistoryCommand('KICK', showAll)).toBe(false);
  });

  it('does not fully drop MODE (ban lines may still be kept)', () => {
    expect(skipHistoryCommand('MODE', hideAll)).toBe(false);
    expect(skipHistoryModeLine(hideAll)).toBe(true);
    expect(skipHistoryModeLine(showAll)).toBe(false);
  });
});
