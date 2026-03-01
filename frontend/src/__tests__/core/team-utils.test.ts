import { describe, test, expect } from 'vitest';
import { teamCssClass } from '../../core/team-utils';

describe('teamCssClass', () => {
  test('returns plain team name unchanged', () => {
    expect(teamCssClass('鹿島')).toBe('鹿島');
    expect(teamCssClass('FC東京')).toBe('FC東京');
    expect(teamCssClass('柏レイソルU-18')).toBe('柏レイソルU-18');
  });

  test('removes ASCII dots', () => {
    expect(teamCssClass('サンフレッチェ広島F.Cユース')).toBe('サンフレッチェ広島FCユース');
  });

  test('truncates at first half-width space', () => {
    expect(teamCssClass('栃木SC U-18')).toBe('栃木SC');
    expect(teamCssClass('流通経済大学付属柏高校 B')).toBe('流通経済大学付属柏高校');
  });

  test('truncates at space then removes dots', () => {
    expect(teamCssClass('京都サンガF.C. U-18')).toBe('京都サンガFC');
  });

  test('preserves full-width characters (mid-dot etc.)', () => {
    expect(teamCssClass('横浜F・マリノスユース')).toBe('横浜F・マリノスユース');
  });
});
