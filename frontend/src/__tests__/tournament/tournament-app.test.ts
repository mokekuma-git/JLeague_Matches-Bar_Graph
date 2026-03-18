import { describe, expect, test } from 'vitest';
import { __testables } from '../../tournament-app';
import type { RawMatchRow } from '../../types/match';
import type { BracketSection } from '../../types/season';

function makeRow(overrides: Partial<RawMatchRow> = {}): RawMatchRow {
  const base: RawMatchRow = {
    match_date: '2025/03/15',
    section_no: '98',
    match_index_in_section: '1',
    start_time: '15:00',
    stadium: 'Test Stadium',
    home_team: 'TeamA',
    home_goal: '2',
    away_goal: '1',
    away_team: 'TeamB',
    status: '試合終了',
    round: '準決勝 第1戦',
  };
  return { ...base, ...overrides };
}

describe('tournament-app helpers', () => {
  test('filterRowsByRounds matches both raw and normalized round labels', () => {
    const rows = [
      makeRow({ round: '準決勝 第1戦' }),
      makeRow({ round: '決勝', home_team: 'TeamC', away_team: 'TeamD' }),
    ];
    const filtered = __testables.filterRowsByRounds(rows, ['準決勝']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].round).toBe('準決勝 第1戦');
  });

  describe('resolveSectionRoundFilters', () => {
    test('applies default_round_filter to sections without round_filter', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
        { label: 'B', bracket_order: ['TeamC', 'TeamD'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, ['1回戦', '2回戦']);
      expect(resolved[0].round_filter).toEqual(['1回戦', '2回戦']);
      expect(resolved[1].round_filter).toEqual(['1回戦', '2回戦']);
    });

    test('preserves section-level round_filter over default', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
        { label: 'B', bracket_order: ['TeamC', 'TeamD'], round_filter: ['準決勝', '決勝'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, ['1回戦', '2回戦']);
      expect(resolved[0].round_filter).toEqual(['1回戦', '2回戦']);
      expect(resolved[1].round_filter).toEqual(['準決勝', '決勝']);
    });

    test('returns sections unchanged when no default provided', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
        { label: 'B', bracket_order: ['TeamC', 'TeamD'], round_filter: ['準決勝'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, undefined);
      expect(resolved[0].round_filter).toBeUndefined();
      expect(resolved[1].round_filter).toEqual(['準決勝']);
    });

    test('returns sections unchanged when default is empty array', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, []);
      expect(resolved[0].round_filter).toBeUndefined();
    });

    test('does not mutate original sections', () => {
      const sections: BracketSection[] = [
        { label: 'A', bracket_order: ['TeamA', 'TeamB'] },
      ];
      const resolved = __testables.resolveSectionRoundFilters(sections, ['1回戦']);
      expect(resolved[0].round_filter).toEqual(['1回戦']);
      expect(sections[0].round_filter).toBeUndefined();
    });
  });

  test('collectBracketSourceRows ignores section columns in dedup keys', () => {
    const rows = [
      makeRow({
        section_no: '98',
        match_index_in_section: '1',
        round: '準決勝 第1戦',
      }),
      makeRow({
        section_no: '12',
        match_index_in_section: '9',
        round: '準決勝 第1戦',
      }),
    ];
    const sections: BracketSection[] = [
      { label: '準決勝', bracket_order: ['TeamA', 'TeamB'], round_filter: ['準決勝'] },
      { label: '第1戦', bracket_order: ['TeamA', 'TeamB'], round_filter: ['準決勝 第1戦'] },
    ];
    const collected = __testables.collectBracketSourceRows(rows, sections);
    expect(collected).toHaveLength(1);
  });
});
