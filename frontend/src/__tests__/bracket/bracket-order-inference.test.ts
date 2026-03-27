import { describe, expect, test } from 'vitest';
import { extractTeamsFromBracketOrder, inferBracketOrderFromRows } from '../../bracket/bracket-order-inference';
import type { RawMatchRow } from '../../types/match';

function makeRow(overrides: Partial<RawMatchRow>): RawMatchRow {
  return {
    match_date: '2025/01/01',
    section_no: '-1',
    match_index_in_section: '1',
    start_time: '13:00',
    stadium: 'Test',
    home_team: 'A',
    home_goal: '1',
    away_goal: '0',
    away_team: 'B',
    status: '試合終了',
    round: '決勝',
    ...overrides,
  };
}

describe('inferBracketOrderFromRows', () => {
  test('reconstructs a simple four-team bracket from match_number order', () => {
    const rows: RawMatchRow[] = [
      makeRow({ match_number: '1', section_no: '-2', round: '準決勝', home_team: 'A', away_team: 'B' }),
      makeRow({ match_number: '2', section_no: '-2', round: '準決勝', home_team: 'C', away_team: 'D' }),
      makeRow({ match_number: '3', section_no: '-1', round: '決勝', home_team: 'A', away_team: 'C' }),
    ];

    expect(inferBracketOrderFromRows(rows)).toEqual(['A', 'B', 'C', 'D']);
  });

  test('fills later-entry seeded teams with bye slots based on round depth', () => {
    const rows: RawMatchRow[] = [
      makeRow({ match_number: '1', section_no: '-3', round: '1回戦', home_team: 'B', away_team: 'C' }),
      makeRow({ match_number: '2', section_no: '-2', round: '準決勝', home_team: 'A', away_team: 'B' }),
      makeRow({ match_number: '3', section_no: '-2', round: '準決勝', home_team: 'D', away_team: 'E' }),
      makeRow({ match_number: '4', section_no: '-1', round: '決勝', home_team: 'A', away_team: 'D' }),
    ];

    expect(inferBracketOrderFromRows(rows)).toEqual([
      'A', null, 'B', 'C',
      'D', null, 'E', null,
    ]);
  });
});

describe('extractTeamsFromBracketOrder', () => {
  test('drops bye slots and preserves order', () => {
    expect(extractTeamsFromBracketOrder(['A', null, 'B', 'C', null])).toEqual(['A', 'B', 'C']);
  });
});
