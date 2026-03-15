import { describe, expect, test } from 'vitest';
import { __testables } from '../../tournament-app';
import type { RawMatchRow } from '../../types/match';
import type { BracketSection } from '../../types/season';

function makeRow(overrides: Partial<RawMatchRow> = {}): RawMatchRow {
  return {
    match_date: '2025/03/15',
    start_time: '15:00',
    stadium: 'Test Stadium',
    home_team: 'TeamA',
    home_goal: '2',
    away_goal: '1',
    away_team: 'TeamB',
    status: '試合終了',
    round: '準決勝 第1戦',
    ...overrides,
  };
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

  test('collectBracketSourceRows deduplicates rows even without section columns', () => {
    const row = makeRow({
      section_no: undefined,
      match_index_in_section: undefined,
      round: '準決勝 第1戦',
    });
    const sections: BracketSection[] = [
      { label: '準決勝', bracket_order: ['TeamA', 'TeamB'], round_filter: ['準決勝'] },
      { label: '第1戦', bracket_order: ['TeamA', 'TeamB'], round_filter: ['準決勝 第1戦'] },
    ];
    const collected = __testables.collectBracketSourceRows([row], sections);
    expect(collected).toHaveLength(1);
  });
});
